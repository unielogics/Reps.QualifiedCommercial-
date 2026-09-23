/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/contacts/:path*",
        destination: "/marketing/:path*",
        permanent: true,
      },
    ];
  },
};
export default nextConfig;
