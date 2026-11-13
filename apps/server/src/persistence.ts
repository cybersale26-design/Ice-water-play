import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { MATCH_SECONDS } from "@icewater/shared";
import type { Room } from "./engine.js";

/**
 * Optional match persistence in Supabase (Postgres).
 * Uses the SERVICE-ROLE key, so it must only ever run on the game server — never in a browser bundle.
 * When SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set, persistence is simply disabled
 * and the game keeps working with in-memory state only.
 */
let client: SupabaseClient | null | undefined;

function getClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  return client;
}

export function persistenceEnabled(): boolean {
  return getClient() !== null;
}

/** Writes a finished match (match row + all player rows) atomically through the record_match() SQL function. */
export async function recordMatch(room: Room, now = Date.now()): Promise<string | null> {
  const db = getClient();
  if (!db || room.players.size < 2) return null;
  const id = randomUUID();
  const durationSeconds = Math.min(MATCH_SECONDS, Math.max(0, Math.round((now - room.startedAt) / 1000)));
  const { error } = await db.rpc("record_match", {
    p_match: {
      id,
      room_code: room.code,
      mode: room.mode,
      winner: room.winner ?? "",
      duration_seconds: durationSeconds,
      started_at: new Date(room.startedAt).toISOString(),
      players: [...room.players.values()].map(p => ({
        name: p.name,
        team: p.team,
        freezes: p.freezes,
        rescues: p.rescues,
        final_status: p.status
      }))
    }
  });
  if (error) throw new Error(`record_match failed: ${error.message}`);
  return id;
}
