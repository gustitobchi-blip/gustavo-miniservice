'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { X, Camera, AlertTriangle } from 'lucide-react';

/**
 * Lector de códigos de barras con la cámara del celular.
 *
 * Usa ZXing en vez de la API nativa BarcodeDetector porque esa no existe en
 * Safari/iOS, y la idea es poder escanear parado frente a la góndola con
 * cualquier teléfono.
 *
 * Ojo: el navegador sólo da acceso a la cámara sobre HTTPS (o en localhost).
 */
export default function EscanerCodigoBarras({ onDetectar, onCerrar }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');

  // El callback se guarda en una ref y el efecto no lo lista en las deps: si
  // el padre lo pasa inline, cambia en cada render y la cámara se reiniciaría
  // una y otra vez.
  const alDetectar = useRef(onDetectar);
  useEffect(() => { alDetectar.current = onDetectar; }, [onDetectar]);

  useEffect(() => {
    const lector = new BrowserMultiFormatReader();
    let controles = null;
    let activo = true;

    lector
      .decodeFromConstraints(
        // facingMode environment = cámara trasera, la que apunta a la góndola.
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current,
        (resultado, _err, ctrl) => {
          controles = ctrl;
          if (resultado && activo) {
            activo = false;
            try { ctrl.stop(); } catch { /* ya estaba parada */ }
            alDetectar.current(resultado.getText());
          }
        }
      )
      .then(ctrl => {
        controles = ctrl;
        // Si el componente se desmontó mientras arrancaba la cámara.
        if (!activo) { try { ctrl.stop(); } catch { /* nada */ } }
      })
      .catch(() => {
        setError('No pudimos abrir la cámara. Revisá que le hayas dado permiso al navegador y que la página esté en HTTPS.');
      });

    return () => {
      activo = false;
      try { controles?.stop(); } catch { /* nada */ }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Camera className="w-4 h-4 text-brand-purple-700" />
            Escanear código de barras
          </h3>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error ? (
          <div className="p-6 text-center">
            <AlertTriangle className="w-10 h-10 text-orange-500 mx-auto mb-3" />
            <p className="text-sm text-gray-600 leading-relaxed">{error}</p>
            <button onClick={onCerrar} className="btn-outline text-sm mt-5 w-full justify-center">
              Cerrar y buscar a mano
            </button>
          </div>
        ) : (
          <>
            <div className="relative bg-black aspect-[4/3]">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              {/* Guía visual: el código tiene que entrar en el recuadro */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-4/5 h-20 border-2 border-brand-yellow-400 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            </div>
            <p className="px-5 py-4 text-xs text-gray-500 text-center">
              Apuntá al código de barras del producto. Se detecta solo.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
