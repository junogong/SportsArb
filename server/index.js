import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';

import getRedisClient from './redisClient.js';
import path from 'path';
import { fileURLToPath } from 'url';
import * as jose from 'jose';
import { oddsGet, computeArbitrageForEvent } from './oddsService.js';
// Worker disabled: Caching is now done on-demand by oddsService
// import { startWorker } from './worker.js';
// startWorker();
import { getSecret } from './security.js';
import rateLimit from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load server/.env from the server directory
const envPath = path.join(__dirname, '.env');
console.log(`[DEBUG] Attempting to load .env from: ${envPath}`);
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.warn(`[WARN] Could not load .env at ${envPath}. Using process env only.`);
  console.warn(`[WARN] Error details: ${result.error.message}`);
} else {
  console.log(`[INFO] Successfully loaded .env file.`);
  // Debug: Print keys (but not values for security, except safe ones)
  const keys = Object.keys(result.parsed || {});
  console.log(`[DEBUG] Keys loaded from .env: ${keys.join(', ')}`);
}

// Debug: Check specific relevant keys in process.env
const debugKeys = ['ODDS_API_KEY', 'COGNITO_REGION', 'COGNITO_USER_POOL_ID', 'DDB_TABLE', 'REDIS_HOST'];
const envState = debugKeys.map(k => `${k}=${process.env[k] ? 'SET' : 'MISSING'}`).join(', ');
console.log(`[DEBUG] Final process.env state: ${envState}`);

const app = express();
const port = process.env.PORT || 4000;
const ODDS_API_KEY_SSM_PATH = '/arb-finder/odds-api-key';
const REDIS_HOST_SSM_PATH = '/stakt/redis/host';
const REDIS_PORT_SSM_PATH = '/stakt/redis/port';

let ODDS_API_KEY = process.env.ODDS_API_KEY;

// Re-check and fetch from cloud if needed
async function initializeSecurity() {
  // 1. Fetch Odds API Key
  ODDS_API_KEY = await getSecret(ODDS_API_KEY_SSM_PATH, ODDS_API_KEY);
  if (!ODDS_API_KEY) {
    console.warn(`[WARN] ODDS_API_KEY is not set globally or via ${envPath}.`);
  } else {
    const mask = (k) => (k && k.length >= 8) ? `${k.slice(0, 4)}...${k.slice(-4)} (len:${k.length})` : '(short)';
    console.log(`[INFO] Odds API Key is active (Source: ${process.env.ODDS_API_KEY === ODDS_API_KEY ? '.env' : 'AWS SSM'})`);
    process.env.ODDS_API_KEY = ODDS_API_KEY;
  }

  // 2. Fetch Redis Configuration (Critical for auto-resume after pause)
  const redisHost = await getSecret(REDIS_HOST_SSM_PATH, process.env.REDIS_HOST);
  const redisPort = await getSecret(REDIS_PORT_SSM_PATH, process.env.REDIS_PORT);

  if (redisHost) {
    process.env.REDIS_HOST = redisHost;
    console.log(`[INFO] Redis Host configured: ${redisHost}`);
  }
  if (redisPort) {
    process.env.REDIS_PORT = redisPort;
    console.log(`[INFO] Redis Port configured: ${redisPort}`);
  }
}

initializeSecurity();

// CORS Configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://stakt.live',
  'https://www.stakt.live'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // DEBUG: Log the origin to see what's failing matched
    console.log('[CORS] Checking origin:', origin);

    if (allowedOrigins.indexOf(origin) === -1) {
      console.log('[CORS] Blocked:', origin);
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true // Important for cookies/authorization headers
}));
app.use(express.json());
app.use(morgan('dev'));

// Global Rate Limiter for API (500 requests per 15 mins)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Apply limiting to all /api routes
app.use('/api', apiLimiter);

// Cognito JWT verification middleware
const COGNITO_REGION = process.env.COGNITO_REGION;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const COGNITO_APP_CLIENT_ID = process.env.COGNITO_APP_CLIENT_ID;
let jwks = null;
let issuer = null;
if (COGNITO_REGION && COGNITO_USER_POOL_ID) {
  issuer = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`;
  const jwksUrl = new URL(`${issuer}/.well-known/jwks.json`);
  jwks = jose.createRemoteJWKSet(jwksUrl);
  console.log(`[INFO] Cognito JWT verification enabled. Issuer=${issuer}, Audience(AppClientID)=${COGNITO_APP_CLIENT_ID || '(not set - audience not enforced)'}`);
} else {
  console.warn('[WARN] COGNITO_REGION and/or COGNITO_USER_POOL_ID not set. Skipping JWT verification.');
}

async function verifyJwtMiddleware(req, res, next) {
  // Allow health to remain public
  if (req.path === '/api/health') return next();
  // Only protect /api routes
  if (!req.path.startsWith('/api')) return next();

  if (!jwks || !issuer) return next(); // if not configured, allow through (dev mode)

  try {
    const auth = req.headers['authorization'] || '';
    const [, token] = auth.split(' ');
    if (!token) return res.status(401).json({ error: 'Missing Authorization Bearer token' });

    const { payload } = await jose.jwtVerify(token, jwks, {
      issuer,
      audience: COGNITO_APP_CLIENT_ID, // if undefined, jose will not enforce audience
    });

    // Attach user info for downstream routes if needed
    req.cognito = { sub: payload.sub, username: payload['cognito:username'], email: payload.email, payload };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token', details: err?.message });
  }
}

app.use(verifyJwtMiddleware);

// Start the background cache warming worker
// startWorker();

// (Deleted inline functions as they are now imported)

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Arb server running', hasApiKey: Boolean(ODDS_API_KEY) });
});

app.get('/api/sports', async (req, res) => {
  try {
    const sports = await oddsGet('/sports');
    res.json(sports);
  } catch (err) {
    console.error('[ERROR] /api/sports failed:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch sports', details: err?.response?.data || err.message });
  }
});

app.get('/api/odds', async (req, res) => {
  const { sportKey, regions = 'us', markets = 'h2h', oddsFormat = 'american', dateFormat = 'iso' } = req.query;
  if (!sportKey) return res.status(400).json({ error: 'sportKey is required' });
  try {
    const data = await oddsGet(`/sports/${sportKey}/odds`, { regions, markets, oddsFormat, dateFormat });
    res.json(data);
  } catch (err) {
    console.error('[ERROR] /api/odds failed:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch odds', details: err?.response?.data || err.message });
  }
});

app.get('/api/arbs', async (req, res) => {
  const { sportKey, regions = 'us', markets = 'h2h', oddsFormat = 'american', dateFormat = 'iso', roundingUnit = '1', bankroll = '100' } = req.query;
  if (!sportKey) return res.status(400).json({ error: 'sportKey is required' });
  try {
    const events = await oddsGet(`/sports/${sportKey}/odds`, { regions, markets, oddsFormat, dateFormat });
    const ru = Math.max(1, Number(roundingUnit) || 1);
    const bk = Math.max(1, Number(bankroll) || 100);
    const arbs = events.map(e => computeArbitrageForEvent(e, { bankroll: bk, roundingUnit: ru, requireRoundedPositive: true }))
      .filter(Boolean)
      .sort((a, b) => b.edge_rounded_percent - a.edge_rounded_percent);
    res.json({ count: arbs.length, arbs, rounding_unit: ru, bankroll: bk });
  } catch (err) {
    console.error('[ERROR] /api/arbs failed:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to compute arbs', details: err?.response?.data || err.message });
  }
});

// --- DynamoDB integration for user bets ---
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const DDB_TABLE = process.env.DDB_TABLE || 'ArbBets';
let ddbDoc = null;
try {
  const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
  ddbDoc = DynamoDBDocumentClient.from(ddbClient);
  console.log(`[INFO] DynamoDB DocumentClient initialized. Table=${DDB_TABLE}`);
} catch (e) {
  console.warn('[WARN] Failed to initialize DynamoDB client:', e?.message);
}

function requireAuth(req, res) {
  const sub = req?.cognito?.sub;
  if (!sub) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return sub;
}

// Fetch bets list for current user
app.get('/api/bets', async (req, res) => {
  const sub = requireAuth(req, res);
  if (!sub) return;
  if (!ddbDoc) return res.status(500).json({ error: 'DynamoDB not configured' });
  try {
    const userID = sub;
    const betID = 'BETS'; // Using fixed Sort Key for singleton bets list
    const { Item } = await ddbDoc.send(new GetCommand({ TableName: DDB_TABLE, Key: { userID, betID } }));
    const bets = Item?.data || [];
    res.json({ bets, updatedAt: Item?.updatedAt || null });
  } catch (err) {
    console.error('[ERROR] GET /api/bets failed:', err);
    res.status(500).json({ error: 'Failed to fetch bets' });
  }
});

// Replace bets list for current user
app.put('/api/bets', async (req, res) => {
  const sub = requireAuth(req, res);
  if (!sub) return;
  if (!ddbDoc) return res.status(500).json({ error: 'DynamoDB not configured' });
  const bets = Array.isArray(req.body?.bets) ? req.body.bets : null;
  if (!bets) return res.status(400).json({ error: 'bets array required' });
  try {
    const userID = sub;
    const betID = 'BETS';
    const now = new Date().toISOString();
    await ddbDoc.send(new PutCommand({
      TableName: DDB_TABLE,
      Item: { userID, betID, type: 'UserBets', userSub: sub, data: bets, updatedAt: now },
    }));
    res.json({ ok: true, updatedAt: now });
  } catch (err) {
    console.error('[ERROR] PUT /api/bets failed:', err);
    res.status(500).json({ error: 'Failed to save bets' });
  }
});

app.listen(port, () => {
  console.log(`Arb server listening on http://localhost:${port}`);
});
