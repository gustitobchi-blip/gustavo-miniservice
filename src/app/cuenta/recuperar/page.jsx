'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Store, Mail, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function RecuperarPage() {
  const [email, setEmail]     = useState('');
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/cuenta/nueva-clave`,
    });

    if (err) {
      setError('No pudimos enviar el mail. Revisá la dirección e intentá de nuevo.');
      setLoading(false);
      return;
    }

    // Se muestra el mismo mensaje exista o no la cuenta: si dijéramos "ese
    // email no está registrado" cualquiera podría averiguar quién tiene cuenta.
    setEnviado(true);
    setLoading(false);
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
          {enviado ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <h1 className="text-xl font-black text-gray-900 mb-2">Revisá tu mail</h1>
              <p className="text-gray-600 text-sm leading-relaxed">
                Si <strong className="text-gray-900">{email.trim()}</strong> tiene una cuenta,
                te mandamos un link para poner una contraseña nueva.
              </p>
              <p className="text-gray-400 text-xs mt-3">
                El link vence en una hora. Si no lo ves, mirá en spam.
              </p>
              <Link href="/cuenta/login" className="btn-primary text-sm justify-center w-full mt-6">
                Volver a ingresar
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-black text-gray-900 mb-1">¿Olvidaste tu contraseña?</h1>
              <p className="text-gray-500 text-sm mb-6">
                Poné tu email y te mandamos un link para cambiarla.
              </p>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-4">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="email" required autoFocus value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="tumail@ejemplo.com"
                      className="input pl-10" />
                  </div>
                </div>

                <button type="submit" disabled={loading || !email.trim()}
                  className="btn-primary w-full justify-center disabled:opacity-60">
                  {loading ? 'Enviando...' : 'Enviarme el link'}
                </button>
              </form>

              <Link href="/cuenta/login"
                className="flex items-center justify-center gap-1.5 text-gray-500 hover:text-brand-purple-700 text-sm mt-6 transition-colors">
                <ArrowLeft className="w-4 h-4" />Volver a ingresar
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
