
'use strict';
/* Isoliertes Übungsspiel. Unabhängig von localStorage und Frame-Punktestand. */
const practice={canvas:null,ctx:null,balls:[],aim:null,charging:false,start:0,power:0,frame:0,last:0,finished:false,shotPreview:null,pointerId:null};
const practiceFelt=new Image();
practiceFelt.src='./satin-tuch.webp';
practiceFelt.onload=()=>{if(practice.canvas)drawPractice()};
const PW=420,PH=720,LEFT=36,RIGHT=384,TOP=32,BOTTOM=688,R=7.3;
const POTS=[[LEFT,TOP],[RIGHT,TOP],[LEFT,(TOP+BOTTOM)/2],[RIGHT,(TOP+BOTTOM)/2],[LEFT,BOTTOM],[RIGHT,BOTTOM]];
const PCOL={red:'#ef263d',yellow:'#ffe323',green:'#26d977',brown:'#b87b3c',blue:'#238bff',pink:'#ff82cb',black:'#17191b',white:'#f8fbfc'};
function initPractice(){
 practice.canvas=document.getElementById('practice-canvas');if(!practice.canvas)return;
 practice.ctx=practice.canvas.getContext('2d');
 if(!practice.canvas.dataset.bound){
  const c=practice.canvas;
  c.addEventListener('pointerdown',practiceDown);c.addEventListener('pointermove',practiceMove);
  c.addEventListener('pointerup',practiceUp);c.addEventListener('pointercancel',practiceCancel);
  c.dataset.bound='1';
 }
 resetPractice();
 if(!practice.frame)practice.frame=requestAnimationFrame(practiceLoop);
}
function newBall(type,x,y){return {type,x,y,vx:0,vy:0,live:true,r:R};}
function resetPractice(){
 practice.balls=[];
 practice.balls.push(newBall('white',210,590));
 practice.balls.push(newBall('black',210,87));
 practice.balls.push(newBall('pink',210,240));
 practice.balls.push(newBall('blue',210,360));
 practice.balls.push(newBall('yellow',132,532));
 practice.balls.push(newBall('brown',210,532));
 practice.balls.push(newBall('green',288,532));
 // Apex points towards pink (towards baulk end). Fifteen reds.
 for(let row=0;row<5;row++)for(let j=0;j<=row;j++)
   practice.balls.push(newBall('red',210+(j-row/2)*15.5,190-row*14.0));
 practice.finished=false;practice.charging=false;practice.aim=null;practice.power=0;practice.shotPreview=null;practice.pointerId=null;
 practiceMessage('🎯 Halten = Kraft laden, Loslassen = Stoßen. Zielwechsel setzt die Kraft auf 0 %.');
}
function respawnCueBall(){
 const cue=practice.balls.find(b=>b.type==='white');
 if(!cue)return;
 // Bevorzugter Ursprung; falls besetzt, den nächsten freien Platz wählen.
 let spot=null;
 for(let radius=0;radius<=90&&!spot;radius+=15){
  for(let i=0;i<(radius===0?1:24);i++){
   const a=i*Math.PI/12;
   const x=210+Math.cos(a)*radius,y=590+Math.sin(a)*radius;
   if(x<LEFT+R+3||x>RIGHT-R-3||y<TOP+R+3||y>BOTTOM-R-3)continue;
   if(practice.balls.some(b=>b!==cue&&b.live&&Math.hypot(b.x-x,b.y-y)<2*R+3))continue;
   spot={x,y};break;
  }
 }
 cue.live=true;cue.x=spot?spot.x:210;cue.y=spot?spot.y:590;cue.vx=0;cue.vy=0;
 practice.charging=false;practice.pointerId=null;practice.power=0;practice.aim=null;
 const meter=document.getElementById('practice-power');if(meter)meter.style.width='0%';
 practiceMessage('⚪ Weiß versenkt – automatisch wieder auf dem Ausgangspunkt eingesetzt.');
}
function resetCueBall(){respawnCueBall()}

function practiceMessage(t){const el=document.getElementById('practice-status');if(el)el.textContent=t}
function ptFromEvent(e){
 const rect=practice.canvas.getBoundingClientRect();
 return {x:(e.clientX-rect.left)*PW/rect.width,y:(e.clientY-rect.top)*PH/rect.height};
}
function moving(){return practice.balls.some(b=>b.live&&Math.hypot(b.vx,b.vy)>.12)}
// Freie Zielrichtung durch Fingerposition, ohne Einrasten.
function aimToPoint(cue,p){
 // Freies Zielen: KEIN automatisches Einrasten auf die Kugelmitte.
 return Math.atan2(p.y-cue.y,p.x-cue.x);
}
// Nur eine wirkliche geometrische Kollision erzeugt eine türkisfarbene Linie.
// Keine Parallel- oder Annäherungs-Vorschau.
function previewHit(cue,ux,uy){return firstHit(cue,ux,uy)}
function practiceDown(e){
 if(!practice.canvas||practice.charging||practice.finished)return;
 const cue=practice.balls.find(b=>b.type==='white'&&b.live);if(!cue){practiceMessage('⚪ Weiße Kugel mit dem Knopf neu setzen.');return;}
 e.preventDefault();practice.pointerId=e.pointerId;practice.canvas.setPointerCapture(e.pointerId);
 const p=ptFromEvent(e);
 practice.aim=aimToPoint(cue,p);
 practice.charging=true;practice.start=performance.now();practice.power=0;
 practiceMessage('🎯 Frei zielen: Türkis erscheint nur bei echtem Kugelkontakt und zeigt die Abprallrichtung der getroffenen Kugel.');
 drawPractice();
}
function practiceMove(e){
 if(!practice.charging||e.pointerId!==practice.pointerId)return;
 e.preventDefault();
 const cue=practice.balls.find(b=>b.type==='white'&&b.live);if(!cue)return;
 const p=ptFromEvent(e);
 if(Math.hypot(p.x-cue.x,p.y-cue.y)>15){
  const nextAim=aimToPoint(cue,p);
  const delta=Math.abs(Math.atan2(Math.sin(nextAim-practice.aim),Math.cos(nextAim-practice.aim)));
  // A meaningful direction change resets the held power immediately.
  if(delta>Math.PI/90){ // >2 degrees
   practice.start=performance.now();practice.power=0;
   const meter=document.getElementById('practice-power');if(meter)meter.style.width='0%';
   practiceMessage('🎯 Ziel geändert – Stoßkraft wieder 0 %. Jetzt neu ausholen.');
  }
  practice.aim=nextAim;
 }
 drawPractice();
}
function practiceUp(e){
 if(!practice.charging||e.pointerId!==practice.pointerId)return;e.preventDefault();
 const cue=practice.balls.find(b=>b.type==='white'&&b.live);
 const hold=performance.now()-practice.start;
 practice.charging=false;practice.pointerId=null;
 if(!cue||practice.aim===null)return;
 // 0–100 % is mapped to an impulse, not a constant speed.
 const charge=Math.min(1,Math.max(0,hold/1450));
 const force=3.2+charge*20.8;
 practice.shotPreview=null;
 // An existing rolling cue ball receives the new stroke as an impulse.
 cue.vx+=Math.cos(practice.aim)*force;cue.vy+=Math.sin(practice.aim)*force;
 const speed=Math.hypot(cue.vx,cue.vy);
 if(speed>29){cue.vx*=29/speed;cue.vy*=29/speed;}
 practice.power=0;practice.aim=null;practiceMessage('🎱 Stoß ausgeführt – du kannst sofort erneut zielen und stoßen.');
}
function practiceCancel(){practice.charging=false;practice.power=0;practice.pointerId=null;practice.aim=null;
 const meter=document.getElementById('practice-power');if(meter)meter.style.width='0%';}
function practiceLoop(t){
 practice.frame=requestAnimationFrame(practiceLoop);
 if(!practice.canvas||!document.getElementById('practice-canvas'))return;
 const dt=practice.last?Math.min(2.2,(t-practice.last)/16.67):1;practice.last=t;
 if(practice.charging)practice.power=Math.min(1,(t-practice.start)/1450);
 const meter=document.getElementById('practice-power');if(meter)meter.style.width=Math.round(practice.power*100)+'%';
 // Fixed-step physics with substeps to reduce tunneling.
 for(let step=0;step<Math.max(1,Math.ceil(dt*2));step++)physicsStep(dt/Math.max(1,Math.ceil(dt*2)));
 drawPractice();
}
function physicsStep(dt){
 const balls=practice.balls;
 for(const b of balls){
  if(!b.live)continue;
  b.x+=b.vx*dt;b.y+=b.vy*dt;
  const pocket=POTS.find(([px,py])=>Math.hypot(b.x-px,b.y-py)<17);
  if(pocket){b.live=false;b.vx=b.vy=0;continue;}
  if(b.x<LEFT+R){b.x=LEFT+R;b.vx=Math.abs(b.vx)*.84}
  if(b.x>RIGHT-R){b.x=RIGHT-R;b.vx=-Math.abs(b.vx)*.84}
  if(b.y<TOP+R){b.y=TOP+R;b.vy=Math.abs(b.vy)*.84}
  if(b.y>BOTTOM-R){b.y=BOTTOM-R;b.vy=-Math.abs(b.vy)*.84}
  // Reduced rolling resistance: a full-power stroke travels noticeably farther.
  b.vx*=Math.pow(.995,dt);b.vy*=Math.pow(.995,dt);
  if(Math.hypot(b.vx,b.vy)<.035)b.vx=b.vy=0;
 }
 for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){
  const a=balls[i],b=balls[j];if(!a.live||!b.live)continue;
  let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
  if(d>=2*R||d<.00001)continue;
  const nx=dx/d,ny=dy/d,over=2*R-d;
  a.x-=nx*over/2;b.x+=nx*over/2;a.y-=ny*over/2;b.y+=ny*over/2;
  const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
  if(rel<0){const imp=-rel*.94;a.vx-=imp*nx;a.vy-=imp*ny;b.vx+=imp*nx;b.vy+=imp*ny;}
 }
 // Weiß sofort nach dem Versenken wieder aufstellen – auch wenn andere Kugeln noch rollen.
 const cue=balls.find(b=>b.type==='white');
 if(cue&&!cue.live)respawnCueBall();
 if(!practice.finished&&balls.filter(b=>b.type!=='white'&&b.live).length===0){
  practice.finished=true;practiceMessage('🏆 Alle farbigen und roten Kugeln versenkt! Mit „Tisch abräumen“ neu starten.');
 }
}

function buildShotPreview(cue,angle){
 const ux=Math.cos(angle),uy=Math.sin(angle);
 const hit=firstHit(cue,ux,uy);
 if(!hit)return null;
 const hx=cue.x+ux*hit.t,hy=cue.y+uy*hit.t;
 const dx=hit.ball.x-hx,dy=hit.ball.y-hy,len=Math.hypot(dx,dy)||1;
 const nx=dx/len,ny=dy/len;
 const travel=rayWall(hit.ball,nx,ny);
 return {cx:cue.x,cy:cue.y,hx,hy,bx:hit.ball.x,by:hit.ball.y,ex:hit.ball.x+nx*travel,ey:hit.ball.y+ny*travel};
}
function drawShotPreview(c,v){
 c.save();c.lineCap='round';
 c.strokeStyle='#fce89a';c.lineWidth=2.5;c.setLineDash([7,6]);
 c.beginPath();c.moveTo(v.cx,v.cy);c.lineTo(v.hx,v.hy);c.stroke();
 drawObjectFlight(c,v.bx,v.by,v.ex,v.ey);
 c.restore();
}
function drawObjectFlight(c,x,y,ex,ey,approx=false){
 // Leuchtende Ziellinie der anvisierten Kugel, sichtbar auch während die Kugeln rollen.
 const dx=ex-x,dy=ey-y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
 c.save();c.lineCap='round';
 c.strokeStyle=approx?'#9ee5e4':'#63ffff';c.lineWidth=approx?2.5:4.5;c.globalAlpha=approx?.65:1;c.shadowColor='#00e5ff';c.shadowBlur=approx?3:14;
 c.setLineDash([9,6]);c.beginPath();c.moveTo(x,y);c.lineTo(ex,ey);c.stroke();
 c.setLineDash([]);c.shadowBlur=0;
 const ax=ex-ux*13,ay=ey-uy*13;
 c.fillStyle='#b9ffff';c.beginPath();c.moveTo(ax+ux*11,ay+uy*11);
 c.lineTo(ax-ux*5-uy*6,ay-uy*5+ux*6);
 c.lineTo(ax-ux*5+uy*6,ay-uy*5-ux*6);c.closePath();c.fill();
 c.restore();
}
function drawPractice(){
 const c=practice.ctx;if(!c)return;
 c.clearRect(0,0,PW,PH);
 const wood=c.createLinearGradient(0,0,PW,PH);wood.addColorStop(0,'#c38b49');wood.addColorStop(.4,'#5b2f18');wood.addColorStop(.7,'#ab7038');wood.addColorStop(1,'#4d2919');
 c.fillStyle='#0c1c1b';c.fillRect(0,0,PW,PH);
 roundRect(c,13,8,394,704,34,wood);
 roundRect(c,24,18,372,684,27,'#d4ad66');
 const felt=c.createLinearGradient(40,20,380,700);felt.addColorStop(0,'#124e35');felt.addColorStop(.35,'#21835a');felt.addColorStop(.7,'#126646');felt.addColorStop(1,'#073a2b');
 roundRect(c,LEFT,TOP,RIGHT-LEFT,BOTTOM-TOP,22,felt);
 // Dieselbe Satin-Stofftextur wie beim Regel-Tisch, unter den Spiellinien.
 if(practiceFelt.complete && practiceFelt.naturalWidth){
  c.save();
  c.beginPath();c.roundRect(LEFT,TOP,RIGHT-LEFT,BOTTOM-TOP,22);c.clip();
  c.globalAlpha=.87;
  c.drawImage(practiceFelt,LEFT,TOP,RIGHT-LEFT,BOTTOM-TOP);
  const shade=c.createRadialGradient(210,300,40,210,360,390);
  shade.addColorStop(0,'rgba(24,85,53,.03)');
  shade.addColorStop(1,'rgba(0,26,17,.48)');
  c.globalAlpha=1;c.fillStyle=shade;c.fillRect(LEFT,TOP,RIGHT-LEFT,BOTTOM-TOP);
  c.restore();
 }

 // Satin texture using low-opacity fine lines.
 c.save();c.beginPath();c.roundRect(LEFT,TOP,RIGHT-LEFT,BOTTOM-TOP,22);c.clip();
 for(let y=TOP;y<BOTTOM;y+=4){c.strokeStyle='rgba(235,255,214,.017)';c.beginPath();c.moveTo(LEFT,y);c.lineTo(RIGHT,y);c.stroke();}
 c.strokeStyle='#d8e6bc7a';c.lineWidth=1.4;c.beginPath();c.moveTo(LEFT,532);c.lineTo(RIGHT,532);c.stroke();
 c.beginPath();c.arc(210,532,78,0,Math.PI);c.stroke();
 c.restore();
 for(const [x,y] of POTS){c.beginPath();c.arc(x,y,17,0,Math.PI*2);c.fillStyle='#8e6639';c.fill();c.beginPath();c.arc(x,y,13,0,Math.PI*2);c.fillStyle='#020c0a';c.fill();}
 for(const b of practice.balls){if(!b.live)continue;drawBall(c,b);}
 if(practice.aim!==null){
  const cue=practice.balls.find(b=>b.type==='white'&&b.live);
  if(cue){const ux=Math.cos(practice.aim),uy=Math.sin(practice.aim);
   const hit=previewHit(cue,ux,uy);
   const reach=hit?hit.t:Math.min(950,rayWall(cue,ux,uy));
   c.save();c.setLineDash([7,7]);c.strokeStyle='#fff9a9';c.lineWidth=2;
   c.beginPath();c.moveTo(cue.x,cue.y);c.lineTo(cue.x+ux*reach,cue.y+uy*reach);c.stroke();c.setLineDash([]);
   practice.previewFlight=null;
   if(hit){
     // Mittelpunkt der weißen Kugel genau im ersten Kontaktmoment.
     const hx=cue.x+ux*hit.t,hy=cue.y+uy*hit.t;
     c.beginPath();c.arc(hx,hy,R);c.strokeStyle='#fff8a8';c.lineWidth=2;c.stroke();
     // Die Objektkugel rollt entlang der Verbindung der Kugelmittelpunkte
     // im Kollisionsmoment – nicht parallel zur Stoßrichtung.
     const dx=hit.ball.x-hx,dy=hit.ball.y-hy,len=Math.hypot(dx,dy)||1;
     const nx=dx/len,ny=dy/len;
     const travel=rayWall(hit.ball,nx,ny);
     // Fluglinie am Ende erneut über dem Kö zeichnen, damit sie niemals verdeckt wird.
     practice.previewFlight={x:hit.ball.x,y:hit.ball.y,ex:hit.ball.x+nx*travel,ey:hit.ball.y+ny*travel,type:hit.ball.type};
     // Tangentiale Richtung der weißen Kugel bei einem schrägen Treffer.
     const dot=ux*nx+uy*ny;
     const tangentX=ux-dot*nx,tangentY=uy-dot*ny;
     if(Math.hypot(tangentX,tangentY)>.04){
       c.strokeStyle='#ffe79c';c.lineWidth=2;c.setLineDash([4,5]);
       c.beginPath();c.moveTo(hx,hy);c.lineTo(hx+tangentX*95,hy+tangentY*95);c.stroke();c.setLineDash([]);
     }
   }
   drawCue(c,cue,ux,uy,practice.charging?practice.power:0);
   if(practice.previewFlight){const v=practice.previewFlight;drawObjectFlight(c,v.x,v.y,v.ex,v.ey,false);}
   c.restore();
  }
 }

}
function rayWall(ball,ux,uy){
 // Robust against zero components and exact rail positions.
 const distances=[];
 if(ux>1e-8)distances.push((RIGHT-R-ball.x)/ux);
 if(ux< -1e-8)distances.push((LEFT+R-ball.x)/ux);
 if(uy>1e-8)distances.push((BOTTOM-R-ball.y)/uy);
 if(uy< -1e-8)distances.push((TOP+R-ball.y)/uy);
 const valid=distances.filter(v=>Number.isFinite(v)&&v>0);
 return valid.length?Math.min(...valid):120;
}
function firstHit(cue,ux,uy){
 let best=null;
 for(const b of practice.balls){
  if(!b.live||b===cue)continue;
  const dx=b.x-cue.x,dy=b.y-cue.y,t=dx*ux+dy*uy,perp2=dx*dx+dy*dy-t*t;
  if(t<0||perp2>(2*R)*(2*R))continue;
  const dist=t-Math.sqrt(Math.max(0,4*R*R-perp2));
  if(dist>=0&&(!best||dist<best.t))best={ball:b,t:dist};
 }
 return best;
}
function drawCue(c,b,ux,uy,power){
 // Kö hinter der weißen Kugel: Spitze nahe der weißen Kugel, Griff weit außen.
 const gap=R+5+power*45,tipX=b.x-ux*gap,tipY=b.y-uy*gap;
 const backX=tipX-ux*215,backY=tipY-uy*215;
 c.lineCap='round';c.strokeStyle='#17110e';c.lineWidth=9;c.beginPath();c.moveTo(backX,backY);c.lineTo(tipX,tipY);c.stroke();
 const grad=c.createLinearGradient(backX,backY,tipX,tipY);grad.addColorStop(0,'#18191a');grad.addColorStop(.38,'#262524');grad.addColorStop(.4,'#9c6334');grad.addColorStop(.8,'#e6b879');grad.addColorStop(1,'#f3dcad');
 c.strokeStyle=grad;c.lineWidth=6;c.beginPath();c.moveTo(backX,backY);c.lineTo(tipX,tipY);c.stroke();
 c.strokeStyle='#4bb5d4';c.lineWidth=7;c.beginPath();c.moveTo(tipX-ux*2,tipY-uy*2);c.lineTo(tipX,tipY);c.stroke();
}
function drawBall(c,b){
 const r=b.r,glow=c.createRadialGradient(b.x-r*.4,b.y-r*.5,1,b.x,b.y,r*1.3);
 glow.addColorStop(0,'#ffffff');glow.addColorStop(.18,PCOL[b.type]);glow.addColorStop(.75,PCOL[b.type]);glow.addColorStop(1,'#111a1a');
 c.fillStyle='#0007';c.beginPath();c.arc(b.x+2,b.y+3,r+1,0,Math.PI*2);c.fill();
 c.fillStyle=glow;c.beginPath();c.arc(b.x,b.y,r,0,Math.PI*2);c.fill();
 c.fillStyle='#ffffffb9';c.beginPath();c.ellipse(b.x-2.2,b.y-2.5,2.4,1.4,-.6,0,Math.PI*2);c.fill();
}
function roundRect(c,x,y,w,h,r,fill){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();}
