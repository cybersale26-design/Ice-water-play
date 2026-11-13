-- ICE & WATER — initial Supabase schema (PRD section 13).
--
-- Access model
--   * The Socket.IO game server writes with the service-role (secret) key, which bypasses RLS.
--   * Browsers use the anon/publishable key. RLS is ENABLED on every table and NO policies
--     exist yet, so anon/authenticated clients can neither read nor write anything.
--   * Add explicit, narrow policies (e.g. a public leaderboard view) in a later migration.

-- ---------------------------------------------------------------------------
-- Guest sessions (reconnect identity; never store the raw reconnect secret)
-- ---------------------------------------------------------------------------
create table if not exists public.guest_sessions (
  id                    uuid primary key default gen_random_uuid(),
  display_name          varchar(18) not null,
  reconnect_token_hash  text not null,
  created_at            timestamptz not null default now(),
  last_seen             timestamptz not null default now()
);
create index if not exists guest_sessions_last_seen_idx on public.guest_sessions (last_seen);

-- ---------------------------------------------------------------------------
-- Optional account profiles (P1). Linked to Supabase Auth users.
-- ---------------------------------------------------------------------------
create table if not exists public.player_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    varchar(18) not null unique,
  created_at  timestamptz not null default now(),
  wins        integer not null default 0 check (wins >= 0),
  losses      integer not null default 0 check (losses >= 0),
  xp          integer not null default 0 check (xp >= 0)
);

-- ---------------------------------------------------------------------------
-- Matches and per-player results (written once, by the server, when a match ends)
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id                uuid primary key default gen_random_uuid(),
  room_code         varchar(6) not null,
  mode              varchar(12) not null check (mode in ('classic', 'team')),
  winner            varchar(8) check (winner in ('ice', 'water')),
  duration_seconds  integer not null check (duration_seconds >= 0),
  player_count      smallint not null check (player_count between 2 and 10),
  started_at        timestamptz not null,
  ended_at          timestamptz not null default now()
);
create index if not exists matches_ended_at_idx on public.matches (ended_at desc);
create index if not exists matches_room_code_idx on public.matches (room_code);

create table if not exists public.match_players (
  id            bigint generated always as identity primary key,
  match_id      uuid not null references public.matches (id) on delete cascade,
  guest_id      uuid references public.guest_sessions (id) on delete set null,
  profile_id    uuid references public.player_profiles (id) on delete set null,
  display_name  varchar(18) not null,
  team          varchar(8) not null check (team in ('ice', 'water')),
  freezes       integer not null default 0 check (freezes >= 0),
  rescues       integer not null default 0 check (rescues >= 0),
  final_status  varchar(12) not null check (final_status in ('active', 'frozen', 'disconnected'))
);
create index if not exists match_players_match_id_idx   on public.match_players (match_id);
create index if not exists match_players_guest_id_idx   on public.match_players (guest_id)   where guest_id   is not null;
create index if not exists match_players_profile_id_idx on public.match_players (profile_id) where profile_id is not null;

-- ---------------------------------------------------------------------------
-- Row Level Security: on, deny-by-default for browser roles
-- ---------------------------------------------------------------------------
alter table public.guest_sessions  enable row level security;
alter table public.player_profiles enable row level security;
alter table public.matches         enable row level security;
alter table public.match_players   enable row level security;

revoke all on public.guest_sessions  from anon, authenticated;
revoke all on public.player_profiles from anon, authenticated;
revoke all on public.matches         from anon, authenticated;
revoke all on public.match_players   from anon, authenticated;

-- ---------------------------------------------------------------------------
-- record_match: one atomic call (match + all players, or nothing).
-- Payload shape:
--   { "id": uuid, "room_code": "AB12CD", "mode": "classic", "winner": "ice",
--     "duration_seconds": 142, "started_at": "<iso>",
--     "players": [ { "name": "Sam", "team": "ice", "freezes": 3, "rescues": 0,
--                    "final_status": "active" }, ... ] }
-- ---------------------------------------------------------------------------
create or replace function public.record_match(p_match jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := coalesce((p_match ->> 'id')::uuid, gen_random_uuid());
  v_players jsonb := coalesce(p_match -> 'players', '[]'::jsonb);
begin
  insert into public.matches (id, room_code, mode, winner, duration_seconds, player_count, started_at)
  values (
    v_id,
    p_match ->> 'room_code',
    p_match ->> 'mode',
    nullif(p_match ->> 'winner', ''),
    (p_match ->> 'duration_seconds')::integer,
    jsonb_array_length(v_players),
    (p_match ->> 'started_at')::timestamptz
  );

  insert into public.match_players (match_id, display_name, team, freezes, rescues, final_status)
  select v_id, left(p.name, 18), p.team, coalesce(p.freezes, 0), coalesce(p.rescues, 0), p.final_status
  from jsonb_to_recordset(v_players)
    as p(name text, team text, freezes integer, rescues integer, final_status text);

  return v_id;
end;
$$;

revoke all on function public.record_match(jsonb) from public, anon, authenticated;
grant execute on function public.record_match(jsonb) to service_role;
