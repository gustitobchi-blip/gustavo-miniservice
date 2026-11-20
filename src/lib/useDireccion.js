'use client';

/**
 * Lógica de "dirección de entrega" compartida por el registro, Mi cuenta y el
 * carrito: el cliente escribe la calle (o elige el punto en el mapa), la
 * dirección se verifica contra OpenStreetMap y se calcula si cae dentro del
 * radio de reparto.
 *
 * estado: idle | loading | ok | fuera_rango | error
 *   - ok / fuera_rango  → la dirección existe (fuera_rango: está a más de 3 km).
 *   - error             → no se encontró.
 */
import { useState, useRef, useCallback } from 'react';
import { distanciaDesdeLocal, RADIO_MAXIMO_KM } from '@/lib/envio';

async function pedir(body) {
  const res = await fetch('/api/geocodificar', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'No pudimos verificar la dirección.');
  return data;
}

const estadoPara = km => (km > RADIO_MAXIMO_KM ? 'fuera_rango' : 'ok');
const tieneNumero = texto => /\d/.test(texto) || /\bs\s*\/\s*n\b/i.test(texto);
const AVISO_NUMERO = 'Falta el número de la calle: agregalo para que el cadete te encuentre.';

export function useDireccion() {
  const [direccion, setDireccionState] = useState('');
  const [depto, setDepto]       = useState('');
  const [geo, setGeo]           = useState(null); // { lat, lng, distanciaKm, direccionFormateada, barrio, ciudad }
  const [estado, setEstado]     = useState('idle');
  const [error, setError]       = useState('');
  const [aviso, setAviso]       = useState('');
  const [mapaAbierto, setMapaAbierto] = useState(false);

  // Refs: los handlers de blur / fin de arrastre corren con valores de render
  // viejos, y una respuesta lenta no debe pisar a una más nueva.
  const textoRef      = useRef('');
  const verificadoRef = useRef('');   // texto para el que ya hay un punto en el mapa
  const secuencia     = useRef(0);

  const guardarTexto = texto => {
    textoRef.current = texto;
    setDireccionState(texto);
  };

  /** Mientras escribe: el punto anterior ya no corresponde a lo que dice el campo. */
  const setDireccion = useCallback(texto => {
    secuencia.current += 1;
    guardarTexto(texto);
    verificadoRef.current = '';
    setGeo(null);
    setEstado('idle');
    setError('');
    setAviso('');
  }, []);

  /** Busca lo escrito en el campo. Devuelve { estado, geo } (null si quedó vieja). */
  const verificar = useCallback(async (texto = textoRef.current) => {
    const limpio = String(texto || '').trim();
    if (!limpio) return { estado: 'idle', geo: null };

    const mi = ++secuencia.current;
    setEstado('loading');
    setError('');
    setAviso('');
    try {
      const d = await pedir({ direccion: limpio });
      if (mi !== secuencia.current) return null;

      const km = distanciaDesdeLocal(d.lat, d.lng);
      const nuevo = {
        lat: d.lat, lng: d.lng, distanciaKm: km,
        direccionFormateada: d.direccionFormateada, barrio: d.barrio || '', ciudad: d.ciudad || '',
      };
      const est = estadoPara(km);
      verificadoRef.current = limpio;
      setGeo(nuevo);
      setEstado(est);
      setAviso(tieneNumero(limpio) ? '' : AVISO_NUMERO);
      return { estado: est, geo: nuevo };
    } catch (err) {
      if (mi !== secuencia.current) return null;
      setGeo(null);
      setEstado('error');
      setError(err.message || 'No pudimos verificar la dirección. Probá de nuevo.');
      return { estado: 'error', geo: null };
    }
  }, []);

  /** Al salir del campo: sólo busca si el texto cambió desde la última verificación. */
  const alSalir = useCallback(() => {
    const texto = textoRef.current.trim();
    if (texto && texto !== verificadoRef.current) verificar(texto);
  }, [verificar]);

  /**
   * El cliente movió el pin (o tocó el mapa / usó su ubicación). El pin manda:
   * recalcula la distancia al instante y después averigua qué calle es.
   * `reemplazarTexto`: pisa lo escrito aunque no venga número de puerta.
   */
  const moverPunto = useCallback(async (lat, lng, { reemplazarTexto = false } = {}) => {
    const mi = ++secuencia.current;
    const km = distanciaDesdeLocal(lat, lng);
    const est = estadoPara(km);

    setGeo(prev => ({ direccionFormateada: '', barrio: '', ciudad: '', ...(prev || {}), lat, lng, distanciaKm: km }));
    setEstado(est);
    setError('');
    setMapaAbierto(true);

    try {
      const d = await pedir({ lat, lng });
      if (mi !== secuencia.current) return;

      let texto = textoRef.current;
      if (d.calle) {
        const completa = d.numero ? `${d.calle} ${d.numero}` : d.calle;
        if (d.numero || reemplazarTexto || !texto.trim()) texto = completa;
      }
      guardarTexto(texto);
      verificadoRef.current = texto.trim();

      setGeo({
        lat, lng, distanciaKm: km,
        direccionFormateada: d.direccionFormateada || '',
        barrio: d.barrio || '', ciudad: d.ciudad || '',
      });
      setAviso(texto.trim() && !tieneNumero(texto) ? AVISO_NUMERO : '');
    } catch {
      // Sin la calle igual vale el punto: sólo avisamos que lo complete a mano.
      if (mi !== secuencia.current) return;
      verificadoRef.current = textoRef.current.trim();
      setAviso(textoRef.current.trim() ? '' : 'Marcamos tu punto, pero no pudimos leer la calle. Escribila en el campo.');
    }
  }, []);

  const usarMiUbicacion = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setEstado('error');
      setError('Tu navegador no permite obtener la ubicación. Escribí la dirección.');
      return;
    }
    setEstado('loading');
    setError('');
    navigator.geolocation.getCurrentPosition(
      pos => moverPunto(pos.coords.latitude, pos.coords.longitude, { reemplazarTexto: true }),
      () => {
        setEstado('error');
        setError('No pudimos obtener tu ubicación. Permití el acceso en el navegador o escribí la dirección.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [moverPunto]);

  /**
   * Carga una dirección ya guardada (perfil / registro). Si trae coordenadas no
   * hace falta volver a buscarla. Por defecto no pisa lo que el cliente ya escribió.
   */
  const cargar = useCallback(({ direccion: dir, depto: dep, lat, lng } = {}, { forzar = false } = {}) => {
    if (!forzar && textoRef.current.trim()) return;
    const texto = String(dir || '');
    if (!texto.trim() && lat == null) return;

    guardarTexto(texto);
    setDepto(dep || '');

    if (lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      const km = distanciaDesdeLocal(Number(lat), Number(lng));
      verificadoRef.current = texto.trim();
      setGeo({ lat: Number(lat), lng: Number(lng), distanciaKm: km, direccionFormateada: texto, barrio: '', ciudad: '' });
      setEstado(estadoPara(km));
      setAviso('');
    } else if (texto.trim()) {
      verificar(texto);
    }
  }, [verificar]);

  /** Para guardar: asegura que lo escrito esté verificado (por si no salió del campo). */
  const asegurar = useCallback(async () => {
    if (!textoRef.current.trim() && !geo) return { estado: 'idle', geo: null };
    if (estado === 'ok' || estado === 'fuera_rango') return { estado, geo };
    return (await verificar()) || { estado: 'idle', geo: null };
  }, [estado, geo, verificar]);

  return {
    direccion, depto, geo, estado, error, aviso, mapaAbierto,
    setDireccion, setDepto, verificar, alSalir, moverPunto, usarMiUbicacion,
    abrirMapa: () => setMapaAbierto(true),
    cargar, asegurar,
  };
}
