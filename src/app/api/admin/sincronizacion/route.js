import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Últimas actualizaciones de precio y stock que mandó la PC del súper.
 * La tabla `sync_log` no se puede leer desde el navegador (no tiene permisos
 * públicos), así que se lee acá con la clave del servidor, sólo para admins.
 *
 * El panel manda la sesión en `Authorization: Bearer <token>`: la versión de
 * @supabase/ssr instalada no lee la sesión desde las cookies en rutas de API.
 */
export async function GET(request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'Sin sesión' }, { status: 401 });

  const admin = createAdminClient();

  const { data: { user } = {}, error: errUser } = await admin.auth.getUser(token);
  if (errUser || !user) return Response.json({ error: 'Sin sesión' }, { status: 401 });

  const { data: cliente } = await admin.from('clientes').select('rol').eq('id', user.id).maybeSingle();
  if (cliente?.rol !== 'admin') return Response.json({ error: 'Sin permiso' }, { status: 403 });

  const { data, error } = await admin
    .from('sync_log')
    .select('id, fecha, ok, mensaje, actualizados')
    .eq('simulacion', false)
    .order('fecha', { ascending: false })
    .limit(8);

  if (error) return Response.json({ error: 'No se pudo leer el registro' }, { status: 500 });
  return Response.json({ corridas: data || [] });
}
