# ICE & WATER — playable multiplayer starter

A new monorepo for a browser-based ICE & WATER game. It includes:
- Next.js lobby and game client
- React Three Fiber 3D playground with procedural humanoid avatars
- Socket.IO multiplayer server with server-owned room and match state
- Guest identities (no account required)
- Private room codes and public matchmaking
- Classic and team modes
- Freeze, rescue, match timer, reconnect grace period
- Shared game protocol and server unit tests

## Requirements
- Node.js 20+
- npm 10+
- Optional: Docker Desktop (for local Redis/Postgres services if you extend persistence)

## Run locally
```bash
npm install
cp apps/web/.env.example apps/web/.env.local
cp apps/server/.env.example apps/server/.env
npm run dev
```
Deploying (Vercel + Supabase + game server host): see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
Open http://localhost:3000 in two or more browser tabs. Use **Quick Match** to enter public matchmaking, or create a private room and share its code.

The game server runs on http://localhost:4000.

## Controls
- WASD / arrow keys: move
- Shift: sprint
- Mouse drag / right-side touch drag: rotate camera
- E or interaction button: tag/rescue when close
- Mobile: on-screen joystick + action button

## Current MVP behavior
- Classic: one ICE player, remaining players are WATER.
- Team Battle: ICE and WATER teams are balanced by the server.
- ICE freezes a nearby WATER player by interacting within tag range.
- WATER rescues a nearby frozen teammate.
- The server validates role, distance, cooldown, match state and action rate.
- A match ends when all WATER players are frozen or the match timer expires.
- The first version uses server-validated movement inputs and authoritative snapshots. It is a playable prototype, not yet production anti-cheat or high-scale infrastructure.

## Important production work still required
1. Replace procedural primitive avatars with licensed, rigged realistic human GLB assets and add animation retargeting.
2. Add persistent user profiles, match history and leaderboard (PostgreSQL).
3. Add Redis adapter and distributed matchmaking before running multiple game-server instances.
4. Add HTTPS/WSS, origin allowlists, rate limits, moderation/reporting, telemetry and load tests.
5. Tune physics, map boundaries, mobile performance and latency compensation with real players.
6. Add privacy policy, terms, age-appropriate safety controls and operational monitoring.

## Architecture
```text
Next.js browser client
  ├── React Three Fiber scene + procedural 3D avatars
  └── Socket.IO client
          │ WebSocket
          ▼
Node.js + Socket.IO authoritative server
  ├── room lifecycle / public queue
  ├── movement validation / tagging / rescue
  └── match clock / reconnect grace
```

## Environment
Web (`apps/web/.env.local`): `NEXT_PUBLIC_GAME_SERVER_URL`, `NEXT_PUBLIC_SITE_URL`.
Server (`apps/server/.env`): `PORT` (default 4000), `CLIENT_ORIGIN` (comma-separated allowed origins), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (optional — without them matches simply aren't saved).

## Tests
```bash
npm test
```

The tests cover role assignment and freeze/rescue state transitions.
