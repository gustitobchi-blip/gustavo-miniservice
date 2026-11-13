'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingBag, ArrowLeft, Package, Clock, CheckCircle2, Truck, XCircle, AlertTriangle, CreditCard, RotateCcw, Info } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatPrecio, productosDePedido } from '@/lib/productos';
import { useCart } from '@/context/CartContext';

const PAGO_LABELS = {
  mercadopago:   'Mercado Pago',
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta',
  transferencia: 'Transferencia',
};

const ESTADO_CONFIG = {
  pendiente_mp: { label: 'Esperando pago', icon: CreditCard, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  pendiente:  { label: 'Pendiente',  icon: Clock,        color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  confirmado: { label: 'Confirmado', icon: CheckCircle2, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  en_camino:  { label: 'En camino',  icon: Truck,        color: 'text-purple-600 bg-purple-50 border-purple-200' },
  entregado:  { label: 'Entregado',  icon: Package,      color: 'text-green-600 bg-green-50 border-green-200' },
  cancelado:  { label: 'Cancelado',  icon: XCircle,      color: 'text-red-600 bg-red-50 border-red-200' },
};

export default function HistorialPage() {
  const router = useRouter();
  const [pedidos, setPedidos]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [expandido, setExpand]        = useState(null);
  const [cancelando, setCancelando]   = useState(null); // id del pedido que se está cancelando
  const [confirmCancel, setConfirm]   = useState(null); // id del pedido a confirmar cancelación
  const [repitiendo, setRepitiendo]   = useState(null); // id del pedido que se está repitiendo
  const [avisoRepetir, setAviso]      = useState(null); // { agregados, faltantes }

  const { addItems, openCart } = useCart();

  // Vuelve a cargar el pedido al carrito, pero con el precio y el stock de HOY:
  // repetir un pedido con los precios viejos sería cobrarle mal al cliente.
  const volverAPedir = async pedido => {
    setRepitiendo(pedido.id);
    setAviso(null);

    const { disponibles, faltantes } = await productosDePedido(pedido.detalle_pedidos || []);
    if (disponibles.length) addItems(disponibles);

    setAviso({ agregados: disponibles.length, faltantes });
    setRepitiendo(null);
    if (disponibles.length) openCart();
  };

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/cuenta/login'); return; }

      const { data } = await supabase
        .from('pedidos')
        .select('*, detalle_pedidos(*)')
        .eq('cliente_id', user.id)
        .order('creado_en', { ascending: false });

      setPedidos(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const handleCancelar = async (pedidoId) => {
    setCancelando(pedidoId);
    const supabase = createClient();
    const { error } = await supabase
      .from('pedidos')
      .update({ estado: 'cancelado' })
      .eq('id', pedidoId);

    if (error) {
      alert('No se pudo cancelar el pedido. Si el problema persiste, contactá al local.');
      console.error('Error al cancelar:', error.message);
    } else {
      setPedidos(prev =>
        prev.map(p => p.id === pedidoId ? { ...p, estado: 'cancelado' } : p)
      );
    }
    setCancelando(null);
    setConfirm(null);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-brand-purple-700 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="container-max py-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/cuenta/perfil" className="text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-black text-gray-900">Mis pedidos</h1>
      </div>

      {avisoRepetir && (
        <div className={`flex items-start gap-2 rounded-xl p-3 mb-4 text-sm border ${
          avisoRepetir.agregados
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-orange-50 border-orange-200 text-orange-800'
        }`}>
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            {avisoRepetir.agregados > 0
              ? <p><strong>{avisoRepetir.agregados}</strong> producto{avisoRepetir.agregados !== 1 ? 's' : ''} al carrito, con los precios de hoy.</p>
              : <p>Ninguno de esos productos está disponible ahora.</p>}
            {avisoRepetir.faltantes.length > 0 && (
              <p className="mt-1 text-xs opacity-80">
                Sin stock o fuera de la página: {avisoRepetir.faltantes.slice(0, 4).join(', ')}
                {avisoRepetir.faltantes.length > 4 && ` y ${avisoRepetir.faltantes.length - 4} más`}.
              </p>
            )}
          </div>
          <button onClick={() => setAviso(null)} className="opacity-50 hover:opacity-100 text-lg leading-none">×</button>
        </div>
      )}

      {/* En un miniservice la compra se repite casi igual todas las semanas */}
      {pedidos.length > 0 && (
        <button onClick={() => volverAPedir(pedidos[0])} disabled={repitiendo === pedidos[0].id}
          className="w-full flex items-center gap-3 bg-brand-purple-800 hover:bg-brand-purple-900 disabled:opacity-60 text-brand-yellow-400 rounded-2xl p-4 mb-5 transition-colors text-left">
          <RotateCcw className={`w-5 h-5 flex-shrink-0 ${repitiendo === pedidos[0].id ? 'animate-spin' : ''}`} />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">
              {repitiendo === pedidos[0].id ? 'Armando el carrito...' : 'Repetir mi último pedido'}
            </p>
            <p className="text-brand-purple-300 text-xs">
              {new Date(pedidos[0].creado_en).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}
              {' · '}{(pedidos[0].detalle_pedidos || []).length} producto{(pedidos[0].detalle_pedidos || []).length !== 1 ? 's' : ''}
              {' · '}{formatPrecio(pedidos[0].total)}
            </p>
          </div>
        </button>
      )}

      {pedidos.length === 0 ? (
        <div className="text-center py-20">
          <ShoppingBag className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Todavía no hiciste ningún pedido</p>
          <Link href="/catalogo" className="btn-primary mt-6 inline-flex">Ver productos</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {pedidos.map(pedido => {
            const cfg = ESTADO_CONFIG[pedido.estado] || ESTADO_CONFIG.pendiente;
            const Icon = cfg.icon;
            const isOpen = expandido === pedido.id;
            const puedeCancel = pedido.estado === 'pendiente' || pedido.estado === 'pendiente_mp';

            return (
              <div key={pedido.id} className="card overflow-hidden">
                <button onClick={() => setExpand(isOpen ? null : pedido.id)}
                  className="w-full p-5 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.color}`}>
                    <Icon className="w-3 h-3" />{cfg.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">Pedido #{String(pedido.id).padStart(6, '0')}</p>
                    <p className="text-gray-500 text-xs">
                      {new Date(pedido.creado_en).toLocaleDateString('es-AR', {
                        day: 'numeric', month: 'long', year: 'numeric'
                      })}
                    </p>
                  </div>
                  <span className="font-black text-brand-purple-800">{formatPrecio(pedido.total)}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-5 pb-5 pt-4 fade-in">
                    {/* Detalle de items */}
                    <div className="space-y-2 mb-4">
                      {(pedido.detalle_pedidos || []).map((item, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{item.descripcion}</p>
                            <p className="text-xs text-gray-500">x{item.cantidad} · {formatPrecio(item.precio_unitario)}</p>
                          </div>
                          <p className="text-sm font-bold text-gray-900">{formatPrecio(item.subtotal)}</p>
                        </div>
                      ))}
                    </div>

                    {/* Info del pedido */}
                    <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 space-y-1 mb-4">
                      <p><strong>Entrega:</strong> {pedido.forma_entrega === 'retiro' ? 'Retiro en local' : 'Delivery'}</p>
                      <p><strong>Pago:</strong> {PAGO_LABELS[pedido.forma_pago] || pedido.forma_pago}</p>
                      {pedido.direccion_entrega && <p><strong>Dirección:</strong> {pedido.direccion_entrega}</p>}
                      {pedido.observaciones && <p><strong>Nota:</strong> {pedido.observaciones}</p>}
                    </div>

                    <button onClick={() => volverAPedir(pedido)} disabled={repitiendo === pedido.id}
                      className="w-full flex items-center justify-center gap-2 border border-brand-purple-200 bg-brand-purple-50 text-brand-purple-800 hover:bg-brand-purple-100 disabled:opacity-60 text-sm font-semibold py-2.5 rounded-xl transition-colors mb-3">
                      <RotateCcw className={`w-4 h-4 ${repitiendo === pedido.id ? 'animate-spin' : ''}`} />
                      {repitiendo === pedido.id ? 'Armando el carrito...' : 'Volver a pedir esto'}
                    </button>

                    {/* Botón cancelar — solo para pedidos pendientes */}
                    {puedeCancel && (
                      confirmCancel === pedido.id ? (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                          <div className="flex items-center gap-2 mb-3">
                            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                            <p className="text-sm text-red-700 font-medium">¿Confirmás la cancelación?</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleCancelar(pedido.id)}
                              disabled={cancelando === pedido.id}
                              className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                            >
                              {cancelando === pedido.id ? 'Cancelando...' : 'Sí, cancelar'}
                            </button>
                            <button
                              onClick={() => setConfirm(null)}
                              className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold py-2 rounded-lg transition-colors"
                            >
                              No, volver
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirm(pedido.id)}
                          className="w-full border border-red-300 text-red-600 hover:bg-red-50 text-sm font-semibold py-2.5 rounded-xl transition-colors"
                        >
                          Cancelar pedido
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
