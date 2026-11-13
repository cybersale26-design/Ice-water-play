export type GameMode = "classic" | "team";
export type Team = "ice" | "water";
export type PlayerStatus = "active" | "frozen" | "disconnected";
export type RoomStatus = "waiting" | "countdown" | "playing" | "finished";

export interface Vec3 { x: number; y: number; z: number; }
export interface PlayerState {
  id: string;
  name: string;
  color: string;
  team: Team;
  status: PlayerStatus;
  position: Vec3;
  rotation: number;
  ready: boolean;
  freezes: number;
  rescues: number;
  joinedAt: number;
}
export interface PublicRoom {
  code: string;
  mode: GameMode;
  players: number;
  maxPlayers: number;
  status: RoomStatus;
}
export interface RoomSnapshot {
  code: string;
  mode: GameMode;
  status: RoomStatus;
  players: PlayerState[];
  hostId: string;
  timeLeft: number;
  winner: Team | null;
  maxPlayers: number;
}
export const MAX_PLAYERS = 10;
export const MATCH_SECONDS = 300;
export const TAG_DISTANCE = 2.15;
export const RESCUE_DISTANCE = 2.3;
export const RESCUE_COOLDOWN_MS = 3000;
export const RESCUE_IMMUNITY_MS = 2000;
export const MOVE_SPEED = 5.2;
export const SPRINT_SPEED = 7.2;
export const MAP_LIMIT = 24;
