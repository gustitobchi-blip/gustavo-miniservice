'use client';

/**
 * Carga de productos desde el browser, siempre paginada.
 *
 * Antes existía un `getProductos()` que bajaba la tabla completa y filtraba en
 * memoria. Con ~2300 productos eso eran varios MB por visita y el catálogo
 * tardaba segundos en pintar. Ahora el filtrado, el orden y el corte los hace
 * Supabase, y el browser recibe sólo la página que está mirando.
 */
import { createClient } from '@/lib/supabase/client';
import { normalizar, COLUMNAS, POR_PAGINA, terminosBusqueda, limpiarBusqueda } from '@/lib/productos-shared';

export { formatPrecio } from '@/lib/productos-shared';

/** Lo que ve el cliente: sólo publicado y con precio cargado. */
function base(supabase, select, opciones) {
  return supabase
    .from('productos')
    .select(select, opciones)
    .eq('publicado', true)
    .gt('precio', 0);
}

function aplicarBusqueda(query, q) {
  const palabras = terminosBusqueda(q);
  if (!palabras.length) return query;

  // Un número suelto suele ser el código del producto, no parte del nombre.
  if (palabras.length === 1 && /^\d+$/.test(palabras[0])) {
    return query.or(
      `descripcion.ilike.%${palabras[0]}%,descripcion_web.ilike.%${palabras[0]}%,codigo.ilike.%${palabras[0]}%`
    );
  }

  // Varias palabras: tienen que aparecer todas, en cualquier orden. Así
  // "coca 2 litros" encuentra "COCA COLA 2.25 LT", que con un ilike de la
  // frase entera no aparecía nunca. Cada `or` encadenado se combina con AND,
  // y adentro de cada uno se mira la descripción del miniservice y la web
  // (que es el nombre que termina viendo el cliente).
  return palabras.reduce(
    (acc, palabra) => acc.or(`descripcion.ilike.%${palabra}%,descripcion_web.ilike.%${palabra}%`),
    query
  );
}

function aplicarOrden(query, orden) {
  switch (orden) {
    case 'precio-asc':  return query.order('precio', { ascending: true });
    case 'precio-desc': return query.order('precio', { ascending: false });
    case 'nombre':      return query.order('descripcion', { ascending: true });
    default:            return query.order('destacado', { ascending: false }).order('descripcion');
  }
}

/**
 * Una página del catálogo. Devuelve además el total para poder dibujar el
 * paginador sin traer el resto de las filas.
 */
export async function buscarProductos({
  q = '',
  categoria = '',
  soloOfertas = false,
  soloConStock = false,
  precioMin = null,
  precioMax = null,
  orden = 'destacados',
  pagina = 1,
  porPagina = POR_PAGINA,
} = {}) {
  try {
    const supabase = createClient();
    const desde = (pagina - 1) * porPagina;

    let query = base(supabase, COLUMNAS.join(','), { count: 'exact' });
    query = aplicarBusqueda(query, q);
    if (categoria)    query = query.eq('categoria', categoria);
    if (soloOfertas)  query = query.eq('oferta', true);
    if (soloConStock) query = query.gt('stock', 0);
    if (precioMin !== null && precioMin !== '') query = query.gte('precio', Number(precioMin));
    if (precioMax !== null && precioMax !== '') query = query.lte('precio', Number(precioMax));

    // El `id` desempata: sin un orden total, dos páginas seguidas pueden
    // repetir o saltear filas.
    query = aplicarOrden(query, orden).order('id');

    const { data, count, error } = await query.range(desde, desde + porPagina - 1);
    if (error) throw error;

    const total = count || 0;
    return {
      items: (data || []).map(normalizar),
      total,
      totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
    };
  } catch (err) {
    console.error('buscarProductos error:', err);
    return { items: [], total: 0, totalPaginas: 1 };
  }
}

/**
 * Sugerencias del buscador. Se dispara mientras el cliente tipea, así que trae
 * pocas filas y sin `count` (contar es lo caro de la query).
 */
export async function sugerirProductos(q, limite = 6) {
  if (!terminosBusqueda(q).length) return [];
  try {
    const supabase = createClient();
    let query = base(supabase, COLUMNAS.join(','));
    query = aplicarBusqueda(query, q);

    const { data, error } = await query
      .order('destacado', { ascending: false })
      .order('descripcion')
      .limit(limite);
    if (error) throw error;

    return (data || []).map(normalizar);
  } catch (err) {
    console.error('sugerirProductos error:', err);
    return [];
  }
}

/**
 * Plan B cuando la búsqueda exacta no devolvió nada: busca por parecido con
 * pg_trgm, así "cocacola" o "coka" llegan igual a "COCA COLA".
 *
 * Necesita la función `buscar_productos_similares` de
 * scripts/migracion_features.sql. Si todavía no se corrió, devuelve vacío y el
 * catálogo se comporta como antes.
 */
export async function buscarSimilares(q, limite = 8) {
  const termino = limpiarBusqueda(q);
  if (termino.length < 3) return [];
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('buscar_productos_similares', {
      termino,
      limite,
    });
    if (error) throw error;
    return (data || []).map(normalizar);
  } catch {
    return [];
  }
}

/**
 * Términos más buscados de los últimos 30 días, para los chips de sugerencias.
 * Depende de la tabla `busquedas`; sin la migración devuelve vacío.
 */
export async function busquedasPopulares(limite = 8) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('busquedas_populares', { limite });
    if (error) throw error;
    return (data || []).map(f => f.termino).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Deja registrado qué buscó el cliente y cuántos resultados hubo. Las de 0
 * resultados son la lista de lo que la gente pide y no está publicado.
 * No guarda quién buscó, y si falla no interrumpe nada.
 */
export function registrarBusqueda(termino, resultados) {
  const limpio = limpiarBusqueda(termino);
  if (limpio.length < 3) return;
  try {
    createClient()
      .from('busquedas')
      .insert([{ termino: limpio.slice(0, 80), resultados }])
      .then(() => {}, () => {});
  } catch {
    // La tabla puede no existir todavía: no es motivo para romper la búsqueda.
  }
}

/**
 * Trae los productos de un pedido anterior, con el precio y el stock de HOY.
 * Se usa para "volver a pedir": repetir un pedido con precios viejos sería
 * cobrarle mal al cliente.
 *
 * @param {Array<{codigo_producto: string, cantidad: number, descripcion: string}>} detalles
 * @returns {{ disponibles: Array, faltantes: Array<string> }}
 */
export async function productosDePedido(detalles) {
  const lineas = (detalles || []).filter(d => d?.codigo_producto);
  if (!lineas.length) return { disponibles: [], faltantes: [] };

  try {
    const supabase = createClient();
    const ids = [...new Set(lineas.map(d => d.codigo_producto))];

    const { data, error } = await supabase
      .from('productos')
      .select(COLUMNAS.join(','))
      .in('id', ids)
      .eq('publicado', true)
      .gt('precio', 0);
    if (error) throw error;

    const porId = new Map((data || []).map(p => [String(p.id), normalizar(p)]));

    const disponibles = [];
    const faltantes = [];

    lineas.forEach(linea => {
      const producto = porId.get(String(linea.codigo_producto));
      // Sin stock también cuenta como faltante: no tiene sentido meterlo al
      // carrito para que el checkout lo rebote después.
      if (!producto || producto.stock <= 0) {
        faltantes.push(linea.descripcion || 'Producto');
        return;
      }
      disponibles.push({
        producto,
        cantidad: Math.max(1, Math.min(Number(linea.cantidad) || 1, producto.stock)),
      });
    });

    return { disponibles, faltantes };
  } catch (err) {
    console.error('productosDePedido error:', err);
    return { disponibles: [], faltantes: [] };
  }
}
