/** @type {import('next').NextConfig} */
// build: 2026-06-26
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle server-only modules on client side
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        child_process: false,
        'fs/promises': false,
      }
    }
    return config
  },

  // Quién puede meter el CRM dentro de un iframe.
  //
  // Hasta hoy no había ninguna cabecera, o sea que podía enmarcarlo cualquiera
  // (clickjacking: te ponen el CRM invisible encima de otra cosa y haces clics
  // que no querías). Se cierra con lista blanca, no con comodín.
  //
  // ⚠️ Estos valores están repetidos a mano porque next.config.js es CommonJS y
  // lib/origenes.js es ESM. `tests/csp.test.js` compara los dos y falla si se
  // desincronizan — si agregas un inbox, agrégalo en los dos lados.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://inbox.apps.mandarinaec.com https://ind-inbox.apps.mandarinaec.com",
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
