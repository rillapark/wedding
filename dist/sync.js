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
   const res=await fetch(API,{method:'PUT',headers,cache:'no-store',body:JSON.stringify({plan:JSON.parse(body),etag})});
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
  if(data.plan){etag=data.etag;applyRemote(data.plan);status('공유 배치를 불러왔습니다 · '+time())}
  else{etag=null;synced=null;status('공유 저장을 시작합니다…');await push({silent:true})}
  setInterval(()=>{if(!document.hidden)poll()},POLL_MS);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});
 })();
})();
