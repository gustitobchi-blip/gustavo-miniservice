/**
 * Estados de un pedido y cómo avanzan según la forma de entrega.
 *
 *   Delivery:  pendiente → confirmado → en_camino → entregado
 *   Retiro:    pendiente → confirmado → listo_retiro → entregado ("Retirado")
 *
 * `pendiente_mp` es el pedido de Mercado Pago que todavía no se acreditó y
 * `cancelado` se puede dar en cualquier momento. Un pedido para retirar nunca
 * pasa por "en camino" (no hay envío), ni uno de delivery por "listo para retirar".
 */

export const ETIQUETA_ESTADO = {
  pendiente_mp: 'Esperando pago',
  pendiente:    'Pendiente',
  confirmado:   'Confirmado',
  en_camino:    'En camino',
  listo_retiro: 'Listo para retirar',
  entregado:    'Entregado',
  cancelado:    'Cancelado',
};

export const esRetiro = formaEntrega => formaEntrega === 'retiro';

/** Texto del estado: un pedido para retirar que se completó figura como "Retirado". */
export function etiquetaEstado(estado, formaEntrega) {
  if (estado === 'entregado' && esRetiro(formaEntrega)) return 'Retirado';
  return ETIQUETA_ESTADO[estado] || estado;
}

/** Siguiente paso del botón "→" del panel. null si no hay (entregado / cancelado). */
export function siguienteEstado(estado, formaEntrega) {
  switch (estado) {
    case 'pendiente_mp':
    case 'pendiente':
      return 'confirmado';
    case 'confirmado':
      return esRetiro(formaEntrega) ? 'listo_retiro' : 'en_camino';
    case 'en_camino':
    case 'listo_retiro':
      return 'entregado';
    default:
      return null;
  }
}

/**
 * Si se cambia la forma de entrega de un pedido ya avanzado, pasa al estado
 * equivalente (en camino ↔ listo para retirar) para no dejarlo incoherente.
 */
export function estadoCoherente(estado, formaEntrega) {
  if (esRetiro(formaEntrega) && estado === 'en_camino') return 'listo_retiro';
  if (!esRetiro(formaEntrega) && estado === 'listo_retiro') return 'en_camino';
  return estado;
}

/** Estados que se pueden elegir a mano para ese tipo de entrega. */
export function estadosElegibles(formaEntrega) {
  const sinElOtro = esRetiro(formaEntrega) ? 'en_camino' : 'listo_retiro';
  return Object.keys(ETIQUETA_ESTADO).filter(e => e !== sinElOtro);
}
