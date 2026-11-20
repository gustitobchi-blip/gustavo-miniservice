import { LOCAL_LAT, LOCAL_LNG } from '@/lib/envio';

const HEADERS = {
  // La política de uso de Nominatim exige identificar la app que hace la llamada.
  'User-Agent': 'gustavo-miniservice-checkout/1.0',
  'Accept-Language': 'es',
};

/**
 * Dos usos, según lo que llegue:
 *  - { direccion }  → busca la dirección escrita y devuelve sus coordenadas.
 *  - { lat, lng }   → "geocodificación inversa": dado un punto del mapa,
 *                     devuelve qué dirección es (para cuando el cliente mueve el pin).
 */
export async function POST(request) {
  try {
    const body = await request.json();

    if (typeof body.lat === 'number' && typeof body.lng === 'number') {
      return await inversa(body.lat, body.lng);
    }

    const { direccion } = body;
    if (!direccion || !direccion.trim()) {
      return Response.json({ error: 'Falta la dirección' }, { status: 400 });
    }

    // Solo se agrega la provincia (no la ciudad): forzar "San Miguel de Tucumán"
    // hace que Nominatim matchee mal direcciones de otras localidades (ej. "Tafí
    // Viejo" terminaba resolviendo a una calle homónima dentro de la capital).
    const query = `${direccion}, Tucumán, Argentina`;

    // viewbox sin bounded=1: prioriza resultados cercanos al local ante
    // direcciones ambiguas, pero sigue resolviendo bien las que están lejos de
    // verdad (necesario para poder rechazarlas por radio).
    const margen = 0.5; // ~55km
    const viewbox = [
      LOCAL_LNG - margen, LOCAL_LAT + margen,
      LOCAL_LNG + margen, LOCAL_LAT - margen,
    ].join(',');

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1&countrycodes=ar&viewbox=${viewbox}`;

    const res = await fetch(url, { headers: HEADERS });
    const data = await res.json();

    if (!data?.length) {
      return Response.json({ error: 'No pudimos encontrar esa dirección. Revisá que esté bien escrita.' }, { status: 404 });
    }

    const resultado = data[0];

    return Response.json({
      lat: parseFloat(resultado.lat),
      lng: parseFloat(resultado.lon),
      direccionFormateada: resultado.display_name,
      ...partesDe(resultado.address),
    });
  } catch (err) {
    console.error('[geocodificar]', err);
    return Response.json({ error: 'Error al geocodificar la dirección' }, { status: 500 });
  }
}

async function inversa(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: 'Ubicación inválida' }, { status: 400 });
  }

  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18`;
  const res = await fetch(url, { headers: HEADERS });
  const data = await res.json();

  // Sin dirección conocida en ese punto (descampado, río...): el pin igual vale
  // como ubicación, solo que no hay calle para completar.
  if (!data || data.error) {
    return Response.json({ lat, lng, direccionFormateada: '', calle: '', numero: '', barrio: '', ciudad: '' });
  }

  return Response.json({
    lat,
    lng,
    direccionFormateada: data.display_name || '',
    ...partesDe(data.address),
  });
}

/** Saca de la respuesta de Nominatim las partes que usa el formulario. */
function partesDe(a = {}) {
  return {
    calle:  a.road || a.pedestrian || a.footway || '',
    numero: a.house_number || '',
    barrio: a.neighbourhood || a.suburb || a.quarter || '',
    ciudad: a.city || a.town || a.village || a.municipality || '',
  };
}
