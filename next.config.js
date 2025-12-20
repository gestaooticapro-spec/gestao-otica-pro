/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverActions: {
            bodySizeLimit: '10mb', // Aumenta o limite para 10MB
        },
    },
  };
export default nextConfig;
