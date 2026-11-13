'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Store, Lock, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

function NuevaClaveContent() {
  const router = useRouter();
  const [form, setForm]       = useState({ password: '', confirmar: '' });
  const [showPass, setShow]   = useState(false);
  const [listo, setListo]     = useState(false);   // hay sesión de recuperación
  const [verificando, setVer] = useState(true);
  const [guardado, setGuard]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // El link del mail puede llegar de dos formas según cómo esté configurado
  // Supabase: con ?code= (PKCE) o con el token en el hash. Se contemplan las dos.
  useEffect(() => {
    const supabase = createClient();
    let vivo = true;

    const marcarListo = () => { if (vivo) { setListo(true); setVer(false); } };

    const arrancar = async () => {
      const code = new URLSearchParams(window.location.search).get('code');
      if (code) {
        const { error: err } = await supabase.auth.exchangeCodeForSession(code);
        if (!err) { marcarListo(); return; }
      }

      const { data } = await supabase.auth.getSession();
      if (data?.session) { marcarListo(); return; }

      // Todavía puede llegar por el evento de abajo; si no llega, se corta.
      setTimeout(() => { if (vivo) setVer(false); }, 2500);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (evento === 'PASSWORD_RECOVERY' || sesion) marcarListo();
    });

    arrancar();
    return () => { vivo = false; subscription.unsubscribe(); };
  }, []);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');

    if (form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    if (form.password !== form.confirmar) { setError('Las contraseñas no coinciden'); return; }

    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password: form.password });

    if (err) {
      setError('No se pudo cambiar la contraseña. Pedí un link nuevo e intentá otra vez.');
      setLoading(false);
      return;
    }

    setGuard(true);
    setLoading(false);
    setTimeout(() => { router.push('/cuenta/login'); router.refresh(); }, 2500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-purple-900 via-brand-purple-800 to-brand-purple-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3">
            <div className="bg-brand-yellow-400 rounded-2xl p-2.5">
              <Store className="w-7 h-7 text-brand-purple-900" />
            </div>
            <span className="text-brand-yellow-400 font-black text-2xl">Gustavo 1°</span>
          </Link>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-2xl">
          {verificando ? (
            <div className="text-center py-6">
              <div className="w-8 h-8 border-4 border-brand-purple-700 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-gray-500 text-sm mt-4">Verificando el link...</p>
            </div>
          ) : guardado ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <h1 className="text-xl font-black text-gray-900 mb-2">Contraseña cambiada</h1>
              <p className="text-gray-600 text-sm">Te llevamos a ingresar...</p>
            </div>
          ) : !listo ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-7 h-7 text-orange-600" />
              </div>
              <h1 className="text-xl font-black text-gray-900 mb-2">El link no sirve</h1>
              <p className="text-gray-600 text-sm leading-relaxed">
                Puede que haya vencido o que ya lo hayas usado. Pedí uno nuevo.
              </p>
              <Link href="/cuenta/recuperar" className="btn-primary text-sm justify-center w-full mt-6">
                Pedir un link nuevo
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-black text-gray-900 mb-1">Nueva contraseña</h1>
              <p className="text-gray-500 text-sm mb-6">Elegí una de al menos 6 caracteres.</p>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-4">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña nueva</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input name="password" type={showPass ? 'text' : 'password'} required autoFocus
                      value={form.password}
                      onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="••••••••" className="input pl-10 pr-10" />
                    <button type="button" onClick={() => setShow(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Repetila</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input name="confirmar" type={showPass ? 'text' : 'password'} required
                      value={form.confirmar}
                      onChange={e => setForm(p => ({ ...p, confirmar: e.target.value }))}
                      placeholder="••••••••" className="input pl-10" />
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="btn-primary w-full justify-center disabled:opacity-60">
                  {loading ? 'Guardando...' : 'Guardar contraseña'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NuevaClavePage() {
  return (
    <Suspense fallback={null}>
      <NuevaClaveContent />
    </Suspense>
  );
}
