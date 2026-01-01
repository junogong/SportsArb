# Stakt - Sports Arbitrage Finder

A production-ready sports arbitrage hunting platform that scans bookmakers for guaranteed profit opportunities ("arbs"). Built with a focus on cloud-native architecture, security, and high performance.

<img width="1919" height="966" alt="Screenshot 2025-12-30 080742" src="https://github.com/user-attachments/assets/4229c84b-7c4c-45b4-a2b0-6dab53b7de2e" />

<img width="1916" height="965" alt="Screenshot 2025-12-30 080812" src="https://github.com/user-attachments/assets/83c8f1e7-d756-4aea-a92f-d3de88c20db9" />


## 🚀 Features

### Core Arbitrage Engine
*   **Real-time Odds**: Integrates with [The Odds API](https://the-odds-api.com/).
*   **Guaranteed Profit**: Automatically calculates edge percent, stake splits, and rounding logic.
*   **Fail-Open Caching**: Multi-layer Redis strategy ensures odds are served instantly even if the API is slow.

### Modern Frontend (React + Amplify)
*   **Interactive PnL Portfolio**: Track your comprehensive betting history with a `recharts` performance graph derived from actual bet data.
*   **Smart Grouping**: Bets are automatically grouped by Event.
*   **Auto-Sync**: Marking one outcome as "Win" automatically resolves sibling bets as "Lose".
*   **Premium UX**: Dark "Navy" theme, glassmorphism elements, and a subtle **animated nebula background**.
*   **Authentication**: Secure signup/login via AWS Cognito (Google Social Auth enabled).

### Enterprise Backend (Node.js)
*   **VPC Architecture**: Deployed on AWS EC2, protected by Security Groups.
*   **Redis Cluster**: Connected to **AWS ElastiCache** (Cluster Mode + TLS) for globally distributed caching.
*   **Secret Management**: Zero code secrets. API keys are fetched at runtime from **AWS Systems Manager Parameter Store**.
*   **Rate Limiting**: Protected by `express-rate-limit` (100 req/15min).
*   **Persistence**: AWS DynamoDB for immutable bet history storage.

## 🏗️ Architecture

```mermaid
graph LR
    %% --- Styling Definitions ---
    classDef userStyle fill:#f9f,stroke:#333,stroke-width:2px,color:black;
    classDef entryStyle fill:#d6eaf8,stroke:#2e86c1,stroke-width:2px,color:black;
    classDef computeStyle fill:#fcf3cf,stroke:#f1c40f,stroke-width:2px,color:black;
    classDef dataStyle fill:#fadbd8,stroke:#e74c3c,stroke-width:2px,color:black;
    classDef externalStyle fill:#ebedef,stroke:#95a5a6,stroke-width:2px,stroke-dasharray: 5 5,color:black;

    %% --- Nodes ---
    User([User]):::userStyle
    
    %% Entry Layer
    CloudFront["AWS Amplify (Frontend)"]:::entryStyle
    ALB[Nginx Reverse Proxy]:::entryStyle
    
    %% External
    External[The Odds API]:::externalStyle

    %% VPC Subgraph
    subgraph VPC [AWS Cloud VPC]
        style VPC fill:#fdfefe,stroke:#333,stroke-width:1px,stroke-dasharray: 5 5
        
        EC2[Node.js Server]:::computeStyle
        
        %% Data & Config
        Redis[(ElastiCache Redis)]:::dataStyle
        DDB[(DynamoDB)]:::dataStyle
        SSM{{AWS SSM Param Store}}:::dataStyle
    end

    %% --- Relationships ---
    User -->|HTTPS| CloudFront
    User -->|API Calls| ALB
    
    ALB -->|Forward| EC2
    
    EC2 -->|Read/Write| Redis
    EC2 -->|Store Bets| DDB
    EC2 -->|Get Secrets| SSM
    
    EC2 -.->|Failover / Data| External
```

## 🛠️ Tech Stack

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

## 🧪 Testing & CI/CD
This project uses **Jest** for backend unit testing and **GitHub Actions** for automated validation.

### Running Tests Locally
```bash
cd server
npm test
```
This executes the test suite in `server/tests/`, verifying:
*   Arbitrage Math Logic (Positive/Negative cases)
*   Data parsing resilience

### Automated Pipeline
On every `git push` to `main`, GitHub Actions:
1.  Installs dependencies (Client & Server).
2.  Builds the React Frontend.
3.  Runs the Backend Unit Tests.
4.  (Optional) Deploys to AWS if all checks pass.

## 📈 Performance
*   **Cache Hit**: < 3ms response time.
*   **Cache Miss**: ~400ms (API fetch) -> Auto-caches for 15 minutes.
