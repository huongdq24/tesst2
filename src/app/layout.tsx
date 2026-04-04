import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { I18nProvider } from '@/contexts/i18n-context';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  metadataBase: new URL('https://io.igentechsolutions.com'),
  title: 'iGen - Trợ lý AI Xây dựng thương hiệu cá nhân',
  description: 'Nền tảng AI xây dựng thương hiệu cá nhân bằng công nghệ trí tuệ nhân tạo tiên tiến, giúp bạn tạo ảnh, video và giọng nói mang đậm bản sắc riêng.',
  keywords: 'AI, Personal Branding, iGen, Video AI, Image AI, Voice AI, Thương hiệu cá nhân',
  openGraph: {
    title: 'iGen - Trợ lý AI Xây dựng thương hiệu cá nhân',
    description: 'Nền tảng AI xây dựng thương hiệu cá nhân chuyên nghiệp.',
    url: 'https://io.igentechsolutions.com',
    siteName: 'iGen Official',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'iGen - AI Personal Brand Assistant',
      },
    ],
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'iGen - Trợ lý AI Xây dựng thương hiệu cá nhân',
    description: 'Nền tảng AI xây dựng thương hiệu cá nhân chuyên nghiệp.',
    images: ['/opengraph-image'],
  },
  icons: {
    icon: '/icon',
    apple: '/icon',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn('font-sans antialiased', inter.variable)}>
        <AuthProvider>
          <I18nProvider>
            {children}
            <Toaster />
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
