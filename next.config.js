/** @type {import('next').NextConfig} */
const towerContentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.jsdelivr.net https://storage.googleapis.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join('; ')

const nextConfig = {
    poweredByHeader: false,
    // O repositorio ainda possui divida historica de lint fora do escopo da
    // Torre. O typecheck continua obrigatorio e o lint da Torre tem script proprio.
    eslint: {
        ignoreDuringBuilds: true,
    },
    async headers() {
        return [
            {
                source: '/torre/:path*',
                headers: [
                    { key: 'Content-Security-Policy', value: towerContentSecurityPolicy },
                    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()' },
                ],
            },
            {
                source: '/:path*',
                headers: [
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                ],
            },
        ]
    },
    experimental: {
        serverActions: {
            bodySizeLimit: '10mb', // Aumenta o limite para 10MB
        },
    },
  };
module.exports = nextConfig;
