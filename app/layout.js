import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-display' })

export const metadata = {
  title: 'Mandarina Pro',
  description: 'Sistema de gestión Mandarina Republic & Indstore',
  manifest: '/manifest.json',
  themeColor: '#FF6B00',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
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
