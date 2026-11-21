import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'

// ── Fuentes ──
// La interfaz NO usa estas fuentes descargadas: tailwind.config.js pone
// `font-sans: ['Inter', 'system-ui', …]` con el NOMBRE 'Inter', y next/font
// registra la fuente con un nombre propio (`__Inter_xxxx`) que solo vive en la
// variable `--font-inter`. Resultado: el CRM se ve en la fuente del sistema
// (o en un Inter instalado en la PC) y la webfont no se pinta en ningún lado…
// salvo en el documento de COTIZACIÓN (components/cotizaciones/CotizacionPreview.js),
// que sí usa `var(--font-inter)` y `var(--font-display)` en línea, y de ahí sale
// el PDF.
//
// Por eso las variables se quedan, pero con `preload: false`: antes cada página
// del CRM bajaba las dos fuentes por el <link rel="preload"> aunque nadie las
// mirara; ahora el navegador las baja solo cuando una pantalla las usa de
// verdad (la cotización). Nada cambia a la vista.
//
// ⚠️ Pasar la interfaz entera al Inter de verdad es una decisión VISUAL aparte
// (cambia anchos, cortes de línea, cómo se ven las cifras): no se hace aquí.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', preload: false })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', preload: false })

export const metadata = {
  title: 'Mandarina Pro',
  description: 'Sistema de gestión Mandarina Republic & Indstore',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mandarina Pro',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
}

// Next 14 pide el color de la barra del navegador en `viewport`, no en `metadata`
// (el build avisaba en cada página). Mismo color de siempre. Es la ÚNICA fuente
// del theme-color (y del viewport): había además un <meta name="theme-color"> a mano en el <head>
// y salían dos etiquetas iguales.
// viewport-fit=cover va aquí también, y no en un <meta name="viewport"> a mano:
// Next ya escribe su propia etiqueta viewport y con las dos el navegador se
// queda con una cualquiera. viewport-fit=cover permite usar toda la pantalla en
// Android/iOS; por eso la cabecera móvil y los avisos fijos suman
// env(safe-area-inset-top) — sin eso quedan debajo del notch/la hora.
export const viewport = {
  themeColor: '#FF6B00',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }) {
  return (
    // es-EC y no "es" a secas: el lector de pantalla y el corrector del
    // navegador usan la variante de Ecuador (números, fechas, pronunciación).
    <html lang="es-EC">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Mandarina Pro" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        {/* Google Maps YA NO se carga aquí. Se bajaba en TODAS las páginas
            (login, producción, impresión…) y solo lo usa el selector de mapa
            de Nueva Venta: ahora lo pide components/maps/MapaPicker.js cuando
            alguien abre el mapa (lib/cargarGoogleMaps.js), misma URL y misma key. */}
      </head>
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-sans bg-gray-950 text-white min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
