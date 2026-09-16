import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getProductoServer, getRelacionadosServer } from '@/lib/productos-server';
import { formatPrecio } from '@/lib/productos-shared';
import ProductoDetalle from './ProductoDetalle';

export const revalidate = 60;

/**
 * Metadatos por producto. Sin esto, compartir el link de un producto por
 * WhatsApp mostraba el título genérico del sitio: sin foto, sin nombre y sin
 * precio. WhatsApp lee og:title, og:description y og:image.
 */
export async function generateMetadata({ params }) {
  const producto = await getProductoServer(params.id);

  if (!producto) {
    return {
      title: 'Producto no encontrado | Gustavo 1°',
      robots: { index: false },
    };
  }

  const titulo = `${producto.nombre} — ${formatPrecio(producto.precio)}`;
  const descripcion = (producto.descripcion || '').slice(0, 160)
    || `Comprá ${producto.nombre} en Gustavo 1° Miniservice. Envío a domicilio o retiro en el local.`;

  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: `/producto/${producto.id}` },
    openGraph: {
      title: titulo,
      description: descripcion,
      url: `/producto/${producto.id}`,
      siteName: 'Gustavo 1° | Miniservice',
      type: 'website',
      locale: 'es_AR',
      images: [{ url: producto.imagen, width: 400, height: 400, alt: producto.nombre }],
    },
    twitter: {
      card: 'summary_large_image',
      title: titulo,
      description: descripcion,
      images: [producto.imagen],
    },
  };
}

export default async function ProductoPage({ params }) {
  const producto = await getProductoServer(params.id);

  if (!producto) {
    return (
      <div className="container-max py-16 text-center">
        <span className="text-6xl">😕</span>
        <p className="text-gray-500 font-medium mt-4">Producto no encontrado</p>
        <Link href="/catalogo" className="mt-4 btn-primary inline-flex">
          <ArrowLeft className="w-4 h-4" />Volver al catálogo
        </Link>
      </div>
    );
  }

  const relacionados = await getRelacionadosServer(producto.categoria, producto.id, 4);

  return <ProductoDetalle producto={producto} relacionados={relacionados} />;
}
