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
- `DATABASE_URL` — SQLite path (default `file:./dev.db`)
- `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
- `NEXTAUTH_URL` — `http://localhost:3000` for dev
- `OPENAI_API_KEY` — for the AI Demo Agent (optional for MVP)

### 3. Initialize the database

```bash
npx prisma migrate dev --name init
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign up.

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

## Production Notes

- **Database:** Switch `DATABASE_URL` to a Postgres connection string and run `npx prisma migrate deploy`
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
