import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import NodeCache from 'node-cache';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load server/.env from the server directory
const envPath = path.join(__dirname, '.env');
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.warn(`[WARN] Could not load .env at ${envPath}. Using process env only.`);
}

const app = express();
const port = process.env.PORT || 4000;
const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

if (!ODDS_API_KEY) {
  console.warn(`[WARN] ODDS_API_KEY is not set. Looked for ${envPath}. CWD=${process.cwd()}`);
} else {
  const mask = (k) => (k && k.length >= 8) ? `${k.slice(0,4)}...${k.slice(-4)} (len:${k.length})` : '(short)';
  console.log(`[INFO] Loaded ODDS_API_KEY=${mask(ODDS_API_KEY)} from ${envPath}`);
}

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

async function oddsGet(path, params = {}) {
  const url = `${ODDS_API_BASE}${path}`;
  const finalParams = { apiKey: ODDS_API_KEY, ...params };
  const cacheKey = `${url}?${new URLSearchParams(finalParams).toString()}`;

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const { data } = await axios.get(url, { params: finalParams });
  cache.set(cacheKey, data);
  return data;
}

function americanToDecimal(american) {
  const o = Number(american);
  if (!Number.isFinite(o)) return null;
  return o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o);
}

function computeArbitrageForEvent(event, { bankroll = 100, roundingUnit = 1, requireRoundedPositive = true } = {}) {
  // event: from /sports/{sportKey}/odds with markets=h2h
  const market = event.bookmakers?.flatMap(bm => bm.markets || [])?.find(m => m.key === 'h2h');
  if (!market) return null;

  // Build best price per outcome across bookmakers
  const outcomeBest = new Map(); // outcome name -> { priceAmerican, priceDecimal, bookmaker, last_update }

  for (const bm of event.bookmakers || []) {
    const h2h = bm.markets?.find(m => m.key === 'h2h');
    if (!h2h) continue;
    for (const out of h2h.outcomes || []) {
      const dec = americanToDecimal(out.price);
      if (!dec) continue;
      const prev = outcomeBest.get(out.name);
      if (!prev || dec > prev.priceDecimal) {
        outcomeBest.set(out.name, {
          priceAmerican: out.price,
          priceDecimal: dec,
          bookmaker: bm.key,
          last_update: h2h.last_update || bm.last_update || event.commence_time,
        });
      }
    }
  }

  const outcomes = Array.from(outcomeBest.entries()).map(([name, info]) => ({ name, ...info }));
  if (outcomes.length < 2) return null; // need at least two outcomes

  const sumInv = outcomes.reduce((acc, o) => acc + 1 / o.priceDecimal, 0);
  if (sumInv >= 1) return null; // no arb

  const edge = 1 / sumInv - 1; // profit percentage on total stake

  // Exact stake split on bankroll basis
  const stakes = outcomes.map(o => ({
    name: o.name,
    stake: (bankroll / o.priceDecimal) / sumInv,
  }));
  const guaranteedPayout = bankroll / sumInv;

  // Rounded stake split (nearest roundingUnit, default $1)
  const roundToUnit = (x, unit) => Math.round(x / unit) * unit;
  const stakesRounded = stakes.map(s => ({ ...s, stake: roundToUnit(s.stake, roundingUnit) }));
  const totalStakeRounded = stakesRounded.reduce((a, s) => a + s.stake, 0);
  // Payout per outcome = stake_on_outcome * decimal_price
  const payouts = outcomes.map((o, idx) => stakesRounded[idx].stake * o.priceDecimal);
  const guaranteedPayoutRounded = Math.min(...payouts);
  const profitRounded = guaranteedPayoutRounded - totalStakeRounded;
  const edgeRoundedPercent = totalStakeRounded > 0 ? (profitRounded / totalStakeRounded) * 100 : -Infinity;

  if (requireRoundedPositive && edgeRoundedPercent <= 0) return null;

  return {
    id: event.id,
    sport_key: event.sport_key,
    sport_title: event.sport_title,
    commence_time: event.commence_time,
    home_team: event.home_team,
    away_team: event.away_team,
    outcomes,
    sum_inverse: sumInv,
    edge_percent: edge * 100,
    bankroll_example: bankroll,
    stakes,
    guaranteed_payout: guaranteedPayout,
    rounding_unit: roundingUnit,
    stakes_rounded: stakesRounded,
    total_stake_rounded: totalStakeRounded,
    guaranteed_payout_rounded: guaranteedPayoutRounded,
    edge_rounded_percent: edgeRoundedPercent,
    profit_rounded: profitRounded,
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Arb server running', hasApiKey: Boolean(ODDS_API_KEY) });
});

app.get('/api/sports', async (req, res) => {
  try {
    const sports = await oddsGet('/sports');
    res.json(sports);
  } catch (err) {
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
    res.status(500).json({ error: 'Failed to compute arbs', details: err?.response?.data || err.message });
  }
});

app.listen(port, () => {
  console.log(`Arb server listening on http://localhost:${port}`);
});
