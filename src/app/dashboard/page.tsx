'use client';

import { FeatureCard } from '@/components/feature-card';
import { useI18n } from '@/contexts/i18n-context';
import { Voicemail, ScanFace, Image as ImageIcon, Video } from 'lucide-react';

export default function DashboardPage() {
  const { t } = useI18n();

  const features = [
    {
      slug: 'voice-cloning',
      title: t('feature.voiceCloning'),
      icon: <Voicemail className="h-8 w-8 text-primary" />,
      description: 'Clone your voice for personalized audio content.',
    },
    {
      slug: 'avatar-cloning',
      title: t('feature.avatarCloning'),
      icon: <ScanFace className="h-8 w-8 text-primary" />,
      description: 'Create a consistent brand avatar from your image.',
    },
    {
      slug: 'image-generation',
      title: t('feature.imageGeneration'),
      icon: <ImageIcon className="h-8 w-8 text-primary" />,
      description: 'Generate stunning images from text descriptions.',
    },
    {
      slug: 'video-generation',
      title: t('feature.videoGeneration'),
      icon: <Video className="h-8 w-8 text-primary" />,
      description: 'Produce short, professional videos from prompts.',
    },
  ];

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-2">{t('dashboard.title')}</h1>
      <p className="text-muted-foreground mb-8">Choose a tool to start creating.</p>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-2">
        {features.map((feature) => (
          <FeatureCard
            key={feature.slug}
            slug={feature.slug}
            title={feature.title}
            icon={feature.icon}
            description={feature.description}
          />
        ))}
      </div>
    </div>
  );
}
