"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Sky, ContactShadows } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Socket } from "socket.io-client";
import type { PlayerState, RoomSnapshot } from "@icewater/shared";

function Avatar({ player, isMe }: { player: PlayerState; isMe: boolean }) {
  const group = useRef<THREE.Group>(null);
  const target = useRef(new THREE.Vector3(player.position.x, 0, player.position.z));
  useEffect(() => { target.current.set(player.position.x, 0, player.position.z); }, [player.position.x, player.position.z]);
  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.position.lerp(target.current, Math.min(1, dt * 12));
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, player.rotation, Math.min(1,dt*10));
  });
  const frozen = player.status === "frozen";
  return <group ref={group} position={[player.position.x,0,player.position.z]}>
    <group position={[0, frozen ? 0.95 : 0.9, 0]}>
      <mesh castShadow position={[0,0.48,0]}><capsuleGeometry args={[0.28,0.72,6,12]}/><meshStandardMaterial color={frozen?"#8bdcff":player.color} roughness={0.78}/></mesh>
      <mesh castShadow position={[0,1.08,0]}><sphereGeometry args={[0.24,20,20]}/><meshStandardMaterial color={frozen?"#a8e8ff":"#c99b78"} roughness={0.8}/></mesh>
      <mesh position={[0,1.12,0.205]}><boxGeometry args={[0.22,0.045,0.035]}/><meshStandardMaterial color="#20252a"/></mesh>
      <mesh castShadow position={[-0.36,0.45,0]} rotation={[0,0,-0.15]}><capsuleGeometry args={[0.09,0.48,4,8]}/><meshStandardMaterial color={player.color}/></mesh>
      <mesh castShadow position={[0.36,0.45,0]} rotation={[0,0,0.15]}><capsuleGeometry args={[0.09,0.48,4,8]}/><meshStandardMaterial color={player.color}/></mesh>
      <mesh castShadow position={[-0.14,-0.22,0]}><capsuleGeometry args={[0.11,0.43,4,8]}/><meshStandardMaterial color="#30343a"/></mesh>
      <mesh castShadow position={[0.14,-0.22,0]}><capsuleGeometry args={[0.11,0.43,4,8]}/><meshStandardMaterial color="#30343a"/></mesh>
    </group>
    {frozen && <mesh position={[0,1.1,0]}><sphereGeometry args={[0.72,16,16]}/><meshPhysicalMaterial color="#74d9ff" transparent opacity={0.18} roughness={0.1}/></mesh>}
    <group position={[0,2.35,0]}><mesh><planeGeometry args={[1.1,0.22]}/><meshBasicMaterial color={player.team==="ice"?"#75d8ff":"#f2e8d7"}/></mesh></group>
  </group>;
}
function World({ room, socket, me }: { room: RoomSnapshot; socket: Socket|null; me?: PlayerState }) {
  const keys = useRef<Record<string,boolean>>({});
  const last = useRef(0);
  const [move, setMove] = useState({x:0,z:0,sprint:false});
  useEffect(() => {
    const down=(e:KeyboardEvent)=>{keys.current[e.key.toLowerCase()]=true;};
    const up=(e:KeyboardEvent)=>{keys.current[e.key.toLowerCase()]=false;};
    const action=(e:KeyboardEvent)=>{if(e.key.toLowerCase()==="e") socket?.emit("player:interact");};
    window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("keydown",action);
    return ()=>{window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("keydown",action);};
  },[]);
  useFrame((state) => {
    if (!socket || room.status!=="playing") return;
    const t=state.clock.elapsedTime;
    if(t-last.current<0.05)return;
    last.current=t;
    const x=Number(keys.current.d||keys.current.arrowright)-Number(keys.current.a||keys.current.arrowleft);
    const z=Number(keys.current.s||keys.current.arrowdown)-Number(keys.current.w||keys.current.arrowup);
    const sprint=!!keys.current.shift;
    if(x||z) socket.emit("player:input",{x,z,sprint,rotation:Math.atan2(x,z),deltaMs:50});
  });
  return <group>
    <mesh rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[60,60]}/><meshStandardMaterial color="#4d694b" roughness={1}/></mesh>
    <gridHelper args={[48,48,"#78916a","#637c5b"]} position={[0,0.02,0]}/>
    {Array.from({length:16},(_,i)=><group key={i} position={[Math.sin(i*2.4)*19,0,Math.cos(i*2.4)*19]}><mesh castShadow position={[0,1.5,0]}><cylinderGeometry args={[0.18,0.35,3,8]}/><meshStandardMaterial color="#72523a"/></mesh><mesh castShadow position={[0,3.6,0]}><sphereGeometry args={[1.7,12,12]}/><meshStandardMaterial color={i%2?"#315d3d":"#426b43"}/></mesh></group>)}
    <mesh position={[0,0.3,-8]} castShadow><boxGeometry args={[8,0.6,1.4]}/><meshStandardMaterial color="#8a765b"/></mesh>
    {room.players.filter(p=>p.status!=="disconnected").map(p=><Avatar key={p.id} player={p} isMe={p.id===me?.id}/>)}
    <ambientLight intensity={0.6}/><directionalLight castShadow position={[8,14,7]} intensity={2} shadow-mapSize={[1024,1024]}/>
    <ContactShadows position={[0,0.03,0]} opacity={0.3} scale={50} blur={2}/>
  </group>;
}
export default function GameScene({socket,room,me}:{socket:Socket|null;room:RoomSnapshot;me?:PlayerState}) {
  const [touch,setTouch]=useState<{x:number;y:number}|null>(null);
  const interact=()=>socket?.emit("player:interact");
  return <div className="scene-wrap">
    <Canvas shadows camera={{position:[0,10,17],fov:55}}><Sky sunPosition={[100,30,100]}/><Environment preset="park"/><World room={room} socket={socket} me={me}/></Canvas>
    <div className="hud"><div className="hud-card"><small>TIME LEFT</small><b>{Math.floor(room.timeLeft/60).toString().padStart(2,"0")}:{(room.timeLeft%60).toString().padStart(2,"0")}</b></div><div className="hud-card"><small>YOUR ROLE</small><b className={me?.team==="ice"?"ice-text":"water-text"}>{me?.team?.toUpperCase()||"SPECTATING"}</b></div><div className="hud-card"><small>PLAYERS FREE</small><b>{room.players.filter(p=>p.team==="water"&&p.status==="active").length} / {room.players.filter(p=>p.team==="water").length}</b></div></div>
    <div className="game-help">WASD MOVE · SHIFT SPRINT · E TAG / RESCUE</div>
    <button className="interact-button" onClick={interact}>E<br/><small>INTERACT</small></button>
    <div className="touch-controls"><div className="touch-pad" onTouchStart={e=>setTouch({x:e.touches[0].clientX,y:e.touches[0].clientY})} onTouchEnd={()=>setTouch(null)} onTouchMove={e=>{if(!touch||!socket)return;const t=e.touches[0];const dx=t.clientX-touch.x,dy=t.clientY-touch.y;socket.emit("player:input",{x:Math.max(-1,Math.min(1,dx/35)),z:Math.max(-1,Math.min(1,dy/35)),deltaMs:50});}}><span>MOVE</span></div><button onClick={interact}>TAG / RESCUE</button></div>
  </div>;
}
