/**
 * Carga de productos para Server Components — fetch directo a la API REST de
 * Supabase. La normalización vive en productos-shared.js.
 *
 * Todas las funciones piden sólo lo que la pantalla necesita. Antes había un
 * `getProductosServer()` que traía las ~2300 filas para mostrar 6 destacados y
 * 5 ofertas, y la home pagaba ese fetch completo en cada revalidación.
 */
import { normalizar, COLUMNAS } from '@/lib/productos-shared';

const PUBLICADO = 'publicado=eq.true&precio=gt.0';

function credenciales() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

/**
 * @param {string} query  querystring de PostgREST ya armada
 * @param {boolean} conTotal  pide el header Content-Range para contar filas
 */
async function consultar(query, { conTotal = false } = {}) {
  const cred = credenciales();
  if (!cred) return { filas: [], total: 0 };

  try {
    const headers = {
      apikey: cred.key,
      Authorization: `Bearer ${cred.key}`,
      ...(conTotal ? { Prefer: 'count=exact' } : {}),
    };

    const res = await fetch(`${cred.url}/rest/v1/productos?${query}`, {
      headers,
      next: { revalidate: 60 },
    });
    if (!res.ok) return { filas: [], total: 0 };

    const filas = await res.json();
    // Content-Range viene como "0-23/2325"; lo que interesa es lo de después
    // de la barra.
    const rango = res.headers.get('content-range') || '';
    const total = Number(rango.split('/')[1]) || filas.length;

    return { filas: filas || [], total };
  } catch {
    return { filas: [], total: 0 };
  }
}

const SELECT = `select=${COLUMNAS.join(',')}`;

/** Un producto por id — para la página de detalle y sus metadatos. */
export async function getProductoServer(id) {
  if (!id) return null;
  const { filas } = await consultar(`${SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`);
  return filas.length ? normalizar(filas[0]) : null;
}

/** Otros productos de la misma categoría, para el bloque "También te puede interesar". */
export async function getRelacionadosServer(categoria, excluirId, limite = 4) {
  if (!categoria) return [];
  const { filas } = await consultar(
    `${SELECT}&${PUBLICADO}&categoria=eq.${encodeURIComponent(categoria)}` +
    `&id=neq.${encodeURIComponent(excluirId)}&order=destacado.desc,descripcion&limit=${limite}`
  );
  return filas.map(normalizar);
}

export async function getDestacadosServer(limite = 6) {
  const { filas } = await consultar(
    `${SELECT}&${PUBLICADO}&destacado=eq.true&order=descripcion&limit=${limite}`
  );
  return filas.map(normalizar);
}

export async function getOfertasServer(limite = 5) {
  const { filas } = await consultar(
    `${SELECT}&${PUBLICADO}&oferta=eq.true&order=descripcion&limit=${limite}`
  );
  return filas.map(normalizar);
}

/** Sólo el número, para el texto del CTA de la home. No baja ninguna fila. */
export async function contarProductosServer() {
  const { total } = await consultar(`select=id&${PUBLICADO}&limit=1`, { conTotal: true });
  return total;
}
