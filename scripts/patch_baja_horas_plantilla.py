from pathlib import Path
import base64
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: se esperaban 1 coincidencia y hay {count}')
    return text.replace(old, new, 1)


index_path = Path('index.html')
index_text = index_path.read_text(encoding='utf-8')
match = re.search(r'var MOTOR_B64="([A-Za-z0-9+/=]+)";', index_text)
if not match:
    raise SystemExit('No se encontró MOTOR_B64')

motor = base64.b64decode(match.group(1)).decode('utf-8')

old_local = """  if(!esHL&&_hpCambioSustituyePorNoTrabajo(tipo)&&!_hpPerenDur(local)&&!_hpHfunDur(local)){
    return Object.assign({},local,{e1:'',s1:'',e2:'',s2:'',total:0,cambioCompartido:true,etiquetaCambio:_hpEtiquetaCambioNoHL(local)});
  }
"""
new_local = """  // Una baja mantiene la jornada planificada: cambia el estado, no las horas.
  if(!esHL&&tipo==='baja'&&turnoOriginal&&_turnoGrupoTieneHoras(turnoOriginal)){
    return Object.assign({},turnoOriginal,local,{
      tipo:'baja',
      e1:turnoOriginal.e1||'',
      s1:turnoOriginal.s1||'',
      e2:turnoOriginal.e2||'',
      s2:turnoOriginal.s2||'',
      total:turnoOriginal.total,
      cambioCompartido:true,
      etiquetaCambio:_hpEtiquetaCambioNoHL(local)
    });
  }
  if(!esHL&&_hpCambioSustituyePorNoTrabajo(tipo)&&!_hpPerenDur(local)&&!_hpHfunDur(local)){
    return Object.assign({},local,{e1:'',s1:'',e2:'',s2:'',total:0,cambioCompartido:true,etiquetaCambio:_hpEtiquetaCambioNoHL(local)});
  }
"""
motor = replace_once(motor, old_local, new_local, 'baja local')

shared_block = """  // La baja conserva el turno planificado y sus horas, pero se muestra como BAJA.
  if(tipo==='baja'&&turnoOriginal&&_turnoGrupoTieneHoras(turnoOriginal)){
    return Object.assign({},turnoOriginal,{
      tipo:'baja',
      cambioCompartido:true,
      etiquetaCambio:etiqueta,
      actualizadoPor:c.actualizado_por||c.email||''
    });
  }

"""
shared_return = "return {tipo:(tipo==='dl'||tipo==='descanso'?'libre':tipo),e1:'',s1:'',e2:'',s2:'',total:0,cambioCompartido:true,etiquetaCambio:etiqueta,actualizadoPor:c.actualizado_por||c.email||''};"
return_pos = motor.find(shared_return)
if return_pos < 0:
    raise SystemExit('No se encontró el retorno de los estados no trabajados')
function_pos = motor.rfind('function _hpCambioToTurnoHoras', 0, return_pos)
if function_pos < 0:
    raise SystemExit('No se encontró _hpCambioToTurnoHoras')
if shared_block.strip() not in motor[function_pos:return_pos]:
    if_pos = motor.rfind('\n  if(', function_pos, return_pos)
    if if_pos < 0:
        raise SystemExit('No se encontró la condición de estados no trabajados')
    motor = motor[:if_pos + 1] + shared_block + motor[if_pos + 1:]

encoded = base64.b64encode(motor.encode('utf-8')).decode('ascii')
index_text = index_text[:match.start(1)] + encoded + index_text[match.end(1):]
index_path.write_text(index_text, encoding='utf-8')

sw_path = Path('sw.js')
sw = sw_path.read_text(encoding='utf-8')
sw = replace_once(
    sw,
    "/* HERRAMIENTAS SW V76 - RECUPERACION EN EQUIPOS NUEVOS */\nconst CACHE='herramientas-turnos-v76';",
    "/* HERRAMIENTAS SW V77 - BAJA CONSERVA HORAS EN PLANTILLA */\nconst CACHE='herramientas-turnos-v77';",
    'versión de caché'
)
sw_path.write_text(sw, encoding='utf-8')

Path('/tmp/MOTOR_BAJA_VALIDAR.js').write_text(motor, encoding='utf-8')
print('Parche de BAJA aplicado correctamente')
