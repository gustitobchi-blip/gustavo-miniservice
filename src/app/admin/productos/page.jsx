'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Pencil, Save, X, Search, Upload, ImageIcon, Package, EyeOff, Globe, Camera, ScanLine, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { categorias } from '@/data/mockData';
import { formatPrecio } from '@/lib/productos';
import { POR_PAGINA_ADMIN, terminosBusqueda } from '@/lib/productos-shared';
import Paginacion from '@/components/catalog/Paginacion';
import EscanerCodigoBarras from '@/components/admin/EscanerCodigoBarras';

// Sin cod_barra: esa columna no existe en la tabla y hacía fallar el insert.
const EMPTY = {
  codigo: '', descripcion: '', descripcion_web: '', precio: '', precio_anterior: '',
  categoria: 'Almacén General', stock: '', unidad: 'unidad',
  oferta: false, destacado: false, activo: true, publicado: true, foto_url: '', cod_barra: '',
};

export default function AdminProductos() {
  const [productos, setProductos] = useState([]);
  const [total, setTotal]         = useState(0);
  const [totalPaginas, setTotPag] = useState(1);
  const [pagina, setPagina]       = useState(1);
  const [busqueda, setBusqueda]   = useState('');
  // Lo que se tipea vs. lo que ya se consultó: sin el debounce cada letra
  // dispararía una query contra Supabase.
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [catFiltro, setCat]       = useState('');
  const [estado, setEstado]       = useState('publicados');
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null);
  const [form, setForm]           = useState(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);
  // Alta: se busca el producto en la base (el import ya lo trajo) y se publica.
  const [altaBusqueda, setAltaBusqueda] = useState('');
  const [altaResultados, setAltaResultados] = useState([]);
  const [altaBuscando, setAltaBuscando] = useState(false);
  const [altaBuscada, setAltaBuscada] = useState(false);
  const [modoAlta, setModoAlta] = useState(false);
  const fileRef   = useRef();
  const camaraRef = useRef();
  const [escaneando, setEscaneando]           = useState(false);
  const [codigoEscaneado, setCodigoEscaneado] = useState('');
  const supabase = createClient();

  // Una página por vez. Antes se traían hasta 20.000 filas al browser y se
  // filtraban en memoria; ahora el filtro, el orden y el corte los hace
  // Supabase y llegan sólo las 50 que se ven.
  const pedido = useRef(0);

  const cargar = async () => {
    const mio = ++pedido.current;
    setLoading(true);
    const desde = (pagina - 1) * POR_PAGINA_ADMIN;

    let q = supabase.from('productos').select('*', { count: 'exact' });
    if (estado === 'publicados')     q = q.eq('publicado', true);
    if (estado === 'no-publicados')  q = q.eq('publicado', false);
    if (catFiltro)                   q = q.eq('categoria', catFiltro);

    const palabras = terminosBusqueda(busquedaAplicada);
    if (palabras.length === 1 && /^\d+$/.test(palabras[0])) {
      // Un número suelto suele ser el código, no parte de la descripción.
      q = q.or(`descripcion.ilike.%${palabras[0]}%,codigo.ilike.%${palabras[0]}%`);
    } else {
      palabras.forEach(palabra => { q = q.ilike('descripcion', `%${palabra}%`); });
    }

    const { data, count, error } = await q
      .order('categoria').order('descripcion').order('id')
      .range(desde, desde + POR_PAGINA_ADMIN - 1);

    // Si mientras tanto salió otra consulta, esta respuesta ya quedó vieja.
    if (mio !== pedido.current) return;

    if (!error) {
      setProductos(data || []);
      setTotal(count || 0);
      setTotPag(Math.max(1, Math.ceil((count || 0) / POR_PAGINA_ADMIN)));
    }
    setLoading(false);
  };

  // 350ms sin teclas antes de consultar.
  useEffect(() => {
    const timer = setTimeout(() => setBusquedaAplicada(busqueda), 350);
    return () => clearTimeout(timer);
  }, [busqueda]);

  // Cambiar un filtro vuelve a la primera página: quedarse en la 7 de un
  // resultado que ahora tiene 2 páginas muestra una tabla vacía.
  useEffect(() => { setPagina(1); }, [busquedaAplicada, catFiltro, estado]);

  useEffect(() => { cargar(); }, [estado, catFiltro, busquedaAplicada, pagina]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirAlta = () => {
    setAltaBusqueda(''); setAltaResultados([]); setAltaBuscada(false);
    setCodigoEscaneado('');
    setModal('buscar');
  };
  const abrirCrearAMano = () => { setModoAlta(false); setForm(EMPTY); setModal('crear'); };

  // Busca en toda la tabla, no solo en lo cargado: con ~6000 filas el filtrado
  // tiene que pasar en Supabase. Parte el texto en palabras igual que el
  // buscador del cliente, así "aceite oliva" encuentra "ACEITE DE OLIVA ...".
  const buscarParaAlta = async texto => {
    const palabras = terminosBusqueda(texto);
    if (!palabras.length) {
      setAltaResultados([]); setAltaBuscada(false); setAltaBuscando(false);
      return;
    }

    setAltaBuscando(true);
    let q = supabase.from('productos').select('*');

    if (palabras.length === 1 && /^\d+$/.test(palabras[0])) {
      q = q.or(`descripcion.ilike.%${palabras[0]}%,codigo.ilike.%${palabras[0]}%`);
    } else {
      palabras.forEach(palabra => { q = q.ilike('descripcion', `%${palabra}%`); });
    }

    const { data } = await q.order('publicado').order('descripcion').limit(40);
    setAltaResultados(data || []);
    setAltaBuscada(true);
    setAltaBuscando(false);
  };

  // Autocompletado: 350ms sin teclas y busca solo, sin apretar nada.
  useEffect(() => {
    if (modal !== 'buscar') return;
    const timer = setTimeout(() => buscarParaAlta(altaBusqueda), 350);
    return () => clearTimeout(timer);
  }, [altaBusqueda, modal]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Un código escaneado se busca primero en cod_barra y, si no aparece, en el
   * código interno del miniservice. Cuando no está en ningún lado, el admin
   * busca el producto por nombre y al guardarlo le queda pegado el código:
   * así el mapeo se arma solo con el uso.
   */
  const buscarPorCodigoBarra = async codigo => {
    setEscaneando(false);
    setCodigoEscaneado(codigo);
    setAltaBusqueda(codigo);
    setAltaBuscando(true);

    let encontrados = [];
    // La columna cod_barra puede no existir todavía: si falla, se sigue.
    const porBarra = await supabase.from('productos').select('*').eq('cod_barra', codigo).limit(10);
    if (!porBarra.error) encontrados = porBarra.data || [];

    if (!encontrados.length) {
      const { data } = await supabase.from('productos').select('*').eq('codigo', codigo).limit(10);
      encontrados = data || [];
    }

    setAltaResultados(encontrados);
    setAltaBuscada(true);
    setAltaBuscando(false);
  };

  // Publicar = editar la fila que ya existe, con publicado en true.
  const elegirDeLaBusqueda = p => {
    setForm({
      ...p,
      precio:          String(p.precio ?? ''),
      precio_anterior: String(p.precio_anterior || ''),
      stock:           String(p.stock || ''),
      descripcion_web: p.descripcion_web || '',
      foto_url:        p.foto_url || '',
      cod_barra:       p.cod_barra || codigoEscaneado || '',
      publicado:       true,
    });
    setModoAlta(true);
    setModal(p.id);
  };
  const abrirEditar = p  => {
    setModoAlta(false);
    setForm({
      ...p,
      precio:          String(p.precio),
      precio_anterior: String(p.precio_anterior || ''),
      stock:           String(p.stock || ''),
      descripcion_web: p.descripcion_web || '',
      foto_url:        p.foto_url || '',
      cod_barra:       p.cod_barra || '',
    });
    setModal(p.id);
  };
  const cerrar = () => setModal(null);

  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  /**
   * Una foto sacada con el celular pesa 3-5 MB. Subirla tal cual llena el
   * storage y tarda muchísimo con datos móviles, así que se reescala a 1000px
   * y se pasa a JPEG antes de mandarla.
   */
  const comprimir = file => new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1000;
      const escala = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.82);
    };
    // Si el navegador no puede leerla, se sube el original antes que fallar.
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });

  const subirImagen = async file => {
    setUploading(true);
    const blob = await comprimir(file);
    const path = `${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('productos')
      .upload(path, blob, { contentType: 'image/jpeg' });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('productos').getPublicUrl(path);
      setForm(p => ({ ...p, foto_url: publicUrl }));
    }
    setUploading(false);
  };

  const handleSave = async e => {
    e.preventDefault();
    setSaving(true);
    // Explícito y no `...form`: el spread arrastraba campos que no son columnas
    // de la tabla (cod_barra) y hacía fallar el guardado.
    const payload = {
      codigo:          form.codigo || null,
      descripcion:     form.descripcion,
      descripcion_web: form.descripcion_web || null,
      precio:          Number(form.precio),
      precio_anterior: form.precio_anterior ? Number(form.precio_anterior) : null,
      stock:           Number(form.stock) || 0,
      unidad:          form.unidad,
      categoria:       form.categoria,
      foto_url:        form.foto_url || null,
      oferta:          !!form.oferta,
      destacado:       !!form.destacado,
      activo:          !!form.activo,
      publicado:       !!form.publicado,
      actualizado_en:  new Date().toISOString(),
    };
    const guardar = datos => modal === 'crear'
      // carga_manual protege a este producto de la despublicación automática:
      // no viene del miniservice, así que nunca va a estar en el JSON.
      ? supabase.from('productos').insert([{ ...datos, carga_manual: true }])
      : supabase.from('productos').update(datos).eq('id', modal);

    // cod_barra sólo existe si ya se corrió scripts/migracion_features.sql.
    // Si la columna no está, se reintenta sin ella en vez de perder el cambio.
    const conBarra = form.cod_barra ? { ...payload, cod_barra: form.cod_barra } : payload;
    let { error } = await guardar(conBarra);
    if (error && form.cod_barra) await guardar(payload);
    await cargar();
    setSaving(false);
    cerrar();
  };

  // No se borra la fila: el próximo import la volvería a insertar igual. Se
  // saca de la web y queda en la base, lista para republicar.
  const cambiarPublicado = async (id, publicado) => {
    if (publicado === false && !confirm('¿Sacar este producto de la página? Queda en la base y lo podés volver a publicar cuando quieras.')) return;
    await supabase.from('productos')
      .update({ publicado, actualizado_en: new Date().toISOString() })
      .eq('id', id);
    await cargar();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand-purple-900 text-white px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-brand-purple-300 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold text-brand-yellow-400 flex-1">Gestión de Productos</h1>
        <button onClick={abrirAlta} className="btn-secondary text-sm py-2 px-4">
          <Plus className="w-4 h-4" />Nuevo producto
        </button>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o código..." className="input pl-10 bg-white" />
          </div>
          <select value={catFiltro} onChange={e => setCat(e.target.value)} className="input bg-white w-auto">
            <option value="">Todas las categorías</option>
            {categorias.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          </select>
          <select value={estado} onChange={e => setEstado(e.target.value)} className="input bg-white w-auto">
            <option value="publicados">En la página</option>
            <option value="no-publicados">Fuera de la página</option>
            <option value="todos">Todos</option>
          </select>
          <span className="self-center text-sm text-gray-500">
            {loading ? 'Buscando...'
              : total === 0 ? 'Sin resultados'
              : `${(pagina - 1) * POR_PAGINA_ADMIN + 1}–${Math.min(pagina * POR_PAGINA_ADMIN, total)} de ${total}`}
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Cargando...</div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Producto</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Categoría</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Precio</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Stock</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Tags</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {productos.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.foto_url
                          ? <img src={p.foto_url} className="w-10 h-10 rounded-lg object-cover bg-gray-100" />
                          : <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                              <Package className="w-4 h-4 text-gray-400" />
                            </div>
                        }
                        <div>
                          <p className="font-medium text-gray-900 line-clamp-1">{p.descripcion}</p>
                          {p.codigo && <p className="text-xs text-gray-400">#{p.codigo}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{p.categoria}</td>
                    <td className="px-4 py-3 text-right font-bold text-brand-purple-800">{formatPrecio(p.precio)}</td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      <span className={`font-medium ${p.stock <= 5 ? 'text-red-600' : 'text-gray-700'}`}>{p.stock}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-1">
                        {p.oferta && <span className="badge bg-red-100 text-red-700 text-[10px]">Oferta</span>}
                        {p.destacado && <span className="badge bg-brand-purple-100 text-brand-purple-700 text-[10px]">⭐</span>}
                        {!p.publicado && <span className="badge bg-gray-100 text-gray-500 text-[10px]">Fuera de la web</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => abrirEditar(p)}
                          className="p-1.5 text-gray-500 hover:text-brand-purple-700 hover:bg-brand-purple-50 rounded-lg transition-all">
                          <Pencil className="w-4 h-4" />
                        </button>
                        {p.publicado ? (
                          <button onClick={() => cambiarPublicado(p.id, false)} title="Sacar de la página"
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                            <EyeOff className="w-4 h-4" />
                          </button>
                        ) : (
                          <button onClick={() => cambiarPublicado(p.id, true)} title="Publicar en la página"
                            className="p-1.5 text-gray-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-all">
                            <Globe className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {productos.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                {busquedaAplicada
                  ? `No hay productos que coincidan con “${busquedaAplicada}”`
                  : 'No hay productos'}
              </div>
            )}
          </div>
        )}

        <Paginacion
          pagina={pagina}
          totalPaginas={totalPaginas}
          onCambiar={p => { setPagina(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          className="mt-6"
        />
      </div>

      {/* Alta: primero se busca el producto en la base, después se publica */}
      {modal === 'buscar' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-3xl">
              <h2 className="font-bold text-gray-900 text-lg">Agregar producto a la página</h2>
              <button onClick={cerrar} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">
                Buscá por código o por nombre. Los datos salen de Supabase, así que el
                producto ya viene con el precio y el stock del miniservice.
              </p>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input autoFocus value={altaBusqueda}
                    onChange={e => setAltaBusqueda(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscarParaAlta(altaBusqueda); } }}
                    placeholder="Escribí el nombre o el código..." className="input pl-10 pr-9" />
                  {altaBuscando && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-purple-400 animate-spin" />
                  )}
                </div>
                <button type="button" onClick={() => setEscaneando(true)}
                  title="Escanear el código de barras con la cámara"
                  className="btn-primary px-4">
                  <ScanLine className="w-4 h-4" />
                  <span className="hidden sm:inline">Escanear</span>
                </button>
              </div>

              {codigoEscaneado && (
                <div className="flex items-start gap-2 bg-brand-purple-50 border border-brand-purple-200 rounded-xl p-3 text-xs text-brand-purple-900">
                  <ScanLine className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>
                    Código escaneado: <strong>{codigoEscaneado}</strong>.{' '}
                    {altaResultados.length > 0
                      ? 'Elegí el producto de la lista.'
                      : 'Ningún producto tiene ese código todavía. Buscalo por nombre y al guardarlo le queda asociado para la próxima.'}
                  </p>
                </div>
              )}

              {altaBuscada && altaResultados.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">
                  No se encontró ningún producto con ese código o nombre.
                </p>
              )}

              <div className="divide-y divide-gray-100">
                {altaResultados.map(r => (
                  <button key={r.id} onClick={() => elegirDeLaBusqueda(r)}
                    className="w-full text-left py-3 px-2 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 line-clamp-1">{r.descripcion}</p>
                      <p className="text-xs text-gray-400">
                        #{r.codigo} · {r.categoria} · stock {r.stock}
                        {r.publicado && <span className="text-green-700 font-semibold"> · ya está en la página</span>}
                      </p>
                    </div>
                    <span className="font-bold text-brand-purple-800 flex-shrink-0">{formatPrecio(r.precio)}</span>
                  </button>
                ))}
              </div>

              <div className="pt-2 border-t border-gray-100">
                <button onClick={abrirCrearAMano} className="btn-outline text-sm w-full justify-center">
                  <Plus className="w-4 h-4" />No está en la base, lo cargo a mano
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal !== null && modal !== 'buscar' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-3xl">
              <h2 className="font-bold text-gray-900 text-lg">
                {modal === 'crear' ? 'Nuevo producto' : modoAlta ? 'Publicar producto' : 'Editar producto'}
              </h2>
              <button onClick={cerrar} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {/* Foto */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Foto</label>
                <div className="flex gap-3 items-start">
                  {form.foto_url
                    ? <img src={form.foto_url} className="w-20 h-20 rounded-xl object-cover border" />
                    : <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center border">
                        <ImageIcon className="w-6 h-6 text-gray-400" />
                      </div>
                  }
                  <div className="flex-1 space-y-2">
                    <input value={form.foto_url}
                      onChange={e => setForm(p => ({ ...p, foto_url: e.target.value }))}
                      className="input text-xs" placeholder="URL de imagen" />
                    <div className="flex gap-2 flex-wrap">
                      {/* capture="environment" abre directo la cámara trasera
                          del celular, para sacar la foto frente a la góndola */}
                      <button type="button" onClick={() => camaraRef.current?.click()} disabled={uploading}
                        className="btn-primary text-xs py-1.5 px-3 disabled:opacity-60">
                        <Camera className="w-3 h-3" />
                        {uploading ? 'Subiendo...' : 'Sacar foto'}
                      </button>
                      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                        className="btn-outline text-xs py-1.5 px-3 disabled:opacity-60">
                        <Upload className="w-3 h-3" />
                        Subir archivo
                      </button>
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden"
                      onChange={e => e.target.files?.[0] && subirImagen(e.target.files[0])} />
                    <input ref={camaraRef} type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => e.target.files?.[0] && subirImagen(e.target.files[0])} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Código</label>
                  <input name="codigo" value={form.codigo} onChange={handleChange}
                    className="input" placeholder="Código del miniservice" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Código de barras
                  </label>
                  <div className="flex gap-1.5">
                    <input name="cod_barra" value={form.cod_barra || ''} onChange={handleChange}
                      className="input flex-1" placeholder="Escaneá o escribí" />
                    <button type="button" onClick={() => setEscaneando(true)}
                      title="Escanear con la cámara"
                      className="px-3 rounded-xl border border-gray-200 text-gray-500 hover:text-brand-purple-700 hover:border-brand-purple-300 transition-all">
                      <ScanLine className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nombre del producto *</label>
                <input name="descripcion" value={form.descripcion} onChange={handleChange}
                  required className="input" placeholder="Nombre del producto" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Descripción web</label>
                <textarea name="descripcion_web" value={form.descripcion_web} onChange={handleChange}
                  className="input resize-none" rows={2} placeholder="Descripción para la página web" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Precio *</label>
                  <input name="precio" value={form.precio} onChange={handleChange}
                    required type="number" min="0" className="input" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Precio anterior (tachado)</label>
                  <input name="precio_anterior" value={form.precio_anterior} onChange={handleChange}
                    type="number" min="0" className="input" placeholder="(opcional)" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Categoría</label>
                  <select name="categoria" value={form.categoria} onChange={handleChange} className="input">
                    {categorias.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Stock</label>
                  <input name="stock" value={form.stock} onChange={handleChange}
                    type="number" min="0" className="input" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Unidad</label>
                  <select name="unidad" value={form.unidad} onChange={handleChange} className="input">
                    {['unidad','kg','litro','paquete','botella','porción'].map(u =>
                      <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="oferta" checked={form.oferta} onChange={handleChange}
                    className="w-4 h-4 accent-brand-purple-700" />
                  <span className="text-sm font-medium text-gray-700">En oferta 🔥</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="destacado" checked={form.destacado} onChange={handleChange}
                    className="w-4 h-4 accent-brand-purple-700" />
                  <span className="text-sm font-medium text-gray-700">Destacado ⭐</span>
                </label>
              </div>

              <label className="flex items-start gap-2 cursor-pointer bg-gray-50 rounded-xl p-3">
                <input type="checkbox" name="publicado" checked={!!form.publicado} onChange={handleChange}
                  className="w-4 h-4 accent-brand-purple-700 mt-0.5" />
                <span className="text-sm">
                  <span className="font-medium text-gray-700">Mostrar en la página</span>
                  <span className="block text-xs text-gray-500">
                    El precio y el stock se siguen actualizando solos con cada importación,
                    esté publicado o no.
                  </span>
                </span>
              </label>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center disabled:opacity-60">
                  {saving ? <span className="w-4 h-4 border-2 border-brand-yellow-400 border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" onClick={cerrar} className="btn-outline px-4">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Escáner: desde el alta busca el producto; desde la ficha sólo carga
          el código en el formulario */}
      {escaneando && (
        <EscanerCodigoBarras
          onCerrar={() => setEscaneando(false)}
          onDetectar={codigo => {
            if (modal === 'buscar') {
              buscarPorCodigoBarra(codigo);
            } else {
              setForm(p => ({ ...p, cod_barra: codigo }));
              setEscaneando(false);
            }
          }}
        />
      )}
    </div>
  );
}
