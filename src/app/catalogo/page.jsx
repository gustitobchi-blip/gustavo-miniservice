'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ChevronDown, Tag, LayoutGrid } from 'lucide-react';
import { categorias } from '@/data/mockData';
import { buscarProductos } from '@/lib/productos';
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
  const soloOfertas = cat === 'ofertas';

  const [datos, setDatos]       = useState({ items: [], total: 0, totalPaginas: 1 });
  const [cargando, setCargando] = useState(true);

  // El input se maneja local para que no lagee; la URL se actualiza al frenar.
  const [texto, setTexto] = useState(q);
  const ultimoPush = useRef(q);

  const actualizar = useCallback((cambios) => {
    const p = new URLSearchParams(searchParams.toString());
    Object.entries(cambios).forEach(([clave, valor]) => {
      const vacio = valor === '' || valor == null
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

  // Si la URL cambió por afuera (botón atrás, link del menú), se acomoda el input.
  useEffect(() => {
    if (q !== ultimoPush.current) {
      setTexto(q);
      ultimoPush.current = q;
    }
  }, [q]);

  // Una página de productos por vez, filtrada y ordenada en Supabase.
  useEffect(() => {
    let cancelado = false;
    setCargando(true);

    const catNombre = soloOfertas ? '' : (categorias.find(c => c.slug === cat)?.nombre || '');

    buscarProductos({ q, categoria: catNombre, soloOfertas, orden, pagina })
      .then(resultado => {
        // Si mientras tanto cambió el filtro, esta respuesta ya no sirve.
        if (cancelado) return;
        setDatos(resultado);
        setCargando(false);
      });

    return () => { cancelado = true; };
  }, [q, cat, orden, pagina, soloOfertas]);

  const irAPagina = nueva => {
    actualizar({ pag: nueva });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const elegirCategoria = slug => actualizar({ cat: slug, pag: 1 });

  const limpiarTodo = () => {
    setTexto('');
    ultimoPush.current = '';
    router.replace('/catalogo', { scroll: false });
  };

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

          {/* Buscador — vive acá, que es donde se muestran los productos */}
          <BuscadorProductos
            valor={texto}
            onChange={setTexto}
            placeholder="Buscar productos..."
            className="mb-4"
          />

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
            <div className="text-center py-20">
              <span className="text-6xl">😕</span>
              <p className="text-gray-500 font-medium mt-4">
                {q ? `No encontramos productos con “${q}”` : 'No encontramos productos'}
              </p>
              <button onClick={limpiarTodo} className="mt-4 btn-primary text-sm">
                Ver todos los productos
              </button>
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
