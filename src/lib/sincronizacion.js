/**
 * Estado de la sincronización de precios y stock con el sistema del súper.
 *
 * La PC del súper corre de lunes a sábado a las 8:15 y 17:15 (con un reintento
 * a las 8:45 y 17:45); el sistema genera el archivo a las 8:00 y 17:00 sólo si
 * la PC está prendida. Los domingos no corre.
 */

const TURNOS = [
  { hora: 8,  minuto: 15 },
  { hora: 17, minuto: 15 },
];
// Margen después del turno antes de darlo por perdido (cubre el reintento de :45).
const MARGEN_MIN = 50;
// Una corrida cuenta para el turno si llegó desde 20 min antes de la hora.
const ANTICIPO_MIN = 20;

const esDiaDeSincronizacion = fecha => fecha.getDay() !== 0; // 0 = domingo

/** El último turno que ya tendría que haber llegado (en hora local). */
export function ultimoTurnoEsperado(ahora = new Date()) {
  const dia = new Date(ahora);
  for (let i = 0; i < 8; i++) {
    if (esDiaDeSincronizacion(dia)) {
      for (const t of [...TURNOS].reverse()) {
        const turno = new Date(dia);
        turno.setHours(t.hora, t.minuto, 0, 0);
        const limite = new Date(turno.getTime() + MARGEN_MIN * 60000);
        if (limite <= ahora) return turno;
      }
    }
    dia.setDate(dia.getDate() - 1);
    dia.setHours(23, 59, 59, 999);
  }
  return null;
}

/**
 * A partir de las últimas corridas (más nueva primero, sin simulaciones)
 * devuelve { estado: 'ok' | 'atrasado' | 'error' | 'sin_datos', ultimaOk, ultimoError, turno }.
 */
export function estadoSincronizacion(corridas, ahora = new Date()) {
  const ultimaOk = corridas.find(c => c.ok) || null;
  const ultimoError = corridas.find(c => !c.ok) || null;
  const turno = ultimoTurnoEsperado(ahora);

  if (!ultimaOk && !ultimoError) return { estado: 'sin_datos', ultimaOk, ultimoError, turno };

  // Falló algo después de la última que salió bien (archivo cortado, otro archivo...).
  if (ultimoError && (!ultimaOk || new Date(ultimoError.fecha) > new Date(ultimaOk.fecha))) {
    return { estado: 'error', ultimaOk, ultimoError, turno };
  }

  const llegoElTurno = turno && ultimaOk &&
    new Date(ultimaOk.fecha).getTime() >= turno.getTime() - ANTICIPO_MIN * 60000;

  return { estado: llegoElTurno || !turno ? 'ok' : 'atrasado', ultimaOk, ultimoError, turno };
}

/** "hoy a las 17:15", "ayer a las 8:15", "sáb 21/11 a las 17:15" */
export function cuandoFue(fecha, ahora = new Date()) {
  const f = new Date(fecha);
  // 24 h ("17:15"): con es-AR el navegador a veces muestra "05:15 p. m.".
  const hora = `${f.getHours()}:${String(f.getMinutes()).padStart(2, '0')}`;
  const dia = d => d.toLocaleDateString('en-CA');
  const ayer = new Date(ahora); ayer.setDate(ayer.getDate() - 1);
  if (dia(f) === dia(ahora)) return `hoy a las ${hora}`;
  if (dia(f) === dia(ayer)) return `ayer a las ${hora}`;
  const fechaTxt = f.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return `${fechaTxt} a las ${hora}`;
}

/** Nombre del turno: "8:15" o "17:15" con su día. */
export function nombreTurno(turno, ahora = new Date()) {
  if (!turno) return '';
  return cuandoFue(turno, ahora);
}
