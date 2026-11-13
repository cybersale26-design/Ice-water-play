import {
  MAX_PLAYERS, MATCH_SECONDS, MAP_LIMIT, TAG_DISTANCE, RESCUE_DISTANCE,
  RESCUE_COOLDOWN_MS, RESCUE_IMMUNITY_MS, MOVE_SPEED, SPRINT_SPEED,
  type GameMode, type PlayerState, type RoomSnapshot, type Team, type Vec3
} from "@icewater/shared";

export interface Room {
  code: string;
  mode: GameMode;
  status: RoomSnapshot["status"];
  players: Map<string, PlayerState>;
  hostId: string;
  createdAt: number;
  startedAt: number;
  winner: Team | null;
  lastAction: Map<string, number>;
  lastRescue: Map<string, number>;
  immunityUntil: Map<string, number>;
  lastInput: Map<string, number>;
}
const COLORS = ["#d9e8f5", "#d9b38c", "#a9c5a0", "#c8a6d8", "#e6c46b", "#9fc8d5", "#d69a9a", "#aab1c8", "#b7c69a", "#d3b5a0"];

export function createRoom(code: string, mode: GameMode, hostId: string, now = Date.now()): Room {
  return {
    code, mode, status: "waiting", players: new Map(), hostId, createdAt: now,
    startedAt: 0, winner: null, lastAction: new Map(), lastRescue: new Map(),
    immunityUntil: new Map(), lastInput: new Map()
  };
}
export function addPlayer(room: Room, id: string, name: string): PlayerState {
  if (room.players.size >= MAX_PLAYERS) throw new Error("Room is full");
  if (room.status !== "waiting") throw new Error("Match already started");
  if (room.players.has(id)) return room.players.get(id)!;
  const p: PlayerState = {
    id, name: name.slice(0, 18) || "Guest", color: COLORS[room.players.size % COLORS.length],
    team: "water", status: "active", position: spawnPosition(room.players.size),
    rotation: 0, ready: false, freezes: 0, rescues: 0, joinedAt: Date.now()
  };
  room.players.set(id, p);
  if (room.players.size === 1) room.hostId = id;
  return p;
}
function spawnPosition(i: number): Vec3 {
  const a = (i / MAX_PLAYERS) * Math.PI * 2;
  return { x: Math.cos(a) * 8, y: 0, z: Math.sin(a) * 8 };
}
export function assignRoles(room: Room): void {
  const list = [...room.players.values()].sort((a,b) => a.joinedAt - b.joinedAt);
  if (!list.length) return;
  if (room.mode === "classic") {
    list.forEach((p, i) => { p.team = i === 0 ? "ice" : "water"; });
  } else {
    list.forEach((p, i) => { p.team = i % 2 === 0 ? "ice" : "water"; });
  }
}
export function startMatch(room: Room, now = Date.now()): void {
  if (room.players.size < 2) throw new Error("At least 2 players are required");
  assignRoles(room);
  room.status = "playing";
  room.startedAt = now;
  room.winner = null;
  for (const p of room.players.values()) { p.status = "active"; p.ready = true; }
}
function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
export function movePlayer(room: Room, id: string, input: { x: number; z: number; sprint?: boolean; rotation?: number }, deltaMs: number): void {
  const p = room.players.get(id);
  if (!p || room.status !== "playing" || p.status !== "active") return;
  const now = Date.now();
  const dt = Math.min(Math.max(deltaMs, 0), 100) / 1000;
  const mag = Math.hypot(input.x, input.z);
  if (!Number.isFinite(mag) || mag > 1.5) return;
  const scale = mag > 1 ? 1 / mag : 1;
  const speed = input.sprint ? SPRINT_SPEED : MOVE_SPEED;
  p.position.x = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, p.position.x + input.x * scale * speed * dt));
  p.position.z = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, p.position.z + input.z * scale * speed * dt));
  if (Number.isFinite(input.rotation)) p.rotation = input.rotation!;
  room.lastInput.set(id, now);
}
export function interact(room: Room, actorId: string, now = Date.now()): { type: "frozen" | "rescued"; targetId: string } | null {
  if (room.status !== "playing") return null;
  const actor = room.players.get(actorId);
  if (!actor || actor.status !== "active") return null;
  const previous = room.lastAction.get(actorId) ?? 0;
  if (now - previous < 450) return null;
  room.lastAction.set(actorId, now);
  const candidates = [...room.players.values()]
    .filter(p => p.id !== actorId && p.status !== "disconnected")
    .sort((a,b) => distance(actor.position, a.position) - distance(actor.position, b.position));
  if (actor.team === "ice") {
    const target = candidates.find(p =>
      p.team === "water" && p.status === "active" &&
      now >= (room.immunityUntil.get(p.id) ?? 0) &&
      distance(actor.position, p.position) <= TAG_DISTANCE
    );
    if (!target) return null;
    target.status = "frozen";
    actor.freezes += 1;
    checkWinner(room);
    return { type: "frozen", targetId: target.id };
  }
  const target = candidates.find(p =>
    p.team === "water" && p.status === "frozen" &&
    distance(actor.position, p.position) <= RESCUE_DISTANCE &&
    now - (room.lastRescue.get(p.id) ?? 0) >= RESCUE_COOLDOWN_MS
  );
  if (!target) return null;
  target.status = "active";
  target.position.x = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, target.position.x + 0.8));
  room.lastRescue.set(target.id, now);
  room.immunityUntil.set(target.id, now + RESCUE_IMMUNITY_MS);
  actor.rescues += 1;
  return { type: "rescued", targetId: target.id };
}
export function checkWinner(room: Room): Team | null {
  const waters = [...room.players.values()].filter(p => p.team === "water");
  if (waters.length && waters.every(p => p.status === "frozen" || p.status === "disconnected")) {
    room.winner = "ice";
    room.status = "finished";
  }
  return room.winner;
}
export function tickRoom(room: Room, now = Date.now()): void {
  if (room.status !== "playing") return;
  if (now - room.startedAt >= MATCH_SECONDS * 1000) {
    room.winner = "water";
    room.status = "finished";
    return;
  }
  checkWinner(room);
}
export function snapshot(room: Room, now = Date.now()): RoomSnapshot {
  return {
    code: room.code, mode: room.mode, status: room.status,
    players: [...room.players.values()].map(p => ({ ...p, position: { ...p.position } })),
    hostId: room.hostId, timeLeft: room.status === "playing" ? Math.max(0, MATCH_SECONDS - Math.floor((now-room.startedAt)/1000)) : MATCH_SECONDS,
    winner: room.winner, maxPlayers: MAX_PLAYERS
  };
}
