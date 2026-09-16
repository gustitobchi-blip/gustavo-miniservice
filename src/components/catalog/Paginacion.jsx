'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Ventana de páginas alrededor de la actual: [1, '…', 7, 8, 9, '…', 97].
 * Con 2300 productos hay ~97 páginas y dibujarlas todas no entra en pantalla.
 */
function ventana(pagina, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const cercanas = [1, total, pagina, pagina - 1, pagina + 1]
    .filter(p => p >= 1 && p <= total);
  const unicas = [...new Set(cercanas)].sort((a, b) => a - b);

  return unicas.reduce((acc, p, i) => {
    if (i > 0 && p - unicas[i - 1] > 1) acc.push('…');
    acc.push(p);
    return acc;
  }, []);
}

export default function Paginacion({ pagina, totalPaginas, onCambiar, className = '' }) {
  if (totalPaginas <= 1) return null;

  const ir = p => {
    const destino = Math.min(Math.max(1, p), totalPaginas);
    if (destino !== pagina) onCambiar(destino);
  };

  const flecha = 'flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 bg-white text-gray-600 transition-all hover:border-brand-purple-300 hover:text-brand-purple-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-600';

  return (
    <nav className={`flex items-center justify-center gap-1.5 ${className}`} aria-label="Paginación">
      <button onClick={() => ir(pagina - 1)} disabled={pagina <= 1}
        className={flecha} aria-label="Página anterior">
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* En mobile el detalle de páginas no entra: se muestra "3 / 97". */}
      <span className="sm:hidden px-3 text-sm font-semibold text-gray-600">
        {pagina} / {totalPaginas}
      </span>

      <div className="hidden sm:flex items-center gap-1.5">
        {ventana(pagina, totalPaginas).map((p, i) =>
          p === '…' ? (
            <span key={`sep-${i}`} className="w-9 text-center text-gray-400 select-none">…</span>
          ) : (
            <button key={p} onClick={() => ir(p)}
              aria-current={p === pagina ? 'page' : undefined}
              className={`w-9 h-9 rounded-xl text-sm font-bold transition-all ${
                p === pagina
                  ? 'bg-brand-purple-800 text-brand-yellow-400 shadow-md'
                  : 'border border-gray-200 bg-white text-gray-600 hover:border-brand-purple-300 hover:text-brand-purple-700'
              }`}>
              {p}
            </button>
          )
        )}
      </div>

      <button onClick={() => ir(pagina + 1)} disabled={pagina >= totalPaginas}
        className={flecha} aria-label="Página siguiente">
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  );
}
