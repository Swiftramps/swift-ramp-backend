# SwiftRamp Backend

A Fastify service that sits between the SwiftRamp frontend and the `swiftramp-swap` Soroban contract on Stellar. It does two jobs:

1. **API layer** — read-only quotes, relaying client-signed swap transactions, checking swap status, and recent swap history for a wallet.
2. **Rate oracle** — polls a real FX rate source on a schedule and pushes `set_rate` updates on-chain, so the contract's conversion math stays in sync with real-world rates without manual CLI calls.

This service never holds a user's private key. Swaps are built and signed client-side (e.g. via Freighter in the frontend) and only the signed transaction is sent here for submission. The one private key this service *does* hold is the **oracle key** — the contract admin's secret key, used only to sign `set_rate` calls on a timer.

---

## Architecture

```
┌─────────────┐      quote / submit signed tx      ┌──────────────────┐      Soroban RPC      ┌────────────────────┐
│  Frontend    │ ─────────────────────────────────▶ │  swiftramp-backend│ ─────────────────────▶ │ swiftramp-swap      │
│ (Next.js)    │ ◀───────────────────────────────── │  (this service)   │ ◀───────────────────── │ contract (Soroban)  │
└─────────────┘      status / history JSON          └──────────────────┘      quote/set_rate     └────────────────────┘
                                                              │
                                                              │ scheduled poll (node-cron)
                                                              ▼
                                                     ┌──────────────────┐
                                                     │  FX rate source   │
                                                     │ (open.er-api.com) │
                                                     └──────────────────┘
```

---

## Project structure

```
swiftramp-backend/
├── .env.example          # Template for required environment variables
├── .env                  # Your actual secrets/config — never commit this
├── tsconfig.json
├── package.json
└── src/
    ├── server.ts          # Entry point: wires up Fastify, CORS, routes, and the oracle scheduler
    ├── config.ts          # Central env-driven config, validates required vars on boot
    ├── lib/
    │   └── stellar.ts     # All Soroban RPC logic: quote, set_rate, swap submission/status, event history
    ├── routes/
    │   ├── quote.ts       # GET /quote
    │   ├── swap.ts        # POST /swap/submit, GET /swap/:hash/status
    │   └── history.ts     # GET /history/:address
    └── oracle/
        └── rateOracle.ts  # Scheduled job: fetches FX rates, pushes set_rate on-chain
```

---

## Prerequisites

- Node.js 18+ (for native `fetch` support used by the rate oracle)
- A deployed `swiftramp-swap` Soroban contract on testnet (or mainnet), already `initialize`d
- Token contracts registered on that contract for each currency you plan to support (via `set_currency_token`)
- The **secret key** of the contract's admin account

---

## Setup

**1. Install dependencies**
```bash
npm install
```

**2. Configure environment**
```bash
cp .env.example .env
```
Then fill in `.env`:

| Variable | Description |
|---|---|
| `PORT` | Port the API listens on (default `4000`) |
| `SOROBAN_RPC_URL` | Soroban RPC endpoint (default: public testnet RPC) |
| `NETWORK_PASSPHRASE` | Must match the network your contract is deployed to |
| `SWAP_CONTRACT_ID` | Your deployed contract's `C...` address |
| `ORACLE_SECRET_KEY` | Secret key (`S...`) of the contract's `admin` account — get it with `stellar keys show admin` |
| `CURRENCY_TOKENS_JSON` | JSON map of currency code → token contract address, e.g. `{"USD":"C...","NGN":"C..."}` |
| `ORACLE_INTERVAL_MS` | How often the rate oracle runs, in milliseconds (default 5 minutes) |
| `NODE_ENV` | Runtime environment. Only `development` mirrors arbitrary CORS origins. |
| `ALLOWED_ORIGINS` | Required for browser access in production. Comma-separated exact origins. |

### CORS configuration

Development mode accepts requests from any browser origin for local tooling. In
production, browser requests to API routes are accepted only when their
`Origin` header exactly matches an entry in `ALLOWED_ORIGINS`. Whitespace
around comma-separated entries is ignored.

For example:

```env
NODE_ENV=production
ALLOWED_ORIGINS=https://swiftramp.com,https://app.swiftramp.com
```

Requests without an `Origin` header, such as server-to-server and CLI
requests, remain supported. The `/health` endpoint is always public for
deployment probes. If `ALLOWED_ORIGINS` is omitted in production,
cross-origin browser requests are denied by default.

Rate limits are keyed by allowed origin when one is present and by client IP
otherwise, preventing one frontend origin from consuming another origin's
quota.

**3. Run in development**
```bash
npm run dev
```
This starts the server with `tsx watch`, runs the rate oracle once immediately, and re-runs it on the configured interval.

**4. Build and run in production**
```bash
npm run build
npm start
```

---

## API reference

### `GET /health`
Liveness check.

**Response**
```json
{ "ok": true }
```

**Example curl**
```bash
curl http://localhost:4000/health
```

---

### `GET /quote`
Read-only conversion preview, computed by simulating the contract's own `quote` function — so the number returned is guaranteed to match what an actual swap would produce, not a client-side copy of the rate table.

**Query parameters**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `from` | string | Yes | Source currency code (3 letters, e.g., USD) |
| `to` | string | Yes | Target currency code (3 letters, e.g., NGN) |
| `amount` | string | Yes | Amount to convert (decimal number as string) |

**Response**
```json
{
  "from": "USD",
  "to": "NGN",
  "sendAmount": "100",
  "receiveAmount": "158000.0000000"
}
```

**Error cases**
- 400: Missing or invalid query parameters
- 502: Simulation failed or RPC error

**Example curl**
```bash
curl "http://localhost:4000/quote?from=USD&to=NGN&amount=100"
```

---

### `POST /swap/submit`
Relays an already-signed transaction to the network and waits for confirmation. The frontend builds and signs this transaction itself (e.g., via Freighter) — this endpoint never sees a private key.

**Request body**
```json
{
  "signedTxXdr": "<base64 signed transaction envelope>"
}
```

**Response**
```json
{
  "txHash": "a3f...",
  "receivedAmount": "1580000000000"
}
```

**Error cases**
- 400: Missing or invalid `signedTxXdr`
- 502: Transaction rejected by Soroban RPC or failed to confirm within timeout

**Example curl**
```bash
curl -X POST http://localhost:4000/swap/submit \
  -H "Content-Type: application/json" \
  -d '{"signedTxXdr": "AAAAAgAAAAA..."}'
```

---

### `GET /swap/:hash/status`
Polls the ledger for a transaction's current status.

**Path parameters**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `hash` | string | Yes | Transaction hash |

**Response**
```json
{
  "status": "SUCCESS",
  "receivedAmount": "1580000000000"
}
```

Status values:
- `SUCCESS`: Transaction succeeded
- `FAILED`: Transaction failed
- `NOT_FOUND`: Transaction not found in ledger

**Example curl**
```bash
curl http://localhost:4000/swap/a3f.../status
```

---

### `GET /history/:address`
Recent `swap` contract events involving the given address, either as sender or recipient. Note this reads directly from the RPC provider's event stream, which typically retains only recent history (days, not months).

**Path parameters**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `address` | string | Yes | Stellar public key (must start with G and be 56 characters long) |

**Response**
```json
{
  "address": "GDNSOJUOGMIOOBZVSCE2XB7F7WGBHVC3ELL3N47ANO3QFOKN4UMHCIQJ",
  "swaps": [
    {
      "ledger": 123456,
      "txHash": "a3f...",
      "sender": "G...",
      "recipient": "G...",
      "receivedAmount": "1580000000000"
    }
  ]
}
```

**Error cases**
- 400: Invalid Stellar address

**Example curl**
```bash
curl http://localhost:4000/history/GDNSOJUOGMIOOBZVSCE2XB7F7WGBHVC3ELL3N47ANO3QFOKN4UMHCIQJ
```

---

### `GET /audit/contract`
Returns contract audit information: admin address and current registered currency rates.

**Response**
```json
{
  "admin": "G...",
  "rates": {
    "USD": "10000000",
    "NGN": "1580000000"
  }
}
```

**Error cases**
- 502: Simulation failed or RPC error

**Example curl**
```bash
curl http://localhost:4000/audit/contract
```

---

### `GET /audit/oracle`
Returns oracle audit information: oracle public address and configured update interval.

**Response**
```json
{
  "address": "G...",
  "intervalMs": 300000
}
```

**Example curl**
```bash
curl http://localhost:4000/audit/oracle
```

> **Note:** this reads live from the RPC provider's event stream, which typically only retains recent history (days, not months). For a permanent activity log, add a small database that persists events as they're observed rather than re-querying the ledger on every request.

---

## The rate oracle

On startup, and then every `ORACLE_INTERVAL_MS`, the service:
1. Fetches USD-based FX rates from a free public source (`open.er-api.com`, no API key required)
2. For each currency registered in `CURRENCY_TOKENS_JSON`, converts that rate to the contract's scaled integer format
3. Signs and submits a `set_rate` call using the oracle key, confirming each one lands before moving to the next currency

If the FX source is unreachable, or a specific currency isn't in the response, that run logs an error and skips — it does not crash the server or stop future scheduled runs.

**Swapping the FX source:** the free API used here is a reasonable default but not guaranteed uptime/SLA. To switch providers, only `fetchUsdRates()` in `src/oracle/rateOracle.ts` needs to change — everything downstream (scaling, signing, submission) stays the same.

---

## Security notes

- `ORACLE_SECRET_KEY` can move real funds via `set_rate` authorization and should be treated like any production private key — use a secrets manager in deployment, not a plaintext `.env` file on a shared server.
- CORS mirrors request origins only in development. Production deployments must configure `ALLOWED_ORIGINS`.
- Production requests are rate-limited per browser origin, falling back to client IP for requests without an `Origin` header.

---

## Related repositories

- **Contract**: `swiftramp-smartcontract` — the Soroban contract this service calls (`swap`, `quote`, `set_rate`, etc.)
- **Frontend**: the Next.js app — calls `/quote` for live pricing, and will call `/swap/submit` once wired up to route signed transactions through this backend instead of hitting Soroban RPC directly.
