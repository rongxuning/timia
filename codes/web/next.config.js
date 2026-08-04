/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async rewrites() {
    return [
      {
        source: "/auth/:path*",
        destination: "http://localhost:8000/auth/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
