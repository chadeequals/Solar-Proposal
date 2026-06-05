/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode for development
  reactStrictMode: true,

  // Allow images from external domains (for future Aurora integration)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "design.aurorasolar.com",
      },
    ],
  },
};

export default nextConfig;
