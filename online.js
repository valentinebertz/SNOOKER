'use strict';
/* Online-Erweiterung: lokale Daten bleiben unabhängig. */
const SURL=window.SNOOKER_SUPABASE_URL, SKEY=window.SNOOKER_SUPABASE_ANON_KEY;
const onlineReady=!!(SURL&&SKEY&&!SURL.startsWith('HIER_')&&!SKEY.startsWith('HIER_'));
const sb=onlineReady&&window.supabase?.createClient(SURL,SKEY,{auth:{persistSession:true,autoRefreshToken:true}});
let onlineUser=null,onlineRoom=null,onlineBusy=false,onlineSnapshot=null,onlinePoll=null,onlinePage=false;
// Der zuletzt geöffnete Raum bleibt pro Konto auch nach App-Neustart erhalten.
const ONLINE_ROOM_KEY='snooker-online-active-room-v1';
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
function onlineBadge(){return `<div class="card"><h2>🌐 Online mit Freunden</h2><p class="muted">Gemeinsame Punkte, Spielcode, alle dürfen zählen. Eine Eingabe nach der anderen – ohne fremde Spiele zu löschen.</p><button class="btn" onclick="openOnline()">🎱 Online-Spiele öffnen</button>${onlineRoom?` <span class="badge">Raum ${esc(onlineRoom.code)}</span>`:''}</div>`}
home=function(){originalHome();document.getElementById('app').insertAdjacentHTML('afterbegin',onlineBadge())};
go=function(t){onlinePage=false;originalGo(t)};
function onlineRender(){onlinePage=true;tab='online';nav();const who=onlineUser?.email?.split('@')[0]||'';
 html(`<h1>🌐 Online-Snooker</h1>${!onlineReady?`<div class="card"><h2>Supabase einrichten</h2><p class="muted">Trage zuerst Projekt-URL und Publishable/Anon-Key in <b>config.js</b> ein und führe die SQL-Datei aus.</p></div>`:!onlineUser?`<div class="card"><h2>Mit Spielername anmelden</h2><p class="muted">Keine E-Mail nötig. Merke dir Name und Passwort gut: ohne E-Mail gibt es keine automatische Passwort-Wiederherstellung.</p><div class="field"><label>Spielername (3–30 Zeichen)</label><input id="on-name" autocomplete="username" placeholder="waldemar"></div><div class="field"><label>Passwort (mindestens 6 Zeichen)</label><input id="on-pass" type="password" autocomplete="current-password"></div><div class="row"><button class="btn" onclick="onlineAuth(false)">Anmelden</button><button class="btn alt" onclick="onlineAuth(true)">Neu registrieren</button></div><p class="muted">Für die Registrierung muss in Supabase die E-Mail-Bestätigung ausgeschaltet sein.</p></div>`:`<div class="card"><div class="row" style="justify-content:space-between"><b>👤 ${esc(who)}</b><button class="btn alt small" onclick="onlineLogout()">Abmelden</button></div></div>${!onlineRoom&&onlineStoredRoom()?`<div class="card"><h2>⏳ Gespeicherten Raum wieder öffnen</h2><p class="muted">Dein letzter Raum ist noch vorgemerkt. Bei Verbindungsproblemen bleibt er erhalten.</p><button class="btn" onclick="onlineRestoreRoom()">Raum erneut laden</button></div>`:''}${onlineRoom?`<div class="card"><h2>🎱 Raum ${esc(onlineRoom.code)}</h2><p class="muted">Alle angemeldeten Mitspieler dürfen Punkte eingeben. Der Server nimmt immer nur eine Änderung je Versionsstand an.</p><div class="row"><button class="btn" onclick="onlineShowGame()">Spielstand öffnen</button><button class="btn alt" onclick="onlineLeave()">Raum verlassen (nur hier)</button></div></div>`:`<div class="card"><h2>Eigenes Online-Spiel starten</h2><p class="muted">Richte Teams wie bisher auf der Startseite ein. Danach hier starten.</p><button class="btn" onclick="onlineCreate()">Neuen Raum mit 2 Teams starten</button><p class="muted">Die Teams heißen zunächst Team 1 und Team 2. Du kannst auch lokal weiter spielen.</p></div><div class="card"><h2>Spiel beitreten</h2><div class="field"><label>8-stelliger Spielcode</label><input id="on-code" maxlength="8" placeholder="z. B. A1B2C3D4" style="text-transform:uppercase"></div><button class="btn" onclick="onlineJoin()">Beitreten</button></div><div class="card"><h2>Meine Online-Spiele</h2><div id="on-rooms"><p class="muted">Lade Spiele …</p></div></div>`}`}`);
 if(onlineUser&&!onlineRoom)onlineList();}
async function openOnline(){if(!sb)return onlineRender();try{const {data:{user}}=await sb.auth.getUser();onlineUser=user;if(await onlineRestoreRoom())return}catch(e){onlineMessage(e)}onlineRender()}
async function onlineAuth(register){try{if(!sb)throw Error('Bitte config.js ausfüllen');const email=usernameEmail(document.getElementById('on-name').value),password=document.getElementById('on-pass').value;if(password.length<6)throw Error('Passwort mindestens 6 Zeichen');const {data,error}=register?await sb.auth.signUp({email,password}):await sb.auth.signInWithPassword({email,password});if(error)throw error;if(!data.session)throw Error('E-Mail-Bestätigung in Supabase deaktivieren; keine echte E-Mail wird verwendet');onlineUser=data.user;if(!await onlineRestoreRoom())onlineRender();toast(register?'Konto erstellt':'Angemeldet')}catch(e){onlineMessage(e)}}
async function onlineLogout(){if(onlineRoom&&!confirm('Du bist noch in einem Online-Raum. Wirklich abmelden und diesen Raum verlassen?'))return;if(onlineRoom)await onlineLeave(true);else onlineForgetRoom();await sb.auth.signOut();onlineUser=null;onlineRender()}
async function rpc(name,args){const {data,error}=await sb.rpc(name,args||{});if(error)throw error;return Array.isArray(data)?data[0]:data}
async function onlineList(){try{const {data,error}=await sb.rpc('snooker_my_games');if(error)throw error;const el=document.getElementById('on-rooms');if(el)el.innerHTML=data.length?data.map(r=>`<div class="history"><span>🎱 ${esc(r.code)} · ${esc((r.game?.teams||[]).map(t=>t.name).join(' : '))}</span><button class="btn alt small" onclick="onlineEnter('${r.id}')">Öffnen</button></div>`).join(''):'<p class="muted">Noch keine Online-Spiele.</p>'}catch(e){onlineMessage(e)}}
async function onlineCreate(){if(onlineBusy)return;onlineBusy=true;try{const game={id:Date.now(),mode:'classic',teams:[1,2].map(i=>({name:'Team '+i,players:'',playerNames:[],score:0,bestBreak:0})),turn:0,actions:[],started:new Date().toISOString(),breakPoints:0,reds:15,phase:'red',nextColor:2};const r=await rpc('snooker_create',{p_game:game});onlineBusy=false;await onlineAttach(r)}catch(e){onlineMessage(e)}finally{onlineBusy=false;if(onlineRoom)onlineShowGame()}}
async function onlineJoin(){try{const code=document.getElementById('on-code').value.trim();const r=await rpc('snooker_join',{p_code:code});await onlineAttach(r)}catch(e){onlineMessage(e)}}
async function onlineEnter(id){try{const r=await rpc('snooker_get',{p_id:id});if(!r)throw Error('Spiel nicht verfügbar');await onlineAttach(r)}catch(e){onlineMessage(e)}}
async function onlineAttach(r){
 if(onlineRoom)await onlineLeave(true);
 onlineSnapshot={active:state.active,games:[...state.games]};onlineRoom=r;
 state.active=r.game?.ended?null:structuredClone(r.game);
 onlineRememberRoom();onlineShowGame();onlinePoll=setInterval(onlineRefresh,1100);
 await onlineRegisterPlayer();
 if(onlineRoom){onlineSeenByRoom.set(onlineRoom.id,new Set(onlinePlayers().map(p=>p.id)));onlineShowGame()}
}
// Der Spielerpool liegt im Spiel-JSON auf Supabase, nicht im lokalen Geräte-Speicher.
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
 if(!onlineRoom||!onlineUser||onlineRoom.game?.ended)return;
 try{
  // Registrierung serverseitig atomar, damit Beitritte keine Punkte überschreiben.
  const r=await rpc('snooker_register_player',{p_id:onlineRoom.id});
  if(r){onlineRoom=r;state.active=r.game?.ended?null:structuredClone(r.game);if(tab==='play')onlineShowGame()}
 }catch(e){onlineMessage(e)}
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
  toast(name+' wurde zum Spielerpool hinzugefügt.');
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
 return `<div class="card"><h2>👥 Live-Teamverwaltung</h2><p class="muted">Alle sehen die Teams sofort. ${host?'Du kannst Spieler auch während der Partie hinzufügen, verschieben und entfernen.':'Nur der Spielleiter verändert die Aufstellung.'}</p>
 ${host&&pending.length?`<div class="notice" role="status">🔔 <b>${pending.length} Spieler warten auf Zuteilung</b><p class="muted">Bitte nacheinander einem Team zuordnen:</p>${pending.map(p=>`<div class="row" style="margin:8px 0"><b class="grow">👤 ${esc(p.name)}</b>${teams.map((t,i)=>`<button class="btn small" onclick="onlineAssignPlayer('${p.id}',${i})">${esc(t.name)}</button>`).join('')}</div>`).join('')}</div>`:''}
 <div class="grid2" style="margin-top:12px">${teams.map((t,i)=>`<div class="team"><b>${esc(t.name)}</b><div class="muted" style="margin-top:9px">${players.filter(p=>onlineTeamOf(p.id)===i).map(p=>`👤 ${esc(p.name)}`).join('<div style="height:6px"></div>')||'Noch keine Spieler'}</div></div>`).join('')}</div>
 ${host?`<div class="field"><label>Spieler ohne eigenes Konto hinzufügen</label><div class="row"><input id="on-guest-name" class="grow" maxlength="70" placeholder="Spielername" style="width:auto"><button class="btn small" onclick="onlineAddGuest()">+ Hinzufügen</button></div></div>`:''}
 <h3 style="margin-top:17px">Gemeinsamer Spielerpool (${players.length})</h3>
 ${players.length?players.map(p=>`<div class="history"><span>👤 ${esc(p.name)}<div class="muted">${onlineTeamOf(p.id)<0?'Noch nicht zugeteilt':esc(teams[onlineTeamOf(p.id)]?.name||'')}</div></span>${host?`<div class="row"><select aria-label="Team für ${esc(p.name)}" style="width:auto;max-width:170px" onchange="onlineAssignPlayer('${p.id}',Number(this.value))"><option value="-1" ${onlineTeamOf(p.id)<0?'selected':''}>Ohne Team</option>${teams.map((t,i)=>`<option value="${i}" ${onlineTeamOf(p.id)===i?'selected':''}>${esc(t.name)}</option>`).join('')}</select><button class="btn red small" title="Aus Spielerpool entfernen" onclick="onlineRemovePlayer('${p.id}')">Entfernen</button></div>`:''}</div>`).join(''):'<p class="muted">Noch keine Spieler beigetreten.</p>'}
 </div>`;
}
function onlineShowGame(){if(!onlineRoom)return onlineRender();onlinePage=false;tab='play';nav();if(onlineRoom.game?.ended){html(`<h1>🏆 Online-Spiel beendet</h1><div class="card">${resultLine(onlineRoom.game)}<button class="btn alt" onclick="onlineLeave()">Zur Raumübersicht</button></div>`)}else{state.active=structuredClone(onlineRoom.game);originalPlay();document.getElementById('app').insertAdjacentHTML('afterbegin',onlineTeamPanel());document.getElementById('app').insertAdjacentHTML('afterbegin',`<div class="notice">🌐 Live-Raum <b>${esc(onlineRoom.code)}</b> · ${onlineBusy?'🔒 Eingabe wird verarbeitet':'Alle dürfen zählen'} · <button class="btn alt small" onclick="onlineLeave()">Raum verlassen</button></div>`);if(onlineBusy)document.querySelectorAll('#app select').forEach(el=>el.disabled=true);if(onlineBusy)document.querySelectorAll('#app button').forEach(b=>{if(!b.getAttribute('onclick')?.includes('onlineLeave'))b.disabled=true})}}
async function onlineLeave(confirmed=false){if(!confirmed&&!confirm('Diesen Online-Raum wirklich verlassen? Der Spielstand bleibt für alle in Supabase gespeichert.'))return;onlineForgetRoom();if(onlinePoll){clearInterval(onlinePoll);onlinePoll=null}onlineRoom=null;onlineBusy=false;if(onlineSnapshot){state.active=onlineSnapshot.active;state.games=onlineSnapshot.games;onlineSnapshot=null}originalSave();onlineRender()}
async function onlineRefresh(){if(!onlineRoom||onlineBusy)return;try{const r=await rpc('snooker_get',{p_id:onlineRoom.id});if(!r)return;if(r.revision!==onlineRoom.revision){onlineNotifyArrivals(onlineRoom,r);onlineRoom=r;state.active=r.game?.ended?null:structuredClone(r.game);if(tab==='play')onlineShowGame();else if(onlinePage)onlineRender()}}catch(e){/* offline: nächste Abfrage erneut versuchen */}}
// Lokale Speicherroutine wird im Online-Modus zu einer atomaren Serveränderung.
save=function(){if(!onlineRoom)return originalSave();if(!onlineBusy)return;const updated=state.active?structuredClone(state.active):structuredClone(state.games[0]);const previous=onlineRoom;rpc('snooker_commit',{p_id:previous.id,p_revision:previous.revision,p_game:updated}).then(r=>{if(!onlineRoom||onlineRoom.id!==r.id)return;onlineRoom=r;state.active=r.game?.ended?null:structuredClone(r.game);onlineBusy=false;if(tab==='play')onlineShowGame()}).catch(async e=>{onlineBusy=false;onlineMessage(e.message?.includes('KONFLIKT')?'Ein anderer Spieler war schneller. Spielstand wird aktualisiert.':e);try{const fresh=await rpc('snooker_get',{p_id:previous.id});if(fresh){onlineRoom=fresh;state.active=fresh.game?.ended?null:structuredClone(fresh.game)}}catch(_){}if(tab==='play')onlineShowGame()})};
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
(async()=>{if(!sb)return;try{const {data,error}=await sb.auth.getUser();if(error)throw error;onlineUser=data?.user||null;if(onlineUser)await onlineRestoreRoom()}catch(e){/* Beim nächsten Öffnen erneut versuchen. */}})();
// Bei Wiederkehr aus dem Hintergrund aktuelle Serverdaten nachladen.
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&onlineRoom)onlineRefresh()});
window.addEventListener('pageshow',()=>{if(onlineRoom)onlineRefresh();else if(onlineUser)onlineRestoreRoom()});
