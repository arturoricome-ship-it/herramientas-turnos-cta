let statusState={message:'preparando sincronización…',type:''};
let changeState=null;
let backupObserver=null;
let cloudObserver=null;

function styles(){
  if(document.getElementById('storageSyncStyles')) return;
  const style=document.createElement('style');
  style.id='storageSyncStyles';
  style.textContent=`
#firebaseStorageStatus,#firebaseStorageLastChange{box-sizing:border-box;max-width:100%;overflow-wrap:anywhere}
#firebaseStorageStatus{margin-top:7px;font-size:12px;line-height:1.25}
#firebaseStorageLastChange{margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,.16);font-size:11px;line-height:1.3;opacity:.92}
#firebaseStorageLastChange b{font-weight:650}
#firebaseStorageLastChange small{display:block;margin-top:2px;opacity:.72;font-size:10px}
#manualBackupMenuToggle{position:fixed;right:0;top:45%;transform:translateY(-50%);z-index:2147483000;width:38px;height:48px;border:0;border-radius:13px 0 0 13px;box-shadow:0 4px 18px rgba(0,0,0,.22);background:rgba(31,41,55,.94);color:#fff;font-size:25px;line-height:1;cursor:pointer;backdrop-filter:blur(8px)}
#manualBackupMenuToggle:hover,#manualBackupMenuToggle:focus-visible{background:rgba(17,24,39,.98);outline:2px solid rgba(255,255,255,.55);outline-offset:-3px}
#manualBackupMenu{position:fixed;right:48px;top:45%;transform:translateY(-50%);z-index:2147482999;display:none;min-width:195px;max-width:min(280px,calc(100vw - 64px));padding:10px;border:1px solid rgba(255,255,255,.16);border-radius:13px;box-shadow:0 12px 30px rgba(0,0,0,.26);background:rgba(31,41,55,.97);color:#fff;backdrop-filter:blur(10px)}
#manualBackupMenu[data-open=true]{display:block}
#manualBackupMenu h4{margin:0 0 8px;font-size:12px}
#manualBackupMenu .actions{display:grid;gap:7px}
#manualBackupMenu .backup-action{box-sizing:border-box!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;width:100%!important;min-width:0!important;min-height:36px!important;height:auto!important;margin:0!important;padding:8px 10px!important;border-radius:9px!important;font-size:12px!important;line-height:1.25!important;white-space:normal!important;text-align:left!important}
#manualBackupMenu input[type=file]{display:none!important}
@media(max-width:560px){#manualBackupMenuToggle{top:auto;bottom:94px;transform:none;width:35px;height:44px}#manualBackupMenu{top:auto;right:43px;bottom:74px;transform:none}}
`;
  document.head.appendChild(style);
}
function dateText(change){
  const raw=change?.atClient||change?.updatedAtClient||change?.date;
  if(!raw) return '';
  const date=new Date(raw);
  if(Number.isNaN(date.getTime())) return '';
  try{return date.toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'});}
  catch(_){return date.toLocaleString('es-ES');}
}
function renderStatus(element=document.getElementById('firebaseStorageStatus')){
  if(!element) return;
  const text=`Archivos: ${statusState.message}`;
  if(element.textContent!==text) element.textContent=text;
  if(element.dataset.state!==statusState.type) element.dataset.state=statusState.type;
  element.style.color=statusState.type==='error'?'#fecaca':statusState.type==='work'?'#fde68a':statusState.type==='ok'?'#bbf7d0':'';
}
function renderChange(element=document.getElementById('firebaseStorageLastChange')){
  if(!element) return;
  const signature=JSON.stringify(changeState||null);
  if(element.dataset.signature===signature) return;
  element.dataset.signature=signature;
  element.replaceChildren();
  const title=document.createElement('b');
  title.textContent=changeState?.text?`Último cambio: ${changeState.text}`:'Último cambio: todavía no hay cambios registrados';
  element.appendChild(title);
  if(!changeState?.text) return;
  const details=[],date=dateText(changeState);
  if(date) details.push(date);
  details.push(changeState.ownDevice?'este dispositivo':changeState.deviceLabel||'otro dispositivo');
  const meta=document.createElement('small');
  meta.textContent=details.join(' · ');
  element.appendChild(meta);
}
function cloudDetails(){
  styles();
  const parent=document.getElementById('firebaseCloudMenu')||document.getElementById('firebaseCompact');
  if(!parent) return;
  let status=document.getElementById('firebaseStorageStatus');
  if(!status){
    status=document.createElement('div');
    status.id='firebaseStorageStatus';
    status.className='firebase-storage-status';
    const general=document.getElementById('firebaseStatus');
    general?.parentNode===parent?general.insertAdjacentElement('afterend',status):parent.appendChild(status);
  }
  let change=document.getElementById('firebaseStorageLastChange');
  if(!change){
    change=document.createElement('div');
    change.id='firebaseStorageLastChange';
    status.insertAdjacentElement('afterend',change);
  }
  renderStatus(status);
  renderChange(change);
}
export function setFileStatus(message,type=''){
  statusState={message,type};
  cloudDetails();
}
export function setLastChange(change,deviceId=''){
  if(!change?.text) return;
  changeState={...change,ownDevice:Boolean(change.deviceId&&change.deviceId===deviceId)};
  cloudDetails();
}
function textOf(element){
  return String(element.getAttribute('aria-label')||element.getAttribute('title')||element.value||element.textContent||'')
    .replace(/\s+/g,' ').trim().toLowerCase();
}
function backupKind(text){
  if(!/complet|copia\s*(de)?\s*seguridad|backup|todos?\s+los\s+datos/.test(text)) return '';
  if(/export|descarg|guardar/.test(text)) return 'export';
  if(/import|restaur|cargar/.test(text)) return 'import';
  return '';
}
function menuShell(){
  styles();
  let toggle=document.getElementById('manualBackupMenuToggle');
  let menu=document.getElementById('manualBackupMenu');
  if(!toggle){
    toggle=document.createElement('button');
    Object.assign(toggle,{id:'manualBackupMenuToggle',type:'button',textContent:'⋮',title:'Copia de seguridad manual'});
    toggle.setAttribute('aria-label','Copia de seguridad manual');
    toggle.setAttribute('aria-expanded','false');
    document.body.appendChild(toggle);
  }
  if(!menu){
    menu=document.createElement('div');
    menu.id='manualBackupMenu';
    menu.dataset.open='false';
    menu.setAttribute('role','menu');
    const heading=document.createElement('h4');
    heading.textContent='Copia de seguridad manual';
    const actions=document.createElement('div');
    actions.className='actions';
    menu.append(heading,actions);
    document.body.appendChild(menu);
  }
  if(!toggle.dataset.bound){
    toggle.dataset.bound='1';
    toggle.addEventListener('click',event=>{
      event.stopPropagation();
      const open=menu.dataset.open!=='true';
      menu.dataset.open=String(open);
      toggle.setAttribute('aria-expanded',String(open));
    });
    document.addEventListener('click',event=>{
      if(menu.contains(event.target)||toggle.contains(event.target)) return;
      menu.dataset.open='false';
      toggle.setAttribute('aria-expanded','false');
    });
    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape') return;
      menu.dataset.open='false';
      toggle.setAttribute('aria-expanded','false');
    });
  }
  return {toggle,menu,actions:menu.querySelector('.actions')};
}
function canHide(wrapper,moved){
  if(!wrapper||wrapper===document.body||wrapper.id==='manualBackupMenu') return false;
  const interactive=Array.from(wrapper.querySelectorAll('button,a,label,[role=button],input[type=button],input[type=submit]'));
  return interactive.length>0&&interactive.every(item=>moved.has(item));
}
function compactBackups(){
  const candidates=Array.from(document.querySelectorAll('button,a,label,[role=button],input[type=button],input[type=submit]'))
    .filter(element=>!element.closest('#manualBackupMenu'));
  const matches=candidates.map(element=>({element,kind:backupKind(textOf(element))})).filter(item=>item.kind);
  if(!matches.length) return false;
  const {toggle,menu,actions}=menuShell();
  const moved=new Set(matches.map(item=>item.element));
  const wrappers=[...new Set(matches.map(item=>item.element.parentElement))];
  const hide=wrappers.filter(wrapper=>canHide(wrapper,moved));
  for(const {element,kind} of matches){
    if(element.dataset.manualBackupMoved==='1') continue;
    element.dataset.manualBackupMoved='1';
    element.dataset.backupKind=kind;
    element.classList.add('backup-action');
    element.setAttribute('role','menuitem');
    if(element.tagName==='LABEL'&&element.htmlFor){
      const input=document.getElementById(element.htmlFor);
      if(input?.type==='file') actions.appendChild(input);
    }
    actions.appendChild(element);
  }
  for(const wrapper of hide) wrapper.style.display='none';
  const count=actions.querySelectorAll('.backup-action').length;
  toggle.hidden=!count;
  menu.hidden=!count;
  if(count>=2&&backupObserver){backupObserver.disconnect();backupObserver=null;}
  return Boolean(count);
}
export function installUi(){
  styles();
  cloudDetails();
  compactBackups();
  if(!cloudObserver){
    cloudObserver=new MutationObserver(cloudDetails);
    cloudObserver.observe(document.body,{childList:true,subtree:true});
  }
  if(!backupObserver){
    backupObserver=new MutationObserver(compactBackups);
    backupObserver.observe(document.body,{childList:true,subtree:true});
  }
}
