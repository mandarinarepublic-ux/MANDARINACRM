import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-display' })

export const metadata = {
  title: 'Mandarina Pro',
  description: 'Sistema de gestión Mandarina Republic & Indstore',
  manifest: '/manifest.json',
  themeColor: '#FF6B00',
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

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Mandarina Pro" />
        <meta name="theme-color" content="#FF6B00" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places`}
          async
          defer
        />
      </head>
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-sans bg-gray-950 text-white min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
