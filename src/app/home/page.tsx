'use client';

import { FeatureCard } from '@/components/feature-card';
import { useI18n } from '@/contexts/i18n-context';
import { Voicemail, ScanFace, Sparkles, BarChart3 } from 'lucide-react';

export default function HomePage() {
  const { t } = useI18n();

  const features = [
    {
      slug: 'voice-cloning',
      title: t('feature.voiceCloning'),
      icon: <Voicemail className="h-5 w-5" />,
      tag: '/tools/voice-cloning',
      description: 'Clone your voice for personalized audio content.',
      imageBaseUrl: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800&q=80", // Microphone / Audio studio
    },
    {
      slug: 'avatar-cloning',
      title: t('feature.avatarCloning'),
      icon: <ScanFace className="h-5 w-5" />,
      tag: '/tools/avatar-cloning',
      description: 'Create a consistent brand avatar from your image.',
      imageBaseUrl: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=800&q=80", // VR / Face scan aesthetics
    },
    {
      slug: 'content-studio',
      title: t('feature.contentStudio'),
      icon: <Sparkles className="h-5 w-5" />,
      tag: '/tools/content-studio',
      description: 'Create AI images and videos in one place.',
      imageBaseUrl: "https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=800&q=80", // Camera / Studio lights
    },
  ];

  return (
    <div className="container py-12 pb-24 max-w-5xl">
      <div className="mb-12 space-y-4">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-zinc-900 dark:text-white">
          {t('dashboard.title')}
        </h1>
        <p className="text-lg text-muted-foreground">
          Choose a creative tool to start generating AI content.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <FeatureCard
            key={feature.slug}
            slug={feature.slug}
            title={feature.title}
            icon={feature.icon}
            description={feature.description}
            imageBaseUrl={feature.imageBaseUrl}
            tag={feature.tag}
          />
        ))}
      </div>
    </div>
  );
}
