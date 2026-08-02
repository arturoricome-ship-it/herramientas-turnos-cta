const GROUP_ID='manualBackupTopActions';
const STYLE_ID='firebaseStorageJsonMenuStyles';
const TOGGLE_ID='manualBackupJsonToggle';
const MENU_ID='manualBackupJsonMenu';
let observer=null;
let frame=0;
let outsideBound=false;

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
  display:block!important;
  width:auto!important;
  height:auto!important;
  margin:0!important;
  padding:0!important;
  transform:none!important;
}
#${TOGGLE_ID}{
  appearance:none!important;
  -webkit-appearance:none!important;
  box-sizing:border-box!important;
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  min-width:48px!important;
  height:27px!important;
  margin:0!important;
  padding:0 9px!important;
  border:1px solid rgba(255,255,255,.22)!important;
  border-radius:8px!important;
  background:rgba(31,41,55,.92)!important;
  color:#f8fafc!important;
  box-shadow:0 2px 9px rgba(0,0,0,.2)!important;
  font:700 10px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
  letter-spacing:.45px!important;
  cursor:pointer!important;
  touch-action:manipulation!important;
  -webkit-tap-highlight-color:transparent!important;
  backdrop-filter:blur(8px)!important;
}
#${TOGGLE_ID}::before{
  content:'{ }';
  display:inline-block;
  margin-right:5px;
  color:#94a3b8;
  font-size:9px;
  font-weight:800;
  letter-spacing:-1px;
}
#${TOGGLE_ID}[aria-expanded="true"]{
  background:rgba(17,24,39,.98)!important;
  border-color:rgba(255,255,255,.38)!important;
}
#${TOGGLE_ID}:active{transform:scale(.96)!important}
#${TOGGLE_ID}:focus{outline:none!important}
#${TOGGLE_ID}:focus-visible{
  outline:2px solid rgba(255,255,255,.72)!important;
  outline-offset:2px!important;
}
#${MENU_ID}{
  position:absolute!important;
  top:calc(100% + 6px)!important;
  right:0!important;
  box-sizing:border-box!important;
  display:grid!important;
  gap:4px!important;
  min-width:178px!important;
  margin:0!important;
  padding:6px!important;
  border:1px solid rgba(255,255,255,.18)!important;
  border-radius:11px!important;
  background:rgba(24,32,43,.985)!important;
  color:#fff!important;
  box-shadow:0 12px 28px rgba(0,0,0,.34)!important;
  backdrop-filter:blur(12px)!important;
}
#${MENU_ID}[hidden]{display:none!important}
#${MENU_ID} .firebase-storage-action{
  appearance:none!important;
  -webkit-appearance:none!important;
  box-sizing:border-box!important;
  position:relative!important;
  display:grid!important;
  grid-template-columns:28px minmax(0,1fr)!important;
  align-items:center!important;
  justify-content:stretch!important;
  width:100%!important;
  min-width:0!important;
  max-width:none!important;
  height:38px!important;
  min-height:38px!important;
  max-height:38px!important;
  margin:0!important;
  padding:0 10px 0 7px!important;
  border:0!important;
  border-radius:8px!important;
  background:transparent!important;
  color:#f8fafc!important;
  box-shadow:none!important;
  font:600 12px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
  text-align:left!important;
  text-indent:0!important;
  cursor:pointer!important;
  transform:none!important;
  touch-action:manipulation!important;
  -webkit-tap-highlight-color:transparent!important;
}
#${MENU_ID} .firebase-storage-action:hover,
#${MENU_ID} .firebase-storage-action:focus-visible{
  background:rgba(255,255,255,.08)!important;
  outline:none!important;
}
#${MENU_ID} .firebase-storage-action:active{
  background:rgba(255,255,255,.13)!important;
  transform:scale(.985)!important;
}
#${MENU_ID} .firebase-storage-action::before{
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  width:24px!important;
  height:24px!important;
  border-radius:7px!important;
  font-size:18px!important;
  font-weight:700!important;
  line-height:1!important;
}
#${MENU_ID} .firebase-storage-action[data-json-kind="export"]::before{
  content:'↓';
  background:rgba(59,130,246,.14)!important;
  color:#60a5fa!important;
}
#${MENU_ID} .firebase-storage-action[data-json-kind="import"]::before{
  content:'↑';
  background:rgba(34,197,94,.14)!important;
  color:#4ade80!important;
}
#${MENU_ID} .firebase-storage-action svg{display:none!important}
#${MENU_ID} .firebase-storage-action::after{content:none!important;display:none!important}
@media(max-width:560px){
  #${TOGGLE_ID}{min-width:46px!important;height:26px!important;padding:0 8px!important;font-size:9.5px!important}
  #${MENU_ID}{min-width:170px!important}
}
`;
  document.head.appendChild(style);
}

function cloudScore(element){
  if(!element||element.closest(`#${GROUP_ID}`)) return -100;
  const text=elementText(element);
  if(/export|import|copia de seguridad|backup|json/.test(text)) return -100;
  let score=0;
  if(/nube|cloud/.test(text)) score+=14;
  if(/firebase/.test(text)) score+=10;
  if(/sincron/.test(text)) score+=7;
  if(/☁|🌥|🌩/.test(element.textContent||'')) score+=8;
  if(element.querySelector?.('svg')) score+=1;
  const rect=element.getBoundingClientRect?.();
  if(rect&&rect.width>0&&rect.height>0&&rect.top>=0&&rect.top<240) score+=3;
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
  const preset=button.dataset?.jsonKind||button.dataset?.backupKind;
  if(preset==='export'||preset==='import') return preset;
  const text=elementText(button);
  if(/export|descarg|guardar/.test(text)) return 'export';
  if(/import|restaur|cargar/.test(text)) return 'import';
  return index===0?'export':'import';
}

function closeMenu(){
  const toggle=document.getElementById(TOGGLE_ID);
  const menu=document.getElementById(MENU_ID);
  if(!toggle||!menu) return;
  menu.hidden=true;
  toggle.setAttribute('aria-expanded','false');
}

function prepareAction(button,index){
  const kind=buttonKind(button,index);
  button.dataset.jsonKind=kind;
  button.removeAttribute('title');
  button.removeAttribute('data-title');
  button.removeAttribute('data-tooltip');
  button.setAttribute('aria-label',kind==='export'?'Exportar copia completa':'Importar copia completa');
  button.textContent=kind==='export'?'Exportar copia':'Importar copia';
  if(button.dataset.jsonCloseBound!=='1'){
    button.dataset.jsonCloseBound='1';
    button.addEventListener('click',()=>setTimeout(closeMenu,0));
  }
}

function ensureStructure(group){
  let toggle=document.getElementById(TOGGLE_ID);
  if(!toggle){
    toggle=document.createElement('button');
    toggle.id=TOGGLE_ID;
    toggle.type='button';
    toggle.textContent='JSON';
    toggle.setAttribute('aria-label','Copia de seguridad JSON');
    toggle.setAttribute('aria-haspopup','menu');
    toggle.setAttribute('aria-expanded','false');
    group.prepend(toggle);
  }

  let menu=document.getElementById(MENU_ID);
  if(!menu){
    menu=document.createElement('div');
    menu.id=MENU_ID;
    menu.hidden=true;
    menu.setAttribute('role','menu');
    group.appendChild(menu);
  }

  const actions=Array.from(group.querySelectorAll('.firebase-storage-action,button'))
    .filter(button=>button!==toggle&&!button.closest(`#${MENU_ID}`));
  actions.forEach(button=>menu.appendChild(button));

  const menuActions=Array.from(menu.querySelectorAll('.firebase-storage-action,button'));
  menuActions.forEach(prepareAction);

  if(toggle.dataset.jsonBound!=='1'){
    toggle.dataset.jsonBound='1';
    toggle.addEventListener('click',event=>{
      event.stopPropagation();
      const open=menu.hidden;
      menu.hidden=!open;
      toggle.setAttribute('aria-expanded',String(open));
    });
  }

  if(!outsideBound){
    outsideBound=true;
    document.addEventListener('click',event=>{
      const currentGroup=document.getElementById(GROUP_ID);
      if(currentGroup?.contains(event.target)) return;
      closeMenu();
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape') closeMenu();
    });
  }
}

function fallbackPosition(group){
  group.style.setProperty('top','48px','important');
  group.style.setProperty('right','10px','important');
  group.style.removeProperty('left');
  group.style.removeProperty('bottom');
}

function alignUnderCloud(group){
  const cloud=findCloudButton();
  if(!cloud){fallbackPosition(group);return;}
  const rect=cloud.getBoundingClientRect();
  if(!rect.width||!rect.height||rect.bottom<0||rect.top>window.innerHeight){fallbackPosition(group);return;}

  const groupWidth=48;
  const left=Math.min(
    Math.max(6,Math.round(rect.left+(rect.width-groupWidth)/2)),
    Math.max(6,window.innerWidth-groupWidth-6)
  );
  const top=Math.min(Math.round(rect.bottom+6),Math.max(6,window.innerHeight-34));
  group.style.setProperty('left',`${left}px`,'important');
  group.style.setProperty('top',`${top}px`,'important');
  group.style.removeProperty('right');
  group.style.removeProperty('bottom');
}

function apply(){
  installStyles();
  const group=document.getElementById(GROUP_ID);
  if(!group) return;
  group.classList.remove('firebase-storage-actions-fixed');
  ensureStructure(group);
  alignUnderCloud(group);
}

function schedule(){
  if(frame) return;
  frame=requestAnimationFrame(()=>{
    frame=0;
    apply();
  });
}

function initialize(){
  apply();
  observer=new MutationObserver(schedule);
  observer.observe(document.body,{childList:true,subtree:true});
  addEventListener('resize',schedule,{passive:true});
  addEventListener('orientationchange',schedule,{passive:true});
  setTimeout(schedule,400);
  setTimeout(schedule,1200);
}

document.readyState==='loading'
  ?document.addEventListener('DOMContentLoaded',initialize,{once:true})
  :initialize();
