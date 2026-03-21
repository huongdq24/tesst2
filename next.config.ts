import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverActions: {
<<<<<<< HEAD
    bodySizeLimit: '50mb',
=======
    bodySizeLimit: '50mb', // 50MB đủ để truyền ảnh tham chiếu (không cần 100mb vì video không trả về nữa)
    executionTimeout: 600,
>>>>>>> 7d28e1a8b26d69a3daa766112eb1ba6876765906
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
      { protocol: 'https', hostname: 'placehold.co', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'images.unsplash.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'picsum.photos', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'storage.googleapis.com', port: '', pathname: '/**' },
    ],
  },
};

export default nextConfig;
