export const dynamic = "force-dynamic";

/** Liveness check for the Vercel deployment. Also reports whether the game server is reachable. */
export async function GET() {
  const gameServer = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  let gameServerOk: boolean | null = null;
  if (gameServer) {
    try {
      const res = await fetch(`${gameServer.replace(/\/$/, "")}/health`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
      gameServerOk = res.ok;
    } catch { gameServerOk = false; }
  }
  return Response.json({ ok: true, service: "ice-water-web", gameServerOk });
}
