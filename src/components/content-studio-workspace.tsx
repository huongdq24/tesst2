'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImageGenerationWorkspace } from '@/components/image-generation-workspace';
import { VideoGenerationWorkspace } from '@/components/video-generation-workspace';
import { useI18n } from '@/contexts/i18n-context';

export function ContentStudioWorkspace() {
  const { t } = useI18n();

  return (
    <Tabs defaultValue="image" className="w-full flex-1 flex flex-col">
      <TabsList className="grid w-full grid-cols-2 max-w-lg mx-auto">
        <TabsTrigger value="image">{t('feature.imageGeneration')}</TabsTrigger>
        <TabsTrigger value="video">{t('feature.videoGeneration')}</TabsTrigger>
      </TabsList>
      <TabsContent value="image" className="flex-1 flex flex-col mt-6">
        <ImageGenerationWorkspace />
      </TabsContent>
      <TabsContent value="video" className="flex-1 flex flex-col mt-6">
        <VideoGenerationWorkspace />
      </TabsContent>
    </Tabs>
  );
}
