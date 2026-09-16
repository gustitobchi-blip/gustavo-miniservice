'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ChevronDown, Tag, LayoutGrid, PackageCheck, X, TrendingUp } from 'lucide-react';
import { categorias } from '@/data/mockData';
import {
  buscarProductos, buscarSimilares, busquedasPopulares, registrarBusqueda,
} from '@/lib/productos';
import { POR_PAGINA } from '@/lib/productos-shared';
import ProductCard from '@/components/catalog/ProductCard';
import BuscadorProductos from '@/components/catalog/BuscadorProductos';
import Paginacion from '@/components/catalog/Paginacion';

function CatalogoContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  // La URL es la fuente de verdad: así el botón "atrás" vuelve a la página y
  // al filtro donde estabas, y un link con filtros aplicados se puede compartir.
  const q      = searchParams.get('q') || '';
  const cat    = searchParams.get('cat') || '';
  const orden  = searchParams.get('orden') || 'destacados';
  const pagina = Math.max(1, Number(searchParams.get('pag')) || 1);
  const precioMin    = searchParams.get('min') || '';
  const precioMax    = searchParams.get('max') || '';
  const soloConStock = searchParams.get('stock') === '1';
  const soloOfertas  = cat === 'ofertas';

  const [datos, setDatos]       = useState({ items: [], total: 0, totalPaginas: 1 });
  const [cargando, setCargando] = useState(true);
  const [similares, setSimilares] = useState([]);
  const [populares, setPopulares] = useState([]);

  // Los inputs se manejan locales para que no lagueen; la URL se actualiza al
  // frenar de tipear.
  const [texto, setTexto]       = useState(q);
  const [minLocal, setMinLocal] = useState(precioMin);
  const [maxLocal, setMaxLocal] = useState(precioMax);
  const ultimoPush       = useRef(q);
  const ultimoPrecio     = useRef(`${precioMin}|${precioMax}`);
  const ultimaRegistrada = useRef('');

  const actualizar = useCallback((cambios) => {
    const p = new URLSearchParams(searchParams.toString());
    Object.entries(cambios).forEach(([clave, valor]) => {
      const vacio = valor === '' || valor == null || valor === false
        || (clave === 'pag' && Number(valor) === 1)
        || (clave === 'orden' && valor === 'destacados');
      if (vacio) p.delete(clave);
      else p.set(clave, String(valor));
    });
    const qs = p.toString();
    router.replace(qs ? `/catalogo?${qs}` : '/catalogo', { scroll: false });
  }, [searchParams, router]);

  // Debounce del buscador: 300ms sin teclas y recién ahí se consulta.
  useEffect(() => {
    if (texto === q) return;
    const timer = setTimeout(() => {
      ultimoPush.current = texto;
      actualizar({ q: texto, pag: 1 });
    }, 300);
    return () => clearTimeout(timer);
  }, [texto, q, actualizar]);

  // Si la URL cambió por afuera (botón atrás, buscador del navbar), se acomodan
  // los inputs.
  useEffect(() => {
    if (q !== ultimoPush.current) {
      setTexto(q);
      ultimoPush.current = q;
    }
  }, [q]);

  // Mismo debounce para el rango de precio: escribir "1500" no son 4 consultas.
  useEffect(() => {
    const actual = `${minLocal}|${maxLocal}`;
    if (actual === `${precioMin}|${precioMax}`) return;
    const timer = setTimeout(() => {
      ultimoPrecio.current = actual;
      actualizar({ min: minLocal, max: maxLocal, pag: 1 });
    }, 600);
    return () => clearTimeout(timer);
  }, [minLocal, maxLocal, precioMin, precioMax, actualizar]);

  useEffect(() => {
    const actual = `${precioMin}|${precioMax}`;
    if (actual !== ultimoPrecio.current) {
      setMinLocal(precioMin);
      setMaxLocal(precioMax);
      ultimoPrecio.current = actual;
    }
  }, [precioMin, precioMax]);

  // Lo más buscado por el resto de los clientes, para los chips.
  useEffect(() => { busquedasPopulares(8).then(setPopulares); }, []);

  // Una página de productos por vez, filtrada y ordenada en Supabase.
  useEffect(() => {
    let cancelado = false;
    setCargando(true);

    const catNombre = soloOfertas ? '' : (categorias.find(c => c.slug === cat)?.nombre || '');

    buscarProductos({
      q, categoria: catNombre, soloOfertas, soloConStock,
      precioMin, precioMax, orden, pagina,
    }).then(resultado => {
      // Si mientras tanto cambió el filtro, esta respuesta ya no sirve.
      if (cancelado) return;
      setDatos(resultado);
      setCargando(false);

      // Queda registrado qué se buscó y cuántos resultados hubo. Las de cero
      // son la lista de lo que la gente pide y no está publicado.
      if (q && q !== ultimaRegistrada.current) {
        ultimaRegistrada.current = q;
        registrarBusqueda(q, resultado.total);
      }
    });

    return () => { cancelado = true; };
  }, [q, cat, orden, pagina, soloOfertas, soloConStock, precioMin, precioMax]);

  // Plan B: si la búsqueda exacta no encontró nada, se busca por parecido.
  useEffect(() => {
    if (!q || cargando || datos.total > 0) { setSimilares([]); return; }
    let cancelado = false;
    buscarSimilares(q, 8).then(r => { if (!cancelado) setSimilares(r); });
    return () => { cancelado = true; };
  }, [q, cargando, datos.total]);

  const irAPagina = nueva => {
    actualizar({ pag: nueva });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const elegirCategoria = slug => actualizar({ cat: slug, pag: 1 });

  const buscar = termino => {
    setTexto(termino);
    ultimoPush.current = termino;
    actualizar({ q: termino, pag: 1 });
  };

  const limpiarTodo = () => {
    setTexto(''); setMinLocal(''); setMaxLocal('');
    ultimoPush.current = ''; ultimoPrecio.current = '|';
    router.replace('/catalogo', { scroll: false });
  };

  const hayFiltros = !!(precioMin || precioMax || soloConStock);

  const catActual = categorias.find(c => c.slug === cat);
  const tituloActual = soloOfertas ? '🔥 Ofertas del día'
    : catActual ? `${catActual.emoji} ${catActual.label}`
    : '🛒 Todos los productos';

  const desde = (pagina - 1) * POR_PAGINA + 1;
  const hasta = Math.min(pagina * POR_PAGINA, datos.total);

  return (
    <div className="container-max py-6">
      <div className="flex gap-6">

        {/* Sidebar */}
        <aside className="hidden md:flex flex-col gap-1.5 w-52 flex-shrink-0">
          <button onClick={() => elegirCategoria('')}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all text-left w-full ${!cat ? 'bg-brand-purple-800 text-brand-yellow-400 shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}>
            <LayoutGrid className="w-4 h-4 flex-shrink-0" />Todos los productos
          </button>
          <button onClick={() => elegirCategoria('ofertas')}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all text-left w-full ${soloOfertas ? 'bg-red-500 text-white shadow-md' : 'text-gray-600 hover:bg-red-50 hover:text-red-600'}`}>
            <Tag className="w-4 h-4 flex-shrink-0" />Ofertas del día
          </button>
          <div className="h-px bg-gray-200 my-1" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest px-4 mb-1">Categorías</p>
          {categorias.map(c => (
            <button key={c.id} onClick={() => elegirCategoria(c.slug)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full ${cat === c.slug ? 'bg-brand-purple-100 text-brand-purple-800 font-semibold border border-brand-purple-200' : 'text-gray-600 hover:bg-gray-100'}`}>
              <span className="text-base leading-none">{c.emoji}</span>
              <span className="truncate">{c.label}</span>
            </button>
          ))}
        </aside>

        {/* Contenido */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-4 gap-3">
            <div>
              <h1 className="text-xl font-black text-gray-900">{tituloActual}</h1>
              <p className="text-gray-400 text-sm">
                {cargando ? 'Buscando...'
                  : datos.total === 0 ? 'Sin resultados'
                  : `${desde}–${hasta} de ${datos.total} producto${datos.total !== 1 ? 's' : ''}`}
              </p>
            </div>
            <div className="relative flex-shrink-0">
              <select value={orden} onChange={e => actualizar({ orden: e.target.value, pag: 1 })}
                className="appearance-none border border-gray-200 rounded-xl px-3 py-2 pr-7 text-xs sm:text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-brand-purple-400 cursor-pointer">
                <option value="destacados">Destacados</option>
                <option value="precio-asc">Precio ↑</option>
                <option value="precio-desc">Precio ↓</option>
                <option value="nombre">A–Z</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <BuscadorProductos
            valor={texto}
            onChange={setTexto}
            placeholder="Buscar productos..."
            className="mb-3"
          />

          {/* Filtros de precio y stock */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-1.5">
              <span className="text-xs font-semibold text-gray-400">$</span>
              <input type="number" inputMode="numeric" min="0" placeholder="mín"
                value={minLocal} onChange={e => setMinLocal(e.target.value)}
                className="w-16 text-sm bg-transparent focus:outline-none" />
              <span className="text-gray-300">–</span>
              <input type="number" inputMode="numeric" min="0" placeholder="máx"
                value={maxLocal} onChange={e => setMaxLocal(e.target.value)}
                className="w-16 text-sm bg-transparent focus:outline-none" />
            </div>

            <button onClick={() => actualizar({ stock: soloConStock ? '' : '1', pag: 1 })}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                soloConStock
                  ? 'bg-green-600 border-green-600 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-green-300 hover:text-green-700'
              }`}>
              <PackageCheck className="w-3.5 h-3.5" />
              Solo con stock
            </button>

            {hayFiltros && (
              <button onClick={() => { setMinLocal(''); setMaxLocal(''); actualizar({ min: '', max: '', stock: '', pag: 1 }); }}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-gray-500 hover:text-red-600 transition-colors">
                <X className="w-3.5 h-3.5" />Limpiar filtros
              </button>
            )}
          </div>

          {/* Lo más buscado — sólo mientras no hay una búsqueda activa */}
          {!q && populares.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <TrendingUp className="w-3.5 h-3.5" />Lo más buscado
              </span>
              {populares.map(termino => (
                <button key={termino} onClick={() => buscar(termino)}
                  className="px-3 py-1 rounded-full bg-brand-purple-50 text-brand-purple-700 text-xs font-semibold hover:bg-brand-purple-100 transition-colors">
                  {termino}
                </button>
              ))}
            </div>
          )}

          {/* Categorías mobile */}
          <div className="md:hidden flex gap-2 overflow-x-auto pb-2 mb-4 scroll-x-hidden -mx-4 px-4">
            <button onClick={() => elegirCategoria('')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${!cat ? 'bg-brand-purple-800 text-brand-yellow-400' : 'bg-gray-100 text-gray-600'}`}>
              Todos
            </button>
            <button onClick={() => elegirCategoria('ofertas')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${soloOfertas ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
              🔥 Ofertas
            </button>
            {categorias.map(c => (
              <button key={c.id} onClick={() => elegirCategoria(c.slug)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${cat === c.slug ? 'bg-brand-purple-800 text-brand-yellow-400' : 'bg-gray-100 text-gray-600'}`}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>

          {cargando ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
                  <div className="aspect-square bg-gray-200" />
                  <div className="p-4 space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-1/3" />
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-5 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : datos.items.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 fade-in">
                {datos.items.map(p => <ProductCard key={p.id} producto={p} />)}
              </div>

              <Paginacion
                pagina={pagina}
                totalPaginas={datos.totalPaginas}
                onCambiar={irAPagina}
                className="mt-8"
              />
            </>
          ) : (
            <div className="py-12">
              <div className="text-center">
                <span className="text-6xl">😕</span>
                <p className="text-gray-500 font-medium mt-4">
                  {q ? `No encontramos productos con “${q}”` : 'No encontramos productos'}
                </p>
                <button onClick={limpiarTodo} className="mt-4 btn-primary text-sm">
                  Ver todos los productos
                </button>
              </div>

              {/* Búsqueda por parecido: rescata los errores de tipeo */}
              {similares.length > 0 && (
                <div className="mt-10">
                  <p className="text-center text-gray-600 text-sm mb-5">
                    ¿Quisiste decir alguno de estos?
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 fade-in">
                    {similares.map(p => <ProductCard key={p.id} producto={p} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CatalogoPage() {
  return (
    <Suspense fallback={<div className="container-max py-8 text-center text-gray-400">Cargando productos...</div>}>
      <CatalogoContent />
    </Suspense>
  );
}
