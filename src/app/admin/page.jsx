'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Package, Users, ShoppingBag, TrendingUp, LogOut, ChevronRight, Store,
  Bell, BellOff, RefreshCw, Inbox, BarChart2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatPrecio } from '@/lib/productos';
import { etiquetaEstado } from '@/lib/estados';

// Un pedido cancelado o esperando que MP acredite no es una venta.
const ESTADOS_EXCLUIDOS = ['cancelado', 'pendiente_mp'];

// YYYY-MM-DD en hora local. Con toISOString() los pedidos de la tarde caían en
// el día siguiente, porque Argentina está en UTC-3.
const claveDia = fecha => new Date(fecha).toLocaleDateString('en-CA');

const haceDias = n => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

/** Todos los días entre dos fechas, incluidos los que no tuvieron ventas. */
function rangoDeDias(desde, hasta) {
  const dias = [];
  const cursor = new Date(`${desde}T00:00:00`);
  const fin = new Date(`${hasta}T00:00:00`);
  while (cursor <= fin && dias.length < 400) {
    dias.push(claveDia(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

const etiquetaCorta = dia => {
  const [, m, d] = dia.split('-');
  return `${d}/${m}`;
};

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({ productos: 0, usuarios: 0, pedidos: 0, ventas: 0 });
  const [pedidosRecientes, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Ventas por día ──────────────────────────────────────────
  const [desde, setDesde] = useState(claveDia(haceDias(29)));
  const [hasta, setHasta] = useState(claveDia(new Date()));
  const [serie, setSerie] = useState([]);
  const [cargandoSerie, setCargandoSerie] = useState(true);
  const [diaHover, setDiaHover] = useState(null);

  // ── Aviso de pedido nuevo ───────────────────────────────────
  const [nuevos, setNuevos] = useState(0);
  const [sonido, setSonido] = useState(false);
  const [enVivo, setEnVivo] = useState(false);
  const sonidoRef = useRef(false);

  const cargarResumen = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/cuenta/login?next=/admin'); return; }

    const [{ count: cProds }, { count: cUsers }, { count: cPedidos }, { data: ventas }, { data: pedidos }] =
      await Promise.all([
        supabase.from('productos').select('*', { count: 'exact', head: true }).eq('activo', true),
        supabase.from('clientes').select('*', { count: 'exact', head: true }),
        supabase.from('pedidos').select('*', { count: 'exact', head: true }),
        supabase.from('pedidos').select('total'),
        supabase.from('pedidos').select('*').order('creado_en', { ascending: false }).limit(5),
      ]);

    setStats({
      productos: cProds || 0,
      usuarios:  cUsers || 0,
      pedidos:   cPedidos || 0,
      ventas:    (ventas || []).reduce((s, p) => s + (p.total || 0), 0),
    });
    setPedidos(pedidos || []);
    setLoading(false);
  }, [router]);

  useEffect(() => { cargarResumen(); }, [cargarResumen]);

  // Serie diaria del rango elegido.
  useEffect(() => {
    if (!desde || !hasta || desde > hasta) return;
    let cancelado = false;
    setCargandoSerie(true);

    const cargar = async () => {
      const supabase = createClient();
      const inicio = new Date(`${desde}T00:00:00`);
      const fin    = new Date(`${hasta}T23:59:59.999`);

      const { data } = await supabase
        .from('pedidos')
        .select('total, creado_en, estado')
        .not('estado', 'in', `(${ESTADOS_EXCLUIDOS.join(',')})`)
        .gte('creado_en', inicio.toISOString())
        .lte('creado_en', fin.toISOString());

      if (cancelado) return;

      const porDia = {};
      (data || []).forEach(p => {
        const dia = claveDia(p.creado_en);
        if (!porDia[dia]) porDia[dia] = { total: 0, pedidos: 0 };
        porDia[dia].total += p.total || 0;
        porDia[dia].pedidos += 1;
      });

      setSerie(rangoDeDias(desde, hasta).map(dia => ({
        dia,
        total:   porDia[dia]?.total   || 0,
        pedidos: porDia[dia]?.pedidos || 0,
      })));
      setCargandoSerie(false);
    };

    cargar();
    return () => { cancelado = true; };
  }, [desde, hasta, nuevos]);

  // Beep corto generado con WebAudio: evita tener que sumar un archivo de audio.
  const sonar = () => {
    if (!sonidoRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1180, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch {
      // Si el navegador bloquea el audio, el badge igual avisa.
    }
  };

  useEffect(() => {
    try {
      const guardado = localStorage.getItem('admin-sonido-pedidos') === '1';
      setSonido(guardado);
      sonidoRef.current = guardado;
    } catch {
      // localStorage puede fallar en ventana privada; el default es sin sonido.
    }
  }, []);

  // Supabase Realtime: cada INSERT en pedidos levanta el badge.
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel('admin-pedidos-nuevos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos' }, () => {
        setNuevos(n => n + 1);
        sonar();
      })
      .subscribe(status => setEnVivo(status === 'SUBSCRIBED'));

    return () => { supabase.removeChannel(canal); };
  }, []);

  const alternarSonido = () => {
    const nuevo = !sonido;
    setSonido(nuevo);
    sonidoRef.current = nuevo;
    try { localStorage.setItem('admin-sonido-pedidos', nuevo ? '1' : '0'); } catch { /* ignorar */ }
    // Este click además destraba el audio: los navegadores no dejan sonar
    // nada hasta que el usuario interactuó con la página.
    if (nuevo) sonar();
  };

  const verNuevos = async () => {
    setNuevos(0);
    setLoading(true);
    await cargarResumen();
  };

  const handleLogout = async () => {
    await createClient().auth.signOut();
    router.push('/');
    router.refresh();
  };

  const CARDS = [
    { label: 'Productos activos', value: stats.productos, icon: Package,     color: 'bg-brand-purple-100 text-brand-purple-700', href: '/admin/productos', cta: 'Gestionar productos' },
    { label: 'Usuarios',          value: stats.usuarios,  icon: Users,        color: 'bg-blue-100 text-blue-700',   href: '/admin/usuarios',  cta: 'Gestionar usuarios' },
    { label: 'Pedidos totales',   value: stats.pedidos,   icon: ShoppingBag,  color: 'bg-green-100 text-green-700', href: '/admin/pedidos',   cta: 'Ver pedidos' },
    { label: 'Ventas totales',    value: formatPrecio(stats.ventas), icon: TrendingUp, color: 'bg-yellow-100 text-yellow-700', href: '/admin/ventas', cta: 'Ver ventas' },
  ];

  const ESTADO_COLOR = {
    pendiente: 'bg-yellow-100 text-yellow-700',
    confirmado: 'bg-blue-100 text-blue-700',
    en_camino: 'bg-purple-100 text-purple-700',
    listo_retiro: 'bg-teal-100 text-teal-700',
    pendiente_mp: 'bg-orange-100 text-orange-700',
    entregado: 'bg-green-100 text-green-700',
    cancelado: 'bg-red-100 text-red-700',
  };

  const totalRango  = serie.reduce((s, d) => s + d.total, 0);
  const pedidosRango = serie.reduce((s, d) => s + d.pedidos, 0);
  const maxDia      = Math.max(...serie.map(d => d.total), 0);
  const detalle     = diaHover ?? null;

  const preset = dias => {
    setDesde(claveDia(haceDias(dias - 1)));
    setHasta(claveDia(new Date()));
  };
  const presetActivo = dias =>
    desde === claveDia(haceDias(dias - 1)) && hasta === claveDia(new Date());

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-brand-purple-700 border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin navbar */}
      <header className="bg-brand-purple-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-brand-yellow-400 rounded-xl p-1.5">
            <Store className="w-5 h-5 text-brand-purple-900" />
          </div>
          <div>
            <p className="text-brand-yellow-400 font-black text-lg leading-none">Gustavo 1°</p>
            <p className="text-brand-purple-300 text-xs">Panel Administrador</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={alternarSonido}
            title={sonido ? 'Sonido de pedido nuevo activado' : 'Sonido de pedido nuevo desactivado'}
            className={`flex items-center gap-1.5 text-sm transition-colors ${sonido ? 'text-brand-yellow-400' : 'text-brand-purple-300 hover:text-white'}`}>
            {sonido ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            <span className="hidden sm:inline">{sonido ? 'Aviso activado' : 'Aviso apagado'}</span>
          </button>
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-brand-purple-300"
            title={enVivo ? 'Escuchando pedidos nuevos en tiempo real' : 'Sin conexión en vivo — refrescá para ver pedidos nuevos'}>
            <span className={`w-2 h-2 rounded-full ${enVivo ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
            {enVivo ? 'En vivo' : 'Sin conexión'}
          </span>
          <Link href="/" className="text-brand-purple-300 hover:text-white text-sm transition-colors">
            Ver tienda
          </Link>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 text-red-400 hover:text-red-300 text-sm transition-colors">
            <LogOut className="w-4 h-4" />
            Salir
          </button>
        </div>
      </header>

      {/* Aviso de pedidos nuevos */}
      {nuevos > 0 && (
        <button onClick={verNuevos}
          className="w-full bg-brand-yellow-400 hover:bg-brand-yellow-300 text-brand-purple-900 px-6 py-3 flex items-center justify-center gap-3 font-bold text-sm transition-colors">
          <Bell className="w-4 h-4 animate-bounce" />
          {nuevos === 1 ? 'Entró 1 pedido nuevo' : `Entraron ${nuevos} pedidos nuevos`}
          <span className="inline-flex items-center gap-1.5 bg-brand-purple-900 text-brand-yellow-400 px-3 py-1 rounded-full text-xs">
            <RefreshCw className="w-3 h-3" />Actualizar
          </span>
        </button>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-black text-gray-900 mb-6">Dashboard</h1>

        {/* Stats — la tarjeta no es clickeable, solo el botón de abajo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {CARDS.map(c => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="card p-5 flex flex-col gap-4 hover:shadow-sm">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-black text-gray-900">{c.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
                </div>
                <Link href={c.href}
                  className="mt-auto flex items-center justify-center gap-1 w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-brand-purple-800 text-xs font-bold hover:bg-brand-purple-50 hover:border-brand-purple-300 active:scale-95 transition-all">
                  {c.cta}
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            );
          })}
        </div>

        {/* Ventas por día */}
        <div className="card p-6 mb-8 hover:shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
            <div>
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-brand-purple-700" />
                Ventas por día
              </h2>
              {detalle ? (
                <p className="text-sm text-gray-600 mt-1">
                  <strong className="text-gray-900">{etiquetaCorta(detalle.dia)}</strong>
                  {' · '}{formatPrecio(detalle.total)}
                  {' · '}{detalle.pedidos} pedido{detalle.pedidos !== 1 ? 's' : ''}
                </p>
              ) : (
                <p className="text-sm text-gray-500 mt-1">
                  {formatPrecio(totalRango)} en {pedidosRango} pedido{pedidosRango !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {[7, 15, 30].map(d => (
                <button key={d} onClick={() => preset(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    presetActivo(d)
                      ? 'bg-brand-purple-800 text-brand-yellow-400'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {d} días
                </button>
              ))}
              <input type="date" value={desde} max={hasta}
                onChange={e => setDesde(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-purple-400" />
              <span className="text-gray-400 text-xs">a</span>
              <input type="date" value={hasta} min={desde} max={claveDia(new Date())}
                onChange={e => setHasta(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-purple-400" />
            </div>
          </div>

          {cargandoSerie ? (
            <div className="h-40 flex items-end gap-1 animate-pulse">
              {[...Array(30)].map((_, i) => (
                <div key={i} className="flex-1 bg-gray-100 rounded-t" style={{ height: `${20 + (i % 5) * 15}%` }} />
              ))}
            </div>
          ) : totalRango === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-center">
              <BarChart2 className="w-8 h-8 text-gray-300 mb-2" />
              <p className="text-gray-500 text-sm font-medium">Sin ventas en este período</p>
              <p className="text-gray-400 text-xs mt-1">Probá ampliando el rango de fechas.</p>
            </div>
          ) : (
            <>
              <div className="h-40 flex items-end gap-[3px]" onMouseLeave={() => setDiaHover(null)}>
                {serie.map(d => (
                  <div key={d.dia}
                    onMouseEnter={() => setDiaHover(d)}
                    title={`${etiquetaCorta(d.dia)} · ${formatPrecio(d.total)}`}
                    className="flex-1 min-w-[3px] h-full flex items-end cursor-default group">
                    <div
                      className={`w-full rounded-t transition-all ${
                        diaHover?.dia === d.dia ? 'bg-brand-purple-900' : 'bg-brand-purple-500 group-hover:bg-brand-purple-700'
                      }`}
                      style={{ height: maxDia > 0 ? `${Math.max((d.total / maxDia) * 100, d.total > 0 ? 3 : 1)}%` : '1%' }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-gray-400 font-medium">
                <span>{etiquetaCorta(serie[0].dia)}</span>
                {serie.length > 2 && <span>{etiquetaCorta(serie[Math.floor(serie.length / 2)].dia)}</span>}
                <span>{etiquetaCorta(serie[serie.length - 1].dia)}</span>
              </div>
            </>
          )}
        </div>

        {/* Pedidos recientes */}
        <div className="card p-6 hover:shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Pedidos recientes</h2>
            <Link href="/admin/pedidos" className="text-brand-purple-700 text-sm font-medium hover:underline">
              Ver todos →
            </Link>
          </div>

          {pedidosRecientes.length > 0 ? (
            <div className="space-y-3">
              {pedidosRecientes.map(p => (
                <div key={p.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ESTADO_COLOR[p.estado] || 'bg-gray-100 text-gray-600'}`}>
                    {etiquetaEstado(p.estado, p.forma_entrega)}
                  </span>
                  <p className="text-sm text-gray-700 flex-1">
                    {p.nombre_cliente || 'Cliente'} · #{String(p.id).slice(-6).toUpperCase()}
                  </p>
                  <p className="text-sm font-bold text-gray-900">{formatPrecio(p.total)}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(p.creado_en).toLocaleDateString('es-AR')}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            /* Antes esta sección directamente no se dibujaba con 0 pedidos, y
               "no hay nada" se veía igual que "se rompió algo". */
            <div className="text-center py-10">
              <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600 font-medium text-sm">Todavía no hay pedidos</p>
              <p className="text-gray-400 text-xs mt-1 max-w-sm mx-auto">
                Cuando un cliente haga su primera compra va a aparecer acá, y el panel
                te avisa apenas entre.
              </p>
              <Link href="/" className="inline-flex items-center gap-1.5 mt-4 text-brand-purple-700 text-sm font-semibold hover:underline">
                Ver la tienda como la ve el cliente
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
