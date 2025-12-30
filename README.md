# Stakt - Sports Arbitrage Finder

A real-time sports arbitrage betting tool that scans multiple bookmakers for guaranteed profit opportunities. Built with a React frontend, Node.js backend, Redis caching, and DynamoDB for persistence.

## Features

*   **Real-time Odds**: Fetches odds from [The Odds API](https://the-odds-api.com/).
*   **Production-Grade Caching**: Uses **Redis** (Cache-Aside pattern) to serve high-traffic odds requests with sub-millisecond latency.
*   **Secure API Keys**: Integrates with **AWS Systems Manager Parameter Store** to keep secrets out of source code and env files.
*   **Rate Limiting**: Protected by `express-rate-limit` to prevent API abuse and quota exhaustion.
*   **Arbitrage Calculation**: Automatically identifies "arbs" (situations where odds differences allow guaranteed profit).
*   **Cloud Persistence**: All bets are stored securely in **AWS DynamoDB**.
*   **User Authentication**: Integrated with AWS Amplify / Cognito.
*   **Modern UI**: Sleek, minimal "Navy" dark mode interface.

## Architecture

*   **Frontend**: React, Vite, AWS Amplify UI, Recharts.
*   **Backend**: Node.js, Express, AWS SDK v3.
*   **Database**: AWS DynamoDB (Serverless).
*   **Caching**: Redis (Cluster Mode).
*   **Infrastructure**: AWS EC2, Amplify Hosting, Route53, Systems Manager.

## 📦 Setup & Installation

### 1. Prerequisites
*   Node.js v18+
*   AWS Account (DynamoDB, SSM, Cognito)
*   Redis (Local Docker or ElastiCache)

### 2. Environment Variables

**Backend (`server/.env`):**
```env
PORT=4000
REDIS_HOST=localhost (or clustercfg.xxx.cache.amazonaws.com)
REDIS_PORT=6379
DDB_TABLE=ArbBets
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_xxxx
COGNITO_APP_CLIENT_ID=xxxx
```

**Frontend (`client/.env`):**
```env
VITE_API_URL=https://api.stakt.live (or http://localhost:4000)
```

### 3. Running Locally
```bash
# 1. Start Redis
docker run -p 6379:6379 -d redis

# 2. Start Backend
cd server
npm install
npm run dev

# 3. Start Frontend
cd client
npm install
npm run dev
```

## 🔒 Security Best Practices
1.  **Secret Rotation**: Use AWS SSM to rotate the `ODDS_API_KEY` without redeploying code.
2.  **Least Privilege**: The EC2 instance role only has permission to `PutItem` on the specific DDB table and `GetParameter` for the specific SSM path.
3.  **TLS Encryption**: All Redis connections (if ElastiCache) are encrypted in transit.

## 📈 Performance
*   **Cache Hit**: < 3ms response time.
*   **Cache Miss**: ~400ms (API fetch) -> Auto-caches for 15 minutes.
