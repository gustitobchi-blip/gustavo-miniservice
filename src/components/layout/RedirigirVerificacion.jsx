'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

/**
 * Si el link de confirmación del mail cae en la portada (pasa cuando la "Site
 * URL" de Supabase es la raíz del sitio), lleva al cliente al login con el
 * aviso de cuenta verificada, en vez de dejarlo en la home sin explicación.
 */
export default function RedirigirVerificacion() {
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/') return;
    const busqueda = new URLSearchParams(window.location.search);
    const hash     = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    if (hash.get('error_code') || hash.get('error')) {
      router.replace('/cuenta/login?verificacion=error');
    } else if (busqueda.get('code') || hash.get('type') === 'signup') {
      router.replace('/cuenta/login?verificado=1');
    }
  }, [pathname, router]);

  return null;
}
