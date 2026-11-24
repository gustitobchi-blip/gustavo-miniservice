import { Preference } from 'mercadopago';
import { getMpClient } from '@/lib/mp';
import { createAdminClient } from '@/lib/supabase/admin';
import { lineaMercadoPago, subtotalLinea, esPorPeso } from '@/lib/peso';
import { COSTO_ENVIO } from '@/lib/envio';

/**
 * Crea la preferencia de Checkout Pro y devuelve el link de pago de Mercado Pago.
 * El cliente paga en la página de MP con su cuenta / débito / QR y la plata
 * cae directo en la cuenta de MP del negocio (la del MP_ACCESS_TOKEN).
 *
 * Lo que se cobra se calcula ACÁ, con los precios actuales de la tabla
 * `productos` y el costo de envío fijo: nunca con montos que mande el
 * navegador. El pedido y su detalle se corrigen para que coincidan con lo cobrado.
 */
export async function POST(request) {
  try {
    const { pedidoId, payerEmail } = await request.json();

    if (!pedidoId) {
      return Response.json({ error: 'Falta el número de pedido' }, { status: 400 });
    }
    if (!process.env.MP_ACCESS_TOKEN) {
      return Response.json({ error: 'MP_ACCESS_TOKEN no configurado en .env.local' }, { status: 500 });
    }

    const supabase = createAdminClient();

    const { data: pedido } = await supabase
      .from('pedidos')
      .select('id, estado, forma_entrega')
      .eq('id', pedidoId)
      .maybeSingle();
    if (!pedido) {
      return Response.json({ error: 'No encontramos el pedido' }, { status: 404 });
    }
    if (pedido.estado !== 'pendiente_mp') {
      return Response.json({ error: 'Este pedido ya no está esperando un pago' }, { status: 409 });
    }

    const calculo = await calcularCobro(supabase, pedido);
    if (calculo.error) {
      return Response.json({ error: calculo.error }, { status: 400 });
    }
    const { mpItems, lineas, costoEnvio, total } = calculo;

    // El pedido queda con los mismos montos que se van a cobrar.
    await supabase.from('pedidos').update({ total, costo_envio: costoEnvio }).eq('id', pedidoId);
    for (const l of lineas) {
      if (l.cambio) {
        await supabase.from('detalle_pedidos')
          .update({ precio_unitario: l.precio, subtotal: l.subtotal })
          .eq('id', l.id);
      }
    }

    const siteUrl = baseUrl(request);

    const body = {
      items: mpItems,
      back_urls: {
        success: `${siteUrl}/carrito?mp_status=approved&pedido=${pedidoId}`,
        failure: `${siteUrl}/carrito?mp_status=failure&pedido=${pedidoId}`,
        pending: `${siteUrl}/carrito?mp_status=pending&pedido=${pedidoId}`,
      },
      binary_mode:        true, // aprobado o rechazado, sin quedar "en proceso"
      external_reference:  String(pedidoId),
      statement_descriptor: 'GUSTAVO 1',
      metadata:            { pedido_id: String(pedidoId) },
      // El negocio no acepta tarjeta de crédito (y por lo tanto tampoco cuotas):
      // se excluye ese medio y se fuerza pago en un solo pago.
      payment_methods: {
        excluded_payment_types: [{ id: 'credit_card' }],
        installments: 1,
      },
    };

    // MP no acepta direcciones localhost para volver solo al sitio ni para avisar
    // pagos: en producción (https) vuelve automáticamente y avisa al webhook; en
    // la PC de desarrollo el comprador vuelve con el botón "Volver al sitio".
    if (siteUrl.startsWith('https://')) {
      body.auto_return = 'approved';
      body.notification_url = `${siteUrl}/api/mp-webhook`;
    }

    if (payerEmail) body.payer = { email: payerEmail };

    const result = await new Preference(getMpClient()).create({ body });

    return Response.json({
      init_point: result.init_point,
      preference_id: result.id,
      total,
    });
  } catch (err) {
    console.error('[crear-preferencia]', err);
    return Response.json({ error: err.message || 'Error al crear la preferencia de Mercado Pago' }, { status: 500 });
  }
}

/**
 * Arma lo que se cobra a partir del detalle guardado y los precios actuales.
 * `codigo_producto` guarda el id del producto (o su código en pedidos viejos).
 */
async function calcularCobro(supabase, pedido) {
  const { data: detalle, error } = await supabase
    .from('detalle_pedidos')
    .select('id, codigo_producto, descripcion, cantidad, precio_unitario, unidad')
    .eq('pedido_id', pedido.id);

  if (error || !detalle?.length) return { error: 'El pedido no tiene productos' };

  const claves = [...new Set(detalle.map(d => String(d.codigo_producto)))];
  const ids = claves.filter(c => /^\d+$/.test(c));

  const campos = 'id, codigo, descripcion, precio, unidad, activo';
  const [porId, porCodigo] = await Promise.all([
    ids.length ? supabase.from('productos').select(campos).in('id', ids) : { data: [] },
    supabase.from('productos').select(campos).in('codigo', claves),
  ]);

  const buscar = clave =>
    (porId.data || []).find(p => String(p.id) === clave) ||
    (porCodigo.data || []).find(p => String(p.codigo) === clave);

  const lineas = [];
  for (const d of detalle) {
    const prod = buscar(String(d.codigo_producto));
    const precio = Number(prod?.precio);
    if (!prod || prod.activo === false || !(precio > 0)) {
      return { error: `"${d.descripcion}" ya no está disponible. Sacalo del carrito para seguir.` };
    }
    const cantidad = Number(d.cantidad);
    if (!(cantidad > 0)) return { error: `La cantidad de "${d.descripcion}" no es válida.` };
    if (!esPorPeso({ unidad: prod.unidad }) && !Number.isInteger(cantidad)) {
      return { error: `La cantidad de "${d.descripcion}" no es válida.` };
    }
    const subtotal = subtotalLinea(precio, cantidad);
    lineas.push({
      id: d.id,
      precio,
      subtotal,
      cambio: Number(d.precio_unitario) !== precio,
      mp: lineaMercadoPago({
        descripcion: d.descripcion,
        cantidad,
        precio_unitario: precio,
        subtotal,
        unidad: prod.unidad,
      }),
    });
  }

  const mpItems = lineas.map(l => l.mp);
  const costoEnvio = pedido.forma_entrega === 'delivery' ? COSTO_ENVIO : 0;
  if (costoEnvio > 0) {
    mpItems.push({ title: 'Envío a domicilio', quantity: 1, unit_price: costoEnvio, currency_id: 'ARS' });
  }

  const total = mpItems.reduce((acc, i) => acc + i.quantity * i.unit_price, 0);
  return { mpItems, lineas, costoEnvio, total };
}

function baseUrl(request) {
  const configurada = process.env.NEXT_PUBLIC_SITE_URL;
  if (configurada) return configurada.replace(/\/$/, '');
  return (request.headers.get('origin') || 'http://localhost:3000').replace(/\/$/, '');
}
