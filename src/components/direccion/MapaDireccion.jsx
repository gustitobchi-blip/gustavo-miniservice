'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { LOCAL_LAT, LOCAL_LNG, RADIO_MAXIMO_KM } from '@/lib/envio';

const PIN_HTML = `
  <svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 28 18 28s18-14.5 18-28C36 8.06 27.94 0 18 0z" fill="#6D28D9"/>
    <circle cx="18" cy="18" r="7" fill="#FACC15"/>
  </svg>`;

const LOCAL_HTML = `
  <div style="width:30px;height:30px;border-radius:9999px;background:#FACC15;border:3px solid #4C1D95;
              display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 1px 4px rgba(0,0,0,.35)">🏪</div>`;

/**
 * Mapa (OpenStreetMap + Leaflet, gratis y sin clave) con el pin de la entrega.
 * El cliente toca el mapa o arrastra el pin para ajustar el punto exacto; el
 * círculo punteado marca hasta dónde se reparte y el 🏪 es el local.
 */
export default function MapaDireccion({ lat, lng, onMover }) {
  const contenedor = useRef(null);
  const estado     = useRef({ L: null, mapa: null, pin: null });
  const props      = useRef({ lat, lng, onMover });
  props.current = { lat, lng, onMover };

  // Pone el pin (y la cámara) donde indican las props actuales.
  const sincronizar = () => {
    const { L, mapa, pin } = estado.current;
    const { lat: la, lng: ln } = props.current;
    if (!L || !mapa) return;

    if (la == null || ln == null) {
      if (pin) { pin.remove(); estado.current.pin = null; }
      return;
    }

    if (pin) {
      pin.setLatLng([la, ln]);
      mapa.panTo([la, ln]);
    } else {
      const nuevo = L.marker([la, ln], {
        draggable: true,
        icon: L.divIcon({ html: PIN_HTML, className: '', iconSize: [36, 46], iconAnchor: [18, 46] }),
      }).addTo(mapa);
      nuevo.on('dragend', () => {
        const p = nuevo.getLatLng();
        props.current.onMover?.(p.lat, p.lng);
      });
      estado.current.pin = nuevo;
      mapa.setView([la, ln], 16);
    }
  };

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelado || !contenedor.current) return;

      const { lat: la, lng: ln } = props.current;
      const hayPunto = la != null && ln != null;

      const mapa = L.map(contenedor.current, { scrollWheelZoom: false })
        .setView(hayPunto ? [la, ln] : [LOCAL_LAT, LOCAL_LNG], hayPunto ? 16 : 14);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(mapa);

      L.circle([LOCAL_LAT, LOCAL_LNG], {
        radius: RADIO_MAXIMO_KM * 1000,
        color: '#6D28D9', weight: 2, dashArray: '6 6', fillColor: '#8B5CF6', fillOpacity: 0.06,
        interactive: false,
      }).addTo(mapa);

      L.marker([LOCAL_LAT, LOCAL_LNG], {
        icon: L.divIcon({ html: LOCAL_HTML, className: '', iconSize: [30, 30], iconAnchor: [15, 15] }),
        interactive: false, keyboard: false,
      }).addTo(mapa);

      mapa.on('click', e => props.current.onMover?.(e.latlng.lat, e.latlng.lng));

      estado.current = { L, mapa, pin: null };
      sincronizar();
    })();

    return () => {
      cancelado = true;
      estado.current.mapa?.remove();
      estado.current = { L: null, mapa: null, pin: null };
    };
  }, []);

  useEffect(sincronizar, [lat, lng]);

  // `isolate` encierra los z-index internos de Leaflet (hasta 1000) para que el
  // mapa no se monte encima del menú ni del carrito.
  return (
    <div className="isolate relative z-0">
      <div ref={contenedor} className="h-64 w-full rounded-xl border border-gray-200 overflow-hidden" />
    </div>
  );
}
