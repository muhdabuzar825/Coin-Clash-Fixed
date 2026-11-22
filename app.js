const $=s=>document.querySelector(s);
let ws, me, room, players=[], phase="lobby", raf=0, pollTimer;
const arena=$("#arena"), ctx=arena.getContext("2d");
function show(id){["home","lobby","game","finish"].forEach(x=>$("#"+x).classList.toggle("hidden",x!==id))}
async function connect(){
  // HTTP polling keeps the prototype dependency-free while preserving real-time play locally.
}
async function joinRoom(payload){
 const r=await fetch('/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
 const m=await r.json(); if(!r.ok){$("#err").textContent=m.error||'Could not join room.';return;}
 me=m.id;room=m.room;$("#roomCode").textContent=room;$("#roomTop").textContent=room;show('lobby');applyState(m.state);
 clearInterval(pollTimer); pollTimer=setInterval(async()=>{const q=await fetch('/poll?room='+room+'&id='+me);if(q.ok){const x=await q.json();x.events.forEach(e=>{if(e.type==='state')applyState(e.data)})}},150);
}
function applyState(m){phase=m.phase;players=m.players;renderScores();if(phase==='lobby'){show('lobby');renderLobby()}else if(phase==='playing'||phase==='results'){show('game');$("#round").textContent=m.round;$("#timer").textContent=m.timeLeft;draw(m.coin);if(phase==='results')overlay('Round over')}else if(phase==='finished'){show('finish');renderFinal()}}
async function send(o){if(!room||!me)return; await fetch('/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...o,room,id:me})})}
function name(){return ($("#name").value||"Player").trim().slice(0,18)}
$("#create").onclick=()=>joinRoom({type:'create',name:name()})
$("#join").onclick=()=>{const c=$("#code").value.trim().toUpperCase(); if(c.length!==4)return $("#err").textContent="Enter a 4-letter room code.";joinRoom({type:'join',code:c,name:name()})}
$("#start").onclick=()=>send({type:"start"});
function renderLobby(){$("#players").innerHTML=players.map((p,i)=>`<div class="player"><span>${i===0?"👑 ":""}${esc(p.name)}</span><span>${i===0?"Host":""}</span></div>`).join("");$("#start").style.display=players.length>=2&&players[0].id===me?"block":"none";$("#wait").textContent=players.length<2?"Waiting for at least 2 players…":"Ready! Host can start."}
function renderScores(){$("#scores").innerHTML=players.slice().sort((a,b)=>b.score-a.score).map(p=>`<span class="pill">${esc(p.name)}: ${p.score}</span>`).join("")}
function draw(coin){ctx.clearRect(0,0,900,600);ctx.fillStyle="#10172b";ctx.fillRect(0,0,900,600);
if(coin){ctx.beginPath();ctx.arc(coin.x,coin.y,coin.value===3?13:9,0,Math.PI*2);ctx.fillStyle=coin.value===3?"#facc15":"#22d3ee";ctx.fill();ctx.strokeStyle="#fff";ctx.stroke()}
players.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,18,0,Math.PI*2);ctx.fillStyle=p.color;ctx.fill();if(p.id===me){ctx.strokeStyle="#fff";ctx.lineWidth=3;ctx.stroke()}ctx.fillStyle="#fff";ctx.font="12px system-ui";ctx.textAlign="center";ctx.fillText(p.name,p.x,p.y-25)});
}
function overlay(t){ctx.fillStyle="#0009";ctx.fillRect(0,0,900,600);ctx.fillStyle="#fff";ctx.font="bold 42px system-ui";ctx.textAlign="center";ctx.fillText(t,450,300)}
function renderFinal(){$("#final").innerHTML=players.slice().sort((a,b)=>b.score-a.score).map((p,i)=>`<div class="rank ${i===0?"win":""}"><span>${i+1}. ${esc(p.name)}</span><b>${p.score}</b></div>`).join("")}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
window.addEventListener("keydown",e=>{if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","w","a","s","d","W","A","S","D"].includes(e.key)){e.preventDefault();const k=e.key.toLowerCase();send({type:"move",dx:k==="a"||k==="arrowleft"?-1:k==="d"||k==="arrowright"?1:0,dy:k==="w"||k==="arrowup"?-1:k==="s"||k==="arrowdown"?1:0})}});
document.querySelectorAll(".controls button").forEach(b=>b.onclick=()=>send({type:"move",dx:Number(b.dataset.dx||0),dy:Number(b.dataset.dy||0)}));
$("#again").onclick=()=>show("lobby");
setInterval(()=>{if(phase==="playing")send({type:"move",dx:0,dy:0})},1000);
