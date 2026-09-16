import './globals.css';
import { CartProvider } from '@/context/CartContext';
import ShopWrapper from '@/components/layout/ShopWrapper';

// metadataBase hace que las URLs relativas de openGraph se resuelvan a
// absolutas. WhatsApp y Facebook descartan las relativas, así que sin esto la
// preview del producto queda sin imagen.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Gustavo 1° | Miniservice',
    template: '%s | Gustavo 1°',
  },
  description: 'Tu miniservice online. Comestibles, bebidas, rotisería, lácteos, artículos de limpieza y más. Delivery y retiro en local.',
  keywords: 'miniservice, comestibles, rotiseria, lacteos, bebidas, limpieza, delivery, compras online, Gustavo',
  openGraph: {
    siteName: 'Gustavo 1° | Miniservice',
    type: 'website',
    locale: 'es_AR',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <CartProvider>
          <div className="min-h-screen flex flex-col">
            <ShopWrapper>
              {children}
            </ShopWrapper>
          </div>
        </CartProvider>
      </body>
    </html>
  );
}
