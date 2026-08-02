let statusState={message:'preparando sincronización…',type:''};
let changeState=null;
let observer=null;
let installQueued=false;
const originalActions={export:null,import:null};

const IDS={
  style:'storageSyncStylesV2',
  actions:'manualBackupTopActions',
  vault:'manualBackupActionVault',
  details:'firebaseStorageDetailsPanel',
  popover:'firebaseStorageDetailsPopover'
};

function normalize(value=''){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
}
function textOf(element){
  if(!element) return '';
  return normalize([
    element.getAttribute?.('aria-label'),element.getAttribute?.('title'),element.getAttribute?.('data-tooltip'),
    element.getAttribute?.('name'),element.id,element.className,element.value,element.textContent
  ].filter(Boolean).join(' '));
}
function styles(){
  if(document.getElementById(IDS.style)) return;
  const style=document.createElement('style');
  style.id=IDS.style;
  style.textContent=`
#${IDS.actions}{display:inline-flex;align-items:center;gap:5px;z-index:2147483000}
#${IDS.actions}.firebase-storage-actions-fixed{position:fixed;top:11px;right:68px}
#${IDS.actions} .firebase-storage-action{position:relative;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;min-width:34px;margin:0;padding:0;border:1px solid rgba(255,255,255,.22);border-radius:9px;background:rgba(31,41,55,.92);color:#fff;box-shadow:0 3px 12px rgba(0,0,0,.18);cursor:pointer;backdrop-filter:blur(8px)}
#${IDS.actions} .firebase-storage-action:hover,#${IDS.actions} .firebase-storage-action:focus-visible{background:rgba(17,24,39,.98);transform:translateY(-1px);outline:2px solid rgba(255,255,255,.5);outline-offset:1px}
#${IDS.actions} .firebase-storage-action svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
#${IDS.actions} .firebase-storage-action::after{content:attr(data-tooltip);position:absolute;top:calc(100% + 7px);left:50%;transform:translateX(-50%) translateY(-2px);display:none;padding:5px 7px;border-radius:6px;background:#111827;color:#fff;font-size:11px;line-height:1;white-space:nowrap;box-shadow:0 5px 15px rgba(0,0,0,.24);pointer-events:none}
#${IDS.actions} .firebase-storage-action:hover::after,#${IDS.actions} .firebase-storage-action:focus-visible::after{display:block;transform:translateX(-50%) translateY(0)}
#${IDS.vault}{position:fixed!important;left:-10000px!important;top:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important}
[data-firebase-storage-manual-backup-hidden=true]{display:none!important}
#firebaseStorageStatus{box-sizing:border-box;max-width:100%;margin-top:7px;font-size:12px;line-height:1.3;overflow-wrap:anywhere}
#${IDS.details},#${IDS.popover}{box-sizing:border-box;color:inherit;font-size:12px;line-height:1.35;overflow-wrap:anywhere}
#${IDS.details}{margin-top:8px;padding-top:8px;border-top:1px solid rgba(127,127,127,.3)}
.firebase-storage-detail-title{margin:0 0 7px;font-size:12px;font-weight:750}
.firebase-storage-detail-summary{margin:0 0 8px;font-size:12px;font-weight:650}
.firebase-storage-detail-grid{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 9px;margin:0}
.firebase-storage-detail-grid dt{margin:0;opacity:.68}
.firebase-storage-detail-grid dd{margin:0;font-weight:600}
.firebase-storage-no-change{margin:0;opacity:.78}
#${IDS.popover}{position:fixed;z-index:2147483646;width:min(340px,calc(100vw - 24px));padding:13px;border:1px solid rgba(255,255,255,.18);border-radius:12px;background:rgba(31,41,55,.98);color:#fff;box-shadow:0 14px 38px rgba(0,0,0,.32);backdrop-filter:blur(10px)}
#${IDS.popover}[hidden]{display:none!important}
@media(max-width:560px){#${IDS.actions}.firebase-storage-actions-fixed{top:9px;right:52px}#${IDS.actions} .firebase-storage-action{width:32px;height:32px;min-width:32px}}
`;
  document.head.appendChild(style);
}
function dateText(change){
  const raw=change?.atClient||change?.updatedAtClient||change?.date||change?.updatedAtMs;
  if(!raw) return 'Sin hora registrada';
  const date=new Date(raw);
  if(Number.isNaN(date.getTime())) return 'Sin hora registrada';
  try{
    return date.toLocaleString('es-ES',{
      timeZone:'Europe/Madrid',day:'2-digit',month:'2-digit',year:'numeric',
      hour:'2-digit',minute:'2-digit',second:'2-digit'
    });
  }catch(_){return date.toLocaleString('es-ES');}
}
function actionText(change){
  const type=normalize(change?.type);
  if(type==='import'||/import/.test(type)) return 'Importación';
  if(type==='delete'||/borr|elimin/.test(type)) return 'Eliminación';
  if(type==='update'||/actual/.test(type)) return 'Actualización';
  return 'Sincronización';
}
function subjectText(change){
  if(change?.fileName&&change?.module) return `${change.fileName} · ${change.module}`;
  return change?.fileName||change?.module||'Datos de la aplicación';
}
function deviceText(change){
  const label=change?.deviceLabel||'Dispositivo sin identificar';
  return change?.ownDevice?`${label} (este dispositivo)`:`${label} (otro dispositivo)`;
}
function renderStatus(element=document.getElementById('firebaseStorageStatus')){
  if(!element) return;
  const text=`Archivos: ${statusState.message}`;
  if(element.textContent!==text) element.textContent=text;
  element.dataset.state=statusState.type;
  element.style.color=statusState.type==='error'?'#fecaca':statusState.type==='work'?'#fde68a':statusState.type==='ok'?'#bbf7d0':'';
}
function renderChange(element){
  if(!element) return;
  const signature=JSON.stringify(changeState||null);
  if(element.dataset.signature===signature) return;
  element.dataset.signature=signature;
  element.replaceChildren();
  const title=document.createElement('div');
  title.className='firebase-storage-detail-title';
  title.textContent='Último cambio sincronizado';
  element.appendChild(title);
  if(!changeState?.text){
    const empty=document.createElement('p');
    empty.className='firebase-storage-no-change';
    empty.textContent='Todavía no hay ningún cambio sincronizado registrado.';
    element.appendChild(empty);
    return;
  }
  const summary=document.createElement('p');
  summary.className='firebase-storage-detail-summary';
  summary.textContent=changeState.text;
  const grid=document.createElement('dl');
  grid.className='firebase-storage-detail-grid';
  const rows=[
    ['Acción',actionText(changeState)],
    ['Archivo / módulo',subjectText(changeState)],
    ['Dispositivo',deviceText(changeState)],
    ['Fecha y hora',dateText(changeState)]
  ];
  for(const [label,value] of rows){
    const dt=document.createElement('dt');dt.textContent=label;
    const dd=document.createElement('dd');dd.textContent=value;
    grid.append(dt,dd);
  }
  element.append(summary,grid);
}
function ensureCloudDetails(){
  styles();
  const general=document.getElementById('firebaseStatus');
  if(!general) return false;
  let status=document.getElementById('firebaseStorageStatus');
  if(!status){
    status=document.createElement('div');
    status.id='firebaseStorageStatus';
    general.insertAdjacentElement('afterend',status);
  }
  let details=document.getElementById(IDS.details);
  if(!details){
    details=document.createElement('section');
    details.id=IDS.details;
    details.setAttribute('aria-live','polite');
    status.insertAdjacentElement('afterend',details);
  }
  renderStatus(status);
  renderChange(details);
  return true;
}
function cloudScore(element){
  const text=textOf(element);
  if(/export|import|copia de seguridad|backup/.test(text)) return -100;
  let score=0;
  if(/nube/.test(text)) score+=12;
  if(/cloud/.test(text)) score+=12;
  if(/firebase/.test(text)) score+=9;
  if(/sincron/.test(text)) score+=6;
  if(/☁|🌥|🌩/.test(element.textContent||'')) score+=8;
  if(/cloud|firebase|nube/.test(normalize(`${element.id} ${element.className}`))) score+=7;
  if(element.querySelector?.('svg')) score+=1;
  const rect=element.getBoundingClientRect?.();
  if(rect&&rect.top>=0&&rect.top<150) score+=2;
  return score;
}
function findCloudTrigger(){
  const candidates=Array.from(document.querySelectorAll('button,a,[role=button],summary'))
    .filter(element=>!element.closest(`#${IDS.actions},#${IDS.popover},#${IDS.vault}`));
  const ranked=candidates.map(element=>({element,score:cloudScore(element)})).sort((a,b)=>b.score-a.score);
  return ranked[0]?.score>=6?ranked[0].element:null;
}
function ensurePopover(){
  let popover=document.getElementById(IDS.popover);
  if(!popover){
    popover=document.createElement('section');
    popover.id=IDS.popover;
    popover.hidden=true;
    popover.setAttribute('role','dialog');
    popover.setAttribute('aria-label','Detalles de sincronización de archivos');
    document.body.appendChild(popover);
  }
  renderChange(popover);
  return popover;
}
function positionPopover(popover,trigger){
  const rect=trigger.getBoundingClientRect();
  const width=Math.min(340,window.innerWidth-24);
  const left=Math.min(Math.max(12,rect.right-width),window.innerWidth-width-12);
  const below=rect.bottom+8;
  const top=below+220<window.innerHeight?below:Math.max(12,rect.top-228);
  Object.assign(popover.style,{left:`${left}px`,top:`${top}px`});
}
function bindCloudFallback(){
  if(ensureCloudDetails()) return;
  const trigger=findCloudTrigger();
  if(!trigger||trigger.dataset.firebaseStorageDetailsBound==='1') return;
  trigger.dataset.firebaseStorageDetailsBound='1';
  trigger.addEventListener('click',()=>{
    const popover=ensurePopover();
    const opening=popover.hidden;
    document.querySelectorAll(`#${IDS.popover}`).forEach(node=>node.hidden=true);
    popover.hidden=!opening;
    if(opening) positionPopover(popover,trigger);
  });
}
function vault(){
  let element=document.getElementById(IDS.vault);
  if(!element){
    element=document.createElement('div');
    element.id=IDS.vault;
    element.setAttribute('aria-hidden','true');
    document.body.appendChild(element);
  }
  return element;
}
function backupKind(element){
  if(!element||element.closest(`#${IDS.actions}`)) return '';
  const preset=element.dataset?.backupKind;
  if(preset==='export'||preset==='import') return preset;
  const text=textOf(element);
  const complete=/complet|copia.{0,18}seguridad|backup|todos?.{0,12}datos/.test(text);
  if(!complete) return '';
  if(/export|descarg|guardar/.test(text)) return 'export';
  if(/import|restaur|cargar/.test(text)) return 'import';
  return '';
}
function safeHide(element){
  if(!element||[document.documentElement,document.body].includes(element)) return;
  if(/^(MAIN|HEADER|NAV)$/.test(element.tagName)) return;
  element.dataset.firebaseStorageManualBackupHidden='true';
}
function oldWrapperFor(element){
  let node=element?.parentElement;
  for(let depth=0;node&&depth<6;depth++,node=node.parentElement){
    if([document.body,document.documentElement].includes(node)||/^(MAIN|HEADER|NAV)$/.test(node.tagName)) break;
    const text=textOf(node);
    if(node.tagName==='DETAILS'||/copia de seguridad manual|copia manual|backup manual/.test(text)) return node;
  }
  return null;
}
function stashAction(element,kind){
  if(!element||!kind) return;
  if(!originalActions[kind]) originalActions[kind]=element;
  if(element.tagName==='LABEL'&&element.htmlFor){
    const input=document.getElementById(element.htmlFor);
    if(input&&input.parentElement!==element) vault().appendChild(input);
  }
  vault().appendChild(element);
}
function hideLegacyBackupUi(){
  const previousMenu=document.getElementById('manualBackupMenu');
  if(previousMenu){
    for(const element of previousMenu.querySelectorAll('button,a,label,input[type=file],input[type=button],input[type=submit],[role=button]')){
      const kind=backupKind(element);
      if(kind) stashAction(element,kind);
    }
    previousMenu.remove();
  }
  document.getElementById('manualBackupMenuToggle')?.remove();
  document.getElementById('manualBackupCompactMenu')?.remove();
  document.getElementById('manualBackupCompactButton')?.remove();

  const candidates=Array.from(document.querySelectorAll('button,a,label,input[type=file],input[type=button],input[type=submit],[role=button]'))
    .filter(element=>!element.closest(`#${IDS.actions},#${IDS.vault}`));
  for(const element of candidates){
    const kind=backupKind(element);
    if(!kind) continue;
    const wrapper=oldWrapperFor(element);
    stashAction(element,kind);
    safeHide(wrapper);
  }

  for(const element of Array.from(document.querySelectorAll('summary,h1,h2,h3,h4,h5,button,[role=button],div,section'))){
    const own=normalize(element.childElementCount?Array.from(element.childNodes).filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join(' '):element.textContent);
    if(!/copia de seguridad manual|copia manual/.test(own)) continue;
    const wrapper=element.closest('details,[role=menu],.dropdown,.menu,.backup-menu,.backup-panel')||oldWrapperFor(element)||element;
    safeHide(wrapper);
  }
}
function actionIcon(kind){
  return kind==='export'
    ?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 17v3h14v-3"/></svg>'
    :'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V9m0 0 4 4m-4-4-4 4"/><path d="M5 7V4h14v3"/></svg>';
}
function triggerOriginal(kind){
  let element=originalActions[kind];
  if(!element||!element.isConnected){
    element=Array.from(document.querySelectorAll(`#${IDS.vault} button,#${IDS.vault} a,#${IDS.vault} label,#${IDS.vault} input`)).find(item=>backupKind(item)===kind)||null;
    originalActions[kind]=element;
  }
  if(!element) return;
  if(element.matches('input[type=file]')){element.click();return;}
  if(element.tagName==='LABEL'){
    const input=element.htmlFor?document.getElementById(element.htmlFor):element.querySelector('input[type=file]');
    if(input){input.click();return;}
  }
  element.click();
}
function ensureTopActions(){
  if(!originalActions.export&&!originalActions.import) return;
  let group=document.getElementById(IDS.actions);
  if(!group){
    group=document.createElement('div');
    group.id=IDS.actions;
    group.setAttribute('aria-label','Copia de seguridad manual');
    for(const kind of ['export','import']){
      const label=kind==='export'?'Exportar copia completa':'Importar copia completa';
      const button=document.createElement('button');
      button.type='button';
      button.id=`manualBackup${kind[0].toUpperCase()+kind.slice(1)}Button`;
      button.className='firebase-storage-action';
      button.dataset.kind=kind;
      button.dataset.tooltip=kind==='export'?'Exportar':'Importar';
      button.title=label;
      button.setAttribute('aria-label',label);
      button.innerHTML=actionIcon(kind);
      button.addEventListener('click',()=>triggerOriginal(kind));
      group.appendChild(button);
    }
    document.body.appendChild(group);
  }
  for(const button of group.querySelectorAll('[data-kind]')) button.hidden=!originalActions[button.dataset.kind];

  const cloud=findCloudTrigger();
  const rect=cloud?.getBoundingClientRect?.();
  const suitable=cloud&&cloud.parentElement&&cloud.parentElement!==document.body&&rect&&rect.top>=0&&rect.top<150;
  if(suitable){
    group.classList.remove('firebase-storage-actions-fixed');
    if(group.parentElement!==cloud.parentElement||group.nextElementSibling!==cloud) cloud.parentElement.insertBefore(group,cloud);
  }else{
    group.classList.add('firebase-storage-actions-fixed');
    if(group.parentElement!==document.body) document.body.appendChild(group);
  }
}
function installPass(){
  installQueued=false;
  styles();
  hideLegacyBackupUi();
  ensureTopActions();
  ensureCloudDetails();
  bindCloudFallback();
  renderStatus();
  renderChange(document.getElementById(IDS.details));
  const popover=document.getElementById(IDS.popover);
  if(popover) renderChange(popover);
}
function scheduleInstall(){
  if(installQueued) return;
  installQueued=true;
  requestAnimationFrame(installPass);
}
export function setFileStatus(message,type=''){
  statusState={message,type};
  scheduleInstall();
}
export function setLastChange(change,deviceId=''){
  if(!change?.text) return;
  changeState={...change,ownDevice:Boolean(change.deviceId&&change.deviceId===deviceId)};
  scheduleInstall();
}
export function installUi(){
  installPass();
  if(!observer){
    observer=new MutationObserver(scheduleInstall);
    observer.observe(document.body,{childList:true,subtree:true});
  }
  document.addEventListener('click',event=>{
    const popover=document.getElementById(IDS.popover);
    if(!popover||popover.hidden||popover.contains(event.target)||findCloudTrigger()?.contains(event.target)) return;
    popover.hidden=true;
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape') document.getElementById(IDS.popover)?.setAttribute('hidden','');
  });
  addEventListener('resize',()=>{
    const popover=document.getElementById(IDS.popover),trigger=findCloudTrigger();
    if(popover&&!popover.hidden&&trigger) positionPopover(popover,trigger);
  });
}
