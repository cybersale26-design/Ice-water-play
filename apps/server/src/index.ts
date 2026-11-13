import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { randomBytes } from "node:crypto";
import { addPlayer, createRoom, interact, movePlayer, snapshot, startMatch, tickRoom, type Room } from "./engine.js";
import type { GameMode } from "@icewater/shared";
import { persistenceEnabled, recordMatch } from "./persistence.js";

// Local development: load apps/server/.env if present. Real environment variables (Render, Docker, etc.) always win.
try { process.loadEnvFile(new URL("../.env", import.meta.url)); } catch { /* no .env file — fine */ }

const PORT = Number(process.env.PORT || 4000);
// Comma-separated allowlist, e.g. "https://ice-and-water.vercel.app,http://localhost:3000"
const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN || "http://localhost:3000")
  .split(",").map(o => o.trim().replace(/\/$/, "")).filter(Boolean);
const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.get("/health", (_req, res) => res.json({
  ok: true, service: "ice-water-game-server", rooms: rooms.size, persistence: persistenceEnabled()
}));
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
  pingInterval: 10000,
  pingTimeout: 20000
});
const rooms = new Map<string, Room>();
const socketRoom = new Map<string, string>();
const publicQueue = new Set<string>();
const reconnectTimers = new Map<string, NodeJS.Timeout>();

function roomCode(): string {
  return randomBytes(3).toString("hex").toUpperCase();
}
function emitRoom(room: Room): void { io.to(room.code).emit("room:snapshot", snapshot(room)); }
function joinRoom(socketId: string, code: string): void { socketRoom.set(socketId, code); }
function leaveCurrent(socketId: string): void {
  const code = socketRoom.get(socketId);
  if (!code) return;
  const room = rooms.get(code);
  socketRoom.delete(socketId);
  if (!room) return;
  room.players.delete(socketId);
  if (room.hostId === socketId) room.hostId = room.players.keys().next().value ?? "";
  if (!room.players.size) rooms.delete(code);
  else emitRoom(room);
}
io.on("connection", socket => {
  socket.emit("server:hello", { id: socket.id });
  socket.on("room:create", (payload: { name?: string; mode?: GameMode }, ack?: (v: unknown) => void) => {
    const code = roomCode();
    const mode = payload?.mode === "team" ? "team" : "classic";
    const room = createRoom(code, mode, socket.id);
    rooms.set(code, room);
    addPlayer(room, socket.id, payload?.name || "Guest");
    socket.join(code); joinRoom(socket.id, code);
    emitRoom(room); ack?.({ ok: true, code });
  });
  socket.on("room:join", (payload: { code?: string; name?: string }, ack?: (v: unknown) => void) => {
    const code = (payload?.code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return ack?.({ ok: false, error: "Room not found" });
    try {
      addPlayer(room, socket.id, payload?.name || "Guest");
      socket.join(code); joinRoom(socket.id, code);
      emitRoom(room); ack?.({ ok: true, code });
    } catch (e) { ack?.({ ok: false, error: e instanceof Error ? e.message : "Unable to join" }); }
  });
  socket.on("match:quick", (payload: { name?: string; mode?: GameMode }, ack?: (v: unknown) => void) => {
    const mode = payload?.mode === "team" ? "team" : "classic";
    const room = [...rooms.values()].find(r => r.status === "waiting" && r.mode === mode && r.players.size < 10);
    if (room) {
      try {
        addPlayer(room, socket.id, payload?.name || "Guest");
        socket.join(room.code); joinRoom(socket.id, room.code);
        emitRoom(room); ack?.({ ok: true, code: room.code });
      } catch { ack?.({ ok: false, error: "Could not join a public room" }); }
    } else {
      const code = roomCode();
      const created = createRoom(code, mode, socket.id);
      rooms.set(code, created);
      addPlayer(created, socket.id, payload?.name || "Guest");
      socket.join(code); joinRoom(socket.id, code);
      emitRoom(created); ack?.({ ok: true, code });
    }
  });
  socket.on("player:ready", (ready: boolean) => {
    const room = rooms.get(socketRoom.get(socket.id) || "");
    const player = room?.players.get(socket.id);
    if (!room || !player || room.status !== "waiting") return;
    player.ready = Boolean(ready); emitRoom(room);
  });
  socket.on("game:start", (ack?: (v: unknown) => void) => {
    const room = rooms.get(socketRoom.get(socket.id) || "");
    if (!room || room.hostId !== socket.id) return ack?.({ ok: false, error: "Only the host can start" });
    try {
      startMatch(room);
      emitRoom(room);
      io.to(room.code).emit("game:started", snapshot(room));
      ack?.({ ok: true });
    } catch (e) { ack?.({ ok: false, error: e instanceof Error ? e.message : "Cannot start" }); }
  });
  socket.on("player:input", (input: { x: number; z: number; sprint?: boolean; rotation?: number; deltaMs?: number }) => {
    const room = rooms.get(socketRoom.get(socket.id) || "");
    if (!room) return;
    movePlayer(room, socket.id, input, Math.min(100, Math.max(0, Number(input?.deltaMs) || 50)));
  });
  socket.on("player:interact", () => {
    const room = rooms.get(socketRoom.get(socket.id) || "");
    if (!room) return;
    const result = interact(room, socket.id);
    if (result) io.to(room.code).emit(`player:${result.type}`, { actorId: socket.id, targetId: result.targetId });
    emitRoom(room);
  });
  socket.on("room:leave", () => {
    const code = socketRoom.get(socket.id);
    if (code) socket.leave(code);
    leaveCurrent(socket.id);
  });
  socket.on("disconnect", () => {
    const code = socketRoom.get(socket.id);
    const room = code ? rooms.get(code) : undefined;
    const p = room?.players.get(socket.id);
    if (p) {
      p.status = "disconnected";
      emitRoom(room!);
      const timer = setTimeout(() => {
        const current = rooms.get(code!);
        if (current) { current.players.delete(socket.id); if (!current.players.size) rooms.delete(code!); else emitRoom(current); }
      }, 30000);
      reconnectTimers.set(socket.id, timer);
    }
    socketRoom.delete(socket.id);
  });
});
// Remembers which match (by start time) of a room was already announced and saved, so each match is
// broadcast and persisted exactly once even though the room stays in "finished" state across ticks.
const finalized = new WeakMap<Room, number>();
setInterval(() => {
  for (const room of rooms.values()) {
    tickRoom(room);
    if (room.status === "playing") emitRoom(room);
    if (room.status === "finished" && finalized.get(room) !== room.startedAt) {
      finalized.set(room, room.startedAt);
      io.to(room.code).emit("game:ended", snapshot(room));
      recordMatch(room).catch(err => console.error("[persistence]", err instanceof Error ? err.message : err));
    }
  }
}, 100);
httpServer.listen(PORT, () => console.log(`ICE & WATER server listening on :${PORT}`));
