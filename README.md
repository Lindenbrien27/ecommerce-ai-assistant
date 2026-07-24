# E-Commerce AI Assistant

Automated order & tracking support assistant. An Express API that lets customers ask natural-language questions about their orders, backed by OpenAI tool-calling and a Neon (serverless Postgres) database.

![CI](https://github.com/Lindenbrien27/ecommerce-ai-assistant/actions/workflows/ci.yml/badge.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/express-4.x-000000?logo=express&logoColor=white)
![Postgres](https://img.shields.io/badge/postgres-Neon-4169E1?logo=postgresql&logoColor=white)
![OpenAI](https://img.shields.io/badge/openai-tool--calling-412991?logo=openai&logoColor=white)
![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white)

## Features

- Natural-language chat endpoint that looks up real order data via OpenAI function/tool calling
- Order lookup by order number, customer email, or tracking number
- REST endpoint for direct order lookups (`GET /api/orders/:id`)
- Minimal static chat UI for local testing
- Postgres-backed via Neon; schema auto-applies on startup

## Tech Stack

| Layer    | Choice                               |
|----------|---------------------------------------|
| Runtime  | Node.js + Express                     |
| Database | Neon (serverless Postgres) via `pg`   |
| AI       | OpenAI SDK (tool/function calling)    |
| Frontend | Static HTML/CSS/JS (`public/`)        |

## Architecture

```mermaid
flowchart LR
    UI[public/ chat UI] -->|POST /api/chat| ChatRoute[chatRoutes]
    Client[REST client] -->|GET /api/orders/:id| OrderRoute[orderRoutes]
    ChatRoute --> ChatCtrl[chatController]
    OrderRoute --> OrderCtrl[orderController]
    ChatCtrl --> AIService[aiService]
    AIService -->|tool calls| Tools[trackingTools]
    Tools --> OrderService[orderService]
    OrderCtrl --> OrderService
    AIService --> OpenAI[(OpenAI API)]
    OrderService --> DB[(Neon Postgres)]
```

## API

| Method | Path              | Description                                                      |
|--------|-------------------|--------------------------------------------------------------------|
| GET    | `/health`         | Liveness check for load balancers / container orchestrators        |
| POST   | `/api/chat`       | Send a conversation; assistant replies using order-lookup tools    |
| GET    | `/api/orders/:id` | Fetch a single order by order number                              |

## Setup

```bash
npm install
cp .env.example .env
# fill in OPENAI_API_KEY and DATABASE_URL (from your Neon project) in .env
npm start
```

The `orders` table and seed rows are created automatically on startup via `database.sql`. Server runs at `http://localhost:3000`.

## Testing

```bash
npm test
```

Runs the `node:test` suite (`test/`). Database and OpenAI calls are mocked, so tests don't touch Neon or incur API costs.

## Docker

```bash
docker compose up --build
```

Builds the app image and runs it against your `.env` (`docker-compose.yml`). The container exposes a `/health` check.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs the test suite and builds the Docker image on every push/PR to `main`.

## Project Structure

```
src/
├── config/       # DB connection (pg Pool) and OpenAI client setup
├── services/     # business logic - order queries, AI chat/tool-calling loop
├── tools/        # LLM tool/function definitions and their implementations
├── controllers/  # request/response handling
├── routes/       # Express route definitions
└── app.js        # Express app assembly
server.js         # process entry point - inits DB schema, then listens
public/           # static frontend chat UI
test/             # node:test suite (mocked DB/OpenAI, no live calls)
Dockerfile, docker-compose.yml, .dockerignore   # containerization
.env.example      # documents required environment variables
.github/workflows/ci.yml                        # test + Docker build on push/PR
```
