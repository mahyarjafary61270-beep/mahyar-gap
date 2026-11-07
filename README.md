# Mahyar Gap · مهیار گپ

A private, production-ready real-time communication platform: persistent text chat, real voice rooms, screen sharing, and a **shared live radio** that streams inside voice rooms — built for a small community of friends, designed to scale beyond it.

<p align="center">
  <em>Dark, premium, RTL-first UI · Persian (فارسی) default · English included</em>
</p>

---

## ✨ Features

| Area | What you get |
| --- | --- |
| **Auth** | Invite-only registration, Argon2id password hashing, JWT sessions (httpOnly cookie, revocable), rate limiting, first-owner bootstrap |
| **Chat** | Multiple text channels, persistent history (PostgreSQL), real-time delivery, replies, edits, deletes, emoji reactions, typing indicators, unread badges, paginated history |
| **Voice** | Real LiveKit rooms — microphone, mute/deafen, speaking indicators, connection quality, per-participant **independent volume sliders** |
| **Screen share** | Real LiveKit screen tracks (with audio where the browser allows), live stage view, native "Stop sharing" handling |
| **Radio** | `/mp` opens the station selector; a **server-side publisher** (FFmpeg + `@livekit/rtc-node`) joins the room as a virtual participant so **everyone hears the same stream**; `/mp stop`, quick station commands, per-user radio volume |
| **Auto cleanup** | Radio stops **exactly 60 s** after the last human leaves (rejoin cancels the countdown), FFmpeg processes and LiveKit tracks are always released |
| **Admin** | Invite code creation/revocation, member role management (owner-only), force-logout, channel creation |
| **UX** | RTL-first design system (Tailwind v4), smooth dark theme, loading/empty/error states, fully responsive, i18n (fa/en) |

## 🧱 Tech stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS v4, zustand, socket.io-client, `livekit-client`, lucide-react, Vazirmatn font
- **Backend:** Node.js, TypeScript (ESM), Fastify 5, Socket.IO, zod validation, jose (JWT), `@node-rs/argon2`
- **Database:** PostgreSQL (Railway) + Drizzle ORM + generated SQL migrations (applied automatically on boot)
- **Voice/media:** LiveKit Cloud (WebRTC media never touches your app server), server-side tokens via `livekit-server-sdk`
- **Radio publisher:** `@livekit/rtc-node` + FFmpeg (child process), deployed inside the app container

## 🚀 Deploy to Railway (step by step)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Mahyar Gap"
git remote add origin https://github.com/<you>/mahyar-gap.git
git push -u origin main
```

`.env` is git-ignored — never commit real secrets.

### 2. Create the services on Railway

1. **New Project → Deploy from GitHub repo** → pick this repo.
   Railway detects the `Dockerfile` (which installs **FFmpeg** — required by the radio publisher).
2. **New → Database → PostgreSQL** (this gives you `DATABASE_URL` via a variable reference).
3. In the app service → **Variables**, add:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference the Postgres service) |
| `JWT_ACCESS_SECRET` | long random string — `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `LIVEKIT_URL` | `wss://<your-project>.livekit.cloud` |
| `LIVEKIT_API_KEY` | from LiveKit Cloud |
| `LIVEKIT_API_SECRET` | from LiveKit Cloud |
| `NODE_ENV` | `production` |

Optional:

| Variable | Value |
| --- | --- |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_DISPLAY_NAME` | If set **and the users table is empty**, the owner account is created on first boot (plus a starter invite code, printed in the logs). Leave empty to use the website's first-run setup instead. |
| `PORT` | Railway injects this automatically; the server binds `0.0.0.0:$PORT`. |

### 3. LiveKit Cloud setup

1. Create a project at [cloud.livekit.io](https://cloud.livekit.io).
2. **Settings → Keys → Create key** → copy the key/secret into Railway variables.
3. Copy the project URL (`wss://…`) into `LIVEKIT_URL`.
4. No webhook configuration is needed — presence and radio state run over the app's own Socket.IO.

### 4. Deploy & verify

- Railway builds the Docker image, applies **database migrations automatically on boot**, and starts `node dist/server/index.js`.
- Health check endpoint: **`/api/health`** (set it as the Railway health-check path).
- Open your Railway domain → the login page appears → create the owner account (first-run setup or env vars).
- In **Admin → کدهای دعوت**, create invite codes for your friends.

## 💻 Local development

```bash
cp .env.example .env         # fill in DATABASE_URL + JWT_ACCESS_SECRET (LiveKit optional locally)
npm install
npm run dev                  # API on :3001 + Vite on :5173 (proxied)
```

- Without LiveKit variables, the app works for chat; voice/radio endpoints return a clear "not configured" error.
- With LiveKit variables + FFmpeg installed locally, the full radio publisher runs on Windows/macOS/Linux.
- `npm run build && npm start` → production build served by Fastify on one port.

### Slash commands

| Command | Action |
| --- | --- |
| `/mp` | Open the radio station selector (must be in a voice room) |
| `/mp stop` | Stop the shared radio |
| `/help` | Show the command list |
| `/shrug` | Send `¯\_(ツ)_/¯` |

## 📻 How the shared radio works

```
 user types /mp → server validates the user is IN the LiveKit room
   → radio manager spawns one publisher per room:
       FFmpeg (MP3 → 48 kHz stereo PCM) → @livekit/rtc-node AudioSource
       → "Mahyar Gap Radio" joins the room as a virtual participant
   → every client subscribes to that single track; each listener sets
     their own local volume (Web Audio/element volume), independently
   → last human leaves → 60 s countdown (cancellable) → publisher stops,
     FFmpeg killed, LiveKit track closed, DB session closed
```

- One radio per room; picking another station switches cleanly.
- Stream failures use capped exponential backoff; a watchdog restarts stalled FFmpeg pipes.

## 🗂 Project layout

```
server/          Fastify API, Socket.IO hub, LiveKit tokens, radio publisher/manager
  db/            Drizzle schema + migrations runner + seed
  routes/        auth, users, channels, messages, voice, radio, admin, health
  realtime/      Socket.IO (cookie-authenticated) presence/typing/voice occupancy
  radio/         stations, FFmpeg+rtc-node publisher, per-room manager (60 s auto-stop)
src/             React SPA (RTL-first): chat, voice rooms, radio selector, admin, settings
shared/          Types + socket event contract shared by both sides
drizzle/         Generated SQL migrations (applied on boot)
Dockerfile       node:22-slim + ffmpeg — production image
```

## 🔒 Security notes

- All input validated server-side (zod); parameterized queries via Drizzle (no SQL injection).
- Argon2id password hashing; session JWTs in `httpOnly` `SameSite=Lax` cookies, revocable server-side.
- Rate limiting on auth endpoints (login 10/min, register 5/min) + a global 600/min cap.
- Strict CSP via `@fastify/helmet`; LiveKit secrets never reach the browser (tokens are minted per-join on the server).
- Radio/voice commands re-verify room membership through the **LiveKit API**, not just client state.

## ✅ Verified vs. environment-limited

Verified in this build: production build, DB migrations on boot, invite-only registration, login/logout/revocation, chat CRUD + reactions + pagination, realtime broadcast/typing/presence/voice-occupancy, admin invite & role flows, health check, RTL/i18n UI (screenshots).

Requires your live credentials to verify end-to-end (by design, not simulated): real LiveKit media (voice/screen-share) and the radio publisher against the four stations — the code paths are exercised only when `LIVEKIT_*` variables and FFmpeg are present. Note `@livekit/rtc-node` is officially in developer preview; the publisher isolates failures so a radio problem never takes the app down.

## 📜 License

Private project for the Mahyar Gap community. All rights reserved.
