'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, Phone, LogOut, Save, ShoppingBag, ChevronRight, Store, Home } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cargarPerfil, guardarPerfil } from '@/lib/perfil';
import { useDireccion } from '@/lib/useDireccion';
import CampoDireccion from '@/components/direccion/CampoDireccion';

export default function PerfilPage() {
  const router = useRouter();
  const [user, setUser]     = useState(null);
  const [form, setForm]     = useState({ nombre: '', apellido: '', telefono: '', barrio: '', ciudad: '' });
  const dir = useDireccion();
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/cuenta/login'); return; }
      setUser(user);

      const data = await cargarPerfil(supabase, user);
      setForm({
        nombre:    data.nombre    || '',
        apellido:  data.apellido  || '',
        telefono:  data.telefono  || '',
        barrio:    data.barrio    || '',
        ciudad:    data.ciudad    || '',
      });
      dir.cargar({
        direccion: data.direccion,
        depto:     data.depto,
        lat:       data.direccion_lat,
        lng:       data.direccion_lng,
      });
      setLoading(false);
    };
    load();
  }, []);

  // Si el cliente cambia la dirección, barrio y ciudad se actualizan con lo que
  // devuelve el mapa (se pueden corregir a mano).
  useEffect(() => {
    if (!dir.geo) return;
    setForm(p => ({ ...p, barrio: dir.geo.barrio || p.barrio, ciudad: dir.geo.ciudad || p.ciudad }));
  }, [dir.geo?.lat, dir.geo?.lng]);

  const handleSave = async e => {
    e.preventDefault();
    setError('');
    setSaving(true);

    // Si hay dirección, tiene que existir de verdad.
    const tieneDireccion = dir.direccion.trim().length > 0;
    let geo = null;
    if (tieneDireccion) {
      const verif = await dir.asegurar();
      if (!verif || verif.estado === 'error' || verif.estado === 'idle') {
        setError('No pudimos encontrar tu dirección. Revisá que esté bien escrita, o marcala en el mapa.');
        setSaving(false);
        return;
      }
      geo = verif.geo;
    }

    const { ok } = await guardarPerfil(createClient(), user.id, {
      nombre:        form.nombre.trim(),
      apellido:      form.apellido.trim(),
      telefono:      form.telefono.trim(),
      direccion:     tieneDireccion ? dir.direccion.trim() : '',
      depto:         tieneDireccion ? dir.depto.trim() : '',
      barrio:        form.barrio.trim(),
      ciudad:        form.ciudad.trim(),
      direccion_lat: geo?.lat ?? null,
      direccion_lng: geo?.lng ?? null,
    });
    setSaving(false);
    if (!ok) { setError('No pudimos guardar tus datos. Probá de nuevo.'); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleLogout = async () => {
    await createClient().auth.signOut();
    router.push('/');
    router.refresh();
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-brand-purple-700 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="container-max py-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Mi cuenta</h1>
          <p className="text-gray-500 text-sm">{user?.email}</p>
        </div>
        <button onClick={handleLogout}
          className="flex items-center gap-2 text-red-500 hover:text-red-700 text-sm font-medium transition-colors">
          <LogOut className="w-4 h-4" />Salir
        </button>
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link href="/cuenta/historial" className="card p-4 flex items-center gap-3 hover:border-brand-purple-300 transition-all">
          <div className="bg-brand-purple-100 text-brand-purple-700 p-2 rounded-xl"><ShoppingBag className="w-5 h-5" /></div>
          <div><p className="font-semibold text-sm text-gray-900">Mis pedidos</p><p className="text-xs text-gray-500">Ver historial</p></div>
          <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
        </Link>
        <Link href="/" className="card p-4 flex items-center gap-3 hover:border-brand-purple-300 transition-all">
          <div className="bg-brand-yellow-100 text-brand-yellow-700 p-2 rounded-xl"><Store className="w-5 h-5" /></div>
          <div><p className="font-semibold text-sm text-gray-900">Ver productos</p><p className="text-xs text-gray-500">Hacer un pedido</p></div>
          <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
        </Link>
      </div>

      {/* Formulario */}
      <div className="card p-6">
        <h2 className="font-bold text-gray-900 text-lg mb-5">Datos personales</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-5">{error}</div>
        )}

        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl mb-5">
            ✓ Datos guardados correctamente
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nombre</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                  className="input pl-10" placeholder="Tu nombre" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Apellido</label>
              <input value={form.apellido} onChange={e => setForm(p => ({ ...p, apellido: e.target.value }))}
                className="input" placeholder="Tu apellido" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Teléfono / WhatsApp</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={form.telefono} onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))}
                className="input pl-10" placeholder="381 123-4567" type="tel" />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Dirección de entrega</p>
            <CampoDireccion dir={dir} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Barrio</label>
              <div className="relative">
                <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={form.barrio} onChange={e => setForm(p => ({ ...p, barrio: e.target.value }))}
                  className="input pl-10" placeholder="Nombre del barrio" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ciudad</label>
              <input value={form.ciudad} onChange={e => setForm(p => ({ ...p, ciudad: e.target.value }))}
                className="input" placeholder="Ciudad" />
            </div>
          </div>

          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
            {saving ? <span className="w-4 h-4 border-2 border-brand-yellow-400 border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>
      </div>
    </div>
  );
}
