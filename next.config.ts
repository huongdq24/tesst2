import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  serverActions: {
    bodySizeLimit: '100mb',
  },
  devIndicators: {
    allowedDevOrigins: [
      'https://6000-firebase-studio-1772788450238.cluster-y75up3teuvc62qmnwys4deqv6y.cloudworkstations.dev',
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
