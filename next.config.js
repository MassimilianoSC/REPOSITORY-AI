/** @type {import('next').NextConfig} */
const nextConfig = {
  // Removed 'output: export' to support dynamic pages like /document/[id]
  // output: 'export',
  trailingSlash: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
};

module.exports = nextConfig;
