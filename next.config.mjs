/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  async redirects() {
    return [
      // /filing with no accession number was 404ing — redirect to the
      // filing feed so Google doesn't keep crawling a dead URL.
      {
        source: '/filing',
        destination: '/latest-filings',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
