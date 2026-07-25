# E-Commerce AI Assistant

Automated order & tracking support assistant. An Express API that lets customers ask natural-language questions about their orders, backed by Claude tool-calling and a Neon (serverless Postgres) database.

![CI](https://github.com/Lindenbrien27/ecommerce-ai-assistant/actions/workflows/ci.yml/badge.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/express-4.x-000000?logo=express&logoColor=white)
![React](https://img.shields.io/badge/react-18-149ECA?logo=react&logoColor=white)
![Postgres](https://img.shields.io/badge/postgres-Neon-4169E1?logo=postgresql&logoColor=white)
![Claude](https://img.shields.io/badge/claude-tool--calling-D97757?logo=anthropic&logoColor=white)
![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white)

## Features

- Natural-language chat endpoint that looks up real order data via Claude tool calling, scoped to the authenticated customer
- REST endpoints for listing a customer's orders and fetching one by number
- React UI (`frontend/`, Vite) with client-side routing: an order list, per-order detail pages, and the chat view, gated behind order-ownership verification
- Postgres-backed via Neon; schema auto-applies on startup

## Tech Stack

| Layer    | Choice                               |
|----------|---------------------------------------|
| Runtime  | Node.js + Express                     |
| Database | Neon (serverless Postgres) via `pg`   |
| AI       | Claude (Anthropic SDK, tool calling), model `claude-haiku-4-5` |
| Frontend | React 18 + Vite (`frontend/`)         |

## Architecture

```mermaid
flowchart LR
    UI[React chat UI - frontend/dist] -->|POST /api/chat| ChatRoute[chatRoutes]
    Client[REST client] -->|GET /api/orders/:id| OrderRoute[orderRoutes]
    ChatRoute --> ChatCtrl[chatController]
    OrderRoute --> OrderCtrl[orderController]
    ChatCtrl --> AIService[aiService]
    AIService -->|tool calls| Tools[trackingTools]
    Tools --> OrderService[orderService]
    OrderCtrl --> OrderService
    AIService --> Claude[(Claude API)]
    OrderService --> DB[(Neon Postgres)]
```

## API

| Method | Path              | Description                                                      |
|--------|-------------------|--------------------------------------------------------------------|
| GET    | `/health`         | Liveness check for load balancers / container orchestrators (no auth) |
| POST   | `/api/auth/verify` | Prove ownership of an order (order number + email) and receive a customer-scoped token (no auth) |
| POST   | `/api/chat`       | Send a conversation; assistant replies using order-lookup tools scoped to the authenticated customer (requires `Authorization: Bearer <token>`) |
| GET    | `/api/orders`     | List every order belonging to the authenticated customer (requires `Authorization: Bearer <token>`) |
| GET    | `/api/orders/:id` | Fetch a single order by order number - only if it belongs to the authenticated customer (requires `Authorization: Bearer <token>`) |

## Setup

```bash
npm install
npm run build       # builds frontend/dist (installs frontend deps first)
cp .env.example .env
# fill in ANTHROPIC_API_KEY, DATABASE_URL (from your Neon project), and JWT_SECRET in .env
npm start
```

For frontend-only iteration, `npm --prefix frontend run dev` runs Vite's dev server on its own port and proxies `/api/*` to a locally running `npm start` on port 3000.

`ANTHROPIC_API_KEY` comes from an Anthropic Console account (console.anthropic.com) - separate from any claude.ai chat subscription, billed per token.

The `orders` table and seed rows are created automatically on startup via `database.sql`. Server runs at `http://localhost:3000`.

### Auth

Per-customer, not a shared key. A customer proves who they are with something only they'd know: their order number *and* the email it was placed under - the same low-friction pattern real package-tracking tools use (Shopify, UPS, FedEx). No password to store, no email-sending service required.

```bash
# 1. Verify ownership, get a token scoped to that customer's email
curl -X POST http://localhost:3000/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"orderNumber": "ORD-1001", "email": "jane.doe@example.com"}'
# => {"token": "eyJhbGciOi..."}

# 2. Use it on subsequent requests
curl -H "Authorization: Bearer eyJhbGciOi..." http://localhost:3000/api/orders/ORD-1001
```

The token is a JWT (`JWT_SECRET`, 1 hour expiry) carrying the customer's email. Every protected route uses it, never a value the client supplies:

- `GET /api/orders/:id` - `orderController` returns `404` (not `403`, to avoid confirming another customer's order exists) if the order's `customer_email` doesn't match the token.
- `POST /api/chat` - the authenticated email is passed into `aiService.runChat()` and threaded through to every tool implementation in `trackingTools.js`. Each one enforces the ownership check server-side (`get_my_orders` ignores any email the model might be told to pass and always uses the authenticated one), so the assistant can't be prompted into revealing a different customer's order - the model never has the ability to ask for someone else's data in the first place.

`RATE_LIMIT_AUTH_MAX` (default 10 per `RATE_LIMIT_AUTH_WINDOW_MS`, default 60s) limits `/api/auth/verify` specifically, since it's a credential-guessing surface.

### Rate limiting

- `/api/auth/verify` is capped at `RATE_LIMIT_AUTH_MAX` requests (default 10) per `RATE_LIMIT_AUTH_WINDOW_MS` (default 60s) per client, to slow down (order number, email) guessing.
- `/api/chat` is capped at `RATE_LIMIT_MAX` requests (default 20) per `RATE_LIMIT_WINDOW_MS` (default 60s) per client, to bound Claude API cost under abuse or accidental retry loops.
- `/api/orders/:id` is capped at `RATE_LIMIT_ORDERS_MAX` requests (default 30) per `RATE_LIMIT_ORDERS_WINDOW_MS` (default 60s) per client, to slow down order-number enumeration/scanning attempts.

Each is an independent limiter (separate quota). Exceeding any of them returns `429`.

### Structured logging

Logging runs on [pino](https://getpino.io) (`src/config/logger.js`), emitting structured JSON lines (level, timestamp, message, fields) instead of plain strings - readable by Render's log viewer or any log aggregator. `pino-http` logs every request/response (method, url, status, response time, a generated request id), including ones that never reach a route (404s, auth rejections, rate limits). Level is configurable via `LOG_LEVEL` (default `info`).

`src/utils/logger.js`'s `logError(label, err)` wraps this for caught errors, and the configured `err` serializer only ever includes `type`/`message`/`stack` - never the raw error object. Some HTTP client libraries attach debug properties (request config, headers) directly to thrown errors, and pino's *default* error serializer would include those; ours doesn't, closing a real path for an API key or Authorization header to end up in logs. Client-facing error responses are always a fixed generic message regardless of the underlying failure.

### Frontend routing

`react-router-dom` (`BrowserRouter`), not just conditionally-rendered state. Four real routes, each with a distinct URL, browser back/forward, and direct-link support:

| Route | Page | Access |
|---|---|---|
| `/verify` | `VerifyPage` | Public only - redirects to `/orders` if already authenticated |
| `/orders` | `OrdersPage` | Protected - lists the customer's orders (`GET /api/orders`) |
| `/orders/:orderNumber` | `OrderDetailPage` | Protected - single order (`GET /api/orders/:id`); a different customer's order number 404s here the same as it does over the API |
| `/chat` | `ChatPage` | Protected |

`AuthContext` (`frontend/src/context/AuthContext.jsx`) holds the token and is read by `ProtectedRoute`/`PublicOnlyRoute` to decide whether to render the route or `<Navigate>` elsewhere. Since `express.static` alone 404s on a hard refresh of a client-side route like `/orders/ORD-1001` (no such file exists), `src/app.js` has a catch-all `app.get('*', ...)` after every real route that serves `frontend/dist/index.html` and lets React Router take over - verified working for both in-app navigation and direct/hard-loaded URLs.

### HTTPS enforcement

When `NODE_ENV=production`, `src/middleware/httpsEnforce.js` redirects any plain-HTTP request to HTTPS (301) and sets `Strict-Transport-Security` on secure responses. `app.set('trust proxy', 1)` is also enabled in production so Express derives `req.secure` (and the real client IP used by rate limiting) from Render's `X-Forwarded-Proto`/`X-Forwarded-For` headers, since Render terminates TLS at its edge and forwards plain HTTP to the container over one hop. This is inactive outside `NODE_ENV=production`, so local dev and tests are unaffected.

## Testing

```bash
npm test
```

Runs the `node:test` suite (`test/`). Database and Claude calls are mocked, so tests don't touch Neon or incur API costs.

## Docker

```bash
docker compose up --build
```

The `Dockerfile` is a multi-stage build: stage one installs `frontend/`'s dependencies and runs `vite build`, stage two installs the backend's production dependencies and copies in the built `frontend/dist`. Runs the resulting image against your `.env` (`docker-compose.yml`). The container exposes a `/health` check.

## Deploy

`render.yaml` defines a free Render web service that builds the existing `Dockerfile` and health-checks `/health`.

1. Push to GitHub (already done if you're reading this from the repo)
2. On [render.com](https://render.com), **New +** → **Blueprint** → connect this repo → Render detects `render.yaml`
3. Fill in the three prompted secrets (`ANTHROPIC_API_KEY`, `DATABASE_URL`, `JWT_SECRET`) - they're marked `sync: false` so Render asks for them rather than storing them in the repo
4. Deploy - Render assigns a public `https://<name>.onrender.com` URL

The free tier spins down after 15 minutes idle, so the first request after inactivity has a cold-start delay (same tradeoff as Neon's compute auto-suspend).

## CI

GitHub Actions (`.github/workflows/ci.yml`) builds `frontend/`, runs the test suite, and builds the Docker image on every push/PR to `main`.

## Project Structure

```
src/
├── config/       # DB connection (pg Pool), Claude client, and pino logger setup
├── services/     # business logic - order/auth queries, AI chat/tool-calling loop
├── tools/        # LLM tool/function definitions, scoped to the authenticated customer
├── controllers/  # request/response handling
├── routes/       # Express route definitions
├── middleware/   # customerAuth (JWT), rate limiters, HTTPS enforcement
└── app.js        # Express app assembly - serves frontend/dist
server.js         # process entry point - inits DB schema, then listens
frontend/          # React app (Vite) - separate package.json, own build
├── index.html               # Vite entry HTML
├── vite.config.js
└── src/
    ├── main.jsx               # mounts <App />
    ├── App.jsx                 # BrowserRouter + route definitions
    ├── index.css               # design tokens + component styles
    ├── context/
    │   └── AuthContext.jsx     # token state (sessionStorage-backed), login/logout
    ├── pages/
    │   ├── VerifyPage.jsx      # order number + email verification
    │   ├── OrdersPage.jsx      # GET /api/orders list
    │   ├── OrderDetailPage.jsx # GET /api/orders/:id, reads useParams
    │   └── ChatPage.jsx        # the chat widget
    └── components/
        ├── ProtectedRoute.jsx    # redirects to /verify when logged out
        ├── PublicOnlyRoute.jsx   # redirects to /orders when already logged in
        ├── Layout.jsx            # nav bar (Orders / Chat / Log out) + <Outlet/>
        ├── VerifyForm.jsx        # the verification form itself
        └── MessageBubble.jsx     # reusable bubble component (user/assistant/pending/error)
frontend/dist/     # build output (gitignored) - what Express actually serves
test/             # node:test suite (mocked DB/Claude, no live calls)
Dockerfile, docker-compose.yml, .dockerignore   # containerization; Dockerfile builds frontend/ in a separate stage
render.yaml       # Render Blueprint for deployment
.env.example      # documents required environment variables
.github/workflows/ci.yml                        # frontend build + test + Docker build on push/PR
```
