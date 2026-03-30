import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb', // 50MB đủ để truyền ảnh tham chiếu
    },
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
      { protocol: 'https', hostname: 'files2.heygen.ai', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'resource.heygen.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'resource2.heygen.ai', port: '', pathname: '/**' },
      { protocol: 'https', hostname: '*.heygen.ai', port: '', pathname: '/**' },
      { protocol: 'https', hostname: '*.heygen.com', port: '', pathname: '/**' },
    ],
  },
};

export default nextConfig;
