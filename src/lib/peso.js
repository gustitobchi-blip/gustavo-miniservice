/**
 * Productos que se venden por peso (`unidad = 'kg'` en la tabla productos).
 *
 * El precio de la base es por kilo y la cantidad del carrito está en kilos:
 * 0.1 = 100 g. Se redondea siempre a 3 decimales porque 0.1 + 0.2 en
 * punto flotante da 0.30000000000000004 y eso terminaría en pantalla.
 */

export const PASO_KG = 0.1;   // el cliente elige de a 100 g
export const MIN_KG  = 0.1;
export const MAX_KG  = 3;     // tope por producto en un pedido

export const esPorPeso = (x) => String(x?.unidad ?? '').trim().toLowerCase() === 'kg';

export const redondearKg = (n) => Math.round(Number(n) * 1000) / 1000;

/** Cuánto suma un "+" : 100 g en los de peso, 1 unidad en el resto. */
export const pasoDe = (x) => (esPorPeso(x) ? PASO_KG : 1);

export function sumarCantidad(x, a, b) {
  return esPorPeso(x) ? redondearKg(a + b) : a + b;
}

/** En los de peso corta en el máximo por pedido; el resto no tiene tope. */
export function limitarCantidad(x, cantidad) {
  if (!esPorPeso(x)) return cantidad;
  return Math.min(MAX_KG, redondearKg(cantidad));
}

/** Precio de la línea en pesos enteros (sin centavos). */
export const subtotalLinea = (precio, cantidad) => Math.round(Number(precio) * Number(cantidad));

/** 0.3 → "300 g", 1.2 → "1,2 kg". Para unidades devuelve el número tal cual. */
export function formatCantidad(cantidad, unidad) {
  if (!esPorPeso({ unidad })) return String(cantidad);
  const gramos = Math.round(Number(cantidad) * 1000);
  if (gramos < 1000) return `${gramos} g`;
  return `${String(gramos / 1000).replace('.', ',')} kg`;
}

/** Etiqueta corta para listados de pedidos: "x3" o "300 g". */
export function etiquetaCantidad(cantidad, unidad, prefijo = 'x') {
  return esPorPeso({ unidad })
    ? formatCantidad(cantidad, unidad)
    : `${prefijo}${cantidad}`;
}

/**
 * Una línea de pedido como la espera Mercado Pago. MP sólo acepta cantidades
 * enteras, así que lo que se vende por peso va como 1 ítem por el total
 * (ej: "Jamón cocido x kg (300 g)", $6.600) en vez de 0.3 × $22.000.
 */
export function lineaMercadoPago({ descripcion, cantidad, precio_unitario, subtotal, unidad }) {
  const cant = Number(cantidad);
  const title = String(descripcion || 'Producto');

  if (!esPorPeso({ unidad }) && Number.isInteger(cant)) {
    return { title, quantity: cant, unit_price: Number(precio_unitario), currency_id: 'ARS' };
  }

  const total = subtotal != null && Number(subtotal) > 0
    ? Math.round(Number(subtotal))
    : subtotalLinea(precio_unitario, cant);

  return {
    title: `${title} (${formatCantidad(cant, 'kg')})`,
    quantity: 1,
    unit_price: total,
    currency_id: 'ARS',
  };
}
