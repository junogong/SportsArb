# Sports Arbitrage Finder

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

*   **Frontend**: React (Vite), AWS Amplify UI.
*   **Backend**: Node.js, Express, AWS SDK v3.
*   **Database**: AWS DynamoDB (Table: `ArbBets`).
*   **Cache**: Redis (Key-Value Store).
*   **Auth**: AWS Cognito.

## Prerequisites

1.  **Node.js** (v18+).
2.  **AWS Account** (DynamoDB).
3.  **Redis** (v6+). We recommend running it via Docker.
4.  **The Odds API Key**.

## Setup & Installation

### 1. Clone & Install
```bash
# Install dependencies
npm install
cd client && npm install
cd ../server && npm install
```

### 2. Infrastructure Setup

**Redis (Required):**
Start a local Redis instance using Docker:
```bash
docker run --name arb-redis -p 6379:6379 -d redis
```

**AWS DynamoDB:**
Create a table in `us-east-1` named `ArbBets` with:
-   Partition Key: `userID` (String)
-   Sort Key: `betID` (String)

### 3. Environment Configuration

**Server** (`server/.env`):
```env
PORT=4000
ODDS_API_KEY=your_key_here  # Fallback only
DDB_TABLE=ArbBets
```

**AWS Systems Manager (Recommended):**
Create a **SecureString** parameter in AWS SSM:
- Name: `/arb-finder/odds-api-key`
- Value: `[Your API Key]`

### 4. AWS Credentials
The server needs an IAM role or credentials with:
1. `ssm:GetParameter` for fetching secrets.
2. `dynamodb:*` for bet persistence.

```bash
aws configure
# Region: us-east-1
```

## API Limits & Throttling
To protect your internal and external API quotas:
- **Rate Limit**: 100 requests per 15 minutes per IP.
- **Cache**: Odds are cached for 15 minutes in Redis.

## Running the App

```bash
# Starts client and server
npm run dev
```

-   Frontend: http://localhost:5173
-   Backend: http://localhost:4000
