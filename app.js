// ─── STATE ────────────────────────────────────────────────────────────────────
const S={re:'',gid:'937251908005-hvco8m4dpidqiuo09er1tec3p14426au.apps.googleusercontent.com',gat:'',eid:null,ev:null,matches:[],rankings:[],teams:{},notes:{},sel:null,timer:null,divId:undefined,preScoutMode:false,preScoutDivisions:[]};
const ls=(k,v)=>{if(v!==undefined)localStorage.setItem(k,v);else return localStorage.getItem(k)||'';};
const init=()=>{
  S.re=ls('vs_re');
  S.gid='937251908005-hvco8m4dpidqiuo09er1tec3p14426au.apps.googleusercontent.com';
  if(typeof VADT_CONFIG!=='undefined'&&VADT_CONFIG.googleClientId) S.gid=VADT_CONFIG.googleClientId;
  S.notesKey='vs_n';
  try{const n=ls(S.notesKey);if(n)Object.assign(S.notes,JSON.parse(n));}catch{}
};
const sn2=()=>ls(S.notesKey||'vs_n',JSON.stringify(S.notes));
const nk=(m,t)=>`${m}_${t}`;
const gn=(m,t)=>S.notes[nk(m,t)]||null;
const setN=(m,t,d)=>{S.notes[nk(m,t)]=d;sn2();};

// ─── GOOGLE AUTH ──────────────────────────────────────────────────────────────
let currentUser=null;
function initGoogleAuth(){renderAuthBar(null);}
async function signInGoogle(){
  const sku=document.getElementById('evIn')?.value||'';
  if(sku)sessionStorage.setItem('vadt_restore_sku',sku);
  const p=new URLSearchParams({client_id:S.gid,redirect_uri:'https://vexscout.vercel.app/',response_type:'token',scope:'openid email profile',prompt:'select_account'});
  const authUrl='https://accounts.google.com/o/oauth2/v2/auth?'+p.toString();
  if(IS_ELECTRON&&window.electronAPI?.googleAuth){
    try{
      const token=await window.electronAPI.googleAuth(authUrl);
      await fetchGoogleUser(token);
      const saved=sessionStorage.getItem('vadt_restore_sku');
      if(saved){sessionStorage.removeItem('vadt_restore_sku');const inp=document.getElementById('evIn');if(inp){inp.value=saved;setTimeout(()=>loadEvent(),500);}}
    }catch(e){if(e.message!=='closed')setSt('Sign-in failed: '+e.message,'idle');}
    return;
  }
  window.location.href=authUrl;
}
async function checkAuthRedirect(){
  const hash=window.location.hash;
  if(!hash.includes('access_token'))return;
  const params=new URLSearchParams(hash.slice(1));
  const token=params.get('access_token');
  window.history.replaceState(null,'',window.location.pathname);
  if(token){
    await fetchGoogleUser(token);
    const saved=sessionStorage.getItem('vadt_restore_sku');
    if(saved){sessionStorage.removeItem('vadt_restore_sku');const inp=document.getElementById('evIn');if(inp){inp.value=saved;setTimeout(()=>loadEvent(),500);}}
  }
}
async function fetchGoogleUser(token){
  try{
    const res=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+token}});
    const u=await res.json();
    currentUser={uid:u.sub,displayName:u.name,email:u.email,photoURL:u.picture,accessToken:token};
    S.notesKey='vs_n_'+currentUser.uid;
    try{const n=ls(S.notesKey);if(n)Object.assign(S.notes,JSON.parse(n));}catch{}
    renderAuthBar(currentUser);
    setSt('Signed in as '+currentUser.displayName,'live');
  }catch(e){setSt('Could not fetch user info: '+e.message,'idle');}
}
function signOutGoogle(){currentUser=null;S.notesKey='vs_n';renderAuthBar(null);setSt('Signed out','idle');}
function renderAuthBar(user){
  const el=document.getElementById('authArea');if(!el)return;
  if(user){
    el.innerHTML=`<img src="${user.photoURL||''}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none'"/>
      <span style="font-size:12px;color:var(--t2);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${user.displayName||user.email}</span>
      <button class="btn-o" style="font-size:11px;padding:3px 8px;" onclick="signOutGoogle()">Sign out</button>`;
  }else{
    el.innerHTML=`<button class="btn-o" onclick="signInGoogle()" style="display:flex;align-items:center;gap:5px;font-size:12px;">
      <svg width="13" height="13" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      Sign in with Google</button>`;
  }
}

// ─── API ──────────────────────────────────────────────────────────────────────
const RE='https://www.robotevents.com/api/v2';
async function rg(path,p={},retries=3){
  const u=new URL(RE+path);
  Object.entries(p).forEach(([k,v])=>u.searchParams.append(k,v));
  for(let attempt=0;attempt<=retries;attempt++){
    try{
      const r=await fetch(u.toString(),{headers:{Authorization:`Bearer ${S.re}`,Accept:'application/json'}});
      if(r.status===429){await new Promise(res=>setTimeout(res,2000*(attempt+1)));continue;}
      if(!r.ok){let msg=`API error ${r.status}`;try{const j=await r.json();msg=j.message||msg;}catch{}throw new Error(msg);}
      return r.json();
    }catch(e){
      if(e.message.startsWith('API error'))throw e;
      if(attempt===retries)throw e;
      await new Promise(res=>setTimeout(res,1000*Math.pow(2,attempt)));
    }
  }
}
async function ra(path,p={}){
  let pg=1,all=[];
  while(true){
    const d=await rg(path,{...p,page:pg,per_page:250});
    all=all.concat(d.data||[]);
    if(!d.meta||pg>=d.meta.last_page)break;
    pg++;
  }
  return all;
}

// ─── LOAD EVENT ───────────────────────────────────────────────────────────────
function xSKU(raw){const m=raw.match(/RE-[A-Z0-9]+-\d{2,4}-\d+/i);return m?m[0].toUpperCase():raw.trim().toUpperCase();}
async function loadEvent(){
  if(!S.re){openSettings();return;}
  const raw=document.getElementById('evIn').value.trim();
  if(!raw){setSt('Paste a RobotEvents event URL or SKU','idle');return;}
  const sku=xSKU(raw);
  if(!sku.startsWith('RE-')){setSt('Could not find a valid SKU. Should look like RE-VRC-25-1234.','idle');return;}
  document.getElementById('ldBtn').disabled=true;
  setSt(`Looking up ${sku}…`,'load');
  try{
    const er=await rg('/events',{'sku[]':sku,per_page:1});
    if(!er.data?.length)throw new Error(`No event found for "${sku}".`);
    const ev=er.data[0];
    const divs=ev.divisions||[];
    S.eid=ev.id;S.ev=ev;S.divId=divs.length>0?divs[0].id:false;S.matches=[];S.rankings=[];S.teams={};S.preScoutMode=false;S.preScoutDivisions=[];
    document.getElementById('evNm').textContent=ev.name;
    document.getElementById('evMt').textContent=`${ev.location?.city||''}${ev.location?.region?', '+ev.location.region:''} · ${new Date(ev.start).toLocaleDateString()}`;
    setSt('Event found — loading matches…','load');
    await refreshMatches();
    await loadRankings();
    startPoll();
    if(!S.preScoutMode)setSt(`✓ ${S.matches.length} matches loaded`,'live');
  }catch(e){setSt('Error: '+e.message,'idle');}
  document.getElementById('ldBtn').disabled=false;
}
async function refreshMatches(){
  if(!S.eid)return;
  try{
    if(S.divId){S.matches=await ra(`/events/${S.eid}/divisions/${S.divId}/matches`);}
    else{
      S.matches=[];
      if(!S.preScoutMode)await loadPreScoutTeams();
      else renderPreScoutView();
      return;
    }
    const ids=new Set();
    S.matches.forEach(m=>(m.alliances||[]).forEach(a=>(a.teams||[]).forEach(t=>ids.add(t.team.id))));
    await pfTeams([...ids]);
    if(!S.matches.length){
      if(!S.preScoutMode)await loadPreScoutTeams();
      else renderPreScoutView();
      return;
    }
    if(S.preScoutMode)S.preScoutMode=false;
    renderMList();
    if(S.sel)renderScout(S.matches.find(m=>m.id===S.sel.id)||S.sel);
  }catch(e){setSt('Match load error: '+e.message,'idle');}
}
async function pfTeams(ids){
  for(const id of ids){
    if(!S.teams[id]){
      try{S.teams[id]=await rg(`/teams/${id}`);await new Promise(r=>setTimeout(r,300));}
      catch(e){S.teams[id]={number:'?',organization:'—'};}
    }
  }
}
const tn=id=>{if(S.teams[id]?.number)return S.teams[id].number;const rk=S.rankings.find(r=>Number(r.team?.id)===Number(id));return rk?.team?.name||'?';};
const to=id=>S.teams[id]?.organization||S.teams[id]?.team_name||'';
const rl=r=>r===2?'Q':r===3?'SF':r===4?'F':'M';

function renderMList(){
  const el=document.getElementById('mList');
  if(!S.matches.length){el.innerHTML='<div class="empty">No matches found</div>';return;}
  el.innerHTML=S.matches.map((m,i)=>{
    const red=(m.alliances||[]).find(a=>a.color==='red');
    const blue=(m.alliances||[]).find(a=>a.color==='blue');
    const allIds=[...(red?.teams||[]),...(blue?.teams||[])].map(t=>t.team.id);
    const sk=allIds.some(tid=>gn(m.id,tid));const ac=S.sel?.id===m.id;
    return`<div class="mi${ac?' active':''}${sk?' scouted':''}" onclick="selMatch(${i})">
      <div class="mi-top"><span class="mi-num">${rl(m.round)}${m.matchnum}</span>
        <span class="bx ${m.scored?'b-sc':'b-up'}">${m.scored?'SCORED':'UPCOMING'}</span>
        ${sk?'<span class="bx b-sk">✓</span>':''}
      </div>
      <div class="mi-teams">
        ${(red?.teams||[]).map(t=>`<span class="tt tt-r">${tn(t.team.id)}</span>`).join('')}
        <span class="vs">vs</span>
        ${(blue?.teams||[]).map(t=>`<span class="tt tt-b">${tn(t.team.id)}</span>`).join('')}
      </div>
      ${(m.scored||(red?.score!=null&&blue?.score!=null))?`<div class="mi-sc">${red?.score??'—'} – ${blue?.score??'—'}</div>`:''}
    </div>`;
  }).join('');
}
function selMatch(i){S.sel=S.matches[i];renderMList();renderScout(S.sel);activateScoreOverlay(S.sel);}

// ─── PRE-SCOUT (NO MATCHES YET) ───────────────────────────────────────────────
async function loadPreScoutTeams(){
  S.preScoutMode=true;
  setSt('No matches yet — loading team roster…','load');
  const divs=S.ev?.divisions||[];
  try{
    if(divs.length>1){
      S.preScoutDivisions=await Promise.all(divs.map(async d=>{
        const teams=await ra(`/events/${S.eid}/divisions/${d.id}/teams`,{per_page:250});
        return{id:d.id,name:d.name,teams};
      }));
    }else{
      const teams=await ra(`/events/${S.eid}/teams`,{per_page:250});
      S.preScoutDivisions=[{id:null,name:null,teams}];
    }
    S.preScoutDivisions.forEach(div=>div.teams.forEach(t=>{if(t.id&&!S.teams[t.id])S.teams[t.id]=t;}));
    const total=S.preScoutDivisions.reduce((n,d)=>n+d.teams.length,0);
    renderPreScoutView();
    setSt(`Pre-scouting — ${total} teams registered`,'live');
  }catch(e){setSt('Team roster error: '+e.message,'idle');}
}
function renderPreScoutView(){
  const hasDivs=S.preScoutDivisions.length>1;
  const sortT=ts=>[...ts].sort((a,b)=>(a.number||'').localeCompare(b.number||'',undefined,{numeric:true}));
  const mList=document.getElementById('mList');
  mList.innerHTML=S.preScoutDivisions.map(div=>`
    ${hasDivs?`<div class="ph" style="position:sticky;top:0;z-index:1;background:var(--s2);border-bottom:1px solid var(--b1);"><span class="ph-t" style="font-size:11px;">${div.name}</span><span style="font-size:10px;color:var(--t3);margin-left:6px;">${div.teams.length} teams</span></div>`:''}
    ${sortT(div.teams).map(t=>`<div class="mi" onclick="openTeamPage(${t.id})" style="cursor:pointer;">
      <div class="mi-top"><span class="mi-num">${t.number}</span><span class="bx" style="background:rgba(245,197,66,0.1);color:var(--gold);">PRE-SCOUT</span></div>
      <div style="font-size:12px;color:var(--t2);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.organization||t.team_name||''}</div>
    </div>`).join('')}
  `).join('');
  const rkList=document.getElementById('rkList');
  rkList.innerHTML=S.preScoutDivisions.map(div=>`
    ${hasDivs?`<div style="padding:7px 12px 4px;font-family:var(--fd);font-size:10px;font-weight:700;letter-spacing:0.13em;color:var(--t3);text-transform:uppercase;background:var(--s2);border-bottom:1px solid var(--b1);">${div.name}</div>`:''}
    ${sortT(div.teams).map(t=>`<div class="rr" onclick="openTeamPage(${t.id})" style="cursor:pointer;">
      <span class="rn" style="color:var(--t3);">—</span>
      <span class="rt2">${t.number}</span>
      <span style="font-size:11px;color:var(--t3);margin-left:auto;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${(t.organization||t.team_name||'').substring(0,18)}</span>
    </div>`).join('')}
  `).join('');
}

// ─── SCOUT PANEL ──────────────────────────────────────────────────────────────
function renderScout(m){
  const red=(m.alliances||[]).find(a=>a.color==='red');
  const blue=(m.alliances||[]).find(a=>a.color==='blue');
  const rt=red?.teams||[],bt=blue?.teams||[];
  const {rP,bP}=wProb(rt,bt);
  renderRankings(new Set([...rt,...bt].map(t=>t.team.id)));
  const lb=`${rl(m.round)}${m.matchnum}`;
  document.getElementById('sArea').innerHTML=`
    <div class="nt">📹 Paste the YouTube/Twitch URL above and click <strong>Load ▶</strong> to watch inline. Use <strong>🎯 Detect</strong> to auto-detect scores from the video.</div>
    <div class="mb">
      <div class="mb-s">${rt.map(t=>`<div class="mb-tn r">${tn(t.team.id)}</div><div class="mb-org">${to(t.team.id)}</div>`).join('')}</div>
      <div class="mb-mid"><div class="mb-lbl">${lb}</div><div class="mb-sc">${red?.score??'—'} : ${blue?.score??'—'}</div></div>
      <div class="mb-s rt">${bt.map(t=>`<div class="mb-tn b">${tn(t.team.id)}</div><div class="mb-org">${to(t.team.id)}</div>`).join('')}</div>
    </div>
    <div class="pw">
      <div class="ph2"><span class="pl2">Win Prediction</span><span style="font-size:11px;color:var(--t3);">From event W/L record</span></div>
      <div class="pn"><span class="pr2">${rt.map(t=>tn(t.team.id)).join('+')} ${rP}%</span><span class="pb2">${bP}% ${bt.map(t=>tn(t.team.id)).join('+')}</span></div>
      <div class="pt"><div class="pf" style="width:${rP}%;background:linear-gradient(to right,var(--red),#d06060);"></div></div>
    </div>
    <div class="tr">${[...rt.map(t=>({t,c:'red'})),...bt.map(t=>({t,c:'blue'}))].map(({t,c})=>mkTcard(t.team.id,c)).join('')}</div>
    ${[...rt.map(t=>({t,c:'red'})),...bt.map(t=>({t,c:'blue'}))].map(({t,c})=>mkForm(m.id,t.team.id,c)).join('')}
  `;
  [...rt,...bt].forEach(t=>restoreForm(m.id,t.team.id));
}
function mkTcard(tid,color){
  const rk=S.rankings.find(r=>r.team?.id===tid);
  const wp=rk?`${rk.wins}-${rk.losses}-${rk.ties}`:'—';
  return`<div class="tc ${color}"><div class="tc-top"><div><div class="tc-n ${color}">${tn(tid)}</div><div class="tc-o">${to(tid)}</div></div><span class="rkb">R#${rk?.rank??'?'}</span></div>
    <div class="tc-st"><div class="st"><div class="stl">W/L/T</div><div class="stv">${wp}</div></div><div class="st"><div class="stl">AP</div><div class="stv">${rk?.ap??'—'}</div></div><div class="st"><div class="stl">SP</div><div class="stv">${rk?.sp??'—'}</div></div><div class="st"><div class="stl">Rank</div><div class="stv">#${rk?.rank??'?'}</div></div></div></div>`;
}
function mkForm(mid,tid,color){
  const num=tn(tid),p=`f_${mid}_${tid}`,cc=color==='red'?'#ff6b65':'#6ab3ff';
  return`<div class="sf"><div class="sf-t">Scouting: <span style="color:${cc}">${num}</span></div>
    <div class="sr"><div><div class="sl">Autonomous</div><div class="ss">Routine quality & points</div></div><div class="stars" id="${p}_a" data-val="0">${mkS(p+'_a')}</div></div>
    <div class="sr"><div><div class="sl">Driver Skill</div><div class="ss">Control, speed, precision</div></div><div class="stars" id="${p}_d" data-val="0">${mkS(p+'_d')}</div></div>
    <div class="sr"><div><div class="sl">Alliance Coordination</div><div class="ss">Teamwork with partner</div></div><div class="stars" id="${p}_c" data-val="0">${mkS(p+'_c')}</div></div>
    <div class="sr"><div class="sl">Played Defense</div><div style="display:flex;align-items:center;gap:7px;"><input type="checkbox" class="cb" id="${p}_df"/><label style="font-size:13px;cursor:pointer;" for="${p}_df">Yes</label></div></div>
    <div class="sr"><div class="sl">Consistency</div><select class="sels" id="${p}_cn"><option value="">— select —</option><option>Very consistent</option><option>Mostly consistent</option><option>Some errors</option><option>Frequent errors / penalties</option></select></div>
    <div style="margin-bottom:9px;"><div class="sl" style="margin-bottom:4px;">Observations</div><textarea class="txta" id="${p}_nt" placeholder="Strategy, robot type, weak points…"></textarea></div>
    <div><div class="sl" style="margin-bottom:5px;">Your Rating</div><div class="mr"><span class="mrn" id="${p}_rl">5</span><input type="range" min="1" max="10" value="5" step="1" id="${p}_rv" oninput="document.getElementById('${p}_rl').textContent=this.value"/><span style="font-size:11px;color:var(--t3);">/ 10</span></div></div>
    <div class="fa"><button class="btn-g" onclick="saveOnly('${mid}','${tid}')">Save Notes</button></div></div>`;
}
const mkS=g=>[1,2,3,4,5].map(n=>`<span class="star" onclick="setStar('${g}',${n})">★</span>`).join('');
function setStar(g,n){const el=document.getElementById(g);if(!el)return;el.dataset.val=n;el.querySelectorAll('.star').forEach((s,i)=>s.classList.toggle('on',i<n));}
const gStar=g=>{const el=document.getElementById(g);return el?parseInt(el.dataset.val||0):0;};
function restoreForm(mid,tid){
  const note=gn(mid,tid);if(!note)return;const p=`f_${mid}_${tid}`;
  setStar(`${p}_a`,note.auto||0);setStar(`${p}_d`,note.driver||0);setStar(`${p}_c`,note.coord||0);
  const df=document.getElementById(`${p}_df`);if(df)df.checked=note.defense||false;
  const cn=document.getElementById(`${p}_cn`);if(cn)cn.value=note.consistency||'';
  const nt=document.getElementById(`${p}_nt`);if(nt)nt.value=note.notes||'';
  const rv=document.getElementById(`${p}_rv`);const rl2=document.getElementById(`${p}_rl`);
  if(rv){rv.value=note.myRating||5;if(rl2)rl2.textContent=rv.value;}
}
function readForm(mid,tid){
  const p=`f_${mid}_${tid}`;
  return{matchId:mid,teamId:tid,teamNum:tn(tid),auto:gStar(`${p}_a`),driver:gStar(`${p}_d`),coord:gStar(`${p}_c`),
    defense:document.getElementById(`${p}_df`)?.checked||false,
    consistency:document.getElementById(`${p}_cn`)?.value||'',
    notes:document.getElementById(`${p}_nt`)?.value||'',
    myRating:parseInt(document.getElementById(`${p}_rv`)?.value||5),
    savedAt:new Date().toISOString()};
}
function saveOnly(mid,tid){const d=readForm(mid,tid);setN(mid,tid,{...gn(mid,tid)||{},...d});renderMList();setSt(`Saved notes for ${tn(tid)}`,'live');}

// ─── WIN PROBABILITY ──────────────────────────────────────────────────────────
function wProb(rt,bt){
  const s=ts=>{let t=0,n=0;for(const x of ts){const r=S.rankings.find(r=>r.team?.id===x.team.id);if(r){const tot=(r.wins||0)+(r.losses||0)+(r.ties||0);t+=tot>0?(r.wins+0.5*r.ties)/tot:0.5;n++;}}return n>0?t/n:0.5;};
  const rs=s(rt),bs=s(bt),sum=rs+bs||1;
  const rP=Math.max(5,Math.min(95,Math.round(50+(rs/sum-0.5)*70)));
  return{rP,bP:100-rP};
}

// ─── RANKINGS ─────────────────────────────────────────────────────────────────
async function loadRankings(){
  if(!S.eid||!S.divId)return;
  try{S.rankings=await ra(`/events/${S.eid}/divisions/${S.divId}/rankings`);renderRankings(new Set());}
  catch(e){console.warn('Rankings error:',e.message);}
}
function renderRankings(hl){
  const el=document.getElementById('rkList');
  if(!S.rankings.length){el.innerHTML='<div class="empty" style="padding:12px;">Rankings not available</div>';return;}
  el.innerHTML=S.rankings.map(r=>`
    <div class="rr${hl.has(r.team?.id)?' hl':''}" onclick="openTeamPage(${r.team?.id})" style="cursor:pointer;">
      <span class="rn">${r.rank}</span>
      <span class="rt2">${r.team?.name||'?'}</span>
      <span class="rw">${r.wins}-${r.losses}-${r.ties}</span>
    </div>`).join('');
}

// ─── VIDEO ────────────────────────────────────────────────────────────────────
let vidCollapsed=false;
// ─── YOUTUBE IFRAME API ───────────────────────────────────────────────────────
let ytPlayer=null;
let ytCurrentUrl='';
function onYouTubeIframeAPIReady(){
  // Called automatically by the YT API script once loaded.
  // If a video is already in the iframe, init the player now.
  if(ytCurrentUrl)initYTPlayer();
}
function initYTPlayer(){
  if(typeof YT==='undefined'||!YT.Player)return;
  ytPlayer=new YT.Player('vidFrame',{events:{onReady:()=>{}}});
}
function ytTime(){
  // Returns current playback position in seconds, or null.
  try{return ytPlayer?.getCurrentTime?.()||null;}catch{return null;}
}
function fmtTime(s){
  // Formats seconds as HH:MM:SS for yt-dlp --download-sections.
  if(s==null)return null;
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.floor(s%60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function fmtTimeDisplay(s){
  // Human-readable: 1:23:45 or 2:34.
  if(s==null)return '—';
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.floor(s%60);
  return h>0?`${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`:`${m}:${String(sec).padStart(2,'0')}`;
}

function loadVid(){
  const raw=document.getElementById('vUrl').value.trim();
  if(!raw){setSt('Paste a YouTube or Twitch URL first','idle');return;}
  const frame=document.getElementById('vidFrame'),placeholder=document.getElementById('vidPlaceholder'),blocked=document.getElementById('vidBlocked');
  let embedUrl='',directUrl=raw;
  const yt=raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  const tw=raw.match(/twitch\.tv\/(?:videos\/)?([^\/\?&]+)/);
  if(yt){
    // enablejsapi=1 lets the YT IFrame API read playback position (for clip marking).
    const origin=encodeURIComponent(location.origin||'https://vexscout.vercel.app');
    embedUrl=`https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0&enablejsapi=1&origin=${origin}`;
    directUrl=`https://www.youtube.com/watch?v=${yt[1]}`;
    ytCurrentUrl=directUrl;
  }
  else if(tw){
    const isVod=/twitch\.tv\/videos\//.test(raw);
    embedUrl=isVod?`https://player.twitch.tv/?video=${tw[1]}&parent=${location.hostname}&autoplay=true`:`https://player.twitch.tv/?channel=${tw[1]}&parent=${location.hostname}&autoplay=true`;
    directUrl=raw;ytCurrentUrl='';
  }
  else{setSt('Unsupported URL — use YouTube or Twitch','idle');return;}
  placeholder.style.display='none';blocked.style.display='none';frame.style.display='block';frame.src=embedUrl;
  document.getElementById('vidExtLink').href=directUrl;
  if(vidCollapsed)toggleVid();
  setSt('Video loaded inline','live');
  // Init YT player after iframe src is set (needs a tick for the iframe to register).
  if(yt){ytPlayer=null;setTimeout(initYTPlayer,1000);}
  // Show the download bar in Electron for YouTube videos only.
  const dlBar=document.getElementById('vidDlBar');
  if(dlBar)dlBar.style.display=(IS_ELECTRON&&yt)?'flex':'none';
  resetClipMarkers();
}

// ─── CLIP DOWNLOAD (ELECTRON ONLY) ───────────────────────────────────────────
const IS_ELECTRON=!!(window.electronAPI?.isElectron);
let clipStart=null,clipEnd=null;

function resetClipMarkers(){
  clipStart=null;clipEnd=null;
  const s=document.getElementById('dlStartLabel'),e=document.getElementById('dlEndLabel');
  if(s)s.value='';if(e)e.value='';
  updateDlBtn();
}
function updateDlBtn(){
  const btn=document.getElementById('dlBtn');
  if(btn)btn.disabled=!(clipStart!=null&&clipEnd!=null&&clipEnd>clipStart);
}
function parseManualTime(which,val){
  val=val.trim();let secs=null;
  if(val){const parts=val.split(':').map(p=>parseFloat(p));if(parts.length<=3&&parts.every(p=>!isNaN(p)&&p>=0)){if(parts.length===3)secs=parts[0]*3600+parts[1]*60+parts[2];else if(parts.length===2)secs=parts[0]*60+parts[1];else secs=parts[0];}}
  if(which==='start')clipStart=secs;else clipEnd=secs;
  updateDlBtn();
}
function markClipStart(){
  const t=ytTime();
  if(t==null){setSt('Seek to the match start in the video first','idle');return;}
  clipStart=t;
  const el=document.getElementById('dlStartLabel');if(el)el.value=fmtTimeDisplay(t);
  updateDlBtn();setSt(`Clip start: ${fmtTimeDisplay(t)}`,'live');
}
function markClipEnd(){
  const t=ytTime();
  if(t==null){setSt('Seek to the match end in the video first','idle');return;}
  clipEnd=t;
  const el=document.getElementById('dlEndLabel');if(el)el.value=fmtTimeDisplay(t);
  updateDlBtn();setSt(`Clip end: ${fmtTimeDisplay(t)}`,'live');
}
async function triggerClipDownload(){
  if(!IS_ELECTRON||clipStart==null||clipEnd==null)return;
  const url=ytCurrentUrl;
  if(!url){setSt('No YouTube URL loaded','idle');return;}

  const btn=document.getElementById('dlBtn'),prog=document.getElementById('dlProgress');
  const bar=document.getElementById('dlProgressBar'),status=document.getElementById('dlStatus');
  btn.disabled=true;
  if(prog)prog.style.display='block';
  if(bar)bar.style.width='5%';
  if(status)status.textContent='Starting download…';
  setSt('Downloading clip…','load');

  // Stream progress lines from yt-dlp back to the status label.
  window.electronAPI.removeDownloadListeners();
  window.electronAPI.onDownloadProgress(data=>{
    const line=data.text.trim();
    if(!line)return;
    // yt-dlp prints "[download]  42.3% ..." — extract the percentage.
    const pct=line.match(/(\d+\.?\d*)%/);
    if(pct&&bar){bar.style.width=Math.min(95,parseFloat(pct[1]))+'%';}
    if(status)status.textContent=line.replace(/\[.*?\]/g,'').trim().slice(0,60);
  });

  try{
    const filePath=await window.electronAPI.downloadClip(url,fmtTime(clipStart),fmtTime(clipEnd));
    if(bar)bar.style.width='100%';
    if(status)status.textContent='Done — loading…';
    setSt('Clip downloaded — opening in CV panel','live');

    // Load the clip into the CV capture panel and open the overlay.
    const fileUrl=await window.electronAPI.getFileUrl(filePath);
    const vid=document.getElementById('cvVideoPreview');
    if(vid){
      if(vid.src)URL.revokeObjectURL(vid.src);
      vid.src=fileUrl;vid.style.display='block';
    }
    const msg=document.getElementById('cvNoVideoMsg');
    if(msg){msg.style.display='block';msg.textContent='⏸ Clip loaded — pause at the desired frame, then Capture Frame.';}
    openCVOverlay();
  }catch(err){
    if(status)status.textContent='Error: '+err.message;
    setSt('Download failed: '+err.message,'idle');
  }finally{
    btn.disabled=false;
    setTimeout(()=>{if(prog)prog.style.display='none';if(status)status.textContent='';},4000);
    window.electronAPI.removeDownloadListeners();
  }
}
function toggleVid(){
  const wrap=document.getElementById('vidWrap'),btn=document.getElementById('vidToggle');
  vidCollapsed=!vidCollapsed;wrap.style.height='';wrap.style.transition='';
  wrap.classList.toggle('collapsed',vidCollapsed);btn.textContent=vidCollapsed?'⌄':'⌃';
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────
function exportXLSX(){
  const wb=XLSX.utils.book_new();
  const aR=[['Match','Team','Alliance','Auto★','Driver★','Coord★','Defense','Consistency','My Rating','Notes','Saved']];
  S.matches.forEach(m=>{
    const lb=`${rl(m.round)}${m.matchnum}`;
    (m.alliances||[]).forEach(a=>(a.teams||[]).forEach(t=>{
      const note=gn(m.id,t.team.id);
      if(note)aR.push([lb,tn(t.team.id),a.color,note.auto,note.driver,note.coord,note.defense?'Yes':'',note.consistency,note.myRating,note.notes||'',note.savedAt||'']);
    }));
  });
  const mws=XLSX.utils.aoa_to_sheet(aR);
  XLSX.utils.book_append_sheet(wb,mws,'All Matches');
  XLSX.writeFile(wb,`VEXScout_${(S.ev?.name||'Event').replace(/[^a-zA-Z0-9_\-]/g,'_').substring(0,40)}.xlsx`);
  setSt('Downloaded .xlsx','live');
}
function exportSheets(){
  if(!S.gid){alert('Download the .xlsx file, then import it into Google Sheets.');return;}
  const scope='https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';
  const au=`https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(S.gid)}&redirect_uri=${encodeURIComponent(location.href)}&response_type=token&scope=${encodeURIComponent(scope)}`;
  const aw=window.open(au,'gauth',`width=500,height=600,left=${(screen.width-500)/2},top=${(screen.height-600)/2}`);
  const poll=setInterval(()=>{try{const h=aw?.location?.hash||'';if(h.includes('access_token')){const p=new URLSearchParams(h.slice(1));S.gat=p.get('access_token');clearInterval(poll);aw.close();doSync();}}catch{}if(aw?.closed)clearInterval(poll);},500);
}
async function doSync(){
  setSt('Creating Google Sheet…','load');
  try{
    const cr=await fetch('https://sheets.googleapis.com/v4/spreadsheets',{method:'POST',headers:{Authorization:`Bearer ${S.gat}`,'Content-Type':'application/json'},body:JSON.stringify({properties:{title:`VEXScout — ${S.ev?.name||'Event'}`},sheets:[{properties:{title:'All Matches'}}]})});
    const sh=await cr.json();const sid=sh.spreadsheetId;
    const rows=[['Match','Team','Alliance','Auto','Driver','Coord','Defense','Consistency','My Rating','Notes']];
    S.matches.forEach(m=>{const lb=`${rl(m.round)}${m.matchnum}`;(m.alliances||[]).forEach(a=>(a.teams||[]).forEach(t=>{const note=gn(m.id,t.team.id);if(!note)return;rows.push([lb,tn(t.team.id),a.color,note.auto,note.driver,note.coord,note.defense?'Yes':'',note.consistency,note.myRating,note.notes||'']);}));});
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/All%20Matches!A1:Z${rows.length}?valueInputOption=RAW`,{method:'PUT',headers:{Authorization:`Bearer ${S.gat}`,'Content-Type':'application/json'},body:JSON.stringify({values:rows})});
    setSt('Synced!','live');window.open(`https://docs.google.com/spreadsheets/d/${sid}`,'_blank');
  }catch(e){setSt('Sheets error: '+e.message,'idle');}
}

// ─── VIDEO RESIZE ─────────────────────────────────────────────────────────────
(function(){
  const handle=document.getElementById('vidResizeHandle');if(!handle)return;
  let dragging=false,startY=0,startH=0;
  handle.addEventListener('mousedown',e=>{dragging=true;startY=e.clientY;startH=document.getElementById('vidWrap').offsetHeight;document.body.style.userSelect='none';document.body.style.cursor='ns-resize';});
  document.addEventListener('mousemove',e=>{
    if(!dragging)return;
    const newH=Math.max(0,Math.min(startH+(e.clientY-startY),window.innerHeight*0.65));
    const wrap=document.getElementById('vidWrap');wrap.style.height=newH+'px';wrap.style.transition='none';
    vidCollapsed=newH<40;wrap.classList.toggle('collapsed',vidCollapsed);
    document.getElementById('vidToggle').textContent=vidCollapsed?'⌄':'⌃';
  });
  document.addEventListener('mouseup',()=>{if(!dragging)return;dragging=false;document.body.style.userSelect='';document.body.style.cursor='';});
})();

// ─── POLL ─────────────────────────────────────────────────────────────────────
function startPoll(){
  if(S.timer)clearInterval(S.timer);
  let polling=false;
  S.timer=setInterval(async()=>{
    if(polling)return;polling=true;
    try{await refreshMatches();await loadRankings();setSt(`Updated ${new Date().toLocaleTimeString()}`,'live');}
    catch(e){console.warn('Poll error:',e.message);}
    finally{polling=false;}
  },45000);
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function setSt(msg,state){document.getElementById('stxt').textContent=msg;const d=document.getElementById('sd');d.className='sdot '+(state==='live'?'sdot-live':state==='load'?'sdot-load':'');}

// ─── VIDEO OVERLAY / ANNOTATION ───────────────────────────────────────────────
const MATCH_DURATION=120,AUTON_DURATION=15;
const VO={running:false,elapsed:0,rafId:null,lastTs:null,annotations:[],matchId:null};
const ANN_TYPES={
  auton_start:{label:'Auton Start',emoji:'🟢',color:'#22c55e',chipBg:'rgba(34,197,94,0.18)',chipBorder:'rgba(34,197,94,0.5)'},
  score:{label:'Score',emoji:'💛',color:'#f5c542',chipBg:'rgba(245,197,66,0.18)',chipBorder:'rgba(245,197,66,0.5)'},
  defense:{label:'Defense',emoji:'🛡️',color:'#ff6b65',chipBg:'rgba(232,48,42,0.18)',chipBorder:'rgba(232,48,42,0.5)'},
  alliance:{label:'Alliance',emoji:'🤝',color:'#6ab3ff',chipBg:'rgba(26,125,223,0.18)',chipBorder:'rgba(26,125,223,0.5)'},
  error:{label:'Error',emoji:'⚠️',color:'#f97316',chipBg:'rgba(249,115,22,0.18)',chipBorder:'rgba(249,115,22,0.5)'},
  note:{label:'Note',emoji:'📝',color:'#a78bfa',chipBg:'rgba(167,139,250,0.18)',chipBorder:'rgba(167,139,250,0.5)'},
};
function fmtTime(s){const t=Math.max(0,Math.round(s));return`${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;}
function updateOverlayScore(){
  const r=parseInt(document.getElementById('inRedScore')?.value||0),b=parseInt(document.getElementById('inBlueScore')?.value||0);
  const er=document.getElementById('voRedScore'),eb=document.getElementById('voBlueScore');
  if(er)er.textContent=r;if(eb)eb.textContent=b;
}
function overlayTick(ts){
  if(!VO.running)return;
  if(VO.lastTs!==null)VO.elapsed=Math.min(MATCH_DURATION,VO.elapsed+(ts-VO.lastTs)/1000);
  VO.lastTs=ts;renderOverlayTimer();
  if(VO.elapsed>=MATCH_DURATION){stopMatchTimer();return;}
  VO.rafId=requestAnimationFrame(overlayTick);
}
function renderOverlayTimer(){
  const remaining=Math.max(0,MATCH_DURATION-VO.elapsed);
  const isAuton=VO.elapsed<AUTON_DURATION;
  const displayTime=isAuton?AUTON_DURATION-VO.elapsed:MATCH_DURATION-VO.elapsed;
  const timerEl=document.getElementById('voTimer'),periodEl=document.getElementById('voPeriodBadge'),progEl=document.getElementById('voTlProgress');
  if(timerEl){timerEl.textContent=fmtTime(displayTime);timerEl.className='vo-hud-timer'+(remaining<10?' overtime':'');}
  if(periodEl){periodEl.textContent=isAuton?'AUTON':'DRIVER';periodEl.className='vo-hud-period '+(isAuton?'auton':'driver');}
  if(progEl)progEl.style.width=((VO.elapsed/MATCH_DURATION)*100).toFixed(2)+'%';
}
function toggleMatchTimer(){VO.running?stopMatchTimer():startMatchTimer();}
function startMatchTimer(){VO.running=true;VO.lastTs=null;VO.rafId=requestAnimationFrame(overlayTick);const btn=document.getElementById('voStartBtn');if(btn){btn.textContent='⏸ Pause';btn.classList.add('active');}}
function stopMatchTimer(){VO.running=false;if(VO.rafId)cancelAnimationFrame(VO.rafId);const btn=document.getElementById('voStartBtn');if(btn){btn.textContent='▶ Start Timer';btn.classList.remove('active');}}
function syncTimer(s){const was=VO.running;stopMatchTimer();VO.elapsed=Math.max(0,Math.min(MATCH_DURATION,s));VO.lastTs=null;renderOverlayTimer();if(was)startMatchTimer();}
document.addEventListener('keydown',e=>{
  const overlay=document.getElementById('voHud');
  if(!overlay||overlay.style.display==='none')return;
  if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
  const map={a:'auton_start',s:'score',d:'defense',l:'alliance',e:'error',n:'note'};
  if(map[e.key.toLowerCase()]){dropAnnotation(map[e.key.toLowerCase()]);e.preventDefault();}
  if(e.code==='Space'){toggleMatchTimer();e.preventDefault();}
});
let annIdCounter=0;
function dropAnnotation(type){
  const def=ANN_TYPES[type];if(!def)return;
  const ann={id:++annIdCounter,type,t:VO.elapsed,tFmt:fmtTime(VO.elapsed),label:def.label,emoji:def.emoji,color:def.color,chipBg:def.chipBg,chipBorder:def.chipBorder};
  VO.annotations.push(ann);
  if(VO.matchId!==null){const ex=gn(VO.matchId,'__annotations')||[];ex.push(ann);setN(VO.matchId,'__annotations',ex);}
  renderAnnotations();
  const wrap=document.getElementById('vidWrap');
  if(wrap){wrap.style.outline=`2px solid ${def.color}`;setTimeout(()=>{if(wrap)wrap.style.outline='';},300);}
}
function clearAnnotations(){VO.annotations=[];if(VO.matchId!==null)setN(VO.matchId,'__annotations',[]);renderAnnotations();}
function renderAnnotations(){
  const log=document.getElementById('voAnnLog');
  if(log){
    log.innerHTML=VO.annotations.length?VO.annotations.map(a=>`<div class="vo-ann-chip" style="background:${a.chipBg};border-color:${a.chipBorder};color:${a.color};" onclick="seekToAnnotation(${a.t})">${a.emoji} ${a.label}<span class="chip-t">${a.tFmt}</span></div>`).join(''):'<span style="font-size:11px;color:var(--t3);">Use A/S/D/L/E/N to annotate</span>';
    log.scrollLeft=log.scrollWidth;
  }
  const container=document.getElementById('voTlMarkers');if(!container)return;
  const ticks=[];
  for(let t=0;t<=MATCH_DURATION;t+=15){const pct=(t/MATCH_DURATION*100).toFixed(1);ticks.push(`<div class="vo-tl-tick" style="left:${pct}%;"></div><div class="vo-tl-tick-lbl" style="left:${pct}%;">${fmtTime(t)}</div>`);}
  container.innerHTML=ticks.join('')+VO.annotations.map(a=>{const pct=(Math.min(a.t,MATCH_DURATION)/MATCH_DURATION*100).toFixed(2);return`<div class="vo-tl-marker" style="left:${pct}%;background:${a.color};" onclick="seekToAnnotation(${a.t})" onmouseenter="showMarkerTip(this,'${a.emoji} ${a.label} @ ${a.tFmt}')" onmouseleave="hideMarkerTip()">${a.emoji.substring(0,2)}</div>`;}).join('');
  const az=document.getElementById('voAutonZone');if(az)az.style.width=((AUTON_DURATION/MATCH_DURATION)*100)+'%';
}
function showMarkerTip(el,text){const tip=document.getElementById('voTooltip');if(!tip||!el)return;tip.textContent=text;tip.style.left=el.style.left;tip.classList.add('show');}
function hideMarkerTip(){const tip=document.getElementById('voTooltip');if(tip)tip.classList.remove('show');}
function seekToAnnotation(t){syncTimer(t);if(!VO.running)startMatchTimer();}
function activateScoreOverlay(m){
  const red=(m.alliances||[]).find(a=>a.color==='red'),blue=(m.alliances||[]).find(a=>a.color==='blue');
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
  set('voRedTeams',(red?.teams||[]).map(t=>tn(t.team.id)).join(' + ')||'—');
  set('voBlueTeams',(blue?.teams||[]).map(t=>tn(t.team.id)).join(' + ')||'—');
  set('voRedOrg',(red?.teams||[]).map(t=>to(t.team.id)).filter(Boolean).join(' / '));
  set('voBlueOrg',(blue?.teams||[]).map(t=>to(t.team.id)).filter(Boolean).join(' / '));
  const inR=document.getElementById('inRedScore'),inB=document.getElementById('inBlueScore');
  if(inR)inR.value=red?.score??0;if(inB)inB.value=blue?.score??0;
  set('voRedScore',red?.score??0);set('voBlueScore',blue?.score??0);
  VO.matchId=m.id;VO.annotations=gn(m.id,'__annotations')||[];
  stopMatchTimer();VO.elapsed=0;renderOverlayTimer();renderAnnotations();
  ['voHud','voToolbar','voTimerRow','voTimeline'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='';});
  document.getElementById('vidWrap').classList.add('overlay-pinned');
}

// ─── MATCH JUMP ───────────────────────────────────────────────────────────────
function jumpToMatch(query){
  if(!query||query.length<2)return;
  const q=query.trim().toUpperCase();
  const idx=S.matches.findIndex(m=>`${rl(m.round)}${m.matchnum}`.toUpperCase().startsWith(q));
  const inp=document.getElementById('matchJumpInput');
  if(idx>-1){selMatch(idx);document.querySelectorAll('.mi')[idx]?.scrollIntoView({behavior:'smooth',block:'center'});if(inp)inp.style.borderColor='var(--green)';setTimeout(()=>{if(inp)inp.style.borderColor='var(--b2)';},1200);}
  else{if(inp){inp.style.borderColor='var(--red)';setTimeout(()=>inp.style.borderColor='var(--b2)',1000);}}
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function openSettings(){
  const modal=document.getElementById('settingsModal');
  const reInput=document.getElementById('settingsReToken'),reStatus=document.getElementById('settingsReStatus'),googleEl=document.getElementById('settingsGoogleStatus');
  if(reInput){reInput.value=S.re||'';reInput.style.borderColor=S.re?'var(--green)':'var(--b2)';}
  if(reStatus)reStatus.textContent=S.re?`Token active (${S.re.length} chars)`:'No token set.';
  if(googleEl)googleEl.textContent=currentUser?`Signed in as ${currentUser.displayName}`:'Not signed in';
  if(modal)modal.classList.add('open');
}
function closeSettings(){document.getElementById('settingsModal')?.classList.remove('open');}
function saveSettings(){const inp=document.getElementById('settingsReToken');if(inp?.value.trim()){S.re=inp.value.trim();ls('vs_re',S.re);}setTimeout(closeSettings,200);setSt('Settings saved','live');}
document.addEventListener('click',e=>{const m=document.getElementById('settingsModal');if(m&&e.target===m)closeSettings();});

// ─── TEAM PAGE ────────────────────────────────────────────────────────────────
let tpCharts=[],currentTeamId=null;
async function openTeamPage(teamId){
  if(!teamId)return;currentTeamId=teamId;
  document.getElementById('teamPage').classList.add('open');
  document.getElementById('tpMain').innerHTML='<div class="empty" style="margin-top:60px;"><p>Loading…</p></div>';
  if(!S.teams[teamId]){try{S.teams[teamId]=await rg(`/teams/${teamId}`);}catch(e){const rk=S.rankings.find(r=>r.team?.id===teamId);S.teams[teamId]={id:teamId,number:rk?.team?.name||'?',organization:''};}}
  renderTeamPage(teamId);
}
function closeTeamPage(){document.getElementById('teamPage').classList.remove('open');tpCharts.forEach(c=>{try{c.destroy();}catch{}});tpCharts=[];currentTeamId=null;}
function enterApp(section) {
  const hp = document.getElementById('homePage');
  if (hp) hp.style.display = 'none';
  if (section === 'notebook') openNotebook();
  else if (section === 'cad') openSTLViewer();
}
function openNotebook(){const p=document.getElementById('notebookPage'),f=document.getElementById('notebookFrame');if(!f.src)f.src='notebook.html';p.style.display='flex';}
function closeNotebook(){document.getElementById('notebookPage').style.display='none';}
function renderTeamPage(teamId){
  const rank=S.rankings.find(r=>Number(r.team?.id)===Number(teamId));
  seasonDataLoaded=false;activeTab='event';
  document.getElementById('tpEventTab').style.display='grid';document.getElementById('tpSeasonTab').style.display='none';
  document.getElementById('tabEvent').classList.add('active');document.getElementById('tabSeason').classList.remove('active');
  document.getElementById('tabSeasonBadge').textContent='—';
  document.getElementById('tpTeamNum').textContent=tn(teamId);
  document.getElementById('tpTeamOrg').textContent=to(teamId);
  const teamMatches=getTeamMatches(teamId);
  document.getElementById('tabEventBadge').textContent=`${teamMatches.filter(tm=>tm.scored).length} matches`;
  renderTPMain(teamId,teamMatches,rank);renderTPSide(teamId,teamMatches,rank);
  setTimeout(()=>restoreCVData(teamId),100);
}
function getTeamMatches(teamId){
  const tid=Number(teamId);
  return S.matches.filter(m=>(m.alliances||[]).some(a=>(a.teams||[]).some(t=>Number(t.team.id)===tid))).map(m=>{
    const myA=(m.alliances||[]).find(a=>(a.teams||[]).some(t=>Number(t.team.id)===tid));
    const oppA=(m.alliances||[]).find(a=>!(a.teams||[]).some(t=>Number(t.team.id)===tid));
    const ms=myA?.score!=null?Number(myA.score):null,os=oppA?.score!=null?Number(oppA.score):null;
    const scored=(ms!==null&&os!==null)||m.scored;
    const result=!scored?'—':ms>os?'W':ms<os?'L':'T';
    const partner=(myA?.teams||[]).find(t=>Number(t.team.id)!==tid);
    return{m,lbl:`${rl(m.round)}${m.matchnum}`,myScore:ms,oppScore:os,result,scored,myColor:myA?.color,partner,note:gn(m.id,Number(teamId))};
  });
}
function getScoredMatches(teamId){return getTeamMatches(teamId).filter(tm=>tm.scored);}
function computeMMR(teamId,matches){
  let mmr=1000;const history=[];
  matches.forEach(({myScore,oppScore,result})=>{
    const margin=Math.abs(myScore-oppScore),bonus=Math.min(20,Math.floor(margin/5));
    if(result==='W')mmr+=30+bonus;else if(result==='L')mmr-=25-Math.min(10,bonus);
    history.push(mmr);
  });
  return{mmr:Math.round(mmr),history};
}
function computeConsistency(scores){
  if(scores.length<2)return 100;
  const avg=scores.reduce((a,b)=>a+b,0)/scores.length;
  const stddev=Math.sqrt(scores.reduce((a,b)=>a+Math.pow(b-avg,2),0)/scores.length);
  return Math.max(0,Math.round(100-(stddev/Math.max(avg,1))*100));
}
function computeTrend(scores){
  if(scores.length<3)return{label:'Insufficient data',dir:0};
  const half=Math.floor(scores.length/2);
  const f=scores.slice(0,half).reduce((a,b)=>a+b,0)/half,s=scores.slice(-half).reduce((a,b)=>a+b,0)/half,delta=s-f;
  if(delta>5)return{label:'↑ Improving',dir:1,delta:Math.round(delta)};
  if(delta<-5)return{label:'↓ Declining',dir:-1,delta:Math.round(Math.abs(delta))};
  return{label:'→ Stable',dir:0,delta:0};
}
function renderTPMain(teamId,teamMatches,rank){
  const main=document.getElementById('tpMain');
  tpCharts.forEach(c=>{try{c.destroy();}catch{}});tpCharts=[];
  const scoredMatches=getScoredMatches(teamId);
  if(!teamMatches.length){
    main.innerHTML=`<div class="empty" style="margin-top:60px;"><p>No event matches found.</p>${S.preScoutMode?'<p style="margin-top:8px;font-size:12px;color:var(--t3);">Pre-scouting mode — loading season history…</p>':''}</div>`;
    if(S.preScoutMode&&!seasonDataLoaded)setTimeout(()=>switchTab('season'),80);
    return;
  }
  const scores=scoredMatches.map(tm=>tm.myScore),oppScores=scoredMatches.map(tm=>tm.oppScore),labels=scoredMatches.map(tm=>tm.lbl);
  const wins=scoredMatches.filter(tm=>tm.result==='W').length,losses=scoredMatches.filter(tm=>tm.result==='L').length,ties=scoredMatches.filter(tm=>tm.result==='T').length;
  const avgScore=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):0;
  const peakScore=scores.length?Math.max(...scores):0,peakMatch=scoredMatches[scores.indexOf(peakScore)];
  const consistency=computeConsistency(scores),trend=computeTrend(scores),{mmr}=computeMMR(teamId,scoredMatches);
  const trendColor=trend.dir>0?'#22c55e':trend.dir<0?'#ff7b77':'var(--t2)';
  main.innerHTML=`
    <div class="tp-stats">
      <div class="tp-stat"><div class="tp-stat-lbl">Record</div><div class="tp-stat-val" style="color:#22c55e;">${wins}W</div><div class="tp-stat-sub">${losses}L · ${ties}T</div></div>
      <div class="tp-stat"><div class="tp-stat-lbl">Avg Score</div><div class="tp-stat-val" style="color:var(--gold);">${avgScore}</div><div class="tp-stat-sub">Peak: ${peakScore} (${peakMatch?.lbl||'—'})</div></div>
      <div class="tp-stat"><div class="tp-stat-lbl">Consistency</div><div class="tp-stat-val">${consistency}</div><div class="tp-stat-sub">out of 100</div></div>
      <div class="tp-stat"><div class="tp-stat-lbl">Performance</div><div class="tp-stat-val" style="color:${trendColor};font-size:18px;">${trend.label}</div><div class="tp-stat-sub">${trend.delta?(trend.dir>0?'+':'-')+trend.delta+' pts':''}</div></div>
    </div>
    <div class="tp-card"><div class="tp-card-title">Score Progression</div><div class="tp-chart-wrap"><canvas id="chartScores"></canvas></div></div>
    <div class="tp-card"><div class="tp-card-title">Performance Rating (MMR)<span style="font-size:11px;color:var(--t3);font-weight:400;font-family:var(--fb);">Starts at 1000</span></div>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:10px;"><div><div class="tp-stat-lbl">Current MMR</div><div class="tp-stat-val" style="color:var(--gold);font-size:32px;">${mmr}</div></div><div style="flex:1;height:60px;position:relative;"><canvas id="chartMMR"></canvas></div></div></div>
    <div class="tp-card"><div class="tp-card-title">Win / Loss Streak</div><div class="momentum-row">${teamMatches.map(tm=>`<div class="mom-block mom-${tm.result.toLowerCase()}" title="${tm.lbl}: ${tm.result}">${tm.result}</div>`).join('')}</div></div>
    <div class="tp-card"><div class="tp-card-title">Ranking Points</div><div class="tp-chart-wrap" style="height:140px;"><canvas id="chartRP"></canvas></div></div>`;
  const cd={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#1c1c22',titleColor:'#eeeef4',bodyColor:'#8888a0',borderColor:'rgba(255,255,255,0.1)',borderWidth:1}},scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#48485a',font:{size:11}}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#48485a',font:{size:11}}}}};
  requestAnimationFrame(()=>{
    const ctxS=document.getElementById('chartScores')?.getContext('2d');
    if(ctxS)tpCharts.push(new Chart(ctxS,{type:'line',data:{labels,datasets:[{label:'My Score',data:scores,borderColor:'#f5c542',backgroundColor:'rgba(245,197,66,0.08)',tension:0.3,pointRadius:4,pointBackgroundColor:'#f5c542'},{label:'Opp',data:oppScores,borderColor:'rgba(255,255,255,0.15)',backgroundColor:'transparent',tension:0.3,pointRadius:3,borderDash:[4,4]}]},options:{...cd,plugins:{...cd.plugins,legend:{display:true,labels:{color:'#8888a0',font:{size:11}}}}}}));
    const {history:mmrH}=computeMMR(teamId,scoredMatches);
    const ctxM=document.getElementById('chartMMR')?.getContext('2d');
    if(ctxM)tpCharts.push(new Chart(ctxM,{type:'line',data:{labels,datasets:[{data:mmrH,borderColor:'#f5c542',backgroundColor:'rgba(245,197,66,0.1)',tension:0.4,pointRadius:0,fill:true}]},options:{...cd,scales:{x:{display:false},y:{display:false}},plugins:{legend:{display:false},tooltip:{enabled:false}}}}));
    let rpAcc=0;const rpData=teamMatches.map(tm=>{rpAcc+=tm.result==='W'?2:tm.result==='T'?1:0;return rpAcc;});
    const ctxRP=document.getElementById('chartRP')?.getContext('2d');
    if(ctxRP)tpCharts.push(new Chart(ctxRP,{type:'bar',data:{labels,datasets:[{data:rpData,backgroundColor:teamMatches.map(tm=>tm.result==='W'?'rgba(34,197,94,0.6)':tm.result==='L'?'rgba(232,48,42,0.4)':'rgba(136,136,160,0.3)'),borderRadius:3}]},options:{...cd,scales:{x:cd.scales.x,y:{...cd.scales.y,beginAtZero:true}}}}));
  });
}
function renderTPSide(teamId,teamMatches,rank){
  const side=document.getElementById('tpSide');
  const partnerMap={};
  teamMatches.forEach(tm=>{if(!tm.partner)return;const pid=tm.partner.team.id;if(!partnerMap[pid])partnerMap[pid]={wins:0,losses:0,ties:0,id:pid};if(tm.result==='W')partnerMap[pid].wins++;else if(tm.result==='L')partnerMap[pid].losses++;else partnerMap[pid].ties++;});
  const partners=Object.values(partnerMap).sort((a,b)=>b.wins-a.wins);
  side.innerHTML=`
    <div style="margin-bottom:14px;"><div class="ph-t" style="margin-bottom:8px;">Event Standing</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <div class="tp-stat"><div class="tp-stat-lbl">Rank</div><div class="tp-stat-val" style="color:var(--gold);">#${rank?.rank??'?'}</div></div>
        <div class="tp-stat"><div class="tp-stat-lbl">WP</div><div class="tp-stat-val">${rank?.wp??'—'}</div></div>
        <div class="tp-stat"><div class="tp-stat-lbl">AP</div><div class="tp-stat-val">${rank?.ap??'—'}</div></div>
        <div class="tp-stat"><div class="tp-stat-lbl">SP</div><div class="tp-stat-val">${rank?.sp??'—'}</div></div>
      </div></div>
    <div style="margin-bottom:14px;"><div class="ph-t" style="margin-bottom:8px;">Alliance Partners</div>
      ${partners.length?partners.map(p=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:var(--s2);border-radius:var(--r);margin-bottom:4px;cursor:pointer;" onclick="openTeamPage(${p.id})"><span style="font-family:var(--fm);font-size:12px;font-weight:600;">${tn(p.id)}</span><span style="font-size:11px;color:${p.wins>p.losses?'#22c55e':p.wins<p.losses?'#ff7b77':'var(--t2)'};">${p.wins}W-${p.losses}L-${p.ties}T</span></div>`).join(''):'<div class="empty" style="padding:10px;">No partner data</div>'}
    </div>
    <div><div class="ph-t" style="margin-bottom:8px;">Match History</div>
      ${teamMatches.map(tm=>{const scoreColor=tm.result==='W'?'#22c55e':tm.result==='L'?'#ff7b77':'var(--t2)';const resultCls=tm.result==='W'?'res-w':tm.result==='L'?'res-l':'res-t';return`<div class="tp-match-row" style="cursor:pointer;" onclick="jumpToMatchFromTeam('${tm.lbl}')"><span class="tp-match-lbl">${tm.lbl}</span><span class="tp-match-teams" style="color:${tm.myColor==='red'?'#ff7b77':'#6ab3ff'};">${tn(teamId)}+${tn(tm.partner?.team?.id||0)}</span><span class="tp-match-score" style="color:${scoreColor};">${tm.scored?`${tm.myScore}–${tm.oppScore}`:'Upcoming'}</span><span class="tp-match-result ${resultCls}">${tm.result}</span></div>`;}).join('')}
    </div>`;
}
function exportTeamData(){
  if(!currentTeamId)return;
  const teamMatches=getTeamMatches(currentTeamId),wb=XLSX.utils.book_new();
  const rows=[['Match','Result','My Score','Opp Score','Partner','Notes']];
  teamMatches.forEach(tm=>rows.push([tm.lbl,tm.result,tm.myScore,tm.oppScore,tn(tm.partner?.team?.id||0),tm.note?.notes||'']));
  const ws=XLSX.utils.aoa_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,(S.teams[currentTeamId]?.number||'Team').substring(0,31));
  XLSX.writeFile(wb,`VADT_${tn(currentTeamId)}_analysis.xlsx`);
}
function jumpToMatchFromTeam(lbl){closeTeamPage();setTimeout(()=>jumpToMatch(lbl),150);}

// ─── TABS ─────────────────────────────────────────────────────────────────────
let activeTab='event',seasonDataLoaded=false;
function switchTab(tab){
  activeTab=tab;
  document.getElementById('tpEventTab').style.display=tab==='event'?'grid':'none';
  document.getElementById('tpSeasonTab').style.display=tab==='season'?'grid':'none';
  document.getElementById('tabEvent').classList.toggle('active',tab==='event');
  document.getElementById('tabSeason').classList.toggle('active',tab==='season');
  if(tab==='season'&&!seasonDataLoaded&&currentTeamId)loadSeasonData(currentTeamId);
}

// ─── SEASON DATA ──────────────────────────────────────────────────────────────
let CURRENT_SEASON_ID=null;
const SEASON_CACHE_TTL=5*60*1000;
function getSeasonCache(tid,sid){try{const r=JSON.parse(sessionStorage.getItem(`vadt_season_${tid}_${sid}`)||'null');return r&&Date.now()-r.ts<SEASON_CACHE_TTL?r.data:null;}catch{return null;}}
function setSeasonCache(tid,sid,data){try{sessionStorage.setItem(`vadt_season_${tid}_${sid}`,JSON.stringify({ts:Date.now(),data}));}catch{}}
async function loadSeasonData(teamId){
  const main=document.getElementById('tpSeasonMain'),side=document.getElementById('tpSeasonSide');
  if(!CURRENT_SEASON_ID&&S.ev?.season?.id)CURRENT_SEASON_ID=S.ev.season.id;
  if(!CURRENT_SEASON_ID){try{const s=await rg('/seasons',{'program[]':1,active:true,per_page:1});CURRENT_SEASON_ID=s.data?.[0]?.id;}catch{}}
  if(!CURRENT_SEASON_ID){if(main)main.innerHTML='<div class="empty" style="margin-top:60px;"><p style="color:#ff7b77;">Could not determine season ID</p></div>';return;}
  const cached=getSeasonCache(teamId,CURRENT_SEASON_ID);
  if(cached){seasonDataLoaded=true;document.getElementById('tabSeasonBadge').textContent=`${cached.matchData.length} matches`;renderSeasonMain(teamId,cached.matchData,cached.rankData,cached.skillsData,cached.eventsData);renderSeasonSide(teamId,cached.matchData,cached.rankData,cached.skillsData,cached.eventsData);return;}
  if(main)main.innerHTML=`<div style="padding:20px;display:flex;flex-direction:column;gap:12px;"><div class="tp-stats">${['Season Record','Avg Score','Consistency','Trend'].map(l=>`<div class="tp-stat"><div class="tp-stat-lbl">${l}</div><div style="height:28px;background:var(--s4);border-radius:4px;animation:skelPulse 1.4s ease-in-out infinite;margin-top:4px;"></div></div>`).join('')}</div></div>`;
  try{
    let matchData=[],rankData=[],skillsData=[],eventsData=[];
    await Promise.all([
      ra(`/teams/${teamId}/matches`,{'season[]':CURRENT_SEASON_ID,per_page:250}).then(d=>{matchData=d;document.getElementById('tabSeasonBadge').textContent=`${d.length} matches`;}),
      ra(`/teams/${teamId}/rankings`,{'season[]':CURRENT_SEASON_ID}).then(d=>{rankData=d;}),
      ra(`/teams/${teamId}/skills`,{'season[]':CURRENT_SEASON_ID}).then(d=>{skillsData=d;}),
      ra(`/teams/${teamId}/events`,{'season[]':CURRENT_SEASON_ID}).then(d=>{eventsData=d;}),
    ]);
    seasonDataLoaded=true;
    renderSeasonMain(teamId,matchData,rankData,skillsData,eventsData);
    renderSeasonSide(teamId,matchData,rankData,skillsData,eventsData);
    setSeasonCache(teamId,CURRENT_SEASON_ID,{matchData,rankData,skillsData,eventsData});
  }catch(e){if(main)main.innerHTML=`<div class="empty" style="margin-top:60px;"><p style="color:#ff7b77;">Season error: ${e.message}</p></div>`;}
}
function computeSeasonStats(teamId,matches){
  let wins=0,losses=0,ties=0,totalScore=0,scoreCount=0;const matchesByEvent={};
  matches.forEach(m=>{
    const myA=(m.alliances||[]).find(a=>(a.teams||[]).some(t=>Number(t.team.id)===Number(teamId)));
    const oppA=(m.alliances||[]).find(a=>!(a.teams||[]).some(t=>Number(t.team.id)===Number(teamId)));
    if(!myA)return;
    const ms=myA.score!=null?Number(myA.score):null,os=oppA?.score!=null?Number(oppA.score):null;
    if(!(ms!==null&&os!==null)&&!m.scored)return;
    if(ms>os)wins++;else if(ms<os)losses++;else ties++;
    if(ms!==null){totalScore+=ms;scoreCount++;}
    const eid=m.event?.id;
    if(eid){if(!matchesByEvent[eid])matchesByEvent[eid]={event:m.event,wins:0,losses:0,ties:0,scores:[]};
      if(ms>os)matchesByEvent[eid].wins++;else if(ms<os)matchesByEvent[eid].losses++;else matchesByEvent[eid].ties++;
      if(ms!==null)matchesByEvent[eid].scores.push(ms);}
  });
  return{wins,losses,ties,avgScore:scoreCount?Math.round(totalScore/scoreCount):0,matchesByEvent:Object.values(matchesByEvent),total:wins+losses+ties};
}
function renderSeasonMain(teamId,matches,rankings,skills,events){
  const main=document.getElementById('tpSeasonMain'),stats=computeSeasonStats(teamId,matches);
  const scoredMatches=matches.filter(m=>{const my=(m.alliances||[]).find(a=>(a.teams||[]).some(t=>Number(t.team.id)===Number(teamId)));const opp=(m.alliances||[]).find(a=>!(a.teams||[]).some(t=>Number(t.team.id)===Number(teamId)));return(my?.score!=null&&opp?.score!=null)||m.scored;}).map(m=>{const my=(m.alliances||[]).find(a=>(a.teams||[]).some(t=>Number(t.team.id)===Number(teamId)));const opp=(m.alliances||[]).find(a=>!(a.teams||[]).some(t=>Number(t.team.id)===Number(teamId)));const ms=my?.score!=null?Number(my.score):0,os=opp?.score!=null?Number(opp.score):0;return{myScore:ms,oppScore:os,result:ms>os?'W':ms<os?'L':'T',eventName:m.event?.name||'?'};});
  const scores=scoredMatches.map(m=>m.myScore),consistency=computeConsistency(scores),trend=computeTrend(scores),{mmr,history:mmrHistory}=computeMMR(teamId,scoredMatches);
  const trendColor=trend.dir>0?'#22c55e':trend.dir<0?'#ff7b77':'var(--t2)';
  const driverSkill=skills.filter(s=>s.type===1).sort((a,b)=>b.score-a.score)[0],autoSkill=skills.filter(s=>s.type===0).sort((a,b)=>b.score-a.score)[0];
  const combinedSkill=driverSkill&&autoSkill?driverSkill.score+autoSkill.score:null;
  main.innerHTML=`
    <div class="tp-stats">
      <div class="tp-stat"><div class="tp-stat-lbl">Season Record</div><div class="tp-stat-val" style="color:#22c55e;">${stats.wins}W</div><div class="tp-stat-sub">${stats.losses}L·${stats.ties}T</div></div>
      <div class="tp-stat"><div class="tp-stat-lbl">Avg Score</div><div class="tp-stat-val" style="color:var(--gold);">${stats.avgScore}</div><div class="tp-stat-sub">${stats.total} matches</div></div>
      <div class="tp-stat"><div class="tp-stat-lbl">Consistency</div><div class="tp-stat-val">${consistency}</div><div class="tp-stat-sub">out of 100</div></div>
      <div class="tp-stat"><div class="tp-stat-lbl">Trend</div><div class="tp-stat-val" style="color:${trendColor};font-size:18px;">${trend.label}</div></div>
    </div>
    ${combinedSkill!==null?`<div class="tp-card"><div class="tp-card-title">Robot Skills</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;"><div class="tp-stat"><div class="tp-stat-lbl">Combined</div><div class="tp-stat-val" style="color:var(--gold);">${combinedSkill}</div></div><div class="tp-stat"><div class="tp-stat-lbl">Driver</div><div class="tp-stat-val">${driverSkill?.score??'—'}</div></div><div class="tp-stat"><div class="tp-stat-lbl">Autonomous</div><div class="tp-stat-val">${autoSkill?.score??'—'}</div></div></div></div>`:''}
    <div class="tp-card"><div class="tp-card-title">Season Score Progression</div><div class="tp-chart-wrap"><canvas id="chartSeasonScores"></canvas></div></div>
    <div class="tp-card"><div class="tp-card-title">Season MMR</div><div style="display:flex;align-items:center;gap:16px;margin-bottom:10px;"><div><div class="tp-stat-lbl">Season MMR</div><div class="tp-stat-val" style="color:var(--gold);font-size:32px;">${mmr}</div></div><div style="flex:1;height:60px;position:relative;"><canvas id="chartSeasonMMR"></canvas></div></div></div>
    <div class="tp-card"><div class="tp-card-title">Win / Loss Streak</div><div class="momentum-row">${scoredMatches.map(m=>`<div class="mom-block mom-${m.result.toLowerCase()}">${m.result}</div>`).join('')}</div></div>`;
  requestAnimationFrame(()=>{
    const cd={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#1c1c22',titleColor:'#eeeef4',bodyColor:'#8888a0'}},scales:{x:{display:false},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#48485a',font:{size:11}}}}};
    const ctxSS=document.getElementById('chartSeasonScores')?.getContext('2d');
    if(ctxSS)tpCharts.push(new Chart(ctxSS,{type:'line',data:{labels:scoredMatches.map((_,i)=>i+1),datasets:[{label:'My Score',data:scores,borderColor:'#f5c542',backgroundColor:'rgba(245,197,66,0.08)',tension:0.3,pointRadius:2,pointBackgroundColor:'#f5c542'},{label:'Opp',data:scoredMatches.map(m=>m.oppScore),borderColor:'rgba(255,255,255,0.12)',backgroundColor:'transparent',tension:0.3,pointRadius:0,borderDash:[3,3]}]},options:{...cd,plugins:{...cd.plugins,legend:{display:true,labels:{color:'#8888a0',font:{size:11}}}}}}));
    const ctxSM=document.getElementById('chartSeasonMMR')?.getContext('2d');
    if(ctxSM)tpCharts.push(new Chart(ctxSM,{type:'line',data:{labels:mmrHistory.map((_,i)=>i),datasets:[{data:mmrHistory,borderColor:'#f5c542',backgroundColor:'rgba(245,197,66,0.1)',tension:0.4,pointRadius:0,fill:true}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{display:false},y:{display:false}},plugins:{legend:{display:false},tooltip:{enabled:false}}}}));
  });
}
function renderSeasonSide(teamId,matches,rankings,skills,events){
  const side=document.getElementById('tpSeasonSide'),stats=computeSeasonStats(teamId,matches);
  const eventResults=stats.matchesByEvent.sort((a,b)=>(b.wins/(Math.max(b.wins+b.losses+b.ties,1)))-(a.wins/(Math.max(a.wins+a.losses+a.ties,1))));
  const bestPlacement=rankings.sort((a,b)=>a.rank-b.rank)[0],topSkills=skills.filter(s=>s.type===1).sort((a,b)=>b.score-a.score)[0];
  const pc=r=>r===1?'gold':r<=3?'silver':r<=8?'bronze':'other';
  side.innerHTML=`
    <div style="margin-bottom:14px;"><div class="ph-t" style="margin-bottom:8px;">Season Highlights</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
        <div class="tp-stat"><div class="tp-stat-lbl">Events</div><div class="tp-stat-val">${events.length}</div></div>
        <div class="tp-stat"><div class="tp-stat-lbl">Best Rank</div><div class="tp-stat-val" style="color:var(--gold);">#${bestPlacement?.rank??'—'}</div></div>
        <div class="tp-stat"><div class="tp-stat-lbl">Win Rate</div><div class="tp-stat-val">${stats.total>0?Math.round(stats.wins/stats.total*100):0}%</div></div>
        <div class="tp-stat"><div class="tp-stat-lbl">Skills</div><div class="tp-stat-val">${topSkills?.score??'—'}</div></div>
      </div></div>
    <div><div class="ph-t" style="margin-bottom:8px;">Events Attended</div>
      ${eventResults.length?eventResults.map(er=>{const total=er.wins+er.losses+er.ties,wr=total>0?Math.round(er.wins/total*100):0,avgSc=er.scores.length?Math.round(er.scores.reduce((a,b)=>a+b,0)/er.scores.length):0,evRank=rankings.find(r=>r.event?.id===er.event?.id),rank=evRank?.rank;return`<div class="season-event-row"><div class="season-event-top"><div class="season-event-name">${er.event?.name||'Unknown'}</div>${rank?`<div class="season-event-place ${pc(rank)}">#${rank}</div>`:''}</div><div class="season-event-stats"><span>${er.wins}W-${er.losses}L-${er.ties}T</span><span>·</span><span>${wr}% win</span><span>·</span><span>Avg ${avgSc}</span></div><div class="season-skills-bar"><div class="season-skills-fill" style="width:${wr}%;"></div></div></div>`;}).join(''):'<div class="empty" style="padding:10px;">No event data</div>'}
    </div>`;
}

// ─── CV DATA IMPORT ───────────────────────────────────────────────────────────
let cvData=null;
function importCVData(event){
  const file=event.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(!data.timeline||!data.robot_contributions)throw new Error('Not a valid VADT CV export');
      cvData=data;if(currentTeamId){S.notes[`cv_${currentTeamId}`]=data;sn2();}
      renderCVSection(data);setSt(`CV data imported: ${data.source}`,'live');
    }catch(err){setSt('CV import error: '+err.message,'idle');}
  };
  reader.readAsText(file);event.target.value='';
}
function renderCVSection(data){
  let cvSection=document.getElementById('cvSection');
  if(!cvSection){const main=document.getElementById('tpMain');if(!main)return;const div=document.createElement('div');div.id='cvSection';main.appendChild(div);cvSection=div;}
  const wc=data.winner==='red'?'#ff6b65':data.winner==='blue'?'#6ab3ff':'var(--t2)',ac=data.auton_winner==='red'?'#ff6b65':data.auton_winner==='blue'?'#6ab3ff':'var(--t2)';
  cvSection.innerHTML=`<div class="tp-card" style="margin-top:12px;">
    <div class="tp-card-title">CV Analysis<span style="font-size:11px;color:var(--t3);font-family:var(--fb);font-weight:400;">${data.source}</span></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;">
      <div class="tp-stat"><div class="tp-stat-lbl">Red Score</div><div class="tp-stat-val" style="color:#ff6b65;">${data.final_red_score}</div></div>
      <div class="tp-stat"><div class="tp-stat-lbl">Blue Score</div><div class="tp-stat-val" style="color:#6ab3ff;">${data.final_blue_score}</div></div>
      <div class="tp-stat"><div class="tp-stat-lbl">Winner</div><div class="tp-stat-val" style="color:${wc};font-size:16px;">${data.winner.toUpperCase()}</div></div>
      <div class="tp-stat"><div class="tp-stat-lbl">Auton</div><div class="tp-stat-val" style="color:${ac};font-size:16px;">${data.auton_winner.toUpperCase()}</div></div>
    </div>
    <div style="margin-bottom:12px;"><div style="font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:0.1em;color:var(--t3);text-transform:uppercase;margin-bottom:7px;">Robot Contributions</div>
      ${data.robot_contributions.map(r=>{const c=r.alliance==='red'?'#ff6b65':'#6ab3ff',bc=r.alliance==='red'?'var(--red)':'var(--blue)';return`<div style="margin-bottom:7px;"><div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-family:var(--fm);font-size:12px;font-weight:600;color:${c};">${r.team_number}</span><span style="font-size:12px;color:var(--t2);">${r.blocks_scored} blocks · ${r.contribution_pct}%</span></div><div style="height:5px;background:var(--s4);border-radius:3px;overflow:hidden;"><div style="width:${r.contribution_pct}%;height:100%;background:${bc};border-radius:3px;"></div></div></div>`;}).join('')}
    </div>
    <div style="font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:0.1em;color:var(--t3);text-transform:uppercase;margin-bottom:7px;">Score Timeline</div>
    <div style="position:relative;height:140px;"><canvas id="chartCV"></canvas></div>
  </div>`;
  requestAnimationFrame(()=>{
    const ctx=document.getElementById('chartCV')?.getContext('2d');if(!ctx||!window.Chart)return;
    const step=Math.max(1,Math.floor(data.timeline.length/20));
    tpCharts.push(new Chart(ctx,{type:'line',data:{labels:data.timeline.map((p,i)=>i%step===0?p.t+'s':''),datasets:[{label:'Red',data:data.timeline.map(p=>p.red),borderColor:'#ff6b65',backgroundColor:'rgba(232,48,42,0.08)',tension:0.3,pointRadius:0,fill:true},{label:'Blue',data:data.timeline.map(p=>p.blue),borderColor:'#6ab3ff',backgroundColor:'rgba(26,125,223,0.08)',tension:0.3,pointRadius:0,fill:true}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{color:'#8888a0',font:{size:11}}},tooltip:{backgroundColor:'#1c1c22',titleColor:'#eeeef4',bodyColor:'#8888a0'}},scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#48485a',font:{size:10},maxRotation:0}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#48485a',font:{size:10}},beginAtZero:true}}}}));
  });
}
function restoreCVData(teamId){const saved=S.notes[`cv_${teamId}`];if(saved){cvData=saved;renderCVSection(saved);}}

// ─── CV SCORE DETECTION OVERLAY ───────────────────────────────────────────────
const CV={zones:{redGoal:{label:'Red Goal Zone',color:'#ff6b65',dotColor:'#e8302a',drawn:false,rect:null},blueGoal:{label:'Blue Goal Zone',color:'#6ab3ff',dotColor:'#1a7ddf',drawn:false,rect:null},redBot1:{label:'Red Robot 1',color:'#ff9d9a',dotColor:'#e8302a',drawn:false,rect:null},redBot2:{label:'Red Robot 2',color:'#ffbdb9',dotColor:'#e8302a',drawn:false,rect:null},blueBot1:{label:'Blue Robot 1',color:'#90c4ff',dotColor:'#1a7ddf',drawn:false,rect:null},blueBot2:{label:'Blue Robot 2',color:'#b3d8ff',dotColor:'#1a7ddf',drawn:false,rect:null}},activeZone:'redGoal',drawing:false,drawStart:null,capturedImage:null,rafId:null,lastFrameTime:0,fps:0,redScore:0,blueScore:0,autonWinner:'TBD',autonChecked:false,detectionHistory:[]};
const ZONE_ORDER=['redGoal','blueGoal','redBot1','redBot2','blueBot1','blueBot2'];
const BLOCK_POINTS=5,AUTON_BONUS=8;
const BLOCK_HSV={hMin:75,hMax:108,sMin:70,vMin:55};

function openCVOverlay(){
  document.getElementById('cvOverlayPanel').classList.add('open');
  showCVStep('capture');
  loadCVZones();
  // In Electron with a YouTube URL loaded but no clip yet, show the workflow hint immediately.
  const localVid=document.getElementById('cvVideoPreview');
  const hasClip=localVid&&localVid.src&&localVid.readyState>=2;
  const msg=document.getElementById('cvNoVideoMsg');
  if(msg&&IS_ELECTRON&&ytCurrentUrl&&!hasClip){
    msg.style.display='block';
    msg.innerHTML='⚠️ No clip loaded yet. <strong>Close this panel</strong>, use the <strong>⬥ Start</strong> and <strong>⬥ End</strong> buttons above the video to mark the match, then click <strong>⬇ Download &amp; Analyze</strong> — the clip will load here automatically.';
  } else if(msg){
    msg.style.display='none';
  }
}
function closeCVOverlay(){stopDetection();document.getElementById('cvOverlayPanel').classList.remove('open');}
function showCVStep(step){
  document.getElementById('cvStepCapture').style.display=step==='capture'?'block':'none';
  document.getElementById('cvStepDraw').style.display=step==='draw'?'block':'none';
  document.getElementById('cvStepLive').style.display=step==='live'?'block':'none';
  document.getElementById('cvLiveBar').style.display=step==='live'?'flex':'none';
  ['1','2','3'].forEach((n,i)=>{const pip=document.getElementById('cvStep'+n);if(pip)pip.classList.toggle('active',['capture','draw','live'][i]===step);});
}
function captureFrame(){
  const localVid=document.getElementById('cvVideoPreview');
  if(localVid&&localVid.src&&localVid.readyState>=2){
    const c=document.createElement('canvas');
    c.width=localVid.videoWidth;c.height=localVid.videoHeight;
    c.getContext('2d').drawImage(localVid,0,0);
    const img=new Image();img.onload=()=>{CV.capturedImage=img;showDrawStep(img);};img.src=c.toDataURL('image/jpeg',0.95);
    return;
  }
  const msg=document.getElementById('cvNoVideoMsg');
  if(!msg)return;
  msg.style.display='block';
  if(IS_ELECTRON&&ytCurrentUrl){
    msg.innerHTML='⚠️ No clip loaded yet. <strong>Close this panel</strong>, use the <strong>⬥ Start</strong> and <strong>⬥ End</strong> buttons above the video to mark the match, then click <strong>⬇ Download &amp; Analyze</strong> — the clip will load here automatically.';
  } else {
    msg.textContent='⚠️ Load a video file using the button above, pause it at the desired frame, then capture.';
  }
}
function loadCVVideo(e){
  const file=e.target.files[0];if(!file)return;
  const vid=document.getElementById('cvVideoPreview');
  if(vid.src)URL.revokeObjectURL(vid.src);
  vid.src=URL.createObjectURL(file);
  vid.style.display='block';
  const msg=document.getElementById('cvNoVideoMsg');
  if(msg){msg.style.display='block';msg.textContent='⏸ Pause at the desired frame, then click Capture Frame.';}
  e.target.value='';
}
function loadScreenshot(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();reader.onload=ev=>{const img=new Image();img.onload=()=>{CV.capturedImage=img;showDrawStep(img);};img.src=ev.target.result;};reader.readAsDataURL(file);e.target.value='';
}
function showDrawStep(img){
  showCVStep('draw');
  const canvas=document.getElementById('cvoCanvas'),wrap=document.getElementById('cvCanvasWrap'),scale=wrap.offsetWidth/img.width;
  canvas.width=img.width;canvas.height=img.height;canvas.style.height=(img.height*scale)+'px';
  const dc=document.getElementById('cvoDrawCanvas');dc.width=img.width;dc.height=img.height;dc.style.height=(img.height*scale)+'px';
  canvas.getContext('2d').drawImage(img,0,0);
  renderZoneButtons();renderZoneList();redrawZones();setActiveZone('redGoal');
}
function renderZoneButtons(){
  const el=document.getElementById('cvZoneBtns');if(!el)return;
  el.innerHTML=ZONE_ORDER.map(k=>{const z=CV.zones[k];return`<button class="btn-o" style="${CV.activeZone===k?'border-color:'+z.color+';color:'+z.color+';':''}" onclick="setActiveZone('${k}')"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${z.drawn?'#22c55e':z.dotColor};margin-right:4px;"></span>${z.label}</button>`;}).join('');
}
function setActiveZone(key){CV.activeZone=key;document.getElementById('cvCurrentZoneName').textContent=CV.zones[key].label;renderZoneButtons();}
function renderZoneList(){
  const el=document.getElementById('cvZoneList');if(!el)return;
  el.innerHTML=ZONE_ORDER.map(k=>{const z=CV.zones[k];return`<div class="cvo-zone ${z.drawn?'drawn':''}" onclick="setActiveZone('${k}')"><div class="cvo-zone-hd"><div class="cvo-zone-color" style="background:${z.dotColor};"></div><div class="cvo-zone-name">${z.label}</div></div><div class="cvo-zone-status">${z.drawn?'✓ Zone drawn':'Click to select, then draw'}</div><div class="cvo-zone-val" id="cvZoneVal-${k}">—</div></div>`;}).join('');
}
function cvCoords(e){const canvas=document.getElementById('cvoDrawCanvas'),rect=canvas.getBoundingClientRect(),sx=canvas.width/rect.width,sy=canvas.height/rect.height;return{x:(e.clientX-rect.left)*sx,y:(e.clientY-rect.top)*sy};}
function cvStartDraw(e){CV.drawing=true;CV.drawStart=cvCoords(e);}
function cvMoveDraw(e){
  if(!CV.drawing)return;const pos=cvCoords(e);redrawZones();
  const dc=document.getElementById('cvoDrawCanvas').getContext('2d'),z=CV.zones[CV.activeZone];
  dc.strokeStyle=z.color;dc.lineWidth=2;dc.setLineDash([6,3]);
  dc.strokeRect(CV.drawStart.x,CV.drawStart.y,pos.x-CV.drawStart.x,pos.y-CV.drawStart.y);
}
function cvEndDraw(e){
  if(!CV.drawing)return;CV.drawing=false;const pos=cvCoords(e);
  const x=Math.min(CV.drawStart.x,pos.x),y=Math.min(CV.drawStart.y,pos.y),w=Math.abs(pos.x-CV.drawStart.x),h=Math.abs(pos.y-CV.drawStart.y);
  if(w>10&&h>10){CV.zones[CV.activeZone].rect={x,y,w,h};CV.zones[CV.activeZone].drawn=true;const next=ZONE_ORDER.find(k=>!CV.zones[k].drawn&&k!==CV.activeZone);if(next)setActiveZone(next);renderZoneButtons();renderZoneList();redrawZones();}
}
function redrawZones(){
  const dc=document.getElementById('cvoDrawCanvas');if(!dc)return;const ctx=dc.getContext('2d');ctx.clearRect(0,0,dc.width,dc.height);
  ZONE_ORDER.forEach(k=>{const z=CV.zones[k];if(!z.drawn||!z.rect)return;const r=z.rect;ctx.fillStyle=z.color+'22';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.strokeStyle=z.color;ctx.lineWidth=k===CV.activeZone?3:1.5;ctx.setLineDash([]);ctx.strokeRect(r.x,r.y,r.w,r.h);ctx.fillStyle=z.color;ctx.font='bold 11px Barlow,sans-serif';ctx.fillText(z.label,r.x+4,r.y+14);});
}
function resetZones(){ZONE_ORDER.forEach(k=>{CV.zones[k].drawn=false;CV.zones[k].rect=null;});const dc=document.getElementById('cvoDrawCanvas');if(dc)dc.getContext('2d').clearRect(0,0,dc.width,dc.height);renderZoneButtons();renderZoneList();setActiveZone('redGoal');}
function saveCVZones(){
  const canvas=document.getElementById('cvoCanvas'),saved={};
  ZONE_ORDER.forEach(k=>{if(CV.zones[k].drawn&&CV.zones[k].rect){const r=CV.zones[k].rect;saved[k]={x:r.x/canvas.width,y:r.y/canvas.height,w:r.w/canvas.width,h:r.h/canvas.height};}});
  localStorage.setItem('vadt_cv_zones',JSON.stringify(saved));alert('Zones saved!');
}
function loadCVZones(){try{const saved=JSON.parse(localStorage.getItem('vadt_cv_zones')||'{}');Object.entries(saved).forEach(([k,rel])=>{if(CV.zones[k])CV.zones[k]._relRect=rel;});}catch{}}
function startDetection(){
  const drawn=ZONE_ORDER.filter(k=>CV.zones[k].drawn);
  if(!drawn.includes('redGoal')&&!drawn.includes('blueGoal')){alert('Draw at least Red and Blue Goal zones first.');return;}
  const live=document.getElementById('cvoLiveCanvas'),src=document.getElementById('cvoCanvas');
  live.width=src.width;live.height=src.height;live.style.height=src.style.height;
  showCVStep('live');renderLiveZones();CV.autonChecked=false;CV.autonWinner='TBD';CV.detectionHistory=[];CV.redBlocks=0;CV.blueBlocks=0;
  const localVid=document.getElementById('cvVideoPreview');
  if(localVid&&localVid.readyState>=2)localVid.play();
  let lastAnalysis=0;
  function loop(ts){
    const delta=ts-CV.lastFrameTime;if(delta>0)CV.fps=Math.round(1000/delta);CV.lastFrameTime=ts;
    document.getElementById('cvLiveFPS').textContent=CV.fps+' fps';
    redrawLiveOverlay();
    if(ts-lastAnalysis>2000){
      if(localVid&&localVid.readyState>=2){try{src.getContext('2d').drawImage(localVid,0,0,src.width,src.height);}catch(e){}}
      analyzeZones();lastAnalysis=ts;
    }
    CV.rafId=requestAnimationFrame(loop);
  }
  CV.rafId=requestAnimationFrame(loop);
}
function stopDetection(){
  if(CV.rafId){cancelAnimationFrame(CV.rafId);CV.rafId=null;}
  const localVid=document.getElementById('cvVideoPreview');
  if(localVid)localVid.pause();
}
function analyzeZones(){
  const canvas=document.getElementById('cvoCanvas'),ctx=canvas.getContext('2d'),img=CV.capturedImage;if(!img)return;
  let redBlocks=0,blueBlocks=0;
  ZONE_ORDER.forEach(k=>{
    const z=CV.zones[k];if(!z.drawn||!z.rect)return;const r=z.rect;
    const sx=Math.round(r.x),sy=Math.round(r.y),sw=Math.round(r.w),sh=Math.round(r.h);if(sw<5||sh<5)return;
    try{
      const data=ctx.getImageData(sx,sy,sw,sh).data,blockPixels=countBlockPixels(data),density=blockPixels/(sw*sh),blockCount=Math.round(density*(sw*sh)/400);
      if(k==='redGoal')redBlocks=blockCount;if(k==='blueGoal')blueBlocks=blockCount;
      const valEl=document.getElementById('cvZoneVal-'+k);
      if(valEl){if(k==='redGoal'||k==='blueGoal'){valEl.textContent=`${blockCount} block${blockCount!==1?'s':''}`;valEl.style.color=k==='redGoal'?'#ff6b65':'#6ab3ff';}else{const activity=Math.round(density*100);valEl.textContent=activity>5?`Active (${activity}%)`:'Not detected';valEl.style.color=activity>5?'#22c55e':'var(--t3)';}}
    }catch(err){const valEl=document.getElementById('cvZoneVal-'+k);if(valEl){valEl.textContent='Upload screenshot to detect';valEl.style.color='var(--gold)';}}
  });
  let redScore=redBlocks*BLOCK_POINTS,blueScore=blueBlocks*BLOCK_POINTS;
  if(!CV.autonChecked&&(redBlocks>0||blueBlocks>0)){CV.autonWinner=redBlocks>blueBlocks?'RED':blueBlocks>redBlocks?'BLUE':'TIE';CV.autonChecked=true;document.getElementById('cvAutonWinner').textContent=CV.autonWinner;}
  if(CV.autonWinner==='RED')redScore+=AUTON_BONUS;if(CV.autonWinner==='BLUE')blueScore+=AUTON_BONUS;
  CV.redScore=redScore;CV.blueScore=blueScore;CV.redBlocks=redBlocks;CV.blueBlocks=blueBlocks;
  CV.detectionHistory.push({r:redScore,b:blueScore,ts:Date.now()});if(CV.detectionHistory.length>3)CV.detectionHistory.shift();
  const avgR=Math.round(CV.detectionHistory.reduce((a,x)=>a+x.r,0)/CV.detectionHistory.length),avgB=Math.round(CV.detectionHistory.reduce((a,x)=>a+x.b,0)/CV.detectionHistory.length);
  document.getElementById('cvLiveRed').textContent=avgR;document.getElementById('cvLiveBlue').textContent=avgB;
  document.getElementById('cvLiveStatus').textContent=`Red: ${redBlocks} blocks · Blue: ${blueBlocks} blocks`;
}
function countBlockPixels(data){let count=0;for(let i=0;i<data.length;i+=4){const[h,s,v]=rgbToHsv(data[i],data[i+1],data[i+2]);if(h>=BLOCK_HSV.hMin&&h<=BLOCK_HSV.hMax&&s>=BLOCK_HSV.sMin&&v>=BLOCK_HSV.vMin)count++;}return count;}
function rgbToHsv(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0,s=max?d/max:0,v=max;if(d){if(max===r)h=((g-b)/d)%6;else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h=Math.round(h*30);if(h<0)h+=180;}return[h,Math.round(s*255),Math.round(v*255)];}
function redrawLiveOverlay(){
  const live=document.getElementById('cvoLiveCanvas'),ctx=live.getContext('2d');if(!live||!live.width)return;
  const localVid=document.getElementById('cvVideoPreview');
  if(localVid&&localVid.readyState>=2){try{ctx.drawImage(localVid,0,0,live.width,live.height);}catch(e){if(CV.capturedImage)ctx.drawImage(CV.capturedImage,0,0);}}
  else if(CV.capturedImage){ctx.drawImage(CV.capturedImage,0,0);}
  ZONE_ORDER.forEach(k=>{const z=CV.zones[k];if(!z.drawn||!z.rect)return;const r=z.rect;ctx.fillStyle=z.color+'30';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.strokeStyle=z.color;ctx.lineWidth=2;ctx.setLineDash([]);ctx.strokeRect(r.x,r.y,r.w,r.h);ctx.fillStyle=z.color;ctx.font='bold 12px Barlow,sans-serif';ctx.fillText(k==='redGoal'?`${CV.redBlocks||0}blk`:k==='blueGoal'?`${CV.blueBlocks||0}blk`:z.label.replace(' Robot',''),r.x+4,r.y+r.h-6);});
}
function drawLiveOverlay(redBlocks,blueBlocks){}
function renderLiveZones(){const el=document.getElementById('cvLiveZones');if(el)el.innerHTML=document.getElementById('cvZoneList')?.innerHTML||'';}
function pushDetectedScores(){
  const rIn=document.getElementById('inRedScore'),bIn=document.getElementById('inBlueScore');
  if(rIn)rIn.value=CV.redScore;if(bIn)bIn.value=CV.blueScore;
  if(typeof updateOverlayScore==='function')updateOverlayScore();closeCVOverlay();
}

const STLLoader = {
  parse(buffer) {
    // Detect ASCII vs binary
    const isASCII = (() => {
      const view = new DataView(buffer);
      // Binary STL: first 80 bytes are header, bytes 80-84 are triangle count
      const numTriangles = view.getUint32(80, true);
      const expectedLen = 84 + numTriangles * 50;
      if (buffer.byteLength === expectedLen) return false;
      // Check for "solid" text header (ASCII)
      const header = new TextDecoder().decode(new Uint8Array(buffer, 0, 5));
      return header.toLowerCase().startsWith('solid');
    })();
    return isASCII ? parseASCII(new TextDecoder().decode(buffer)) : parseBinary(buffer);

    function parseASCII(text) {
      const geo = new THREE.BufferGeometry();
      const verts = [], norms = [];
      const lines = text.split('\n');
      let nx=0,ny=0,nz=0;
      for (const line of lines) {
        const l = line.trim();
        if (l.startsWith('facet normal')) {
          const p = l.split(/\s+/); nx=+p[2]; ny=+p[3]; nz=+p[4];
        } else if (l.startsWith('vertex')) {
          const p = l.split(/\s+/);
          verts.push(+p[1],+p[2],+p[3]);
          norms.push(nx,ny,nz);
        }
      }
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
      geo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(norms), 3));
      return geo;
    }

    function parseBinary(buf) {
      const geo = new THREE.BufferGeometry();
      const view = new DataView(buf);
      const n = view.getUint32(80, true);
      const verts = new Float32Array(n * 9), norms = new Float32Array(n * 9);
      let offset = 84;
      for (let i = 0; i < n; i++) {
        const nx=view.getFloat32(offset,true), ny=view.getFloat32(offset+4,true), nz=view.getFloat32(offset+8,true);
        offset += 12;
        for (let v = 0; v < 3; v++) {
          const base = i*9+v*3;
          verts[base]   = view.getFloat32(offset,true);
          verts[base+1] = view.getFloat32(offset+4,true);
          verts[base+2] = view.getFloat32(offset+8,true);
          norms[base]=nx; norms[base+1]=ny; norms[base+2]=nz;
          offset += 12;
        }
        offset += 2; // attribute byte count
      }
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      geo.setAttribute('normal',   new THREE.BufferAttribute(norms, 3));
      return geo;
    }
  }
};

// ─── STL VIEWER STATE ─────────────────────────────────────────────────────────
const STL = {
  scene: null, camera: null, renderer: null, mesh: null,
  animId: null, models: [],  // { name, path }
  activeModel: null,
  mouse: { down: false, right: false, lastX: 0, lastY: 0 },
  spherical: { theta: 0.5, phi: 1.0, radius: 5 },
  target: new (typeof THREE !== 'undefined' ? THREE.Vector3 : Object)(),
  orient: { active: false },
  group: null,
};

function openSTLViewer() {
  const page = document.getElementById('stlPage');
  if (!page) return;
  page.style.display = 'flex';
  if (!STL.renderer) initSTLRenderer();
  refreshSTLLibrary();
}

function closeSTLViewer() {
  document.getElementById('stlPage').style.display = 'none';
  if (STL.animId) { cancelAnimationFrame(STL.animId); STL.animId = null; }
}

function initSTLRenderer() {
  if (typeof THREE === 'undefined') {
    console.error('Three.js not loaded — add the CDN script to index.html');
    return;
  }
  const canvas = document.getElementById('stlCanvas');
  const vp = document.getElementById('stlViewport');

  STL.scene = new THREE.Scene();
  STL.scene.background = new THREE.Color(0x0a0a10);

  STL.camera = new THREE.PerspectiveCamera(45, vp.offsetWidth / vp.offsetHeight, 0.01, 1000);
  updateSTLCamera();

  STL.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  STL.renderer.setPixelRatio(window.devicePixelRatio);
  STL.renderer.setSize(vp.offsetWidth, vp.offsetHeight);
  STL.renderer.shadowMap.enabled = true;

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
  dir1.position.set(5, 10, 7);
  dir1.castShadow = true;
  const dir2 = new THREE.DirectionalLight(0x8888ff, 0.3);
  dir2.position.set(-5, -3, -5);
  STL.scene.add(ambient, dir1, dir2);

  // Grid helper
  const grid = new THREE.GridHelper(10, 20, 0x2e2e3a, 0x1c1c22);
  STL.scene.add(grid);
  STL.target = new THREE.Vector3();

  // Mouse controls
  canvas.addEventListener('mousedown', e => {
    STL.mouse.down = true;
    STL.mouse.right = e.button === 2;
    STL.mouse.lastX = e.clientX; STL.mouse.lastY = e.clientY;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('mouseup', () => { STL.mouse.down = false; });
  window.addEventListener('mousemove', e => {
    if (!STL.mouse.down) return;
    const dx = e.clientX - STL.mouse.lastX, dy = e.clientY - STL.mouse.lastY;
    STL.mouse.lastX = e.clientX; STL.mouse.lastY = e.clientY;
    if (STL.orient.active && STL.group && !STL.mouse.right) {
      // Reorient mode: left drag rotates the model around camera-relative axes so
      // dragging always feels correct regardless of current camera angle.
      const speed = 0.008;
      const camDir = STL.camera.position.clone().sub(STL.target).normalize();
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), camDir).normalize();
      STL.group.rotateOnWorldAxis(right, -dy * speed);
      STL.group.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -dx * speed);
    } else if (STL.mouse.right) {
      // Pan
      const panSpeed = STL.spherical.radius * 0.001;
      STL.target.x -= dx * panSpeed;
      STL.target.y += dy * panSpeed;
      updateSTLCamera();
    } else {
      // Orbit
      STL.spherical.theta -= dx * 0.008;
      STL.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, STL.spherical.phi - dy * 0.008));
      updateSTLCamera();
    }
  });
  canvas.addEventListener('wheel', e => {
    STL.spherical.radius = Math.max(0.5, STL.spherical.radius * (1 + e.deltaY * 0.001));
    updateSTLCamera();
    e.preventDefault();
  }, { passive: false });

  // Resize
  new ResizeObserver(() => {
    if (!STL.renderer) return;
    STL.renderer.setSize(vp.offsetWidth, vp.offsetHeight);
    STL.camera.aspect = vp.offsetWidth / vp.offsetHeight;
    STL.camera.updateProjectionMatrix();
  }).observe(vp);

  stlRenderLoop();
}

function updateSTLCamera() {
  if (!STL.camera) return;
  const { theta, phi, radius } = STL.spherical;
  STL.camera.position.set(
    STL.target.x + radius * Math.sin(phi) * Math.sin(theta),
    STL.target.y + radius * Math.cos(phi),
    STL.target.z + radius * Math.sin(phi) * Math.cos(theta)
  );
  STL.camera.lookAt(STL.target);
}

function stlRenderLoop() {
  STL.animId = requestAnimationFrame(stlRenderLoop);
  if (STL.renderer && STL.scene && STL.camera) STL.renderer.render(STL.scene, STL.camera);
}

// ─── LIBRARY ──────────────────────────────────────────────────────────────────
async function refreshSTLLibrary() {
  if (!window.electronAPI?.stlList) return;
  STL.models = await window.electronAPI.stlList();
  renderSTLLibrary();
}

function renderSTLLibrary() {
  const el = document.getElementById('stlLibraryList');
  if (!el) return;
  if (!STL.models.length) {
    el.innerHTML = '<div class="empty" style="padding:20px 10px;font-size:12px;">No models yet.<br>Click + Import STL</div>';
    return;
  }
  el.innerHTML = STL.models.map(m => `
    <div class="stl-lib-item ${STL.activeModel===m.name?'active':''}" onclick="loadSTLModel('${m.path.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}','${m.name.replace(/'/g,"\\'")}')">
      <button class="stl-lib-item-del" onclick="event.stopPropagation();deleteSTLModel('${m.name.replace(/'/g,"\\'")}')">✕</button>
      <div class="stl-lib-item-name" title="${m.name}">${m.name}</div>
    </div>`).join('');
}

async function stlImport() {
  if (!window.electronAPI) return;
  const filePath = await window.electronAPI.openFileDialog([{ name:'3D Models', extensions:['obj','stl'] }]);
  if (!filePath) return;
  stlShowLoading('Importing…');
  const result = await window.electronAPI.stlSave(filePath);
  if (result) {
    await refreshSTLLibrary();
    loadSTLModel(result.path, result.name);
  } else {
    stlHideLoading();
  }
}

async function deleteSTLModel(name) {
  if (!confirm(`Delete "${name}" from your library?`)) return;
  await window.electronAPI.stlDelete(name);
  if (STL.activeModel === name) {
    if (STL.group) { STL.scene.remove(STL.group); STL.group = null; }
    STL.activeModel = null;
    document.getElementById('stlEmpty').style.display = 'flex';
    document.getElementById('stlSnapshotBtn').style.display = 'none';
    document.getElementById('stlOrientBtn').style.display = 'none';
    if (STL.orient.active) stlToggleReorient();
  }
  await refreshSTLLibrary();
}

// ─── MODEL ORIENTATION ────────────────────────────────────────────────────────
function stlToggleReorient() {
  STL.orient.active = !STL.orient.active;
  const btn = document.getElementById('stlOrientBtn');
  const panel = document.getElementById('stlOrientPanel');
  const hint = document.getElementById('stlControlsHint');
  if (STL.orient.active) {
    btn.style.background = 'var(--gold)';
    btn.style.color = '#000';
    panel.style.display = '';
    hint.textContent = 'Drag — rotate model  ·  Right drag — pan  ·  Scroll — zoom';
  } else {
    btn.style.background = '';
    btn.style.color = '';
    panel.style.display = 'none';
    hint.textContent = 'Left drag — orbit  ·  Right drag — pan  ·  Scroll — zoom';
  }
}

function stlRotateModel(axis, deg) {
  if (!STL.group) return;
  const rad = deg * Math.PI / 180;
  const axes = { x: new THREE.Vector3(1,0,0), y: new THREE.Vector3(0,1,0), z: new THREE.Vector3(0,0,1) };
  STL.group.rotateOnWorldAxis(axes[axis], rad);
}

function stlResetOrientation() {
  if (!STL.group) return;
  STL.group.rotation.set(0, 0, 0);
}

// ─── LOAD MODEL ───────────────────────────────────────────────────────────────
async function loadSTLModel(filePath, name) {
  if (!window.electronAPI || typeof THREE === 'undefined') return;
  stlShowLoading('Loading model…');
  STL.activeModel = name;
  renderSTLLibrary();
  try {
    const resp = await window.electronAPI.stlRead(filePath);
    if (!resp) { stlHideLoading(); return; } // user cancelled large-file warning

    const toAB = u8 => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

    // Parse into array of { geo, mat } — same approach as notebook viewer
    let primitives;
    if (resp.type === 'obj-geo') {
      // Geometry was parsed in the main process via streaming; just build BufferGeometry.
      primitives = resp.groups.map(({ positions, normals, color }) => {
        if (!positions.length) return null;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        if (normals) geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        else geo.computeVertexNormals();
        return { geo, mat: new THREE.MeshStandardMaterial({ color: new THREE.Color(color[0], color[1], color[2]), metalness: 0.15, roughness: 0.65 }) };
      }).filter(Boolean);
      if (!primitives.length) primitives = [{ geo: new THREE.BufferGeometry(), mat: new THREE.MeshStandardMaterial({ color: 0xb8b8b8 }) }];
    } else {
      const geo = STLLoader.parse(toAB(resp.data));
      geo.computeVertexNormals();
      primitives = [{ geo, mat: new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: 0.55, roughness: 0.35 }) }];
    }

    // Compute combined bounding box for centering + scaling
    const combined = new THREE.Box3();
    primitives.forEach(({ geo }) => { geo.computeBoundingBox(); combined.union(geo.boundingBox); });
    const center = new THREE.Vector3(); combined.getCenter(center);
    const size = new THREE.Vector3(); combined.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 3 / maxDim;

    // Remove previous model
    if (STL.group) STL.scene.remove(STL.group);
    STL.group = new THREE.Group();

    // Center model at origin (all axes)
    primitives.forEach(({ geo, mat }) => {
      geo.translate(-center.x, -center.y, -center.z);
      geo.scale(scale, scale, scale);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      STL.group.add(mesh);
    });
    STL.scene.add(STL.group);

    // Camera orbits model center; radius fits the scaled model with some margin
    STL.target.set(0, 0, 0);
    STL.spherical = { theta: 0.5, phi: 1.0, radius: maxDim * scale * 1.8 };
    updateSTLCamera();

    document.getElementById('stlEmpty').style.display = 'none';
    document.getElementById('stlSnapshotBtn').style.display = '';
    document.getElementById('stlOrientBtn').style.display = '';
    // Always leave reorient mode off between loads so the user starts fresh.
    if (STL.orient.active) stlToggleReorient();
  } catch (err) {
    alert('Failed to load model: ' + err.message);
    console.error('Model load error:', err);
  } finally {
    stlHideLoading();
  }
}

// OBJ + MTL parser for the standalone CAD viewer
function stlParseOBJ(objText, mtlText) {
  const matMap = new Map();
  if (mtlText) {
    let cur = null, kd = null;
    for (const raw of mtlText.split('\n')) {
      const t = raw.trim();
      if (t.startsWith('newmtl ')) {
        if (cur !== null) matMap.set(cur, kd || [0.8,0.8,0.8]);
        cur = t.slice(7).trim(); kd = null;
      } else if (t.startsWith('Kd ')) {
        const p = t.split(/\s+/); kd = [+p[1],+p[2],+p[3]];
      }
    }
    if (cur !== null) matMap.set(cur, kd || [0.8,0.8,0.8]);
  }
  const makeMat = name => {
    const c = matMap.get(name) || [0.72,0.74,0.78];
    return new THREE.MeshStandardMaterial({ color: new THREE.Color(c[0],c[1],c[2]), metalness: 0.15, roughness: 0.65 });
  };

  const vPos = [], vNor = [], groups = new Map();
  let curMat = '__default__';
  for (const raw of objText.split('\n')) {
    const t = raw.trim();
    if (t.startsWith('v ') && t[1]===' ') { const p=t.split(/\s+/); vPos.push(+p[1],+p[2],+p[3]); }
    else if (t.startsWith('vn ')) { const p=t.split(/\s+/); vNor.push(+p[1],+p[2],+p[3]); }
    else if (t.startsWith('usemtl ')) { curMat=t.slice(7).trim(); }
    else if (t.startsWith('f ')) {
      if (!groups.has(curMat)) groups.set(curMat,{pos:[],nor:[]});
      const g=groups.get(curMat);
      const face=t.slice(2).trim().split(/\s+/).map(tok=>{const pts=tok.split('/');return{vi:(+pts[0]-1)*3,ni:pts[2]?(+pts[2]-1)*3:-1};});
      for (let i=1;i<face.length-1;i++) for (const v of [face[0],face[i],face[i+1]]) {
        g.pos.push(vPos[v.vi],vPos[v.vi+1],vPos[v.vi+2]);
        if (v.ni>=0) g.nor.push(vNor[v.ni],vNor[v.ni+1],vNor[v.ni+2]);
      }
    }
  }
  const results = [];
  for (const [name,g] of groups) {
    if (!g.pos.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(g.pos),3));
    if (g.nor.length===g.pos.length) geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(g.nor),3));
    else geo.computeVertexNormals();
    results.push({geo, mat: makeMat(name)});
  }
  return results.length ? results : [{geo:new THREE.BufferGeometry(), mat:makeMat('__default__')}];
}

// ─── BASE64 DECODE HELPER ─────────────────────────────────────────────────────
function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ─── SNAPSHOT ─────────────────────────────────────────────────────────────────
async function stlSnapshot() {
  if (!STL.renderer || !window.electronAPI?.snapshotSave) return;
  STL.renderer.render(STL.scene, STL.camera);
  const dataUrl = document.getElementById('stlCanvas').toDataURL('image/png');
  const saved = await window.electronAPI.snapshotSave(dataUrl);
  if (saved) setSt(`Snapshot saved: ${saved}`, 'live');
}

// ─── LOADING UI ───────────────────────────────────────────────────────────────
function stlShowLoading(msg) {
  const el = document.getElementById('stlLoading');
  const msgEl = document.getElementById('stlLoadingMsg');
  if (el) { el.style.display = 'flex'; }
  if (msgEl) msgEl.textContent = msg || 'Loading…';
}
function stlHideLoading() {
  const el = document.getElementById('stlLoading');
  if (el) el.style.display = 'none';
}

// ─── INIT ──────────────────────────────────────────────────────────────────────
init();
initGoogleAuth();
checkAuthRedirect();
if(!S.re)setTimeout(openSettings,600);
if(window.electronAPI?.onUpdateStatus)window.electronAPI.onUpdateStatus(msg=>setSt(msg,'live'));
