'use strict';
// A fixed export layout keeps the entire plan legible on desktop and mobile.
async function exportSeatingImage(){
 const button=$('#export-image');button.disabled=true;button.textContent='이미지 만드는 중…';
 try{
  if(document.fonts?.ready)await document.fonts.ready;
  const snapshot=tables.map(t=>({capacity:t.capacity,seats:t.seats.slice(0,t.capacity).map(id=>guests.find(g=>g.id===id)||null)}));
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  if(!ctx)throw Error('이미지 저장을 지원하지 않는 브라우저입니다.');
  const font='Arial, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const text=(str,x,y,size=18,color='#284b46',weight='400')=>{ctx.font=`${weight} ${size}px ${font}`;ctx.fillStyle=color;ctx.fillText(String(str),x,y)};
  const wrap=(str,width)=>{ctx.font=`18px ${font}`;const lines=[];let line='';for(const char of String(str)){if(line&&ctx.measureText(line+char).width>width){lines.push(line);line=char}else line+=char}lines.push(line);return lines};
  const width=1800,height=6070;
  canvas.width=width;canvas.height=height;ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
  text('우리의 자리',60,65,34,'#204e4c','600');
  const assigned=snapshot.reduce((sum,t)=>sum+t.seats.filter(Boolean).length,0);
  text(`전체 ${guests.length}명 · 배정 ${assigned}명 · 미배정 ${guests.length-assigned}명`,60,110,20);
  text('각 테이블의 1번 좌석부터 시계 방향 · 11번 테이블은 11시, 나머지는 1시 방향에서 시작',60,150,18);
  const mapTop=180,mapHeight=5800;
  ctx.fillStyle='#fafcfb';ctx.fillRect(30,mapTop,1740,mapHeight);ctx.strokeStyle='#c6d5cb';ctx.strokeRect(30,mapTop,1740,mapHeight);
  ctx.fillStyle='#e7eeea';ctx.fillRect(450,mapTop+35,900,200);ctx.textAlign='center';text('STAGE · 신랑 / 신부',900,mapTop+150,34);
  text('신부측',450,mapTop+335,28);text('신랑측',1350,mapTop+335,28);
  ctx.fillStyle='#edf2ef';ctx.fillRect(800,mapTop+245,200,4450);
  ctx.save();ctx.translate(900,mapTop+1400);ctx.rotate(Math.PI/2);text('V I R G I N   R O A D',0,0,26,'#8a9c91');ctx.restore();
  snapshot.forEach((t,i)=>{
   const pos=HALL_LAYOUT.tables[i],x=pos.x*width/100,y=mapTop+pos.y*mapHeight/HALL_LAYOUT.height;
   ctx.beginPath();ctx.arc(x,y,70,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#aabfb1';ctx.lineWidth=2;ctx.stroke();
   text(`${i+1}`,x,y,32,'#204e4c','600');text(`${t.seats.filter(Boolean).length} / ${t.capacity}명`,x,y+30,17,'#698477');
   t.seats.forEach((g,s)=>{
    const angle=seatingAngle(i,s,t.capacity),cx=Math.cos(angle),cy=Math.sin(angle),sx=x+cx*94,sy=y+cy*94,nx=x+cx*190,ny=y+cy*190;
    ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(x+cx*137,y+cy*137);ctx.strokeStyle='#d5e0d8';ctx.lineWidth=1;ctx.stroke();
    ctx.beginPath();ctx.arc(sx,sy,8,0,Math.PI*2);ctx.fillStyle=g?'#376554':'#d7e2da';ctx.fill();
    const lines=wrap(g?g.name:'미배정',100),boxHeight=lines.length*24+24;
    ctx.fillStyle=g?'#eef4ef':'#fafcfb';ctx.fillRect(nx-55,ny-boxHeight/2,110,boxHeight);
    text(`${s+1}번`,nx,ny-boxHeight/2+17,13,'#7a8e80');
    lines.forEach((line,j)=>text(line,nx,ny-boxHeight/2+41+j*24,18,g?'#264635':'#91a096',g?'600':'400'));
   });
  });
  text('↖ ENTRANCE',1400,mapTop+mapHeight-55,23,'#718577');
  ctx.textAlign='left';text('우리의 자리 · 현재 배정 상태 기준 · 빈 좌석은 미배정으로 표시됩니다.',60,height-30,16,'#849186');
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('이미지를 생성하지 못했습니다.')),'image/png'));
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='결혼식_좌석배치도.png';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);notify('배치도 PNG 이미지를 저장했습니다.');
 }catch(error){notify(error.message||'이미지 저장에 실패했습니다. 다시 시도해 주세요.')}finally{button.disabled=false;button.textContent='▧ 배치도 이미지 저장'}
}
$('#export-image').onclick=exportSeatingImage;
