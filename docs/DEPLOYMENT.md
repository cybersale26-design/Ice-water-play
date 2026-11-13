# Deployment guide — ICE & WATER

Three pieces, each on the host that suits it:

| Piece | Host | Why |
|---|---|---|
| Website (Next.js) | **Vercel** | Static/SSR site |
| Game server (Socket.IO) | **Render** (or Railway/Fly/any Docker host) | Needs a persistent WebSocket process — Vercel serverless can't hold one (PRD §12) |
| Database | **Supabase** `bpklcnwrivrpisajzuyv` | Match history, guest sessions, profiles |

## 1. Supabase (database)
1. Install the CLI, then from the repo root:
   ```bash
   supabase login
   supabase link --project-ref bpklcnwrivrpisajzuyv
   supabase db push
   ```
   Alternative with no CLI: Dashboard > SQL Editor > paste `supabase/migrations/20261112000000_init.sql` > Run.
2. Dashboard > Project Settings > API Keys: copy the **service_role / secret** key. You need it in step 2 only.
3. RLS is on with no policies, so browsers (anon key) cannot touch any table. Only the game server can write.

## 2. Game server (Render)
1. Push this repo to GitHub.
2. Render > New > Blueprint > pick the repo (it reads `render.yaml`).
3. Set the two secret/dashboard values:
   - `SUPABASE_SERVICE_ROLE_KEY` = key from step 1
   - `CLIENT_ORIGIN` = your Vercel URL(s), comma-separated (fill in after step 3, then redeploy)
4. Check `https://<your-service>.onrender.com/health` returns `{"ok":true,...,"persistence":true}`.

## 3. Website (Vercel)
1. Vercel > Add New Project > import the repo. Leave the **Root Directory** as the repo root (`vercel.json` handles the monorepo build).
2. Environment variables:
   - `NEXT_PUBLIC_GAME_SERVER_URL` = `https://<your-service>.onrender.com`
   - `NEXT_PUBLIC_SITE_URL` = your final site URL (e.g. `https://ice-and-water.vercel.app`)
3. Deploy. Then go back to Render and set `CLIENT_ORIGIN` to that URL.
4. Visit `/api/health` on the site: `gameServerOk` should be `true`.

## Local development
```bash
npm install
cp apps/web/.env.example apps/web/.env.local
cp apps/server/.env.example apps/server/.env     # add the service-role key to test persistence
npm run dev
```

## Security notes
- The service-role key bypasses RLS. Keep it only in the server host's secret store. If it was ever pasted in chat or committed, rotate it in the Supabase dashboard.
- Never expose it through `NEXT_PUBLIC_*` variables.
