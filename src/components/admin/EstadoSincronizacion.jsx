'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { estadoSincronizacion, cuandoFue, nombreTurno } from '@/lib/sincronizacion';

const ESTILO = {
  ok:        { caja: 'border-green-200 bg-green-50/60',  texto: 'text-green-700', Icono: CheckCircle2,  titulo: 'Precios y stock al día' },
  atrasado:  { caja: 'border-amber-200 bg-amber-50/70',  texto: 'text-amber-700', Icono: AlertTriangle, titulo: 'Precios y stock sin actualizar' },
  error:     { caja: 'border-red-200 bg-red-50/70',      texto: 'text-red-700',   Icono: XCircle,       titulo: 'La última actualización falló' },
  sin_datos: { caja: 'border-gray-200 bg-white',         texto: 'text-gray-600',  Icono: RefreshCw,     titulo: 'Todavía no hubo actualizaciones' },
};

/**
 * Recuadro del dashboard: si la página está mostrando los precios y el stock
 * del último archivo del sistema del súper, y las últimas corridas.
 */
export default function EstadoSincronizacion() {
  const [corridas, setCorridas] = useState(null);
  const [falla, setFalla] = useState(false);

  useEffect(() => {
    let cancelado = false;
    createClient().auth.getSession()
      .then(({ data: { session } }) => fetch('/api/admin/sincronizacion', {
        cache: 'no-store',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      }))
      .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(json => { if (!cancelado) setCorridas(json.corridas || []); })
      .catch(() => { if (!cancelado) setFalla(true); });
    return () => { cancelado = true; };
  }, []);

  if (falla) {
    return (
      <div className="card p-5 mb-8 text-sm text-gray-500">
        No se pudo leer el estado de la actualización de precios y stock. Probá recargar la página.
      </div>
    );
  }

  if (!corridas) {
    return <div className="card p-5 mb-8 h-28 animate-pulse" />;
  }

  const ahora = new Date();
  const { estado, ultimaOk, ultimoError, turno } = estadoSincronizacion(corridas, ahora);
  const { caja, texto, Icono, titulo } = ESTILO[estado];

  return (
    <div className={`rounded-2xl border p-5 mb-8 ${caja}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <Icono className={`w-6 h-6 flex-shrink-0 mt-0.5 ${texto}`} />
          <div className="min-w-0">
            <h2 className={`font-bold ${texto}`}>{titulo}</h2>

            {ultimaOk && (
              <p className="text-sm text-gray-700 mt-0.5">
                Última actualización: <strong>{cuandoFue(ultimaOk.fecha, ahora)}</strong>
                {' — '}{ultimaOk.actualizados ?? 0} producto{ultimaOk.actualizados === 1 ? '' : 's'} cambiaron de precio o stock.
              </p>
            )}

            {estado === 'atrasado' && (
              <p className="text-sm text-amber-800 mt-1">
                No llegó la de {nombreTurno(turno, ahora)}. Revisá que la PC del súper haya estado
                prendida a las {turno?.getHours() === 8 ? '8:00' : '17:00'}, que es cuando el sistema genera el archivo.
              </p>
            )}

            {estado === 'error' && ultimoError && (
              <p className="text-sm text-red-800 mt-1">
                {cuandoFue(ultimoError.fecha, ahora)}: {ultimoError.mensaje} La página sigue con los
                precios de la última actualización que salió bien.
              </p>
            )}

            {estado === 'sin_datos' && (
              <p className="text-sm text-gray-500 mt-0.5">
                Cuando la PC del súper mande el primer archivo, vas a verlo acá.
              </p>
            )}
          </div>
        </div>
      </div>

      {corridas.length > 1 && (
        <div className="mt-4 pt-3 border-t border-black/5">
          <p className="text-xs font-semibold text-gray-500 mb-1.5">Últimas actualizaciones</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {corridas.slice(0, 5).map(c => (
              <li key={c.id} className="text-xs text-gray-600 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${c.ok ? 'bg-green-500' : 'bg-red-500'}`} />
                {cuandoFue(c.fecha, ahora)}
                <span className="text-gray-400">· {c.ok ? `${c.actualizados ?? 0} cambios` : 'falló'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
