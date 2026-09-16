'use client';

import { useState, useEffect, useRef, useId } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2 } from 'lucide-react';
import { sugerirProductos, formatPrecio } from '@/lib/productos';

/**
 * Buscador con sugerencias en vivo. Es el único del sitio: se usa en la barra
 * del navbar (desktop y menú mobile) y arriba de la grilla del catálogo.
 *
 * El input es local para que no lagee al tipear; lo que se demora es la
 * consulta, 200ms sin teclas antes de pedirle sugerencias a Supabase.
 *
 * - Si recibe `valor` y `onChange` funciona controlado: el catálogo maneja el
 *   texto y lo sincroniza con la URL.
 * - Si no, se maneja solo y Enter lleva a /catalogo?q=... (modo navbar).
 */
export default function BuscadorProductos({
  valor,
  onChange,
  variant = 'catalogo',       // 'catalogo' | 'desktop' | 'mobile'
  onNavigate,
  placeholder = 'Buscar productos...',
  className = '',
}) {
  const router = useRouter();
  const listaId = useId();

  const controlado = typeof valor === 'string' && typeof onChange === 'function';
  const [interno, setInterno] = useState('');
  const texto    = controlado ? valor : interno;
  const setTexto = controlado ? onChange : setInterno;

  const [sugerencias, setSugerencias] = useState([]);
  const [abierto, setAbierto]         = useState(false);
  const [cargando, setCargando]       = useState(false);
  const [indice, setIndice]           = useState(-1);

  const contenedorRef = useRef(null);
  // Qué término se consultó ya, para no mostrar "no hay nada" mientras carga.
  const consultado = useRef('');

  useEffect(() => {
    const termino = texto.trim();
    if (termino.length < 2) {
      setSugerencias([]);
      setCargando(false);
      return;
    }

    setCargando(true);
    const timer = setTimeout(async () => {
      const resultados = await sugerirProductos(termino, 6);
      consultado.current = termino;
      setSugerencias(resultados);
      setIndice(-1);
      setCargando(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [texto]);

  // Cerrar al hacer click afuera.
  useEffect(() => {
    const fuera = e => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  const enNavbar = variant !== 'catalogo';

  const irAProducto = producto => {
    setAbierto(false);
    if (!controlado) setTexto('');
    router.push(`/producto/${producto.id}`);
    onNavigate?.();
  };

  const irAlCatalogo = () => {
    const termino = texto.trim();
    if (!termino) return;
    setAbierto(false);
    // En el catálogo el texto ya está aplicado en la grilla de abajo: no hay
    // adónde ir.
    if (!enNavbar) return;
    router.push(`/catalogo?q=${encodeURIComponent(termino)}`);
    onNavigate?.();
  };

  const handleKeyDown = e => {
    if (e.key === 'Escape') { setAbierto(false); return; }

    if (!abierto || !sugerencias.length) {
      if (e.key === 'Enter') irAlCatalogo();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndice(i => (i + 1) % sugerencias.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndice(i => (i <= 0 ? sugerencias.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (indice >= 0) irAProducto(sugerencias[indice]);
      else irAlCatalogo();
    }
  };

  const claseInput = {
    catalogo: 'w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple-400 focus:border-transparent transition-all',
    desktop:  'w-full pl-10 pr-10 py-2 rounded-xl bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow-400 placeholder-gray-400',
    mobile:   'w-full pl-10 pr-10 py-3 rounded-xl bg-white text-gray-900 text-sm focus:outline-none',
  }[variant];

  const mostrarLista = abierto && texto.trim().length >= 2;

  return (
    <div ref={contenedorRef} className={`relative ${enNavbar ? 'w-full' : ''} ${className}`}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />

      <input
        type="text"
        role="combobox"
        aria-expanded={mostrarLista}
        aria-controls={listaId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={texto}
        onChange={e => { setTexto(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onKeyDown={handleKeyDown}
        className={claseInput}
      />

      {cargando ? (
        <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-purple-400 animate-spin" />
      ) : texto ? (
        <button type="button"
          onClick={() => { setTexto(''); setSugerencias([]); setAbierto(false); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1"
          aria-label="Borrar búsqueda">
          <X className="w-4 h-4" />
        </button>
      ) : null}

      {mostrarLista && (
        <div id={listaId} role="listbox"
          className="absolute z-50 left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden max-h-96 overflow-y-auto">
          {sugerencias.length > 0 ? (
            <>
              {sugerencias.map((p, i) => (
                <button key={p.id} role="option" aria-selected={i === indice}
                  onClick={() => irAProducto(p)}
                  onMouseEnter={() => setIndice(i)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    i === indice ? 'bg-brand-purple-50' : 'hover:bg-gray-50'
                  }`}>
                  <img src={p.imagen} alt="" loading="lazy"
                    className="w-10 h-10 rounded-lg object-cover bg-gray-100 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.nombre}</p>
                    <p className="text-xs text-gray-400">{p.categoria}</p>
                  </div>
                  <span className="text-sm font-bold text-brand-purple-800 flex-shrink-0">
                    {formatPrecio(p.precio)}
                  </span>
                </button>
              ))}

              {enNavbar ? (
                <button onClick={irAlCatalogo}
                  className="w-full text-center px-4 py-2.5 text-sm font-semibold text-brand-purple-700 hover:bg-brand-purple-50 border-t border-gray-100">
                  Ver todos los resultados para &quot;{texto.trim()}&quot;
                </button>
              ) : (
                <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
                  <p className="text-[11px] text-gray-400">
                    Enter para ver todos los resultados · ↑↓ para elegir
                  </p>
                </div>
              )}
            </>
          ) : !cargando && consultado.current === texto.trim() ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              No encontramos nada con “{texto.trim()}”
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
