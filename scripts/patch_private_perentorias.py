from pathlib import Path
import base64
import re

index_path=Path('index.html')
index_text=index_path.read_text(encoding='utf-8')
match=re.search(r'((?:var|const|let)\s+MOTOR_B64\s*=\s*)(["\'])([A-Za-z0-9+/=]+)\2',index_text)
if not match:
    raise SystemExit('No se encontró MOTOR_B64 en index.html')
text=base64.b64decode(match.group(3)).decode('utf-8')
if "_HP_PEREN_PRIVADA_PREFIX='__HP_PEREN_PRIVADA__|'" in text:
    print('La corrección de perentorias ya está aplicada')
    raise SystemExit(0)
orig=text

def repl(old,new,label,count=1):
    global text
    n=text.count(old)
    if n!=count:
        raise SystemExit(f'{label}: expected {count}, found {n}')
    text=text.replace(old,new,count)

repl(
".hp-change-detail-current b{color:#86efac}\n",
".hp-change-detail-current b{color:#86efac}\n.hp-change-detail-peren{background:rgba(251,146,60,.07);margin:0 -7px;padding-left:7px;padding-right:7px;border-radius:8px}\n.hp-change-detail-peren span,.hp-change-detail-peren b{color:#fdba74}\n",
'css perentoria row')

repl(
"var _CAMBIOS_TURNOS_COMPARTIDOS={};\nvar _CAMBIOS_TURNOS_CARGANDO={};\nvar _CAMBIOS_TURNOS_ULTIMA_CARGA={};\n",
"var _CAMBIOS_TURNOS_COMPARTIDOS={};\nvar _CAMBIOS_TURNOS_CARGANDO={};\nvar _CAMBIOS_TURNOS_ULTIMA_CARGA={};\nvar _HP_PEREN_PRIVADA_PREFIX='__HP_PEREN_PRIVADA__|';\n\n// El Apps Script actual conserva el campo \"tipo\", pero no siempre devuelve las\n// columnas nuevas de perentorias. Guardamos dentro de ese campo una marca privada\n// que Horas plantilla sabe decodificar. El resto de vistas la ignora por completo.\nfunction _codificarPerenPrivadaSheets(dayObj){\n  if(!dayObj||!Object.prototype.hasOwnProperty.call(dayObj,'perenDur'))return '';\n  var dur=String(dayObj.perenDur==null?'':dayObj.perenDur).trim();\n  if(!dur)return '';\n  var clase=String(dayObj.perenTipo||'perentorias').toLowerCase()==='cp'?'cp':'perentorias';\n  var base=String(dayObj.tipo||'trabajado').toLowerCase();\n  if(!base||base==='perentorias'||base==='cp')base='trabajado';\n  return _HP_PEREN_PRIVADA_PREFIX+[base,clase,dur].map(function(v){return encodeURIComponent(v);}).join('|');\n}\nfunction _decodificarPerenPrivadaSheets(tipo){\n  var raw=String(tipo||'').trim();\n  if(raw.slice(0,_HP_PEREN_PRIVADA_PREFIX.length).toUpperCase()!==_HP_PEREN_PRIVADA_PREFIX.toUpperCase())return null;\n  var p=raw.slice(_HP_PEREN_PRIVADA_PREFIX.length).split('|');\n  if(p.length<3)return null;\n  try{\n    return{\n      base:decodeURIComponent(p[0]||'trabajado')||'trabajado',\n      perenTipo:decodeURIComponent(p[1]||'perentorias')==='cp'?'cp':'perentorias',\n      perenDur:decodeURIComponent(p.slice(2).join('|')||'')\n    };\n  }catch(e){return null;}\n}\nfunction _esPerenPrivadaCompartida(c){\n  return !!(c&&(c.__hpPerenPrivada||_decodificarPerenPrivadaSheets(c.tipo)));\n}\n",
'private marker helpers')

repl(
"function _cacheCambioTurnoCompartido(c){\n  if(!c)return;\n  c=Object.assign({},c);\n  if(!c.perenDur)c.perenDur=c.peren_dur||c.perentoriasDur||c.perentorias_dur||'';\n  if(!c.perenTipo)c.perenTipo=c.peren_tipo||'';\n  if(!c.hfunDur)c.hfunDur=c.hfun_dur||'';\n",
"function _cacheCambioTurnoCompartido(c){\n  if(!c)return;\n  c=Object.assign({},c);\n  var perenPrivada=_decodificarPerenPrivadaSheets(c.tipo);\n  if(perenPrivada){\n    c.__hpPerenPrivada=true;\n    c.__hpTipoSheets=c.tipo;\n    c.tipo=perenPrivada.base||'trabajado';\n    if(!c.perenDur)c.perenDur=perenPrivada.perenDur||'';\n    if(!c.perenTipo)c.perenTipo=perenPrivada.perenTipo||'perentorias';\n  }\n  if(!c.perenDur)c.perenDur=c.peren_dur||c.perentoriasDur||c.perentorias_dur||'';\n  if(!c.perenTipo)c.perenTipo=c.peren_tipo||'';\n  if(!c.hfunDur)c.hfunDur=c.hfun_dur||'';\n",
'decode in cache')

repl(
"  if(c.hlIni&&c.hlFin)turno=Object.assign({},_restarRangoDeTurno(turno,{ini:c.hlIni,fin:c.hlFin}),{cambioCompartido:true,etiquetaCambio:etiqueta,actualizadoPor:turno.actualizadoPor,hlVisible:esHL&&puedeVerHL,hlParcialRecortada:true,hlIni:c.hlIni,hlFin:c.hlFin});\n  return turno;\n}\nfunction _turnoGrupoConCambioCompartido(emp,dateObj,turnoOriginal){\n",
"  if(c.hlIni&&c.hlFin)turno=Object.assign({},_restarRangoDeTurno(turno,{ini:c.hlIni,fin:c.hlFin}),{cambioCompartido:true,etiquetaCambio:etiqueta,actualizadoPor:turno.actualizadoPor,hlVisible:esHL&&puedeVerHL,hlParcialRecortada:true,hlIni:c.hlIni,hlFin:c.hlFin});\n  return turno;\n}\nfunction _limpiarPerenPrivadaParaVistaPublica(c){\n  if(!c)return c;\n  var limpio=Object.assign({},c);\n  ['perenDur','peren_dur','perentoriasDur','perentorias_dur','perenTipo','peren_tipo','__hpPerenPrivada','__hpTipoSheets'].forEach(function(k){delete limpio[k];});\n  return limpio;\n}\nfunction _firmaTurnoCompartidoPublico(t){\n  if(!t)return 'SIN_TURNO';\n  var e1=String(t.e1||'').trim(),s1=String(t.s1||'').trim(),e2=String(t.e2||'').trim(),s2=String(t.s2||'').trim();\n  var tipo=_normTipoCambioTurno(t.tipo);\n  if(e1&&s1&&!_esTipoNoTrabaja(tipo))tipo='trabajado';\n  if(!e1&&!s1&&!tipo)tipo='libre';\n  return [tipo,e1,s1,e2,s2].join('|');\n}\nfunction _aplicarCambioCompartidoPublico(c,turnoOriginal,ocultarHLPropia){\n  if(!c)return turnoOriginal;\n  if(!_esPerenPrivadaCompartida(c))return _cambioToTurno(c,turnoOriginal,ocultarHLPropia);\n  var limpio=_limpiarPerenPrivadaParaVistaPublica(c);\n  // Una perentoria sobre un día libre no crea un turno público ficticio.\n  if(!limpio.e1&&!limpio.s1&&_esTipoTurnoNormalCambio(limpio.tipo))return turnoOriginal;\n  var aplicado=_cambioToTurno(limpio,turnoOriginal,ocultarHLPropia);\n  // Si horario y estado ya coinciden con el Excel, no dejamos ninguna marca visible.\n  if(_firmaTurnoCompartidoPublico(aplicado)===_firmaTurnoCompartidoPublico(turnoOriginal))return turnoOriginal;\n  return aplicado;\n}\nfunction _turnoGrupoConCambioCompartido(emp,dateObj,turnoOriginal){\n",
'public sanitizer helper')

repl(
"function _turnoGrupoConCambioCompartido(emp,dateObj,turnoOriginal){\n  var c=_getCambioCompartidoEmpleado(emp,dateObj);\n  if(!c)return turnoOriginal;\n  // Si el cambio HL es del propio usuario, en compañeros se muestra solo el tramo trabajado,\n",
"function _turnoGrupoConCambioCompartido(emp,dateObj,turnoOriginal){\n  var c=_getCambioCompartidoEmpleado(emp,dateObj);\n  if(!c)return turnoOriginal;\n  // Si el cambio HL es del propio usuario, en compañeros se muestra solo el tramo trabajado,\n",
'group function anchor')

repl(
"  var t=_cambioToTurno(c,turnoOriginal,ocultarHLPropia);\n",
"  var t=_aplicarCambioCompartidoPublico(c,turnoOriginal,ocultarHLPropia);\n",
'apply sanitized group change')

repl(
"function guardarCambioTurnoCompartido(year,monthKey,day,dayObj){\n  var sess=_ctaSession();\n  if(!sess||!sess.email||typeof SHEETS_URL==='undefined'||!SHEETS_URL)return Promise.resolve(null);\n  var fecha=_fechaISOFromParts(year,monthKey,day);\n  var hlParcial=(dayObj&&dayObj.hlParcial&&dayObj.hlParcial.ini&&dayObj.hlParcial.fin)?dayObj.hlParcial:null;\n  var payload={\n",
"function guardarCambioTurnoCompartido(year,monthKey,day,dayObj){\n  var sess=_ctaSession();\n  if(!sess||!sess.email||typeof SHEETS_URL==='undefined'||!SHEETS_URL)return Promise.resolve(null);\n  var fecha=_fechaISOFromParts(year,monthKey,day);\n  var hlParcial=(dayObj&&dayObj.hlParcial&&dayObj.hlParcial.ini&&dayObj.hlParcial.fin)?dayObj.hlParcial:null;\n  var tipoPersistido=(dayObj&&dayObj.tipo)||'libre';\n  var perenPrivadaSheets=_codificarPerenPrivadaSheets(dayObj);\n  if(perenPrivadaSheets)tipoPersistido=perenPrivadaSheets;\n  var payload={\n",
'prepare encoded type')

repl(
"    tipo:(dayObj&&dayObj.tipo)||'libre',\n",
"    tipo:tipoPersistido,\n",
'persist encoded type')

repl(
"          detalleCambio={nombre:empNombre,categoria:empCategoria,nomina:emp.nomina||'',empleado_norm:emp.empleado_norm||emp.norm||'',privado:_hpEsEmpleadoPrivado(emp),mes:monthKey,mesLabel:monthNames[monthIdx],dia:d,fecha:_hpFechaISO(fecha),antes:_hpTurnoHorario(turnoBase),despues:_hpTurnoHorario(turno),horasAntes:hAntes,horasDespues:hDespues,delta:delta,tipo:etiquetaCambio,por:(origenCambio.actualizado_por||origenCambio.email||origenCambio.nombre||'')};\n",
"          var perenDetalle=_hpPerenDur(origenCambio),perenTipoDetalle=_hpPerenTipo(origenCambio);\n          var perenCero=!!perenDetalle&&(!String(perenDetalle).replace(/[0:.,\\s-]/g,''));\n          var tipoDetalle=etiquetaCambio;\n          if(perenDetalle)tipoDetalle=perenTipoDetalle==='cp'?(perenCero?'CP ELIMINADO':'CP REGISTRADO'):(perenCero?'PERENTORIAS ELIMINADAS':'PERENTORIAS AÑADIDAS');\n          detalleCambio={nombre:empNombre,categoria:empCategoria,nomina:emp.nomina||'',empleado_norm:emp.empleado_norm||emp.norm||'',privado:_hpEsEmpleadoPrivado(emp),mes:monthKey,mesLabel:monthNames[monthIdx],dia:d,fecha:_hpFechaISO(fecha),antes:_hpTurnoHorario(turnoBase),despues:_hpTurnoHorario(turno),horasAntes:hAntes,horasDespues:hDespues,delta:delta,tipo:tipoDetalle,por:(origenCambio.actualizado_por||origenCambio.email||origenCambio.nombre||''),perenDur:perenDetalle,perenTipo:perenTipoDetalle,perentoriaPrivada:!!(typeof _esPerenPrivadaCompartida==='function'&&_esPerenPrivadaCompartida(origenCambio))};\n",
'detail fields in calculation')

repl(
"  var detalle={\n    nombre:r.nombre||emp.nombre||'Empleado',categoria:r.categoria||emp.categoria||'General',\n    nomina:r.nomina||emp.nomina||'',mes:monthKey,mesLabel:_hpMonthNames()[mi],dia:Number(day),fecha:_hpFechaISO(fecha),\n    antes:_hpTurnoHorario(turnoBase),despues:_hpTurnoHorario(turnoFinal),\n    horasAntes:hAntes,horasDespues:hDespues,delta:hDespues-hAntes,\n    tipo:etiqueta||'Cambio',por:(origen.actualizado_por||origen.email||origen.nombre||'')\n  };\n",
"  var perenDetalle=_hpPerenDur(origen),perenTipoDetalle=_hpPerenTipo(origen);\n  var perenCero=!!perenDetalle&&(!String(perenDetalle).replace(/[0:.,\\s-]/g,''));\n  var tipoDetalle=etiqueta||'Cambio';\n  if(perenDetalle)tipoDetalle=perenTipoDetalle==='cp'?(perenCero?'CP ELIMINADO':'CP REGISTRADO'):(perenCero?'PERENTORIAS ELIMINADAS':'PERENTORIAS AÑADIDAS');\n  var detalle={\n    nombre:r.nombre||emp.nombre||'Empleado',categoria:r.categoria||emp.categoria||'General',\n    nomina:r.nomina||emp.nomina||'',mes:monthKey,mesLabel:_hpMonthNames()[mi],dia:Number(day),fecha:_hpFechaISO(fecha),\n    antes:_hpTurnoHorario(turnoBase),despues:_hpTurnoHorario(turnoFinal),\n    horasAntes:hAntes,horasDespues:hDespues,delta:hDespues-hAntes,\n    tipo:tipoDetalle,por:(origen.actualizado_por||origen.email||origen.nombre||''),\n    perenDur:perenDetalle,perenTipo:perenTipoDetalle,perentoriaPrivada:!!(typeof _esPerenPrivadaCompartida==='function'&&_esPerenPrivadaCompartida(origen))\n  };\n",
'detail fields in fallback')

repl(
"  if(body)body.innerHTML=\n    '<div class=\"hp-change-detail-row\"><span>Tipo</span><b>'+escH(c.tipo||'Cambio')+'</b></div>'+\n    '<div class=\"hp-change-detail-row\"><span>Turno anterior</span><b>'+escH(c.antes||'Sin turno')+' · '+_hpFmtHoras(c.horasAntes)+'</b></div>'+\n    '<div class=\"hp-change-detail-row hp-change-detail-current\"><span>Turno actual</span><b>'+escH(c.despues||'Sin turno')+' · '+_hpFmtHoras(c.horasDespues)+'</b></div>'+\n    '<div class=\"hp-change-detail-row\"><span>Diferencia</span><b>'+escH(_hpFmtDelta(c.delta))+'</b></div>'+\n    (c.por?'<div class=\"hp-change-detail-row\"><span>Guardado por</span><b>'+escH(c.por)+'</b></div>':'');\n",
"  var perenHtml='';\n  if(c.perenDur){\n    var esCp=String(c.perenTipo||'').toLowerCase()==='cp';\n    var perenCero=!String(c.perenDur).replace(/[0:.,\\s-]/g,'');\n    var perenValor=perenCero?'0:00':((esCp?'−':'+')+String(c.perenDur));\n    perenHtml='<div class=\"hp-change-detail-row hp-change-detail-peren\"><span>'+(esCp?'Horas CP':'H. perentorias')+'</span><b>'+escH(perenValor)+' · No computan</b></div>';\n  }\n  if(body)body.innerHTML=\n    '<div class=\"hp-change-detail-row\"><span>Tipo</span><b>'+escH(c.tipo||'Cambio')+'</b></div>'+\n    '<div class=\"hp-change-detail-row\"><span>Turno anterior</span><b>'+escH(c.antes||'Sin turno')+' · '+_hpFmtHoras(c.horasAntes)+'</b></div>'+\n    '<div class=\"hp-change-detail-row hp-change-detail-current\"><span>Turno actual</span><b>'+escH(c.despues||'Sin turno')+' · '+_hpFmtHoras(c.horasDespues)+'</b></div>'+\n    perenHtml+\n    '<div class=\"hp-change-detail-row\"><span>'+(c.perenDur?'Diferencia jornada':'Diferencia')+'</span><b>'+escH(_hpFmtDelta(c.delta))+'</b></div>'+\n    (c.por?'<div class=\"hp-change-detail-row\"><span>Guardado por</span><b>'+escH(c.por)+'</b></div>':'');\n",
'render perentoria detail')

repl(
"  if(typeof _getCambioCompartidoEmpleado==='function'){\n    var c=_getCambioCompartidoEmpleado(emp,new Date(year,idx,dia));\n    if(c)return true;\n  }\n",
"  if(typeof _getCambioCompartidoEmpleado==='function'){\n    var c=_getCambioCompartidoEmpleado(emp,new Date(year,idx,dia));\n    if(c){\n      var base=(dias[dia]||dias[String(dia)]||null);\n      var publico=(typeof _aplicarCambioCompartidoPublico==='function')?_aplicarCambioCompartidoPublico(c,base,false):base;\n      if(publico!==base)return true;\n    }\n  }\n",
'hide private-only change availability')

repl(
"  var cambioCompartido=_getCambioCompartidoEmpleado(emp,fechaEvento);\n  if(cambioCompartido)turno=_cambioToTurno(cambioCompartido);\n",
"  var cambioCompartido=_getCambioCompartidoEmpleado(emp,fechaEvento);\n  if(cambioCompartido){\n    var turnoAntesCambio=turno;\n    turno=(typeof _aplicarCambioCompartidoPublico==='function')?_aplicarCambioCompartidoPublico(cambioCompartido,turno,false):_cambioToTurno(cambioCompartido,turno);\n    if(typeof _esPerenPrivadaCompartida==='function'&&_esPerenPrivadaCompartida(cambioCompartido)&&turno===turnoAntesCambio)cambioCompartido=null;\n  }\n",
'hide private-only change from event finder')

repl(
"        try{if(typeof _getCambioCompartidoEmpleado==='function')cambio=_getCambioCompartidoEmpleado(emp,date);}catch(e){cambio=null;}\n        var finalDay=base;\n        if(cambio){\n          if(typeof _hpCambioToTurnoHoras==='function')finalDay=_hpCambioToTurnoHoras(cambio,base);\n          else if(typeof _cambioToTurno==='function')finalDay=_cambioToTurno(cambio,base,false);\n        }\n",
"        try{if(typeof _getCambioCompartidoEmpleado==='function')cambio=_getCambioCompartidoEmpleado(emp,date);}catch(e){cambio=null;}\n        var finalDay=base;\n        if(cambio){\n          if(typeof _esPerenPrivadaCompartida==='function'&&_esPerenPrivadaCompartida(cambio)&&typeof _aplicarCambioCompartidoPublico==='function')finalDay=_aplicarCambioCompartidoPublico(cambio,base,false);\n          else if(typeof _hpCambioToTurnoHoras==='function')finalDay=_hpCambioToTurnoHoras(cambio,base);\n          else if(typeof _cambioToTurno==='function')finalDay=_cambioToTurno(cambio,base,false);\n        }\n",
'hide private overlay from shift errors')

repl(
"  // Perentorias/CP y HFUN son anotaciones adicionales: mantienen el turno y sus\n  // horas, pero deben verse claramente en el calendario y en la lista de cambios.\n",
"  // Perentorias/CP y HFUN son anotaciones adicionales: mantienen el turno y sus\n  // horas. Las perentorias compartidas se muestran únicamente en Horas plantilla.\n",
'privacy comment')

if text==orig:
    raise SystemExit('No changes')
payload=base64.b64encode(text.encode('utf-8')).decode('ascii')
index_text=index_text[:match.start(3)]+payload+index_text[match.end(3):]
index_path.write_text(index_text,encoding='utf-8')

sw_path=Path('sw.js')
sw=sw_path.read_text(encoding='utf-8')
sw=sw.replace('HERRAMIENTAS SW V74 - MENU JSON BAJO LA NUBE','HERRAMIENTAS SW V75 - PERENTORIAS PRIVADAS EN HORAS PLANTILLA')
sw=sw.replace("const CACHE='herramientas-turnos-v74';","const CACHE='herramientas-turnos-v75';")
sw_path.write_text(sw,encoding='utf-8')
print('MOTOR_B64 corregido', len(orig), '->', len(text))
