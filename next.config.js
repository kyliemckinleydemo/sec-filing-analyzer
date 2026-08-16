/**
 * @module next.config.js
 * @description Next.js configuration file with optimizations for reduced memory usage and smaller build output
 * 
 * PURPOSE:
 * - Configures Next.js build and runtime behavior with memory-optimized settings
 * - Reduces build memory footprint by limiting worker threads and CPU usage
 * - Excludes large data directories from build tracing to minimize bundle size
 * - Enables standalone output mode for optimized production deployments
 * - Configures SWC minification for improved build performance
 * 
 * EXPORTS:
 * - nextConfig {NextConfig} - Next.js configuration object with experimental and optimization settings
 * 
 * CLAUDE NOTES:
 * - Worker threads disabled (workerThreads: false) to reduce memory pressure on main thread
 * - CPU count limited to 1 to constrain resource usage during builds
 * - Data directories (./data, ./.swarm, ./.claude-flow) excluded from output file tracing
 * - Source maps disabled in production (productionBrowserSourceMaps: false) to reduce bundle size
 * - Standalone output mode produces optimized, self-contained deployment artifact
 * - SWC minifier enabled for faster, more efficient code minification
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimize build to reduce memory usage
  experimental: {
    // Use worker threads to reduce main thread memory pressure
    workerThreads: false,
    // Reduce memory usage during build
    cpus: 1,
    // Exclude large data directories from build tracing
    outputFileTracingExcludes: {
      '*': [
        './data/**',
        './.swarm/**',
        './.claude-flow/**',
      ],
    },
  },
  // Reduce bundle size
  productionBrowserSourceMaps: false,
  // Optimize for smaller builds
  swcMinify: true,
  // Configure output
  output: 'standalone',
  // Baseline security headers on every response (defense-in-depth). A strict Content-Security-Policy
  // is intentionally left as a follow-up (needs report-only tuning against Next inline scripts +
  // Clarity/analytics before enforcing).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
