'use client';

/**
 * Datos del cliente (tabla `clientes`): los usa el registro, "Mi cuenta" y el
 * carrito, así la dirección que carga al registrarse es la misma que le aparece
 * al pedir un delivery.
 */

// Columnas que agrega scripts/migracion_direccion_clientes.sql. Si todavía no se
// corrió ese script, se guardan los datos de siempre y se omiten éstas.
const COLUMNAS_NUEVAS = ['depto', 'direccion_lat', 'direccion_lng'];

const CAMPOS = ['nombre', 'apellido', 'telefono', 'direccion', 'depto', 'barrio', 'ciudad', 'direccion_lat', 'direccion_lng'];

const vacio = v => v === null || v === undefined || String(v).trim() === '';

/** Guarda campos del cliente. Devuelve { ok, error }. */
export async function guardarPerfil(supabase, userId, campos) {
  const intentar = async datos => {
    const { data, error } = await supabase
      .from('clientes')
      .update(datos)
      .eq('id', userId)
      .select('id');
    return { error, filas: data?.length || 0 };
  };

  let res = await intentar(campos);

  // Columna inexistente (migración sin correr): reintenta sin las nuevas.
  if (res.error && COLUMNAS_NUEVAS.some(c => String(res.error.message || '').includes(c))) {
    const basicos = { ...campos };
    COLUMNAS_NUEVAS.forEach(c => delete basicos[c]);
    res = await intentar(basicos);
  }

  if (res.error) return { ok: false, error: res.error };
  if (res.filas === 0) return { ok: false, error: new Error('No se encontró el perfil del cliente') };
  return { ok: true, error: null };
}

/**
 * Perfil del cliente logueado. Si algún dato quedó vacío en la tabla pero se
 * cargó al registrarse (viaja en los metadatos de la cuenta), lo completa y lo
 * guarda. Pasa cuando la cuenta se crea sin sesión, que es lo normal con la
 * confirmación por email: en ese momento la base no deja escribir en `clientes`.
 */
export async function cargarPerfil(supabase, user) {
  const { data: fila } = await supabase.from('clientes').select('*').eq('id', user.id).maybeSingle();
  const meta = user.user_metadata || {};

  const perfil = {};
  const recuperados = {};
  CAMPOS.forEach(campo => {
    const deLaTabla = fila?.[campo];
    if (!vacio(deLaTabla)) { perfil[campo] = deLaTabla; return; }
    if (!vacio(meta[campo])) {
      perfil[campo] = meta[campo];
      recuperados[campo] = meta[campo];
      return;
    }
    perfil[campo] = deLaTabla ?? '';
  });

  if (fila && Object.keys(recuperados).length) {
    guardarPerfil(supabase, user.id, recuperados).catch(() => {});
  }

  return perfil;
}
