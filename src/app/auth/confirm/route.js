import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Destino del link de los mails de Supabase (confirmar cuenta, recuperar clave).
 * Acepta las dos formas en que Supabase arma el link:
 *   ?token_hash=...&type=...   (plantilla de mail personalizada)
 *   ?code=...                  (flujo PKCE)
 *
 * Al confirmar la cuenta, el cliente va derecho a la pantalla de login
 * (se cierra la sesión que abre la confirmación para que ingrese él con su clave).
 * Si el link es de recuperar la contraseña, sigue a la pantalla de nueva clave.
 */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type      = searchParams.get('type');
  const code      = searchParams.get('code');

  const supabase = createClient();
  let ok = false;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (!ok) {
    return NextResponse.redirect(`${origin}/cuenta/login?verificacion=error`);
  }

  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/cuenta/nueva-clave`);
  }

  await supabase.auth.signOut();
  return NextResponse.redirect(`${origin}/cuenta/login?verificado=1`);
}
