"use client";
import { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import { GameMode, RoomSnapshot } from "@icewater/shared";
import GameScene from "../components/GameScene";

const SERVER = process.env.NEXT_PUBLIC_GAME_SERVER_URL || "http://localhost:4000";
type Ack = { ok: boolean; code?: string; error?: string };

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [name, setName] = useState("Guest");
  const [code, setCode] = useState("");
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [mode, setMode] = useState<GameMode>("classic");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = io(SERVER, { transports: ["websocket", "polling"], reconnection: true });
    setSocket(s);
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    s.on("room:snapshot", (snapshot: RoomSnapshot) => setRoom(snapshot));
    s.on("game:started", (snapshot: RoomSnapshot) => setRoom(snapshot));
    s.on("game:ended", (snapshot: RoomSnapshot) => setRoom(snapshot));
    return () => { s.disconnect(); };
  }, []);

  const me = useMemo(() => room?.players.find(p => p.id === socket?.id), [room, socket?.id]);
  const call = (event: string, payload?: unknown) => new Promise<Ack>(resolve => {
    if (!socket) return resolve({ ok: false, error: "Connecting to game server..." });
    setBusy(true); setError("");
    socket.emit(event, payload, (result: Ack) => { setBusy(false); if (!result?.ok) setError(result?.error || "Request failed"); resolve(result); });
    window.setTimeout(() => { setBusy(false); }, 5000);
  });
  const create = async () => { const r = await call("room:create", { name, mode }); if (r.ok) setCode(r.code || ""); };
  const join = async () => { const r = await call("room:join", { name, code }); if (r.ok) setCode(r.code || code); };
  const quick = async () => { const r = await call("match:quick", { name, mode }); if (r.ok) setCode(r.code || ""); };
  const start = async () => { await call("game:start"); };
  const leave = () => { socket?.emit("room:leave"); setRoom(null); setCode(""); };

  if (room?.status === "playing" || room?.status === "finished") {
    return <main className="game-shell">
      <header className="game-top"><a className="brand small" href="/">ICE<span>&</span>WATER</a><div className="pill">ROOM {room.code}</div><button className="ghost" onClick={leave}>Leave match</button></header>
      <GameScene socket={socket} room={room} me={me} />
      {room.status === "finished" && <div className="result-overlay"><div className="result-card"><div className="eyebrow">MATCH COMPLETE</div><h1>{room.winner === me?.team ? "VICTORY" : "GAME OVER"}</h1><p>{room.winner?.toUpperCase()} TEAM WINS</p><button className="primary" onClick={leave}>Back to lobby</button></div></div>}
    </main>;
  }

  return <main className="page">
    <nav className="nav"><a className="brand" href="#">ICE<span>&</span>WATER</a><div className="nav-right"><span className={`status-dot ${connected ? "on" : ""}`} />{connected ? "SERVER ONLINE" : "CONNECTING"}<span className="version">WEB MULTIPLAYER</span></div></nav>
    {!room ? <section className="hero">
      <div className="hero-copy"><div className="eyebrow"><span className="line" /> THE PLAYGROUND IS OPEN</div>
        <h1>THE GAME<br/>WE <em>NEVER</em><br/>FORGOT.</h1>
        <p className="lead">Run. Freeze. Rescue. Repeat.<br/>Bring your friends back to the playground.</p>
        <div className="play-panel">
          <label>YOUR PLAYER NAME</label><input value={name} onChange={e => setName(e.target.value)} maxLength={18} placeholder="Enter a nickname"/>
          <label>GAME MODE</label><div className="mode-switch"><button className={mode==="classic"?"selected":""} onClick={()=>setMode("classic")}>CLASSIC</button><button className={mode==="team"?"selected":""} onClick={()=>setMode("team")}>TEAM BATTLE</button></div>
          <div className="actions"><button className="primary" disabled={!connected || busy} onClick={quick}>QUICK MATCH <span>↗</span></button><button className="secondary" disabled={!connected || busy} onClick={create}>CREATE PRIVATE ROOM</button></div>
          <div className="join-row"><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="ROOM CODE"/><button disabled={!connected || busy || code.length < 4} onClick={join}>JOIN ROOM</button></div>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
      <div className="hero-art"><div className="sun-glow"/><div className="hero-tag"><span>01 / 02</span> CHILDHOOD, RECONNECTED</div><div className="art-caption"><b>ONE TOUCH.</b><br/>A WHOLE NEW CHASE.</div></div>
    </section> : <section className="lobby">
      <div className="eyebrow"><span className="line"/> PRIVATE PLAYGROUND</div><h1>ROOM <em>{room.code}</em></h1>
      <p className="lead">Share this code with your friends.</p><div className="room-code" onClick={()=>navigator.clipboard?.writeText(room.code)}>{room.code} <span>↗ COPY</span></div>
      <div className="lobby-head"><h2>PLAYERS <span>{room.players.length}/10</span></h2><span>{room.mode==="classic"?"CLASSIC":"TEAM BATTLE"}</span></div>
      <div className="player-grid">{Array.from({length:10},(_,i)=>room.players[i]).map((p,i)=><div className="player-slot" key={p?.id||i}><div className="avatar" style={{background:p?.color||"#242a2b"}}>{p?.name?.slice(0,1).toUpperCase()||"+"}</div><div><b>{p?.name||"WAITING FOR PLAYER"}</b><small>{p?.id===room.hostId?"HOST":p?"CONNECTED":"OPEN SLOT"}</small></div><span className="ready-dot">{p?.ready?"✓":"•"}</span></div>)}</div>
      <div className="lobby-actions"><button className="secondary" onClick={()=>socket?.emit("player:ready",!me?.ready)}>{me?.ready ? "READY ✓" : "I'M READY"}</button><button className="primary" disabled={room.hostId!==socket?.id || room.players.length<2 || busy} onClick={start}>START GAME ↗</button><button className="ghost" onClick={leave}>LEAVE</button></div>
      <p className="hint">Minimum 2 players · Maximum 10 · Host starts the match</p>{error&&<p className="error">{error}</p>}
    </section>}
    <footer className="footer"><span>ICE & WATER © 2026</span><span>MADE FOR THE LOVE OF PLAY</span><span>CLASSIC RULES. NEW MEMORIES.</span></footer>
  </main>;
}
