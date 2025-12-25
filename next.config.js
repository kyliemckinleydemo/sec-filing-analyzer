/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimize build to reduce memory usage
  experimental: {
    // Use worker threads to reduce main thread memory pressure
    workerThreads: false,
    // Reduce memory usage during build
    cpus: 1,
  },
  // Reduce bundle size
  productionBrowserSourceMaps: false,
  // Optimize for smaller builds
  swcMinify: true,
  // Configure output
  output: 'standalone',
}

module.exports = nextConfig
