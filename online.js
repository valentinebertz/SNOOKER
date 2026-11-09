'use strict';
/* Online-Erweiterung: lokale Daten bleiben unabhängig. */
const SURL=window.SNOOKER_SUPABASE_URL, SKEY=window.SNOOKER_SUPABASE_ANON_KEY;
const onlineReady=!!(SURL&&SKEY&&!SURL.startsWith('HIER_')&&!SKEY.startsWith('HIER_'));
const sb=onlineReady&&window.supabase?.createClient(SURL,SKEY,{auth:{persistSession:true,autoRefreshToken:true}});
let onlineUser=null,onlineRoom=null,onlineBusy=false,onlineSnapshot=null,onlinePoll=null,onlinePage=false;
// Der zuletzt geöffnete Raum bleibt pro Konto auch nach App-Neustart erhalten.
const ONLINE_ROOM_KEY='snooker-online-active-room-v1';
const ONLINE_POOL_KEY='snooker-online-personal-pool-v1';
function onlineSavedPool(){try{const a=JSON.parse(localStorage.getItem(ONLINE_POOL_KEY)||'[]');return Array.isArray(a)?a.filter(p=>p&&typeof p.name==='string'&&typeof p.id==='string'):[]}catch(_){return []}}
function onlineSavePool(players){try{localStorage.setItem(ONLINE_POOL_KEY,JSON.stringify(players.filter(p=>p.manual).map(p=>({id:p.id,name:p.name,manual:true}))))}catch(_){toast('Spielerpool konnte auf diesem Gerät nicht gespeichert werden')}}
// Pro Raum und Spielende nur einmal anzeigen, auch nach einem Seiten-Neuladen.
const ONLINE_CHEERS_KEY='snooker-online-cheers-seen-v2';
let onlineCheered=new Set();
function onlineCheersId(r){return String(r.id)+':'+String(r.game?.ended||'')}
function onlineWasCheered(key){
 if(onlineCheered.has(key))return true;
 try{return JSON.parse(sessionStorage.getItem(ONLINE_CHEERS_KEY)||'[]').includes(key)}catch(_){return false}
}
function onlineMarkCheered(key){
 onlineCheered.add(key);
 try{const previous=JSON.parse(sessionStorage.getItem(ONLINE_CHEERS_KEY)||'[]');sessionStorage.setItem(ONLINE_CHEERS_KEY,JSON.stringify([...new Set([...previous,key])].slice(-50)))}catch(_){}
}
function onlineShowEndCheers(r){
 if(!r?.game?.ended||!onlineRoom||String(r.id)!==String(onlineRoom.id))return;
 const key=onlineCheersId(r);
 if(onlineWasCheered(key))return;
 // Der lokale Spielabschluss darf nicht als Serverbestätigung gelten.
 if(typeof showCheers!=='function')return;
 const g=structuredClone(r.game);
 if(!Array.isArray(g.teams)||!g.teams.length)return;
 if(!Array.isArray(g.winners)){
  const highest=Math.max(...g.teams.map(t=>Number(t.score)||0));
  g.winners=g.teams.filter(t=>(Number(t.score)||0)===highest).map(t=>t.name);
 }
 try{showCheers(g);onlineMarkCheered(key)}catch(e){console.warn('PROST-Anzeige fehlgeschlagen',e)}
}

function onlineStoredRoom(){try{const v=JSON.parse(localStorage.getItem(ONLINE_ROOM_KEY)||'null');return v?.userId===onlineUser?.id?v.roomId:null}catch(_){return null}}
function onlineRememberRoom(){if(onlineUser&&onlineRoom)try{localStorage.setItem(ONLINE_ROOM_KEY,JSON.stringify({userId:onlineUser.id,roomId:onlineRoom.id}))}catch(_){}}
function onlineForgetRoom(){try{localStorage.removeItem(ONLINE_ROOM_KEY)}catch(_){}}
let onlineRestoring=null;
const onlineSeenByRoom=new Map(); // Bereits gemeldete Zugänge pro Sitzung

async function onlineRestoreRoom(){
 if(!sb||!onlineUser||onlineRoom)return false;
 const id=onlineStoredRoom();if(!id)return false;
 if(onlineRestoring)return onlineRestoring;
 onlineRestoring=(async()=>{
  try{
   const r=await rpc('snooker_get',{p_id:id});
   if(!r)throw Error('Raum nicht gefunden');
   if(!onlineUser||onlineRoom)return false;
   await onlineAttach(r);return true;
  }catch(e){
   // Netzwerkfehler: Raum merken und beim nächsten Start erneut versuchen.
   toast('Raum konnte noch nicht geladen werden. Verbindung prüfen und erneut öffnen.');
   return false;
  }finally{onlineRestoring=null}
 })();
 return onlineRestoring;
}
const originalHome=home,originalSave=save,originalStart=startGame,originalGo=go,originalPlay=play;
function onlineMessage(err){toast(err?.message||String(err))}
function usernameEmail(name){const s=String(name||'').trim().toLowerCase();if(!/^[a-z0-9][a-z0-9_.-]{2,29}$/.test(s))throw Error('Name: 3–30 Zeichen, a–z, 0–9, Punkt, _ oder -');return s+'@snooker-login.example.com'}
function onlineBadge(){return `<div class="card"><h2>🌐 Online mit Freunden</h2><p class="muted">Gemeinsame Punkte, Spielcode, alle dürfen zählen. Eine Eingabe nach der anderen – ohne fremde Spiele zu löschen.</p><button class="btn" onclick="openOnline()"><span class="snooker-seven" aria-label="Schwarze Snookerkugel, 7 Punkte"></span> Online-Spiele öffnen</button>${onlineRoom?` <span class="badge">Raum ${esc(onlineRoom.code)}</span>`:''}</div>`}
home=function(){originalHome();document.getElementById('app').insertAdjacentHTML('afterbegin',onlineBadge())};
go=function(t){onlinePage=false;
 if(onlineRoom&&t==='history'&&onlineBusy){return;} // Spielende wird nach Serverbestätigung angezeigt
 originalGo(t)
};
function onlineRender(){onlinePage=true;tab='online';nav();const who=onlineUser?.email?.split('@')[0]||'';
 html(`<h1>🌐 Online-Snooker</h1>${!onlineReady?`<div class="card"><h2>Supabase einrichten</h2><p class="muted">Trage zuerst Projekt-URL und Publishable/Anon-Key in <b>config.js</b> ein und führe die SQL-Datei aus.</p></div>`:!onlineUser?`<div class="card"><h2>Mit Spielername anmelden</h2><p class="muted">Keine E-Mail nötig. Merke dir Name und Passwort gut: ohne E-Mail gibt es keine automatische Passwort-Wiederherstellung.</p><div class="field"><label>Spielername (3–30 Zeichen)</label><input id="on-name" autocomplete="username" placeholder="waldemar"></div><div class="field"><label>Passwort (mindestens 6 Zeichen)</label><input id="on-pass" type="password" autocomplete="current-password"></div><div class="row"><button class="btn" onclick="onlineAuth(false)">Anmelden</button><button class="btn alt" onclick="onlineAuth(true)">Neu registrieren</button></div><p class="muted">Für die Registrierung muss in Supabase die E-Mail-Bestätigung ausgeschaltet sein.</p></div>`:`<div class="card"><div class="row" style="justify-content:space-between"><b>👤 ${esc(who)}</b><button class="btn alt small" onclick="onlineLogout()">Abmelden</button></div></div>${!onlineRoom&&onlineStoredRoom()?`<div class="card"><h2>⏳ Gespeicherten Raum wieder öffnen</h2><p class="muted">Dein letzter Raum ist noch vorgemerkt. Bei Verbindungsproblemen bleibt er erhalten.</p><button class="btn" onclick="onlineRestoreRoom()">Raum erneut laden</button></div>`:''}${onlineRoom?`<div class="card"><h2><span class="snooker-seven" aria-label="Schwarze Snookerkugel, 7 Punkte"></span> Raum ${esc(onlineRoom.code)}</h2><p class="muted">Alle angemeldeten Mitspieler dürfen Punkte eingeben. Der Server nimmt immer nur eine Änderung je Versionsstand an.</p><div class="row"><button class="btn" onclick="onlineShowGame()">Spielstand öffnen</button><button class="btn alt" onclick="onlineLeave()">Raum verlassen (nur hier)</button></div></div><div class="card"><h2>🔗 Anderen Online-Raum beitreten</h2><p class="muted">Dein jetziger Raum bleibt bestehen. Ein Wechsel erfolgt nur nach deiner Bestätigung.</p><div class="field"><label>8-stelliger Raumcode</label><input id="on-code" maxlength="8" placeholder="z. B. A1B2C3D4" style="text-transform:uppercase" autocomplete="off"></div><button class="btn alt" onclick="onlineJoin()">Mit Raumcode beitreten</button></div>`:`<div class="card"><h2>Eigenes Online-Spiel starten</h2><p class="muted">Richte Teams wie bisher auf der Startseite ein. Danach hier starten.</p><button class="btn" onclick="onlineCreate()">Neuen Raum mit 2 Teams starten</button><p class="muted">Die Teams heißen zunächst Team 1 und Team 2. Du kannst auch lokal weiter spielen.</p></div><div class="card"><h2>Spiel beitreten</h2><div class="field"><label>8-stelliger Spielcode</label><input id="on-code" maxlength="8" placeholder="z. B. A1B2C3D4" style="text-transform:uppercase"></div><button class="btn" onclick="onlineJoin()">Beitreten</button></div><div class="card"><h2>Meine Online-Spiele</h2><div id="on-rooms"><p class="muted">Lade Spiele …</p></div></div>`}`}`);
 if(onlineUser&&!onlineRoom)onlineList();}
async function openOnline(){if(!sb)return onlineRender();try{const {data:{user}}=await sb.auth.getUser();onlineUser=user;if(await onlineRestoreRoom())return}catch(e){onlineMessage(e)}onlineRender()}
async function onlineAuth(register){try{if(!sb)throw Error('Bitte config.js ausfüllen');const email=usernameEmail(document.getElementById('on-name').value),password=document.getElementById('on-pass').value;if(password.length<6)throw Error('Passwort mindestens 6 Zeichen');const {data,error}=register?await sb.auth.signUp({email,password}):await sb.auth.signInWithPassword({email,password});if(error)throw error;if(!data.session)throw Error('E-Mail-Bestätigung in Supabase deaktivieren; keine echte E-Mail wird verwendet');onlineUser=data.user;if(!await onlineRestoreRoom())onlineRender();toast(register?'Konto erstellt':'Angemeldet')}catch(e){onlineMessage(e)}}
async function onlineLogout(){if(onlineRoom&&!confirm('Du bist noch in einem Online-Raum. Wirklich abmelden und diesen Raum verlassen?'))return;if(onlineRoom)await onlineLeave(true);else onlineForgetRoom();await sb.auth.signOut();onlineUser=null;onlineRender()}
async function rpc(name,args){const {data,error}=await sb.rpc(name,args||{});if(error)throw error;return Array.isArray(data)?data[0]:data}
async function onlineList(){try{const {data,error}=await sb.rpc('snooker_my_games');if(error)throw error;const el=document.getElementById('on-rooms');if(el)el.innerHTML=data.length?data.map(r=>`<div class="history"><span><span class="snooker-seven" aria-label="Schwarze Snookerkugel, 7 Punkte"></span> ${esc(r.code)} · ${esc((r.game?.teams||[]).map(t=>t.name).join(' : '))}</span><button class="btn alt small" onclick="onlineEnter('${r.id}')">Öffnen</button></div>`).join(''):'<p class="muted">Noch keine Online-Spiele.</p>'}catch(e){onlineMessage(e)}}
async function onlineCreate(){if(onlineBusy)return;onlineBusy=true;try{const game={id:Date.now(),mode:'classic',teams:[1,2].map(i=>({name:'Team '+i,players:'',playerNames:[],score:0,bestBreak:0})),turn:0,actions:[],started:new Date().toISOString(),breakPoints:0,reds:15,phase:'red',nextColor:2};// Dauerhaft gespeicherte manuelle Spieler auch im neuen Raum anbieten.
 game.onlinePlayers=onlineSavedPool();
 const r=await rpc('snooker_create',{p_game:game});onlineBusy=false;await onlineAttach(r)}catch(e){onlineMessage(e)}finally{onlineBusy=false;if(onlineRoom)onlineShowGame()}}
async function onlineJoin(){
 try{
  if(onlineBusy)return toast('Bitte kurz warten.');
  const code=(document.getElementById('on-code')?.value||'').trim().toUpperCase();
  if(!/^[A-Z0-9]{8}$/.test(code))throw Error('Bitte einen gültigen 8-stelligen Raumcode eingeben.');
  if(onlineRoom?.code?.toUpperCase()===code){onlineShowGame();return;}
  if(onlineRoom&&!confirm('Du bist noch in Raum '+onlineRoom.code+'. Wirklich zu Raum '+code+' wechseln? Der bisherige Raum und alle Spielstände bleiben gespeichert.'))return;
  const r=await rpc('snooker_join',{p_code:code});
  if(!r)throw Error('Raum nicht gefunden. Bitte Code prüfen.');
  if(r.game?.sessionClosed)throw Error('Diese Session wurde vom Spielleiter geschlossen.');
  await onlineAttach(r);
 }catch(e){onlineMessage(e)}
}
async function onlineEnter(id){try{const r=await rpc('snooker_get',{p_id:id});if(!r)throw Error('Spiel nicht verfügbar');await onlineAttach(r)}catch(e){onlineMessage(e)}}
async function onlineAttach(r){
 if(r?.game?.sessionClosed){onlineForgetRoom();throw Error('Diese Session wurde vom Spielleiter geschlossen');}
 if(onlineRoom)await onlineLeave(true);
 onlineSnapshot={active:state.active,games:[...state.games]};onlineRoom=r;
 state.active=r.game?.ended?null:structuredClone(r.game);
 onlineRememberRoom();onlineShowGame();onlinePoll=setInterval(onlineRefresh,1100);
 await onlineRegisterPlayer();
 if(onlineRoom&&onlineIsHost()&&!onlineRoom.game?.ended)await onlineMergeSavedPool();
 if(onlineRoom?.game?.ended)onlineShowEndCheers(onlineRoom);
 if(onlineRoom){onlineSeenByRoom.set(onlineRoom.id,new Set(onlinePlayers().map(p=>p.id)));onlineShowGame()}
}
// Die Raumaufstellung liegt auf Supabase; manuell angelegte Spieler werden
// zusätzlich auf dem Gerät des Spielleiters für zukünftige Partien gespeichert.
async function onlineMergeSavedPool(){
 const saved=onlineSavedPool();if(!saved.length)return;
 try{await onlineUpdateGame(game=>{
  game.onlinePlayers=Array.isArray(game.onlinePlayers)?game.onlinePlayers:[];
  let changed=false;
  for(const p of saved){if(!game.onlinePlayers.some(q=>q.id===p.id||q.name.toLocaleLowerCase('de')===p.name.toLocaleLowerCase('de'))){game.onlinePlayers.push(p);changed=true}}
  return changed;
 })}catch(e){onlineMessage(e)}
}

function onlinePlayers(){return Array.isArray(onlineRoom?.game?.onlinePlayers)?onlineRoom.game.onlinePlayers:[]}
function onlineMyName(){return (onlineUser?.email||'').split('@')[0]}
function onlineIsHost(){return !!onlineRoom&&!!onlineUser&&onlineRoom.host_id===onlineUser.id}
function onlineTeamOf(id){return (onlineRoom?.game?.teams||[]).findIndex(t=>Array.isArray(t.onlineMemberIds)&&t.onlineMemberIds.includes(id))}
async function onlineUpdateGame(change){
 if(!onlineRoom||!onlineUser)return;
 if(onlineBusy)throw Error('Bitte kurz warten, eine Eingabe wird verarbeitet.');
 onlineBusy=true;
 try{
  for(let attempt=0;attempt<5;attempt++){
   const current=await rpc('snooker_get',{p_id:onlineRoom.id});
   if(!current)throw Error('Spiel nicht mehr verfügbar');
   const game=structuredClone(current.game);
   if(!change(game,current)){
    onlineRoom=current;state.active=game.ended?null:structuredClone(game);
    return;
   }
   try{
    const saved=await rpc('snooker_commit',{p_id:current.id,p_revision:current.revision,p_game:game});
    onlineRoom=saved;state.active=saved.game?.ended?null:structuredClone(saved.game);
    return;
   }catch(e){
    if(attempt===4||!/konflikt|conflict|version|revision/i.test(e.message||''))throw e;
   }
  }
 }finally{onlineBusy=false;if(onlineRoom&&tab==='play')onlineShowGame()}
}
async function onlineRegisterPlayer(){
 if(!onlineRoom||!onlineUser)return;
 try{
  // Registrierung serverseitig atomar, damit Beitritte keine Punkte überschreiben.
  const r=await rpc('snooker_register_player',{p_id:onlineRoom.id});
  if(r){onlineRoom=r;state.active=r.game?.ended?null:structuredClone(r.game);if(tab==='play')onlineShowGame()}
 }catch(e){
  console.error('Teilnehmerregistrierung fehlgeschlagen:',e);
  onlineMessage(e);
  const app=document.getElementById('app');
  if(app&&!document.getElementById('online-registration-error'))app.insertAdjacentHTML('afterbegin',`<div id="online-registration-error" class="notice dangerline" role="alert">⚠️ Dein Name konnte nicht in die Teilnehmerliste eingetragen werden: ${esc(e?.message||String(e))}. Bitte den Spielleiter informieren.</div>`);
 }
}
function onlineRebuildTeamNames(game){
 const players=Array.isArray(game.onlinePlayers)?game.onlinePlayers:[];
 for(const team of game.teams){
  team.onlineMemberIds=Array.isArray(team.onlineMemberIds)?team.onlineMemberIds:[];
  const names=team.onlineMemberIds.map(id=>players.find(p=>p.id===id)?.name).filter(Boolean);
  team.playerNames=names;team.players=names.join(', ');
 }
}
function onlineNotifyArrivals(previous,next){
 if(!onlineIsHost())return;
 const known=onlineSeenByRoom.get(onlineRoom.id)||new Set((previous?.game?.onlinePlayers||[]).map(p=>p.id));
 const incoming=(next.game?.onlinePlayers||[]).filter(p=>!known.has(p.id)&&p.id!==onlineUser.id);
 (next.game?.onlinePlayers||[]).forEach(p=>known.add(p.id));onlineSeenByRoom.set(onlineRoom.id,known);
 if(incoming.length){
  toast('🔔 '+incoming.map(p=>p.name).join(', ')+' ist beigetreten – bitte Team zuweisen.');
 }
}
async function onlineAddGuest(){
 if(!onlineIsHost())return toast('Nur der Spielleiter kann Spieler hinzufügen.');
 const input=document.getElementById('on-guest-name');const name=cleanName(input?.value);
 if(!name)return toast('Bitte zuerst einen Namen eingeben.');
 if(name.length>70)return toast('Name zu lang.');
 try{
  await onlineUpdateGame(game=>{
   game.onlinePlayers=Array.isArray(game.onlinePlayers)?game.onlinePlayers:[];
   if(game.onlinePlayers.some(p=>p.name.toLocaleLowerCase('de')===name.toLocaleLowerCase('de')))throw Error('Name bereits im Spielerpool.');
   game.onlinePlayers.push({id:'guest-'+crypto.randomUUID(),name,manual:true});return true;
  });
  onlineSavePool(onlinePlayers());
  toast(name+' wurde dauerhaft gespeichert.');
 }catch(e){onlineMessage(e)}
}
async function onlineRemovePlayer(playerId){
 if(!onlineIsHost())return toast('Nur der Spielleiter kann Spieler entfernen.');
 const player=onlinePlayers().find(p=>p.id===playerId);if(!player)return;
 if(!confirm(player.name+' aus der Teamaufstellung und dem Spielerpool entfernen? Das Online-Konto und die Spielhistorie bleiben erhalten.'))return;
 try{
  await onlineUpdateGame(game=>{
   game.onlinePlayers=(game.onlinePlayers||[]).filter(p=>p.id!==playerId);
   for(const team of game.teams)team.onlineMemberIds=(team.onlineMemberIds||[]).filter(id=>id!==playerId);
   onlineRebuildTeamNames(game);return true;
  });
  onlineSavePool(onlinePlayers());
 }catch(e){onlineMessage(e)}
}
async function onlineAssignPlayer(playerId,teamIndex){
 if(!onlineIsHost())return toast('Nur der Spielleiter darf Teams einteilen.');
 try{
  await onlineUpdateGame(game=>{
   const players=Array.isArray(game.onlinePlayers)?game.onlinePlayers:[];
   const player=players.find(p=>p.id===playerId);
   if(!player)throw Error('Spieler nicht gefunden');
   if(teamIndex < -1||teamIndex>=game.teams.length)throw Error('Ungültiges Team');
   for(const team of game.teams){
    team.onlineMemberIds=(team.onlineMemberIds||[]).filter(id=>id!==playerId);
   }
   if(teamIndex>=0)game.teams[teamIndex].onlineMemberIds.push(playerId);
   onlineRebuildTeamNames(game);
   return true;
  });
 }catch(e){onlineMessage(e)}
}
function onlineTeamPanel(){
 if(!onlineRoom||onlineRoom.game?.ended)return '';
 const players=onlinePlayers(),teams=onlineRoom.game.teams||[],host=onlineIsHost();
 const pending=players.filter(p=>onlineTeamOf(p.id)<0);
 return `<div class="card"><h2>👥 Live-Teamverwaltung · ${players.length} Teilnehmer</h2>${host?'<button class="btn alt small" onclick="onlineRefresh()">🔄 Teilnehmer aktualisieren</button>':''}<p class="muted">Alle sehen die Teams sofort. ${host?'Du kannst Spieler auch während der Partie hinzufügen, verschieben und entfernen.':'Nur der Spielleiter verändert die Aufstellung.'}</p>
 ${host&&!pending.length?'<p class="muted">Keine neuen Spieler zur Einteilung. Beigetretene Spieler erscheinen hier automatisch.</p>':''}${host&&pending.length?`<div class="notice" role="status">🔔 <b>${pending.length} Spieler warten auf Zuteilung</b><p class="muted">Bitte nacheinander einem Team zuordnen:</p>${pending.map(p=>`<div class="row" style="margin:8px 0"><b class="grow">👤 ${esc(p.name)}</b>${teams.map((t,i)=>`<button class="btn small" onclick="onlineAssignPlayer('${p.id}',${i})">${esc(t.name)}</button>`).join('')}</div>`).join('')}</div>`:''}
 <div class="grid2" style="margin-top:12px">${teams.map((t,i)=>`<div class="team"><b>${esc(t.name)}</b><div class="muted" style="margin-top:9px">${players.filter(p=>onlineTeamOf(p.id)===i).map(p=>`👤 ${esc(p.name)}`).join('<div style="height:6px"></div>')||'Noch keine Spieler'}</div></div>`).join('')}</div>
 ${host?`<div class="field"><label>Spieler ohne eigenes Konto hinzufügen</label><div class="row"><input id="on-guest-name" class="grow" maxlength="70" placeholder="Spielername" style="width:auto"><button class="btn small" onclick="onlineAddGuest()">+ Hinzufügen</button></div></div>`:''}
 <h3 style="margin-top:17px">Gemeinsamer Spielerpool (${players.length})</h3>
 ${players.length?players.map(p=>`<div class="history"><span>👤 ${esc(p.name)}<div class="muted">${onlineTeamOf(p.id)<0?'Noch nicht zugeteilt':esc(teams[onlineTeamOf(p.id)]?.name||'')}</div></span>${host?`<div class="row"><select aria-label="Team für ${esc(p.name)}" style="width:auto;max-width:170px" onchange="onlineAssignPlayer('${p.id}',Number(this.value))"><option value="-1" ${onlineTeamOf(p.id)<0?'selected':''}>Ohne Team</option>${teams.map((t,i)=>`<option value="${i}" ${onlineTeamOf(p.id)===i?'selected':''}>${esc(t.name)}</option>`).join('')}</select><button class="btn red small" title="Aus Spielerpool entfernen" onclick="onlineRemovePlayer('${p.id}')">Entfernen</button></div>`:''}</div>`).join(''):'<p class="muted">Noch keine Spieler beigetreten.</p>'}
 </div>`;
}
function onlineShowGame(){if(!onlineRoom)return onlineRender();onlinePage=false;tab='play';nav();if(onlineRoom.game?.ended){
 const players=onlinePlayers(),teams=onlineRoom.game.teams||[];
 html(`<h1>🏆 Spiel beendet · Session läuft weiter</h1><div class="notice">🌐 Raum <b>${esc(onlineRoom.code)}</b> · Alle bleiben im Raum, bis der Spielleiter die Session schließt.</div><div class="card">${resultLine(onlineRoom.game)}</div><div class="card"><h2>👥 Teilnehmer und Teams</h2><div class="grid2">${teams.map((t,i)=>`<div class="team"><b>${esc(t.name)}</b><div class="muted">${players.filter(p=>onlineTeamOf(p.id)===i).map(p=>`👤 ${esc(p.name)}`).join('<div style="height:6px"></div>')||'Keine Spieler zugeteilt'}</div></div>`).join('')}</div><h3>Im Raum (${players.length})</h3>${players.map(p=>`<div class="history">👤 ${esc(p.name)}</div>`).join('')||'<p class="muted">Keine registrierten Teilnehmer</p>'}<p class="muted">Du bleibst in dieser Session – auch beim Neuladen der App.</p>${onlineIsHost()?'<button class="btn red" onclick="onlineCloseSession()">🔒 Session für alle schließen</button>':'<p class="notice">Warte, bis der Spielleiter die Session schließt.</p>'}</div>`);
 }else{state.active=structuredClone(onlineRoom.game);originalPlay();document.getElementById('app').insertAdjacentHTML('afterbegin',onlineTeamPanel());document.getElementById('app').insertAdjacentHTML('afterbegin',`<div class="notice">🌐 Live-Raum <b>${esc(onlineRoom.code)}</b> · ${onlineBusy?'🔒 Eingabe wird verarbeitet':'Alle dürfen zählen'} · <button class="btn alt small" onclick="onlineLeave()">Raum verlassen</button></div>`);if(onlineBusy)document.querySelectorAll('#app select').forEach(el=>el.disabled=true);if(onlineBusy)document.querySelectorAll('#app button').forEach(b=>{if(!b.getAttribute('onclick')?.includes('onlineLeave'))b.disabled=true})}}
async function onlineCloseSession(){
 if(!onlineRoom||!onlineIsHost())return toast('Nur der Spielleiter kann die Session schließen');
 if(!onlineRoom.game?.ended)return toast('Bitte zuerst das Spiel beenden');
 if(!confirm('Die Online-Session für ALLE Teilnehmer endgültig schließen? Alle werden aus diesem Raum zurück zur Übersicht geführt. Der Spielstand bleibt gespeichert.'))return;
 if(onlineBusy)return toast('Bitte kurz warten');
 onlineBusy=true;
 try{
  const current=await rpc('snooker_get',{p_id:onlineRoom.id});
  if(!current||current.game?.sessionClosed)throw Error('Session ist bereits geschlossen');
  if(!current.game?.ended)throw Error('Spiel ist noch nicht beendet');
  const updated=structuredClone(current.game);
  updated.sessionClosed=new Date().toISOString();
  const result=await rpc('snooker_commit',{p_id:current.id,p_revision:current.revision,p_game:updated});
  onlineRoom=result;
  await onlineLeave(true);
  toast('Session für alle geschlossen');
 }catch(e){onlineMessage(e)}finally{onlineBusy=false}
}
async function onlineLeave(confirmed=false){if(!confirmed&&!confirm('Diesen Online-Raum wirklich verlassen? Der Spielstand bleibt für alle in Supabase gespeichert.'))return;onlineForgetRoom();if(onlinePoll){clearInterval(onlinePoll);onlinePoll=null}onlineRoom=null;onlineBusy=false;if(onlineSnapshot){state.active=onlineSnapshot.active;state.games=onlineSnapshot.games;onlineSnapshot=null}originalSave();onlineRender()}
async function onlineRefresh(){if(!onlineRoom||onlineBusy)return;try{const r=await rpc('snooker_get',{p_id:onlineRoom.id});if(!r)return;if(r.game?.sessionClosed){await onlineLeave(true);toast('Der Spielleiter hat die Session geschlossen.');return;}if(r.revision!==onlineRoom.revision||r.game?.ended!==onlineRoom.game?.ended){onlineNotifyArrivals(onlineRoom,r);onlineRoom=r;state.active=r.game?.ended?null:structuredClone(r.game);if(tab==='play')onlineShowGame();else if(onlinePage)onlineRender()}if(r.game?.ended)onlineShowEndCheers(r)}catch(e){/* offline: nächste Abfrage erneut versuchen */}}
// Lokale Speicherroutine wird im Online-Modus zu einer atomaren Serveränderung.
save=function(){if(!onlineRoom)return originalSave();if(!onlineBusy)return;const updated=state.active?structuredClone(state.active):structuredClone(state.games[0]);const previous=onlineRoom;rpc('snooker_commit',{p_id:previous.id,p_revision:previous.revision,p_game:updated}).then(r=>{if(!onlineRoom||onlineRoom.id!==r.id)return;onlineRoom=r;state.active=r.game?.ended?null:structuredClone(r.game);onlineBusy=false;if(r.game?.ended){onlineShowGame();onlineShowEndCheers(r)}else if(tab==='play')onlineShowGame()}).catch(async e=>{onlineBusy=false;onlineMessage(e.message?.includes('KONFLIKT')?'Ein anderer Spieler war schneller. Spielstand wird aktualisiert.':e);try{const fresh=await rpc('snooker_get',{p_id:previous.id});if(fresh){onlineRoom=fresh;state.active=fresh.game?.ended?null:structuredClone(fresh.game)}}catch(_){}if(tab==='play')onlineShowGame()})};
// Jede Änderung wird sofort gesperrt; die Datenbank entscheidet atomar, wer zuerst war.
for(const name of ['addPoints','foul','nextTurn','selectTurn','undo','earlyBlack','finish','discard']){
 const fn=globalThis[name];globalThis[name]=function(...args){if(!onlineRoom)return fn(...args);if(onlineBusy)return toast('🔒 Bitte kurz warten');if(name==='discard')return toast('Online-Spiele dürfen nicht gelöscht werden');onlineBusy=true;const oldRevision=onlineRoom.revision;fn(...args);if(onlineBusy&&onlineRoom&&onlineRoom.revision===oldRevision){ // keine Änderung oder Dialog abgebrochen
  // Bei asynchroner Übertragung bleibt onlineBusy bis RPC fertig; sonst Freigabe.
  setTimeout(()=>{if(onlineBusy&&onlineRoom?.revision===oldRevision&&state.active&&JSON.stringify(state.active)===JSON.stringify(onlineRoom.game)){onlineBusy=false;onlineShowGame()}},100);
 }
 };
}
// Frühere Inline-Eventhandler nutzen globale Funktionen.
window.addPoints=globalThis.addPoints;window.foul=globalThis.foul;window.nextTurn=globalThis.nextTurn;window.selectTurn=globalThis.selectTurn;window.undo=globalThis.undo;window.earlyBlack=globalThis.earlyBlack;window.finish=globalThis.finish;window.discard=globalThis.discard;

// Dauerhaft sichtbarer Raumcode für den Ersteller des Online-Spiels.
// Das Banner gehört zur Seite (nicht zum Spielbereich), damit es auch bei
// Live-Teamverwaltung, Seitenwechsel und nach Wiederherstellung sichtbar ist.
(function installHostRoomBanner(){
 const style=document.createElement('style');
 style.textContent=`
  body.snooker-host-room-visible{padding-top:70px!important}
  #snooker-host-room-banner{position:fixed;top:0;left:0;right:0;z-index:100;
    background:#102d28;color:#fff;border-bottom:2px solid #eab65c;
    box-shadow:0 4px 18px #0009;padding:9px 12px;
    padding-top:max(9px,env(safe-area-inset-top));}
  #snooker-host-room-banner .host-room-inner{max-width:850px;margin:auto;display:flex;
    align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
  #snooker-host-room-banner .host-room-caption{font-size:12px;color:#b7d6c7}
  #snooker-host-room-banner .host-room-code{font-size:21px;font-weight:900;
    letter-spacing:2px;color:#f4c477;user-select:all}
  #snooker-host-room-banner button{border:1px solid #658b7b;border-radius:10px;
    background:#31564b;color:white;padding:8px 12px;font:inherit;font-weight:700;cursor:pointer}
  @media(max-width:390px){#snooker-host-room-banner .host-room-code{font-size:18px;letter-spacing:1px}}
 `;
 document.head.appendChild(style);
 function syncHostRoomBanner(){
  const shouldShow=!!(onlineRoom&&onlineUser&&onlineRoom.host_id===onlineUser.id&&onlineRoom.code);
  let banner=document.getElementById('snooker-host-room-banner');
  document.body.classList.toggle('snooker-host-room-visible',shouldShow);
  if(!shouldShow){if(banner)banner.remove();return}
  if(!banner){
   banner=document.createElement('div');banner.id='snooker-host-room-banner';
   banner.setAttribute('role','region');banner.setAttribute('aria-label','Aktueller Online-Raumcode');
   banner.innerHTML='<div class="host-room-inner"><div><div class="host-room-caption"><span class="snooker-seven" aria-label="Schwarze Snookerkugel, 7 Punkte"></span> Dein Online-Raum · LIVE</div><div class="host-room-code"></div></div><button type="button">📋 Code kopieren</button></div>';
   document.body.appendChild(banner);
   banner.querySelector('button').addEventListener('click',async()=>{
    const code=onlineRoom?.code;if(!code)return;
    try{await navigator.clipboard.writeText(code);toast('Raumcode kopiert: '+code)}
    catch(_){window.prompt('Raumcode zum Kopieren:',code)}
   });
  }
  banner.querySelector('.host-room-code').textContent=String(onlineRoom.code);
 }
 const oldShowGame=onlineShowGame;
 onlineShowGame=function(...args){const result=oldShowGame(...args);syncHostRoomBanner();return result};
 const oldRender=onlineRender;
 onlineRender=function(...args){const result=oldRender(...args);syncHostRoomBanner();return result};
 const oldGo=go;
 go=function(...args){const result=oldGo(...args);syncHostRoomBanner();return result};
 const oldLeave=onlineLeave;
 onlineLeave=async function(...args){const result=await oldLeave(...args);syncHostRoomBanner();return result};
 const oldRefresh=onlineRefresh;
 onlineRefresh=async function(...args){const result=await oldRefresh(...args);syncHostRoomBanner();return result};
 // Auth/Host-Informationen können beim asynchronen Start eintreffen.
 const oldAttach=onlineAttach;
 onlineAttach=async function(...args){const result=await oldAttach(...args);syncHostRoomBanner();return result};
 syncHostRoomBanner();
})();

(async()=>{if(!sb)return;try{const {data,error}=await sb.auth.getUser();if(error)throw error;onlineUser=data?.user||null;if(onlineUser)await onlineRestoreRoom()}catch(e){/* Beim nächsten Öffnen erneut versuchen. */}})();
// Bei Wiederkehr aus dem Hintergrund aktuelle Serverdaten nachladen.
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&onlineRoom)onlineRefresh()});
window.addEventListener('pageshow',()=>{if(onlineRoom)onlineRefresh();else if(onlineUser)onlineRestoreRoom()});
