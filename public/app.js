
(function(){const root=document.getElementById('glass-luck-preview');
function initGlassScene(canvas){
 const gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false,powerPreference:'low-power',preserveDrawingBuffer:true});
 if(!gl)throw Error('Для стеклянных кубиков нужен WebGL');
 function compile(type,src){const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;}
 const fragment=`precision highp float;
 uniform vec2 resolution;uniform float time;uniform float phase;uniform float chosen;uniform float still;uniform float breakAll;uniform float focus;
 mat3 ry(float a){float c=cos(a),s=sin(a);return mat3(c,0.,s,0.,1.,0.,-s,0.,c);}
 mat3 rx(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,-s,0.,s,c);}
 float cube(vec3 p){vec3 q=abs(p)-vec3(.43);return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-.105;}
 vec3 local(vec3 p,float id){float shift=(id-1.)*1.82;float isChosen=1.-step(.1,abs(id-chosen));p.x-=shift*(1.-phase*isChosen);p.y-=sin(time*.32+id*1.8)*.018*(1.-still);float a=.52+(id-1.)*.09+time*.32*(1.-still)+phase*isChosen*.26;return ry(a)*rx(.38+sin(time*.25+id)*.045*(1.-still))*p;}
 float map(vec3 p){float d=99.;for(int i=0;i<3;i++){float id=float(i);float selected=1.-step(.1,abs(id-chosen));float turn=.52+(id-1.)*.09+time*.32*(1.-still)+phase*selected*.26;float fit=1.30/(sqrt(cos(turn)*cos(turn)+.015)+sqrt(sin(turn)*sin(turn)+.015));float size=1.25*fit*(1.-phase*(1.-selected)*.98);float v=cube(local(p,id)/max(.02,size))*size;d=min(d,v);}return d;}
 vec3 normal(vec3 p){vec2 e=vec2(.002,0.);return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));}
 vec3 environment(vec3 d){
  vec3 col=vec3(.012,.009,.014);
  float panel=pow(max(0.,dot(d,normalize(vec3(-1.6,2.3,3.1)))),36.);
  float strip=pow(max(0.,dot(d,normalize(vec3(2.5,.7,1.4)))),58.);
  float soft=pow(max(0.,dot(d,normalize(vec3(-2.,.1,2.)))),12.);
  col+=vec3(.92,.88,.91)*panel*.9+vec3(.66,.57,.62)*strip*.8+vec3(.19,.12,.16)*soft;
  float windowA=pow(max(0.,dot(d,normalize(vec3(.82,.12,.56)))),9.);
  float windowB=pow(max(0.,dot(d,normalize(vec3(-.72,.55,.42)))),13.);
  col+=vec3(.72,.63,.68)*windowA*.48+vec3(.62,.55,.60)*windowB*.48;
  col+=vec3(.22,.017,.058)*pow(max(0.,-d.y),2.);
  return col;
 }
 void main(){
  vec2 uv=(gl_FragCoord.xy/resolution*2.-1.);float aspect=resolution.x/resolution.y;uv.y-=.30;
  vec3 ro=vec3(uv.x*2.75,uv.y*2.75/aspect,5.0),rd=vec3(0.,0.,-1.);
  float distance=0.;bool hit=false;vec3 p;
  for(int i=0;i<55;i++){p=ro+rd*distance;float d=map(p);if(d<.0018){hit=true;break;}distance+=max(d,.003);if(distance>8.)break;}
  if(!hit){gl_FragColor=vec4(0.);return;}
  vec3 n=normal(p),reflection=reflect(rd,n),refraction=refract(rd,n,1./1.47);
  float facing=max(.0,dot(-rd,n)),fresnel=.035+.965*pow(1.-facing,5.);
  float insideLength=.025;vec3 back=p;
  for(int j=0;j<24;j++){back=p+refraction*insideLength;float backDistance=map(back);if(backDistance>0.)break;insideLength+=max(.006,abs(backDistance));}
  vec3 backNormal=normal(back);vec3 exitRay=refract(refraction,-backNormal,1.47);
  float thickness=max(.08,insideLength);
  vec3 tint=exp(-vec3(.47,3.2,2.24)*thickness);
  vec3 transmitted=(environment(exitRay)*.8+environment(reflect(refraction,-backNormal))*.28+vec3(.24,.026,.065))*tint;
  vec3 reflected=environment(reflection);
  float edge=pow(1.-facing,2.5);
  float topLight=pow(max(0.,dot(n,normalize(vec3(-.6,1.2,1.8)))),70.);
  float rimLight=pow(max(0.,dot(n,normalize(vec3(1.,-.5,.4)))),18.);
  vec3 color=transmitted*(1.-fresnel)+reflected*(.22+fresnel*.78);
  color+=vec3(.52,.045,.13)*rimLight*.35+vec3(.9,.79,.83)*topLight*.48;
  color+=vec3(.23,.075,.12)*edge*.28;
  color+=vec3(.10,.017,.04)*(max(n.y,0.)*.65+max(-n.x,0.)*.23);
  // Soft reflections of studio strips are refracted into the thick rounded edges.
  float band=exp(-pow((p.y+.3*p.x+.05*sin(time*.3)-.22)/.13,2.));
  color+=vec3(.16,.12,.15)*band*pow(facing,4.)*.45;
  float selectedSurface=1.-step(.91,abs(p.x-(chosen-1.)*1.82));
  color+=selectedSurface*focus*(vec3(.12,.035,.065)+color*.4);
  color=pow(color,vec3(.78));float alpha=(1.-smoothstep(.78,1.,phase))*(1.-breakAll);
  gl_FragColor=vec4(color,alpha);
 }`;
 const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,'attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}'));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
 const loc={};for(const k of ['resolution','time','phase','chosen','still','breakAll','focus'])loc[k]=gl.getUniformLocation(program,k);
 return {resize(w,h){const ratio=Math.min(devicePixelRatio||1,1.2);canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));gl.viewport(0,0,canvas.width,canvas.height);},draw(t,phase=0,chosen=1,breakAll=0,focus=0){if(breakAll===1||phase===1){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);return;}gl.uniform2f(loc.resolution,canvas.width,canvas.height);gl.uniform1f(loc.time,t);gl.uniform1f(loc.phase,phase);gl.uniform1f(loc.chosen,chosen);gl.uniform1f(loc.still,reduced.matches?1:0);gl.uniform1f(loc.breakAll,breakAll);gl.uniform1f(loc.focus,focus);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.SCISSOR_TEST);const crop=Math.ceil(canvas.width*.52),bottom=Math.floor(canvas.height*.65-crop/2);gl.scissor(0,Math.max(0,bottom),canvas.width,Math.min(crop,canvas.height-Math.max(0,bottom)));gl.drawArrays(gl.TRIANGLES,0,6);gl.disable(gl.SCISSOR_TEST);},gl};
}

const $=id=>root.querySelector('#'+id),reduced=matchMedia('(prefers-reduced-motion: reduce)');
let game={cursor:0,total:0,canOpen:false,complete:false,last:null},ready=false,view='home',current=null,rolling=false,requesting=false,rollStart=0,selected=1,raf=0,last=0;
function positionHalo(){const appRect=$('app').getBoundingClientRect(),sceneRect=$('scene').getBoundingClientRect();const cardRect=$('prizeCard').getBoundingClientRect();const top=(view==='home'?sceneRect.top-appRect.top+sceneRect.height*.59:cardRect.bottom-appRect.top+42);$('app').style.setProperty('--halo-top',top+'px');}
function resize(){const r=$('scene').getBoundingClientRect();renderer.resize(r.width,r.height);positionHalo();render(performance.now());}
const fracturePieces=[];let fractureTime=0,particleCanvas=null,particleContext=null,particlesReady=false,particleWidth=0,particleHeight=0;
function clearFracture(){fracturePieces.length=0;if(particleCanvas)particleCanvas.remove();particleCanvas=null;particleContext=null;particlesReady=false;$('glassWorld').style.opacity='1';}
function smooth(a,b,x){const v=Math.max(0,Math.min(1,(x-a)/(b-a)));return v*v*(3-2*v);}
function prepareFracture(snapshotTime){
 clearFracture();if(reduced.matches)return;
 const canvas=$('glassWorld'),rect=$('scene').getBoundingClientRect();fractureTime=snapshotTime??performance.now()*.001;
 renderer.draw(fractureTime,0,selected,0,.85);
 if(!renderer.gl){particlesReady=true;return;}
 const gl=renderer.gl,w=canvas.width,h=canvas.height,pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
 particleCanvas=document.createElement('canvas');particleCanvas.className='particle-field';particleCanvas.setAttribute('aria-hidden','true');
 const ratio=Math.min(devicePixelRatio||1,2);particleCanvas.width=Math.round(rect.width*ratio);particleCanvas.height=Math.round(rect.height*ratio);
 Object.assign(particleCanvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});$('shards').appendChild(particleCanvas);particleContext=particleCanvas.getContext('2d');particleContext.scale(ratio,ratio);particleWidth=rect.width;particleHeight=rect.height;
 const step=3.4,sx=w/rect.width,sy=h/rect.height;
 for(let y=0;y<rect.height;y+=step)for(let x=0;x<rect.width;x+=step){
  const px=Math.min(w-1,Math.floor(x*sx)),py=Math.min(h-1,Math.floor((rect.height-y)*sy)),i=(py*w+px)*4;
  if(pixels[i+3]<80)continue;
  const cube=Math.max(0,Math.min(2,Math.floor(x/rect.width*3))),cx=rect.width*(.5+(cube-1)*1.82/5.5);
  fracturePieces.push({cube,x:x+(Math.random()-.5)*1.6,y:y+(Math.random()-.5)*1.6,dx:(x-cx)*.8+(Math.random()-.5)*90,dy:-45-Math.random()*95,r:.65+Math.random()*.65,phase:Math.random()*Math.PI*2,delay:(cube===selected?0:.025)+Math.random()*.10,color:`rgb(${Math.min(235,pixels[i]*1.35+22)},${Math.min(170,pixels[i+1]*1.15+12)},${Math.min(190,pixels[i+2]*1.2+19)})`});
 }
 particlesReady=true;animateFracture(0);
}
function animateFracture(progress){
 if(!particleContext)return;particleContext.clearRect(0,0,particleWidth,particleHeight);
 $('glassWorld').style.opacity=String(1-smooth(.015,.22,progress));
 for(const p of fracturePieces){
  const v=Math.max(0,Math.min(1,(progress-p.delay)/.88)),drift=v*v*v*(v*(v*6-15)+10),fade=smooth(0,.16,progress)*(1-smooth(.38,1,v));
  if(fade<.002)continue;
  const x=p.x+p.dx*drift+Math.sin(v*3+p.phase)*12*drift,y=p.y+p.dy*drift+Math.cos(v*2+p.phase)*9*drift;
  particleContext.globalAlpha=fade*.88;particleContext.fillStyle=p.color;particleContext.beginPath();particleContext.arc(x,y,p.r*(1-.45*smooth(.5,1,v)),0,Math.PI*2);particleContext.fill();
 }
 particleContext.globalAlpha=1;
}
function render(now){
 const t=reduced.matches?0:now*.001;let progress=0;
 const elapsed=now-rollStart;
 if(view==='roll')progress=reduced.matches?1:Math.max(0,Math.min(1,(elapsed-420)/3100));
 if(view==='home')renderer.draw(t,0,selected,0);
 else if(view==='roll'&&reduced.matches)renderer.draw(fractureTime,0,selected,1);
 else if(view==='roll'&&!particlesReady){const focus=smooth(0,330,elapsed),u=Math.min(1,Math.max(0,elapsed/420)),rotationTime=rollStart*.001+.14*(1-Math.pow(1-u,3));renderer.draw(rotationTime,0,selected,0,focus*.85);if(elapsed>=420)prepareFracture(rotationTime);}
 else if(view!=='roll')renderer.draw(t,1,selected,1);
 animateFracture(progress);
 if(view==='roll'&&progress>.65){$('prizeCard').classList.add('visible');positionHalo();}
 if(view==='roll'&&progress===1){view='result';rolling=false;$('app').dataset.view=view;$('prizeCard').classList.add('visible');clearFracture();resize();positionHalo();}
}

function loop(now){raf=0;if(document.hidden)return;render(now);last=now;if((!reduced.matches&&view==='home')||view==='roll')raf=requestAnimationFrame(loop);}
function start(){if(!raf)raf=requestAnimationFrame(loop);}
function showStatus(message,retry=false){$('statusText').textContent=message;$('status').hidden=!message;$('retry').hidden=!retry;}
function home(){clearFracture();view=game.canOpen?'home':'locked';rolling=false;$('app').dataset.view=view;$('greeting').textContent=view==='home'?'Бусенька':'Твой подарок';$('daily').textContent=game.complete?'Все подарки открыты':game.canOpen?'Новый выбор каждый день':'Новый выбор завтра';$('amount').textContent=view==='locked'?(game.last?.label||''):'';$('amount').classList.toggle('tease',game.last?.amount===0);$('prizeCard').classList.toggle('visible',view==='locked'&&!!game.last);$('prizeCard').setAttribute('aria-hidden',view==='locked'&&game.last?'false':'true');for(const b of root.querySelectorAll('.cube-button'))b.disabled=!ready||requesting||!game.canOpen;resize();start();}
function reveal(prize,index){current=prize;selected=index;view='roll';rolling=true;rollStart=performance.now();$('app').dataset.view=view;$('greeting').textContent='Твой подарок';$('daily').textContent=game.complete?'Все подарки открыты':prize.kind==='tease'?'Завтра — новый выбор':'Для Бусеньки';$('amount').textContent=prize.kind==='tease'?'Фигушка!':prize.amount.toLocaleString('ru-RU')+' ₽';$('amount').classList.toggle('tease',prize.kind==='tease');$('prizeCard').classList.remove('visible');$('prizeCard').setAttribute('aria-hidden','false');clearFracture();resize();rollStart=performance.now();start();}
function initData(){return window.Telegram?.WebApp?.initData||new URLSearchParams(location.hash.slice(1)).get('tgWebAppData')||'';}
async function api(path,body){const response=await fetch(path,{method:body?'POST':'GET',headers:{'X-Telegram-Init-Data':initData(),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000),cache:'no-store'});const data=await response.json();if(!response.ok){const e=new Error(data.message||'Не удалось загрузить подарок.');e.code=data.error;throw e;}return data;}
function pending(){try{return JSON.parse(sessionStorage.getItem('busenka.pending')||'null');}catch{return null;}}
function savePending(value){try{if(value)sessionStorage.setItem('busenka.pending',JSON.stringify(value));else sessionStorage.removeItem('busenka.pending');}catch{}}
async function loadState(){if(rolling||requesting)return;try{game=await api('/api/state');ready=true;$('app').dataset.demo=String(game.demo);$('app').dataset.loading='false';if(game.last?.day===game.today||game.complete)savePending(null);showStatus('');home();}catch(e){ready=false;for(const b of root.querySelectorAll('.cube-button'))b.disabled=true;showStatus(e.message==='Failed to fetch'?'Нет соединения. Проверь интернет и попробуй ещё раз.':e.message,true);}}
for(const b of root.querySelectorAll('.cube-button')){b.disabled=true;b.onclick=async()=>{if(!ready||requesting||rolling||!game.canOpen)return;requesting=true;for(const button of root.querySelectorAll('.cube-button'))button.disabled=true;const old=pending(),request=old?.day===game.today?old:{requestId:crypto.randomUUID(),cube:+b.dataset.index,day:game.today};savePending(request);showStatus('Сохраняю твой подарок…');try{const result=await api('/api/claim',{requestId:request.requestId,cube:request.cube});game={...game,...result.state};savePending(null);requesting=false;showStatus('');reveal(result.prize,request.cube);}catch(e){requesting=false;if(e.code==='ALREADY_OPENED'||e.code==='COMPLETE'){await loadState();}else{showStatus(e.code?e.message:'Не удалось получить ответ. Нажми ещё раз — подарок не потеряется.',true);for(const button of root.querySelectorAll('.cube-button'))button.disabled=!ready||!game.canOpen;}}};}
$('retry').onclick=()=>loadState();
$('done').onclick=()=>{if(rolling)return;home();};
let opener=null;
function open(id,button){opener=button;const overlay=$(id),panel=overlay.querySelector('.popup');overlay.getAnimations().forEach(a=>a.cancel());panel.getAnimations().forEach(a=>a.cancel());overlay.classList.remove('closing');overlay.hidden=false;$('app').inert=true;if(!reduced.matches){overlay.animate([{opacity:0},{opacity:1}],{duration:480,easing:'ease-out'});panel.animate([{opacity:0,transform:'translateY(20px) scale(.97)'},{opacity:1,transform:'none'}],{duration:620,easing:'cubic-bezier(.16,1,.3,1)'});}overlay.querySelector('button').focus();}
function close(id){const overlay=$(id),panel=overlay.querySelector('.popup');overlay.getAnimations().forEach(a=>a.cancel());panel.getAnimations().forEach(a=>a.cancel());$('app').inert=false;if(opener)opener.focus({preventScroll:true});if(reduced.matches){overlay.hidden=true;return;}overlay.classList.add('closing');panel.animate([{transform:'none'},{transform:'translateY(12px) scale(.985)'}],{duration:300,easing:'ease-in-out'});const fade=overlay.animate([{opacity:1},{opacity:0}],{duration:300,easing:'ease-in-out'});fade.onfinish=()=>{overlay.hidden=true;overlay.classList.remove('closing');};}
$('optionsBtn').onclick=()=>open('optionsOverlay',$('optionsBtn'));$('optionsClose').onclick=()=>close('optionsOverlay');
for(const id of ['optionsOverlay']){$(id).addEventListener('click',e=>{if(e.target===$(id))close(id)});$(id).addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close(id);return;}if(e.key==='Tab'){const all=[...$(id).querySelectorAll('button')];if(e.shiftKey&&document.activeElement===all[0]){e.preventDefault();all.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===all.at(-1)){e.preventDefault();all[0].focus();}}});}
let renderer;
try{renderer=initGlassScene($('glassWorld'));}catch{ $('app').classList.add('no-webgl');renderer={resize(){},draw(){},gl:null};}
new ResizeObserver(resize).observe($('scene'));$('app').dataset.loading='true';resize();start();
async function boot(){for(let i=0;i<12&&!window.Telegram?.WebApp&&!initData();i++)await new Promise(r=>setTimeout(r,125));const tg=window.Telegram?.WebApp;try{tg?.ready();tg?.expand();tg?.setHeaderColor('#030204');tg?.setBackgroundColor('#030204');}catch{}await loadState();}
void boot();
setInterval(()=>{if(!document.hidden&&!rolling&&!requesting)void loadState();},60000);
document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(raf);raf=0;if(!document.hidden){start();if(ready&&!rolling&&!requesting)void loadState();}});reduced.addEventListener('change',()=>{cancelAnimationFrame(raf);raf=0;render(performance.now());start();});
$('glassWorld').addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(raf);raf=0;});$('glassWorld').addEventListener('webglcontextrestored',()=>{renderer=initGlassScene($('glassWorld'));resize();start();});
root.diagnostics=()=>({view,ready,cursor:game.cursor,total:game.total,fragments:fracturePieces.length,fragmentCubes:[...new Set(fracturePieces.map(p=>p.cube))]});

})();
