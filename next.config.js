/** @type {import('next').NextConfig} */
// build: 2026-06-26
const nextConfig = {
  generateBuildId: async () => {
    return 'build-' + Date.now()
  },
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
}

module.exports = nextConfig
