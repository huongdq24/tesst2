'use client';

import { useParams } from 'next/navigation';
import { useI18n } from '@/contexts/i18n-context';
import {
  Voicemail,
  ScanFace,
  Image as ImageIcon,
  Video,
  ArrowLeft,
  UploadCloud,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ImageGenerationWorkspace } from '@/components/image-generation-workspace';
import { VideoGenerationWorkspace } from '@/components/video-generation-workspace';
import { ContentStudioWorkspace } from '@/components/content-studio-workspace';
<<<<<<< HEAD
import { VoiceCloningWorkspace } from '@/components/voice-cloning-workspace';
import { AvatarCloningWorkspace } from '@/components/avatar-cloning-workspace';
=======
>>>>>>> 7d28e1a8b26d69a3daa766112eb1ba6876765906

const featureConfig = {
  'voice-cloning': {
    icon: <Voicemail className="h-6 w-6" />,
    i18nKey: 'feature.voiceCloning',
  },
  'avatar-cloning': {
    icon: <ScanFace className="h-6 w-6" />,
    i18nKey: 'feature.avatarCloning',
  },
  'image-generation': {
    icon: <ImageIcon className="h-6 w-6" />,
    i18nKey: 'feature.imageGeneration',
  },
  'video-generation': {
    icon: <Video className="h-6 w-6" />,
    i18nKey: 'feature.videoGeneration',
  },
  'content-studio': {
    icon: <Sparkles className="h-6 w-6" />,
    i18nKey: 'feature.contentStudio',
  },
};

type FeatureSlug = keyof typeof featureConfig;

// A generic component for features that are not yet implemented
function GenericFeatureWorkspace() {
    const { t } = useI18n();
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
            <div className="lg:col-span-1 flex flex-col gap-6">
                <Card>
                    <CardContent className="p-6">
                        <div className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <UploadCloud className="w-10 h-10 mb-3 text-muted-foreground" />
                                <p className="mb-2 text-sm text-muted-foreground text-center px-2">{t('workspace.upload.label')}</p>
                            </div>
                            <input id="dropzone-file" type="file" className="hidden" />
                        </div>

                        <div className="flex items-center space-x-2 mt-4">
                            <Checkbox id="training-toggle" />
                            <Label htmlFor="training-toggle" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                {t('workspace.upload.trainingToggle')}
                            </Label>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{t('workspace.upload.info')}</p>
                    </CardContent>
                </Card>
                {/* Additional controls can be added here */}
            </div>
            <div className="lg:col-span-2 bg-muted/50 rounded-lg flex items-center justify-center min-h-[400px]">
                <p className="text-muted-foreground">Generation Output Area</p>
            </div>
        </div>
    );
}


export default function FeatureWorkspacePage() {
  const params = useParams();
  const { t } = useI18n();
  const slug = (params.slug as string) as FeatureSlug;
  const feature = featureConfig[slug] || featureConfig['image-generation'];

  const renderWorkspace = () => {
    switch(slug) {
        case 'content-studio':
            return <ContentStudioWorkspace />;
        case 'image-generation':
            return <ImageGenerationWorkspace />;
        case 'video-generation':
            return <VideoGenerationWorkspace />;
<<<<<<< HEAD
        case 'voice-cloning':
            return <VoiceCloningWorkspace />;
        case 'avatar-cloning':
            return <AvatarCloningWorkspace />;
=======
        // Add cases for other features here
        // case 'voice-cloning':
        //   return <VoiceCloningWorkspace />;
>>>>>>> 7d28e1a8b26d69a3daa766112eb1ba6876765906
        default:
            return <GenericFeatureWorkspace />;
    }
  }

  return (
    <div className="container py-8 h-full flex flex-col">
      <div className="flex items-center gap-4 mb-8">
        <Button asChild variant="outline" size="icon">
          <Link href="/home">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="text-primary">{feature.icon}</div>
          <h1 className="text-2xl font-bold">{t(feature.i18nKey)}</h1>
        </div>
      </div>

      {renderWorkspace()}
    </div>
  );
}
