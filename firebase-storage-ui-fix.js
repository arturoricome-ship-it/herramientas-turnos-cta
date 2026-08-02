const GROUP_ID='manualBackupTopActions';
const STYLE_ID='firebaseStorageCompactActionsFix';
let observer=null;
let frame=0;

function normalize(value=''){
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase();
}

function elementText(element){
  if(!element) return '';
  return normalize([
    element.getAttribute?.('aria-label'),
    element.getAttribute?.('data-tooltip'),
    element.getAttribute?.('title'),
    element.id,
    element.className,
    element.textContent
  ].filter(Boolean).join(' '));
}

function installStyles(){
  if(document.getElementById(STYLE_ID)) return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
#${GROUP_ID}{
  position:fixed!important;
  z-index:2147483000!important;
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:5px!important;
  width:auto!important;
  height:auto!important;
  margin:0!important;
  padding:0!important;
  transform:none!important;
}
#${GROUP_ID} .firebase-storage-action{
  appearance:none!important;
  -webkit-appearance:none!important;
  box-sizing:border-box!important;
  position:relative!important;
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  flex:0 0 30px!important;
  width:30px!important;
  min-width:30px!important;
  max-width:30px!important;
  height:30px!important;
  min-height:30px!important;
  max-height:30px!important;
  margin:0!important;
  padding:0!important;
  border:1px solid rgba(255,255,255,.22)!important;
  border-radius:8px!important;
  background:rgba(31,41,55,.9)!important;
  color:#fff!important;
  box-shadow:0 2px 8px rgba(0,0,0,.18)!important;
  font-size:0!important;
  line-height:0!important;
  text-indent:0!important;
  transform:none!important;
  cursor:pointer!important;
  touch-action:manipulation!important;
  -webkit-tap-highlight-color:transparent!important;
  backdrop-filter:blur(8px)!important;
}
#${GROUP_ID} .firebase-storage-action svg{
  display:block!important;
  width:16px!important;
  height:16px!important;
  min-width:16px!important;
  max-width:16px!important;
  min-height:16px!important;
  max-height:16px!important;
  margin:0!important;
  pointer-events:none!important;
  stroke-width:1.9!important;
}
#${GROUP_ID} .firebase-storage-action::after{
  content:none!important;
  display:none!important;
}
#${GROUP_ID} .firebase-storage-action:active{
  transform:scale(.94)!important;
  background:rgba(17,24,39,.98)!important;
}
#${GROUP_ID} .firebase-storage-action:focus{
  outline:none!important;
}
#${GROUP_ID} .firebase-storage-action:focus-visible{
  outline:2px solid rgba(255,255,255,.7)!important;
  outline-offset:2px!important;
}
@media (hover:hover) and (pointer:fine){
  #${GROUP_ID} .firebase-storage-action:hover{
    background:rgba(17,24,39,.98)!important;
    border-color:rgba(255,255,255,.4)!important;
  }
  #${GROUP_ID} .firebase-storage-action:hover::after,
  #${GROUP_ID} .firebase-storage-action:focus-visible::after{
    content:attr(data-tooltip)!important;
    display:block!important;
    position:absolute!important;
    top:calc(100% + 6px)!important;
    left:50%!important;
    z-index:2147483647!important;
    width:max-content!important;
    max-width:120px!important;
    height:auto!important;
    padding:4px 6px!important;
    border:0!important;
    border-radius:5px!important;
    background:#111827!important;
    color:#fff!important;
    box-shadow:0 4px 10px rgba(0,0,0,.22)!important;
    font-size:10px!important;
    font-weight:500!important;
    line-height:1.2!important;
    text-indent:0!important;
    white-space:nowrap!important;
    transform:translateX(-50%)!important;
    pointer-events:none!important;
  }
}
@media (hover:none), (pointer:coarse), (max-width:700px){
  #${GROUP_ID} .firebase-storage-action::after{
    content:none!important;
    display:none!important;
  }
}
`;
  document.head.appendChild(style);
}

function cloudScore(element){
  if(!element||element.closest(`#${GROUP_ID}`)) return -100;
  const text=elementText(element);
  if(/export|import|copia de seguridad|backup/.test(text)) return -100;
  let score=0;
  if(/nube|cloud/.test(text)) score+=14;
  if(/firebase/.test(text)) score+=10;
  if(/sincron/.test(text)) score+=7;
  if(/☁|🌥|🌩/.test(element.textContent||'')) score+=8;
  if(element.querySelector?.('svg')) score+=1;
  const rect=element.getBoundingClientRect?.();
  if(rect&&rect.width>0&&rect.height>0&&rect.top>=0&&rect.top<220) score+=3;
  return score;
}

function findCloudButton(){
  const candidates=Array.from(document.querySelectorAll('button,a,[role=button],summary'));
  const ranked=candidates
    .map(element=>({element,score:cloudScore(element)}))
    .sort((a,b)=>b.score-a.score);
  return ranked[0]?.score>=7?ranked[0].element:null;
}

function buttonKind(button,index){
  const text=elementText(button);
  if(/export|descarg|guardar/.test(text)) return 'export';
  if(/import|restaur|cargar/.test(text)) return 'import';
  return index===0?'export':'import';
}

function cleanButtons(group){
  const buttons=Array.from(group.querySelectorAll('.firebase-storage-action,button'));
  buttons.forEach((button,index)=>{
    const kind=buttonKind(button,index);
    const label=kind==='export'?'Exportar copia completa':'Importar copia completa';
    button.removeAttribute('title');
    button.removeAttribute('data-title');
    button.setAttribute('aria-label',label);
    button.setAttribute('data-tooltip',kind==='export'?'Exportar':'Importar');
    button.setAttribute('type','button');
    button.blur?.();
  });
}

function fallbackPosition(group){
  const top=Math.max(8,Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top'))||8);
  group.style.setProperty('top',`${top}px`,'important');
  group.style.setProperty('right','58px','important');
  group.style.removeProperty('left');
  group.style.removeProperty('bottom');
}

function alignWithCloud(group){
  const cloud=findCloudButton();
  if(!cloud){
    fallbackPosition(group);
    return;
  }
  const rect=cloud.getBoundingClientRect();
  if(!rect.width||!rect.height||rect.bottom<0||rect.top>window.innerHeight){
    fallbackPosition(group);
    return;
  }
  const buttonHeight=30;
  const gap=6;
  const top=Math.max(6,Math.round(rect.top+(rect.height-buttonHeight)/2));
  const right=Math.max(6,Math.round(window.innerWidth-rect.left+gap));
  group.style.setProperty('top',`${top}px`,'important');
  group.style.setProperty('right',`${right}px`,'important');
  group.style.removeProperty('left');
  group.style.removeProperty('bottom');
}

function apply(){
  installStyles();
  const group=document.getElementById(GROUP_ID);
  if(!group) return;
  group.classList.remove('firebase-storage-actions-fixed');
  cleanButtons(group);
  alignWithCloud(group);
}

function schedule(){
  if(frame) cancelAnimationFrame(frame);
  frame=requestAnimationFrame(()=>{
    frame=0;
    apply();
  });
}

function initialize(){
  apply();
  observer=new MutationObserver(schedule);
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','title','data-tooltip']});
  addEventListener('resize',schedule,{passive:true});
  addEventListener('orientationchange',schedule,{passive:true});
  addEventListener('scroll',schedule,{passive:true});
  setTimeout(schedule,500);
  setTimeout(schedule,1500);
}

document.readyState==='loading'
  ?document.addEventListener('DOMContentLoaded',initialize,{once:true})
  :initialize();
