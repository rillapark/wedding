'use strict';
const CACHE_KEY='wedding-seating-v3';
let sourceHash=null,sourceUpdate=null,sourceBusy=false,sourceReady=false,hasSavedState=false;
let sourceConfig={url:'data/guests.xlsx',checkIntervalMs:60000};
// The default workbook and its hash, recorded on every fetch so the shared
// plan can tell whether it was built from the roster file currently deployed.
let defaultRosterHash=null,defaultRoster=null,defaultRosterInfo=null;
function persistSeating(){
 if(!sourceReady)return;
 try{localStorage.setItem(CACHE_KEY,JSON.stringify({version:3,guests,tables,sourceHash,label:$('#source-label').textContent}))}
 catch{ $('#source-status').textContent='이 브라우저에 임시 저장할 수 없습니다.' }
}
function restoreSeating(){
 try{
  const raw=localStorage.getItem(CACHE_KEY);if(!raw)return false;const s=JSON.parse(raw);
  if(s.version!==3||!Array.isArray(s.guests)||!s.guests.length||s.guests.length>5000||!Array.isArray(s.tables)||s.tables.length!==20)throw Error('Invalid saved data');
  const ids=new Set(),used=new Set();
  for(const g of s.guests){if(!Number.isInteger(g.id)||ids.has(g.id)||typeof g.name!=='string'||!g.name.trim()||typeof g.group!=='string')throw Error('Invalid guest');ids.add(g.id)}
  for(const t of s.tables){if(![8,9,10].includes(t.capacity)||!Array.isArray(t.seats)||t.seats.length!==10)throw Error('Invalid table');t.seats.forEach((id,i)=>{if(id!==null){if(i>=t.capacity||!ids.has(id)||used.has(id))throw Error('Invalid seat');used.add(id)}})}
  guests=s.guests;tables=s.tables;sourceHash=typeof s.sourceHash==='string'?s.sourceHash:null;$('#source-label').textContent=String(s.label||'저장된 명단');return true;
 }catch{return false}
}
const baseRender=render;
render=function(){baseRender();persistSeating()};
const baseConfirmImport=$('#confirm-import').onclick;
$('#confirm-import').onclick=()=>{
 if(!pending)return;
 const nextHash=pending.sourceHash;
 baseConfirmImport();hasSavedState=true;
 if(nextHash){sourceHash=nextHash;sourceUpdate=null;$('#apply-source').hidden=true;$('#source-status').textContent='기본 엑셀의 최신 명단을 적용했습니다.'}
 else $('#source-status').textContent='업로드한 명단으로 교체했습니다.';
 persistSeating();
};
async function fetchSource(manual=false){
 if(sourceBusy)return;sourceBusy=true;$('#reload-source').disabled=true;
 try{
  const url=new URL(sourceConfig.url,location.href);if(!['https:','http:'].includes(url.protocol))throw Error('명단 경로가 올바르지 않습니다.');url.searchParams.set('_updated',Date.now());
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('기본 엑셀을 불러오지 못했습니다. 현재 명단은 유지됩니다.');
  const buffer=await response.arrayBuffer();if(buffer.byteLength>10*1024*1024)throw Error('기본 엑셀은 10MB 이하여야 합니다.');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');
  const parsed=parseWorkbook(XLSX.read(buffer,{type:'array'}));
  defaultRosterHash=hash;defaultRoster=parsed;
  defaultRosterInfo={url:url.pathname+url.search.replace(/[?&]_updated=\d+/,''),bytes:buffer.byteLength,count:parsed.guests.length,hash:hash.slice(0,8)};
  const info=$('#roster-info');if(info)info.textContent='받은 파일: '+defaultRosterInfo.url+' · '+defaultRosterInfo.count+'명 · '+(defaultRosterInfo.bytes/1024).toFixed(1)+'KB · '+defaultRosterInfo.hash;
  if(!hasSavedState){guests=parsed.guests;tables=parsed.tables;selected=0;sourceHash=hash;hasSavedState=true;$('#source-label').textContent='기본 엑셀 · '+guests.length+'명';render();$('#source-status').textContent='기본 엑셀 명단을 불러왔습니다.'}
  else if(sourceHash===null){sourceHash=hash;persistSeating();$('#source-status').textContent='저장된 작업을 복원했습니다. 기본 명단도 확인했습니다.'}
  else if(hash!==sourceHash){sourceUpdate={...parsed,filename:'기본 엑셀 · '+parsed.guests.length+'명',sourceHash:hash};$('#apply-source').hidden=false;$('#source-status').textContent='기본 엑셀이 변경되었습니다. 현재 작업을 저장한 뒤 새 명단을 적용할 수 있습니다.'}
  else{sourceUpdate=null;$('#apply-source').hidden=true;if(manual)notify('기본 엑셀에 변경 사항이 없습니다.');$('#source-status').textContent='기본 엑셀 확인 완료'}
 }catch(error){$('#source-status').textContent=error.message||'기본 명단을 확인하지 못했습니다. 현재 작업은 유지됩니다.';if(manual)notify($('#source-status').textContent)}
 finally{sourceBusy=false;$('#reload-source').disabled=false}
}
$('#reload-source').onclick=()=>fetchSource(true);
$('#apply-source').onclick=()=>{if(!sourceUpdate)return;pending=sourceUpdate;$('#import-summary').textContent=`변경된 기본 명단 · 하객 ${pending.guests.length}명. 현재 명단과 배정이 엑셀 내용으로 교체됩니다.`;$('#import-dialog').showModal()};
async function initializeRoster(){
 hasSavedState=restoreSeating();baseRender();
 document.querySelectorAll('.workspace button, #import').forEach(b=>b.disabled=true);
 try{const response=await fetch('roster-config.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(response.ok){const cfg=await response.json();if(typeof cfg.url==='string'&&cfg.url)sourceConfig.url=cfg.url;if(Number.isFinite(cfg.checkIntervalMs))sourceConfig.checkIntervalMs=Math.max(30000,cfg.checkIntervalMs)}}catch{}
 sourceReady=true;
 // Keep editing disabled during the first read so a late response cannot erase work.
 document.querySelectorAll('.workspace button, #import').forEach(b=>b.disabled=true);
 await fetchSource();
 hasSavedState=true;render();$('#import').disabled=false;
 setInterval(()=>{if(!document.hidden)fetchSource()},sourceConfig.checkIntervalMs);
}
window.rosterReady=initializeRoster();
