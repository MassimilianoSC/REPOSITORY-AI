/** @type {import('next').NextConfig} */
const nextConfig = {
  // SSR enabled for Firebase Hosting Framework-Aware deployment
  trailingSlash: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
};

module.exports = nextConfig;
