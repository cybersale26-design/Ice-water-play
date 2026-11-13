import test from "node:test";
import assert from "node:assert/strict";
import { addPlayer, assignRoles, createRoom, interact, startMatch } from "./engine.js";

test("classic assigns one ICE player and remaining WATER players", () => {
  const room = createRoom("ABC123", "classic", "a");
  addPlayer(room, "a", "A"); addPlayer(room, "b", "B"); addPlayer(room, "c", "C");
  assignRoles(room);
  assert.equal([...room.players.values()].filter(p => p.team === "ice").length, 1);
  assert.equal([...room.players.values()].filter(p => p.team === "water").length, 2);
});
test("ICE freezes a nearby WATER player", () => {
  const room = createRoom("ABC123", "classic", "a");
  addPlayer(room, "a", "A"); addPlayer(room, "b", "B");
  startMatch(room);
  const ice = [...room.players.values()].find(p => p.team === "ice")!;
  const water = [...room.players.values()].find(p => p.team === "water")!;
  water.position = { x: ice.position.x + 1, y: 0, z: ice.position.z };
  const result = interact(room, ice.id, Date.now() + 1000);
  assert.equal(result?.type, "frozen");
  assert.equal(water.status, "frozen");
});
test("WATER rescues a frozen teammate", () => {
  const room = createRoom("ABC123", "team", "a");
  addPlayer(room, "a", "A"); addPlayer(room, "b", "B"); addPlayer(room, "c", "C"); addPlayer(room, "d", "D");
  startMatch(room);
  const water = [...room.players.values()].find(p => p.team === "water")!;
  const frozen = [...room.players.values()].find(p => p.team === "water" && p.id !== water.id)!;
  frozen.status = "frozen";
  frozen.position = { ...water.position };
  const result = interact(room, water.id, Date.now() + 5000);
  assert.equal(result?.type, "rescued");
  assert.equal(frozen.status, "active");
});
