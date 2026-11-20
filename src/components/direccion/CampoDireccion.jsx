'use client';

import { MapPin, LocateFixed, Map as MapIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { RADIO_MAXIMO_KM, COSTO_ENVIO } from '@/lib/envio';
import { formatPrecio } from '@/lib/productos-shared';
import MapaDireccion from './MapaDireccion';

/**
 * Campo de dirección con verificación automática y mapa para ajustar el punto
 * (como en las apps de delivery). Se alimenta del hook `useDireccion`.
 *
 * - mostrarEnvio: en el checkout muestra "Llegamos hasta ahí — envío $1.000";
 *   en el registro / Mi cuenta sólo se avisa si queda fuera del reparto.
 * - requerido: marca la calle como obligatoria (checkout).
 */
export default function CampoDireccion({ dir, mostrarEnvio = false, requerido = false }) {
  const { direccion, depto, geo, estado, error, aviso, mapaAbierto } = dir;
  const verMapa = mapaAbierto || !!geo;

  return (
    <div>
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            Calle y número{requerido ? ' *' : ''}
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              name="direccion"
              value={direccion}
              onChange={e => dir.setDireccion(e.target.value)}
              onBlur={dir.alSalir}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); dir.verificar(); } }}
              className="input pl-10"
              placeholder="Ej: Corrientes 99"
              autoComplete="street-address"
              required={requerido}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Piso / Depto</label>
          <input
            name="depto"
            value={depto}
            onChange={e => dir.setDepto(e.target.value)}
            className="input"
            placeholder="Ej: 3° B"
          />
        </div>
      </div>

      {/* Estado de la verificación */}
      {estado === 'loading' && (
        <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1.5">
          <span className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          Verificando dirección...
        </p>
      )}

      {estado === 'ok' && geo && (
        <div className="mt-1.5">
          <p className="text-xs text-green-600 flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {mostrarEnvio
              ? <>Llegamos hasta ahí ({geo.distanciaKm.toFixed(1)} km del local) — envío {formatPrecio(COSTO_ENVIO)}</>
              : <>Dirección encontrada, dentro de nuestra zona de reparto ({geo.distanciaKm.toFixed(1)} km del local)</>}
          </p>
          {geo.direccionFormateada && (
            <p className="text-xs text-gray-400 mt-0.5 ml-5">Dirección encontrada: {geo.direccionFormateada}</p>
          )}
        </div>
      )}

      {estado === 'fuera_rango' && geo && (
        <div className="mt-1.5">
          <p className="text-xs text-red-600 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {mostrarEnvio
              ? <>Esa dirección está a {geo.distanciaKm.toFixed(1)} km del local, fuera de nuestro radio de reparto ({RADIO_MAXIMO_KM} km). Elegí "Retiro en el local" o probá con otra dirección.</>
              : <>La dirección está a {geo.distanciaKm.toFixed(1)} km del local, fuera de nuestro radio de reparto ({RADIO_MAXIMO_KM} km). Podés guardarla igual, pero solo vas a poder retirar en el local.</>}
          </p>
          {geo.direccionFormateada && (
            <p className="text-xs text-gray-400 mt-0.5 ml-5">Interpretamos: {geo.direccionFormateada}</p>
          )}
        </div>
      )}

      {estado === 'error' && (
        <p className="text-xs text-red-600 mt-1.5 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </p>
      )}

      {aviso && (estado === 'ok' || estado === 'fuera_rango') && (
        <p className="text-xs text-amber-600 mt-1.5 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {aviso}
        </p>
      )}

      {/* Acciones del mapa */}
      <div className="flex flex-wrap gap-2 mt-3">
        <button type="button" onClick={dir.usarMiUbicacion}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-purple-700 bg-brand-purple-50 hover:bg-brand-purple-100 px-3 py-2 rounded-lg transition-colors">
          <LocateFixed className="w-3.5 h-3.5" />Usar mi ubicación actual
        </button>
        {!verMapa && (
          <button type="button" onClick={dir.abrirMapa}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg transition-colors">
            <MapIcon className="w-3.5 h-3.5" />Elegir en el mapa
          </button>
        )}
      </div>

      {verMapa && (
        <div className="mt-3">
          <MapaDireccion lat={geo?.lat ?? null} lng={geo?.lng ?? null} onMover={dir.moverPunto} />
          <p className="text-xs text-gray-400 mt-1.5">
            Tocá el mapa o arrastrá el pin para marcar tu puerta. El círculo punteado es la zona de reparto
            ({RADIO_MAXIMO_KM} km alrededor del local 🏪).
          </p>
        </div>
      )}
    </div>
  );
}
