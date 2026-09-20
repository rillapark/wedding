'use strict';
// Shared seating state. The plan lives in Vercel Blob behind /api/plan so every
// device sees the same arrangement; localStorage stays as the offline fallback.
(function () {
 const API='api/plan', KEY_STORE='wedding-edit-key', POLL_MS=5000, PUSH_DELAY=700, RETRY_MS=4000;
 let etag=null, synced=null, applying=false, pushing=false, pushTimer=null, ready=false;
 const statusEl=$('#sync-status'), keyButton=$('#edit-key');

 const time=()=>new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
 function status(text,tone){if(!statusEl)return;statusEl.textContent=text;statusEl.dataset.tone=tone||'ok'}
 function storedKey(){try{return localStorage.getItem(KEY_STORE)||''}catch{return ''}}
 function storeKey(v){try{v?localStorage.setItem(KEY_STORE,v):localStorage.removeItem(KEY_STORE)}catch{}}
 function serialize(){return JSON.stringify({guests,tables})}
 function rosterHash(){return typeof defaultRosterHash==='string'?defaultRosterHash:null}

 // The shared plan pins the roster it was built from. When the deployed
 // workbook changes, adopt the new names rather than letting the stored plan
 // keep resurrecting the old ones, and carry seats over by name + group.
 function rebuild(plan,parsed){
  const oldById=new Map(plan.guests.map(g=>[g.id,g]));
  const k=g=>String(g.name||'').trim()+'\u0000'+String(g.group||'').trim();
  const byKey=new Map();
  for(const g of parsed.guests)if(!byKey.has(k(g)))byKey.set(k(g),g);
  const tables=parsed.tables.map((t,ti)=>{
   const prev=plan.tables[ti];let capacity=t.capacity;
   if(prev&&[8,9,10].includes(prev.capacity)&&!t.seats.slice(prev.capacity).some(x=>x!==null))capacity=prev.capacity;
   return {capacity,seats:t.seats.slice()};
  });
  const used=new Set(tables.flatMap(t=>t.seats).filter(x=>x!==null));
  let kept=0,dropped=0;
  plan.tables.forEach((t,ti)=>t.seats.forEach((id,si)=>{
   if(id===null||!tables[ti])return;
   const old=oldById.get(id),match=old&&byKey.get(k(old));
   if(!match||used.has(match.id)||si>=tables[ti].capacity||tables[ti].seats[si]!==null){dropped++;return}
   tables[ti].seats[si]=match.id;used.add(match.id);kept++;
  }));
  return {guests:parsed.guests,tables,kept,dropped};
 }

 function applyRemote(plan){
  applying=true;
  try{guests=plan.guests;tables=plan.tables;if(!tables[selected])selected=0;render()}
  finally{applying=false}
  synced=serialize();
 }

 function schedulePush(){
  if(!ready)return;
  clearTimeout(pushTimer);pushTimer=setTimeout(()=>push(),PUSH_DELAY);
  if(serialize()!==synced)status('변경 사항 저장 대기 중…');
 }

 async function push({silent=false}={}){
  if(!ready)return;
  if(pushing){clearTimeout(pushTimer);pushTimer=setTimeout(()=>push({silent}),PUSH_DELAY);return}
  const body=serialize();
  if(body===synced)return;
  pushing=true;status('저장 중…');
  try{
   const headers={'Content-Type':'application/json'},key=storedKey();
   if(key)headers['x-edit-key']=key;
   const res=await fetch(API,{method:'PUT',headers,cache:'no-store',body:JSON.stringify({plan:{...JSON.parse(body),rosterHash:rosterHash()},etag})});
   const data=await res.json().catch(()=>({}));
   if(res.status===401){
    status('편집하려면 암호가 필요합니다.','warn');
    if(!silent){notify('편집 암호를 입력해 주세요.');promptKey()}
    return;
   }
   if(res.status===409){
    etag=data.etag||null;
    if(data.plan)applyRemote(data.plan);
    status('다른 기기의 최신 배치를 불러왔습니다.','warn');
    notify('다른 기기에서 먼저 저장했습니다. 최신 배치를 불러왔으니 변경 내용을 다시 적용해 주세요.');
    return;
   }
   if(!res.ok)throw Error(data.error||'저장하지 못했습니다.');
   etag=data.etag;synced=body;
   status('모든 기기에 저장됨 · '+time());
   if(serialize()!==synced)schedulePush();
  }catch{
   status('저장 실패 · 다시 시도합니다.','warn');
   clearTimeout(pushTimer);pushTimer=setTimeout(()=>push({silent}),RETRY_MS);
  }finally{pushing=false}
 }

 async function poll(){
  if(!ready||pushing||serialize()!==synced)return;
  try{
   const res=await fetch(API,{cache:'no-store'});
   if(!res.ok)return;
   const data=await res.json();
   if(!data.plan||!data.etag||data.etag===etag)return;
   etag=data.etag;applyRemote(data.plan);
   status('다른 기기의 변경을 반영했습니다 · '+time());
  }catch{}
 }

 function promptKey(){
  const next=prompt('편집 암호를 입력하세요. 비워 두면 보기 전용입니다.',storedKey());
  if(next===null)return;
  storeKey(next.trim());
  if(next.trim()){status('편집 암호를 저장했습니다.');schedulePush()}
  else status('보기 전용입니다.');
 }
 if(keyButton)keyButton.onclick=promptKey;
 // The password is a deploy-time switch (EDIT_KEY): hide the control entirely
 // when the server is not asking for one, so the UI matches how it behaves.
 function showKeyButton(required){if(keyButton)keyButton.hidden=!required}

 const baseRender=render;
 render=function(){baseRender();if(!applying)schedulePush()};

 (async function init(){
  try{await window.rosterReady}catch{}
  status('공유 배치를 확인하는 중…');
  let data;
  try{
   const res=await fetch(API,{cache:'no-store'});
   if(!res.ok)throw Error('공유 저장소 응답 오류');
   data=await res.json();
  }catch{
   status('공유 저장에 연결하지 못했습니다. 이 브라우저에만 저장됩니다.','warn');
   return;
  }
  ready=true;
  showKeyButton(data.requiresKey);
  const here=rosterHash(),there=data.plan&&typeof data.plan.rosterHash==='string'?data.plan.rosterHash:null;
  // A plan with no rosterHash predates that field, so its roster provenance is
  // unknown and must be treated as stale rather than trusted.
  if(data.plan&&here&&defaultRoster&&there!==here){
   etag=data.etag;
   const next=rebuild(data.plan,defaultRoster);
   applying=true;
   try{guests=next.guests;tables=next.tables;if(!tables[selected])selected=0;render()}finally{applying=false}
   synced=null;
   await push({silent:true});
   status('새 명단('+guests.length+'명)을 반영했습니다'+(next.kept?' · 좌석 '+next.kept+'석 유지':'')); 
   if(next.dropped)notify('명단이 바뀌어 '+next.dropped+'석의 배정이 해제되었습니다. 해당 하객이 새 명단에 없습니다.');
  }
  else if(data.plan){etag=data.etag;applyRemote(data.plan);status('공유 배치를 불러왔습니다 · '+time())}
  else{etag=null;synced=null;status('공유 저장을 시작합니다…');await push({silent:true})}
  setInterval(()=>{if(!document.hidden)poll()},POLL_MS);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});
 })();
})();
