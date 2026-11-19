// Número de WhatsApp del negocio, en formato internacional sin signos.
export const WHATSAPP_NUMERO = '5493816751000';

// Mismo número, con formato legible para mostrar en pantalla.
export const WHATSAPP_NUMERO_DISPLAY = '+54 9 381 675-1000';

export const WHATSAPP_TEXTO = 'Hola! Tengo una duda sobre mi pedido en Gustavo 1°';

export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(WHATSAPP_TEXTO)}`;

// Horarios de atención. Es la única fuente: Footer, /envios, /como-comprar y la
// portada leen de acá.
export const HORARIOS = [
  { dias: 'Lunes a Viernes', horas: '8:00 a 22:00 hs' },
  { dias: 'Sábados',         horas: '8:00 a 15:00 hs y 18:00 a 22:00 hs' },
  { dias: 'Domingos',        horas: '9:30 a 13:30 hs' },
];

// Versión corta para espacios chicos (portada, /como-comprar).
export const HORARIOS_RESUMEN = 'Lun–Vie 8 a 22 · Sáb 8 a 15 y 18 a 22 · Dom 9:30 a 13:30 hs';
