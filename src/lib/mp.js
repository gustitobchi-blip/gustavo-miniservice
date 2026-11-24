import { MercadoPagoConfig, Payment } from 'mercadopago';
import { createAdminClient } from '@/lib/supabase/admin';

/** Estado del pedido mientras esperamos que se acredite el pago con MP. */
export const ESTADO_ESPERANDO_PAGO = 'pendiente_mp';
/** Estado del pedido cuando MP ya acreditó la plata. */
export const ESTADO_PAGADO = 'confirmado';

// Diferencia máxima aceptada entre lo cobrado y el total del pedido (redondeos).
const TOLERANCIA_MONTO = 1;

export function getMpClient() {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN no configurado en .env.local');
  return new MercadoPagoConfig({ accessToken });
}

/** approved | pending | rejected, normalizado a algo que entiende la UI. */
export function normalizarEstadoPago(status) {
  if (status === 'approved') return 'aprobado';
  if (status === 'rejected' || status === 'cancelled') return 'rechazado';
  if (status === 'refunded' || status === 'charged_back') return 'devuelto';
  return 'pendiente'; // pending, in_process, authorized
}

/**
 * Consulta el pago en la API de MP y sincroniza el estado del pedido en Supabase.
 * Es la única fuente de verdad: no confiamos en los parámetros que vuelven en la URL.
 *
 * Lo llaman la vuelta del cliente al sitio y el webhook, a veces varias veces
 * por el mismo pago: sólo pasa el pedido a "confirmado" si todavía estaba
 * esperando el pago, así nunca pisa un estado que el negocio ya avanzó
 * (en camino, listo para retirar, entregado).
 *
 * Devuelve { ok, estadoPago, status, pedidoId, monto, actualizado }.
 */
export async function sincronizarPago(paymentId, pedidoIdEsperado = null) {
  const payment = await new Payment(getMpClient()).get({ id: String(paymentId) });

  const pedidoId = payment.external_reference || pedidoIdEsperado;
  let estadoPago = normalizarEstadoPago(payment.status);

  // Si el front nos manda un pedido que no coincide con el del pago, no tocamos nada.
  if (pedidoIdEsperado && pedidoId && String(pedidoId) !== String(pedidoIdEsperado)) {
    return {
      ok: false,
      error: 'El pago no corresponde a este pedido',
      estadoPago,
      status: payment.status,
      pedidoId,
      monto: payment.transaction_amount,
      actualizado: false,
    };
  }

  let actualizado = false;

  if (pedidoId) {
    const supabase = createAdminClient();

    const { data: pedido } = await supabase
      .from('pedidos')
      .select('id, total, estado')
      .eq('id', pedidoId)
      .maybeSingle();

    // Siempre queda registrado qué pago de MP corresponde al pedido y en qué estado está.
    const { error: errorMp } = await supabase
      .from('pedidos')
      .update({ mp_pago_id: String(payment.id), mp_estado: payment.status })
      .eq('id', pedidoId);
    if (errorMp) console.error('[mercadopago] no se pudo guardar el pago en el pedido', pedidoId, errorMp);

    const montoOk = !!pedido &&
      Math.abs(Number(payment.transaction_amount) - Number(pedido.total)) <= TOLERANCIA_MONTO;

    if (estadoPago === 'aprobado' && !montoOk) {
      // Se cobró un monto distinto al del pedido: no se confirma solo, lo revisa el negocio.
      console.error('[mercadopago] monto distinto', pedidoId, 'cobrado', payment.transaction_amount, 'pedido', pedido?.total);
      estadoPago = 'pendiente';
    } else if (estadoPago === 'aprobado') {
      // "cancelado" también: si la plata entró, el pedido no se puede perder.
      const { data: filas, error } = await supabase
        .from('pedidos')
        .update({ estado: ESTADO_PAGADO })
        .eq('id', pedidoId)
        .in('estado', [ESTADO_ESPERANDO_PAGO, 'cancelado'])
        .select('id');
      if (error) console.error('[mercadopago] no se pudo confirmar el pedido', pedidoId, error);
      else actualizado = (filas?.length || 0) > 0 || pedido?.estado !== ESTADO_ESPERANDO_PAGO;
    } else {
      actualizado = !errorMp;
    }
  }

  return {
    ok: true,
    estadoPago,
    status: payment.status,
    statusDetail: payment.status_detail,
    pedidoId,
    monto: payment.transaction_amount,
    actualizado,
  };
}
