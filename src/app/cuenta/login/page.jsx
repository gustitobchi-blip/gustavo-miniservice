'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Store, Mail, Lock, Eye, EyeOff, LogIn, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/cuenta/perfil';

  const [form, setForm]       = useState({ email: '', password: '' });
  const [showPass, setShow]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [aviso, setAviso]     = useState(null); // 'verificado' | 'vencido' (viene del link del mail)

  // Al llegar desde el mail de confirmación: avisa si la cuenta quedó verificada
  // o si el link ya no sirve, y limpia la barra de direcciones.
  useEffect(() => {
    const busqueda = new URLSearchParams(window.location.search);
    const hash     = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    if (hash.get('error_code') || hash.get('error') || busqueda.get('verificacion') === 'error') {
      setAviso('vencido');
    } else if (busqueda.get('verificado') || busqueda.get('code') || hash.get('type') === 'signup') {
      setAviso('verificado');
    } else {
      return;
    }
    const next = busqueda.get('next');
    window.history.replaceState({}, '', next ? `/cuenta/login?next=${encodeURIComponent(next)}` : '/cuenta/login');
  }, []);

  const handleChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });

    if (err) {
      setError('Email o contraseña incorrectos');
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { data: cliente } = await supabase
      .from('clientes')
      .select('rol')
      .eq('id', user.id)
      .single();

    const rol = cliente?.rol;
    let destino;
    if (rol === 'admin')  destino = '/admin';
    else if (rol === 'cadete') destino = '/cadete';
    else destino = (next && next !== '/cuenta/perfil') ? next : '/';

    router.push(destino);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-purple-900 via-brand-purple-800 to-brand-purple-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3">
            <div className="bg-brand-yellow-400 rounded-2xl p-2.5">
              <Store className="w-8 h-8 text-brand-purple-900" />
            </div>
            <div className="text-left">
              <p className="text-brand-yellow-400 font-black text-2xl leading-none">Gustavo 1°</p>
              <p className="text-brand-purple-300 text-xs">Miniservice</p>
            </div>
          </Link>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-2xl">
          <h1 className="text-2xl font-black text-gray-900 mb-1">Iniciar sesión</h1>
          <p className="text-gray-500 text-sm mb-6">
            ¿No tenés cuenta?{' '}
            <Link href="/cuenta/registro" className="text-brand-purple-700 font-semibold hover:underline">
              Registrate gratis
            </Link>
          </p>

          {aviso === 'verificado' && (
            <div className="flex items-start gap-2 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl mb-5">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span><strong>¡Cuenta verificada!</strong> Ya podés iniciar sesión con tu email y tu contraseña.</span>
            </div>
          )}

          {aviso === 'vencido' && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-xl mb-5">
              El link de verificación ya se usó o venció. Si ya verificaste tu cuenta, iniciá sesión acá abajo.
              Si no, registrate de nuevo o escribinos por WhatsApp.
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input name="email" type="email" value={form.email}
                  onChange={handleChange} required autoComplete="email"
                  placeholder="tu@email.com" className="input pl-10" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-gray-600">Contraseña</label>
                <Link href="/cuenta/recuperar"
                  className="text-xs font-semibold text-brand-purple-700 hover:text-brand-purple-900 transition-colors">
                  ¿La olvidaste?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input name="password" type={showPass ? 'text' : 'password'}
                  value={form.password} onChange={handleChange}
                  required autoComplete="current-password"
                  placeholder="••••••••" className="input pl-10 pr-10" />
                <button type="button" onClick={() => setShow(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="btn-primary w-full justify-center mt-2 disabled:opacity-60">
              {loading
                ? <span className="w-4 h-4 border-2 border-brand-yellow-400 border-t-transparent rounded-full animate-spin" />
                : <LogIn className="w-4 h-4" />}
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link href="/" className="text-gray-400 text-xs hover:text-gray-600 transition-colors">
              Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
