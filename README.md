# DemoHub — Interactive Product Demo Platform

DemoHub is an open-source alternative to **SupaDemo**. It lets you create, share, and analyze interactive product demos with AI-powered features.

## Features (MVP)

- ✅ **User auth** — email/password signup & login
- ✅ **Interactive demo recording** — capture clicks in a popup, generate step-by-step walkthroughs with hotspots
- ✅ **Interactive demo player** — clickable walkthrough with hotspot navigation
- ✅ **Demo library** — create, edit, publish demos
- ✅ **Shareable links** — public view with password protection & email gating
- ✅ **Analytics** — views, completion rate, unique viewers, duration, drop-off
- ✅ **Lead capture** — email/company forms inside demos
- ✅ **AI Demo Agent** — chatbot grounded in your demo content (OpenAI)
- ✅ **Step editor** — edit titles, descriptions, hotspots
- ✅ **Settings** — publish toggle, password, email gate, share link

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React, Tailwind CSS
- **Backend:** Next.js API Routes, Prisma ORM
- **Database:** SQLite (dev) — swap to Postgres for production
- **Auth:** NextAuth.js (Credentials provider)
- **AI:** OpenAI (GPT-4o-mini) for the Demo Agent
- **Charts:** Recharts

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Required:
- `DATABASE_URL` — SQLite path (default `file:./prisma/dev.db`)
- `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
- `NEXTAUTH_URL` — `http://localhost:3000` for dev

Optional (for the AI Demo Agent):
- `GROQ_API_KEY` — **free, no credit card** (recommended). Get one at https://console.groq.com/keys
- `OPENAI_API_KEY` — alternative provider (paid, small free credit for new accounts)

> 💡 Prefer Docker? See the **[Docker](#docker)** section below for one-command setup with SQLite or Postgres.

### 3. Initialize the database

```bash
npx prisma migrate dev --name init
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign up.

## Docker

DemoHub ships with a multi-stage Dockerfile and Docker Compose setup for easy local and production deployment.

### Quick start (SQLite — single container)

```bash
# Copy env template and set a secret
cp .env.example .env
# Generate a strong secret: openssl rand -base64 32
# Edit .env and set NEXTAUTH_SECRET

# Build and run
docker compose up --build
```

The app will be available at [http://localhost:3000](http://localhost:3000). The SQLite database is persisted in a named Docker volume (`demohub_data`), so your data survives container restarts. Prisma migrations run automatically on startup.

### Production (Postgres)

For production, run with Postgres instead of SQLite:

```bash
# Set DATABASE_URL to the Postgres connection string in .env
# DATABASE_URL="postgresql://demohub:demohub_secret@demohub-db:5432/demohub?schema=public"

docker compose --profile postgres up --build
```

This starts both the app and a Postgres 16 container (`demohub-db`), with data persisted in the `demohub_pgdata` volume.

### Docker commands

| Command | Description |
|---------|-------------|
| `docker compose up --build` | Build & start (SQLite mode) |
| `docker compose --profile postgres up --build` | Build & start with Postgres |
| `docker compose down` | Stop containers (keep volumes) |
| `docker compose down -v` | Stop containers **and** delete volumes (wipes DB) |
| `docker compose logs -f app` | Follow app logs |
| `docker compose exec app sh` | Shell into the running container |
| `docker build -t demohub .` | Build image only |
| `docker run -p 3000:3000 --env-file .env demohub` | Run image directly |

### Dockerfile notes

- **Multi-stage build** (deps → builder → runner) keeps the final image small.
- **Standalone output** (`output: "standalone"`) produces a minimal Node server.
- Runs as a **non-root user** (`nextjs`) for security.
- Entrypoint (`docker-entrypoint.sh`) runs `prisma generate` + `prisma migrate deploy` before starting Next.js.
- Port `3000` is exposed. Set `NEXTAUTH_URL` to your public URL in production.

## How to Create a Demo

1. Go to **Dashboard** → **New Demo**
2. Enter a title & description
3. Click **Start Recording** — a popup opens
4. Enter the URL of your product in the popup and click **Start**
5. Click on elements in your product — each click creates a step with a hotspot
6. Click **Done** when finished
7. Review/edit steps, then **Save Demo**
8. Go to **Settings** → publish and copy the share link

## How the Player Works

- Viewers open the share link (`/s/[token]`)
- They click hotspots to advance through steps
- Each step shows a captured snapshot of your product with clickable hotspots
- Analytics are recorded (views, duration, steps viewed, completion)
- If email-gated, viewers must enter email to continue
- The AI Agent panel lets viewers ask questions (if enabled)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| GET/POST | `/api/auth/[...nextauth]` | NextAuth |
| GET/POST | `/api/demos` | List / create demos |
| GET/PUT/DELETE | `/api/demos/[id]` | Get / update / delete demo |
| POST/PUT | `/api/demos/[id]/steps` | Add / bulk-save steps |
| POST | `/api/demos/[id]/agent` | Create/update AI agent |
| GET | `/api/share/[token]` | Public demo (records view) |
| POST | `/api/share/[token]/view` | Update view progress |
| GET/POST | `/api/leads` | List / capture leads |
| GET | `/api/analytics` | Demo analytics |
| POST | `/api/agent/[id]/chat` | Chat with AI agent |

## AI Demo Agent Setup (Free — No Credit Card)

The AI Demo Agent uses **Groq** by default — a free, fast, OpenAI-compatible provider that requires no credit card.

### Option 1: Groq (Recommended — Free)

1. Sign up at **[console.groq.com](https://console.groq.com)** (Google/GitHub login)
2. Create an API key at **[console.groq.com/keys](https://console.groq.com/keys)**
3. Add it to your `.env`:

```bash
GROQ_API_KEY="gsk_your_key_here"
OPENAI_BASE_URL="https://api.groq.com/openai/v1"
AI_MODEL="llama-3.3-70b-versatile"
```

That's it — the agent will use Groq's free tier (Llama 3.3 70B, ~320 tokens/sec). Free limits: ~30 req/min, ~14,400 req/day — plenty for development and small production use.

### Option 2: OpenAI (Paid)

If you prefer OpenAI, set `OPENAI_API_KEY` instead and the app will use it automatically:

```bash
OPENAI_API_KEY="sk-..."
OPENAI_BASE_URL="https://api.openai.com/v1"
AI_MODEL="gpt-4o-mini"
```

> Without any key, the agent returns a friendly fallback message instead of failing.

## Production Notes

- **Database:** Switch `DATABASE_URL` to a Postgres connection string and run `npx prisma migrate deploy`. The easiest path is `docker compose --profile postgres up --build` which handles the DB + migrations automatically.
- **Auth:** Add OAuth providers (Google, GitHub) in `lib/auth.ts`
- **Storage:** For video/snapshots, add S3/Cloudflare R2 (currently snapshots are stored as HTML strings in SQLite — fine for MVP, use object storage for production)
- **Billing:** Stripe integration scaffold is ready — add `STRIPE_*` keys and create checkout sessions
- **Security:** Enable HTTPS, set a strong `NEXTAUTH_SECRET`, consider rate limiting on public endpoints

## Roadmap (Post-MVP)

- [ ] Video recording & editing (screen + webcam, 4K)
- [ ] Sandbox demos (isolated product environments)
- [ ] Route Hub (personalized demo playlists)
- [ ] Mobile demos (iOS/Android)
- [ ] Agentic recording (AI auto-records & updates demos)
- [ ] Team workspaces & collaborators
- [ ] Stripe billing & plans
- [ ] More integrations (HubSpot, Salesforce, Slack, etc.)
- [ ] Custom domains & branding

## License

MIT

---

Built as a SupaDemo alternative. Not affiliated with SupaDemo.
