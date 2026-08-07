from pathlib import Path
import base64
import re

MARKER = 'CTA_ALARMAS_WEB_V1'
index_path = Path('index.html')
text = index_path.read_text(encoding='utf-8')
match = re.search(r'var MOTOR_B64="([A-Za-z0-9+/=]+)";', text)
if not match:
    raise SystemExit('No se encontró MOTOR_B64')

motor = base64.b64decode(match.group(1)).decode('utf-8')
if MARKER not in motor:
    css_anchor = ".mc-edit-cancel{width:100%;background:none;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:11px;font-family:'Outfit',sans-serif;font-size:13px;color:var(--gray);cursor:pointer}"
    css = r'''
/* CTA_ALARMAS_WEB_V1 */
.mc-alarm-box{display:none;margin:0 0 12px;background:rgba(96,165,250,.055);border:1px solid rgba(96,165,250,.22);border-radius:14px;padding:12px}
.mc-alarm-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}
.mc-alarm-title{font-size:12px;font-weight:800;color:#93c5fd;letter-spacing:.25px}
.mc-alarm-entry{font-size:10px;color:var(--gray);white-space:nowrap}
.mc-alarm-offset{display:flex;align-items:center;gap:5px;flex-wrap:wrap;font-size:11px;color:var(--gray);margin-bottom:9px}
.mc-alarm-offset input{width:48px;background:#1f2d47;border:1px solid rgba(255,255,255,.12);border-radius:8px;color:var(--white);font:700 13px 'Outfit',sans-serif;padding:6px;text-align:center}
.mc-alarm-time{font-size:21px;font-weight:900;color:var(--white);margin-bottom:10px}
.mc-alarm-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.mc-alarm-btn{border-radius:10px;padding:10px 7px;font:800 11px 'Outfit',sans-serif;cursor:pointer}
.mc-alarm-btn.clock{background:rgba(200,168,75,.12);border:1px solid rgba(200,168,75,.34);color:var(--gold)}
.mc-alarm-btn.native{background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.28);color:#86efac}
.mc-alarm-note{font-size:9px;line-height:1.35;color:var(--gray);margin-top:8px}
.mc-alarm-note.warn{color:#fbbf24}
@media(max-width:350px){.mc-alarm-actions{grid-template-columns:1fr}.mc-alarm-offset{gap:4px}}
'''
    if css_anchor not in motor:
        raise SystemExit('No se encontró el ancla CSS del editor')
    motor = motor.replace(css_anchor, css_anchor + css, 1)

    js_anchor = 'function mcEditDay(day,e){'
    js = r'''
var _MC_ALARM_OFFSET_KEY='cta_alarm_offset_min_v1';
var _mcAlarmDayObj=null;
function _mcAlarmOffset(){
  var value=70;
  try{value=parseInt(APP_STORAGE.getItem(_MC_ALARM_OFFSET_KEY)||'70',10);}catch(e){}
  if(!isFinite(value)||value<0)value=70;
  return Math.min(720,value);
}
function _mcAlarmPad(v){return String(v).padStart(2,'0');}
function _mcAlarmNoWork(tipo){return ['libre','vacaciones','baja','hl','hlp','festivo','rm','bp','permiso'].indexOf(String(tipo||'').toLowerCase())>=0;}
function _mcAlarmCalc(){
  var obj=_mcAlarmDayObj||{};
  var entry=String(obj.e1||'').trim();
  if(!/^\d{1,2}:\d{2}$/.test(entry))return null;
  var p=entry.split(':'),h=parseInt(p[0],10),m=parseInt(p[1],10);
  if(h<0||h>23||m<0||m>59)return null;
  var shift=new Date(_mcEditYear,_mcEditMonth,_mcEditDay,h,m,0,0);
  var offset=_mcAlarmOffset();
  var alarm=new Date(shift.getTime()-offset*60000);
  return {entry:entry,shift:shift,alarm:alarm,offset:offset,at:alarm.getTime(),time:_mcAlarmPad(alarm.getHours())+':'+_mcAlarmPad(alarm.getMinutes())};
}
function _mcAlarmClockMatchesDate(d){
  var now=new Date();
  var next=new Date(now.getTime());
  next.setSeconds(0,0);next.setHours(d.alarm.getHours(),d.alarm.getMinutes(),0,0);
  if(next.getTime()<=now.getTime())next.setDate(next.getDate()+1);
  return Math.abs(next.getTime()-d.alarm.getTime())<60000;
}
function mcAlarmOffsetChanged(){
  var h=parseInt((document.getElementById('mc-alarm-hours')||{}).value||'0',10)||0;
  var m=parseInt((document.getElementById('mc-alarm-minutes')||{}).value||'0',10)||0;
  h=Math.max(0,Math.min(12,h));m=Math.max(0,Math.min(59,m));
  var total=h*60+m;
  try{APP_STORAGE.setItem(_MC_ALARM_OFFSET_KEY,String(total));}catch(e){}
  mcAlarmRefresh(_mcAlarmDayObj);
}
function mcAlarmRefresh(dayObj){
  _mcAlarmDayObj=dayObj||_mcAlarmDayObj||{};
  var box=document.getElementById('mc-alarm-box');
  if(!box)return;
  if(!_mcAlarmDayObj.e1||_mcAlarmNoWork(_mcAlarmDayObj.tipo)){box.style.display='none';return;}
  var d=_mcAlarmCalc();if(!d){box.style.display='none';return;}
  box.style.display='block';
  var hours=document.getElementById('mc-alarm-hours'),mins=document.getElementById('mc-alarm-minutes');
  if(hours)hours.value=Math.floor(d.offset/60);if(mins)mins.value=d.offset%60;
  var entry=document.getElementById('mc-alarm-entry');if(entry)entry.textContent='Entrada '+d.entry;
  var time=document.getElementById('mc-alarm-time');if(time)time.textContent='Alarma '+d.time;
  var b1=document.getElementById('mc-alarm-clock-btn');if(b1)b1.textContent='⏰ Reloj '+d.time;
  var b2=document.getElementById('mc-alarm-native-btn');if(b2)b2.textContent='📱 CTA exacta '+d.time;
  var note=document.getElementById('mc-alarm-note');
  if(note){
    var exact=_mcAlarmClockMatchesDate(d);
    note.classList.toggle('warn',!exact);
    note.textContent=exact?'Reloj Android sirve para esta próxima alarma. CTA exacta respeta además la fecha concreta.':'Este día no es la próxima ocurrencia de '+d.time+'. Para no crear una alarma en el día equivocado usa CTA exacta.';
  }
}
function _mcAlarmAndroidOnly(){
  if(!/Android/i.test(navigator.userAgent||'')){alert('Esta prueba de alarma está pensada para Android. Ábrela desde tu móvil.');return false;}
  return true;
}
function mcAlarmClock(){
  if(!_mcAlarmAndroidOnly())return;
  var d=_mcAlarmCalc();if(!d)return;
  if(d.at<=Date.now()){alert('La hora de esta alarma ya ha pasado.');return;}
  if(!_mcAlarmClockMatchesDate(d)){
    if(!confirm('El Reloj de Android solo recibe la hora, no la fecha. Podría crear la próxima alarma a las '+d.time+' en un día distinto.\n\nPara este día es más seguro usar CTA exacta.\n\n¿Abrir el Reloj igualmente?'))return;
  }
  var label='CTA - Entrada '+d.entry+' - '+d.shift.toLocaleDateString('es-ES');
  var uri='intent:#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR='+d.alarm.getHours()+';i.android.intent.extra.alarm.MINUTES='+d.alarm.getMinutes()+';S.android.intent.extra.alarm.MESSAGE='+encodeURIComponent(label)+';B.android.intent.extra.alarm.VIBRATE=true;end';
  window.location.href=uri;
}
function mcAlarmNative(){
  if(!_mcAlarmAndroidOnly())return;
  var d=_mcAlarmCalc();if(!d)return;
  if(d.at<=Date.now()){alert('La hora de esta alarma ya ha pasado.');return;}
  var label='CTA · Entrada '+d.entry+' · '+d.shift.toLocaleDateString('es-ES');
  var uri='intent://set?at='+encodeURIComponent(String(d.at))+'&label='+encodeURIComponent(label)+'#Intent;scheme=ctaalarm;package=com.cta.alarm;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end';
  window.location.href=uri;
}

'''
    if js_anchor not in motor:
        raise SystemExit('No se encontró mcEditDay')
    motor = motor.replace(js_anchor, js + js_anchor, 1)

    day_anchor = "  var dayObj=mData[day]||{tipo:'libre'};"
    if day_anchor not in motor:
        raise SystemExit('No se encontró dayObj')
    motor = motor.replace(day_anchor, day_anchor + "\n  _mcAlarmDayObj=dayObj;", 1)

    open_anchor = "  document.getElementById('mc-edit-bg').style.display='block';"
    if open_anchor not in motor:
        raise SystemExit('No se encontró apertura del editor')
    motor = motor.replace(open_anchor, "  mcAlarmRefresh(dayObj);\n" + open_anchor, 1)

    html_anchor = '  <button class="mc-edit-save" onclick="mcEditSave()">✅ Guardar cambios</button>'
    alarm_html = r'''  <div class="mc-alarm-box" id="mc-alarm-box">
    <div class="mc-alarm-head"><div class="mc-alarm-title">⏰ DESPERTADOR</div><div class="mc-alarm-entry" id="mc-alarm-entry">Entrada</div></div>
    <div class="mc-alarm-offset">Despertarme <input id="mc-alarm-hours" type="number" min="0" max="12" inputmode="numeric" onchange="mcAlarmOffsetChanged()"> h <input id="mc-alarm-minutes" type="number" min="0" max="59" inputmode="numeric" onchange="mcAlarmOffsetChanged()"> min antes</div>
    <div class="mc-alarm-time" id="mc-alarm-time">Alarma --:--</div>
    <div class="mc-alarm-actions">
      <button type="button" class="mc-alarm-btn clock" id="mc-alarm-clock-btn" onclick="mcAlarmClock()">⏰ Reloj</button>
      <button type="button" class="mc-alarm-btn native" id="mc-alarm-native-btn" onclick="mcAlarmNative()">📱 CTA exacta</button>
    </div>
    <div class="mc-alarm-note" id="mc-alarm-note"></div>
  </div>
'''
    if html_anchor not in motor:
        raise SystemExit('No se encontró botón Guardar cambios')
    motor = motor.replace(html_anchor, alarm_html + html_anchor, 1)

    encoded = base64.b64encode(motor.encode('utf-8')).decode('ascii')
    text = text[:match.start(1)] + encoded + text[match.end(1):]
    index_path.write_text(text, encoding='utf-8')

sw_path = Path('sw.js')
sw = sw_path.read_text(encoding='utf-8')
if "herramientas-turnos-v78" not in sw:
    sw = sw.replace("/* HERRAMIENTAS SW V77 - BAJA CONSERVA HORAS EN PLANTILLA */\nconst CACHE='herramientas-turnos-v77';",
                     "/* HERRAMIENTAS SW V78 - ALARMAS DE TURNOS CTA */\nconst CACHE='herramientas-turnos-v78';")
    sw_path.write_text(sw, encoding='utf-8')

Path('/tmp/MOTOR_ALARMAS_VALIDAR.html').write_text(motor, encoding='utf-8')
print('Alarmas web CTA aplicadas')
