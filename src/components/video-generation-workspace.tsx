'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Video, Image as ImageIcon, X, RectangleHorizontal, RectangleVertical, Frame } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { aiVideoGeneration } from '@/ai/flows/ai-video-generation-flow';
import Image from 'next/image';
import { useI18n } from '@/contexts/i18n-context';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from '@/lib/utils';

export function VideoGenerationWorkspace() {
  const [prompt, setPrompt] = useState('');
  const [isIngredients, setIsIngredients] = useState(false);
  const [isFrames, setIsFrames] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [numberOfVideos, setNumberOfVideos] = useState<1 | 2 | 3 | 4>(1);
  const [inputImageDataUri, setInputImageDataUri] = useState<string | null>(null);
  const [generatedVideos, setGeneratedVideos] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit for video ingredients
        toast({
            variant: 'destructive',
            title: t('toast.image.fileTooLarge.title'),
            description: 'Please upload a file smaller than 10MB.',
        });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setInputImageDataUri(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setInputImageDataUri(null);
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        variant: 'destructive',
        title: 'Prompt is required',
        description: t('toast.video.noPrompt'),
      });
      return;
    }
    if (isFrames) {
        toast({
            variant: 'default',
            title: 'Coming Soon',
            description: t('toast.video.framesNotReady')
        });
        return;
    }

    setIsLoading(true);
    setGeneratedVideos([]);

    try {
      const result = await aiVideoGeneration({
        textPrompt: prompt,
        imageDataUri: isIngredients ? inputImageDataUri ?? undefined : undefined,
        aspectRatio: aspectRatio,
        numberOfVideos: numberOfVideos,
      });
      setGeneratedVideos(result.videoDataUris);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: t('toast.video.generationFailed.title'),
        description: error.message || t('toast.image.unexpectedError'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full flex-1">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
        {isLoading ? (
          <div className="col-span-full flex flex-col items-center justify-center h-full text-muted-foreground">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
            <p className="mt-4">{t('workspace.video.loadingMessage')}</p>
          </div>
        ) : generatedVideos.length > 0 ? (
          generatedVideos.map((videoUri, index) => (
            <div key={index} className="bg-muted/50 rounded-lg flex items-center justify-center p-2 h-full">
              <video src={videoUri} controls className="w-full h-full object-contain" />
            </div>
          ))
        ) : (
          <div className="col-span-full text-center text-muted-foreground h-full flex flex-col justify-center items-center">
            <Video className="h-16 w-16 mx-auto mb-4" />
            <p>{t('workspace.video.outputPlaceholder')}</p>
          </div>
        )}
      </div>

      <div className="mt-8">
        <div className="relative">
          <Textarea
            id="prompt"
            placeholder={t('workspace.video.promptPlaceholder')}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            disabled={isLoading}
            className="pr-12 resize-none text-base p-4"
          />
        </div>

        <div className="mt-2 flex flex-col sm:flex-row gap-2">
            <div className="flex-1 flex flex-col gap-2">
                <div className='flex gap-2'>
                    <Button variant={isIngredients ? 'secondary' : 'outline'} size="sm" onClick={() => { setIsIngredients(!isIngredients); setIsFrames(false); }}>
                        <ImageIcon className="mr-2 h-4 w-4" />
                        {t('feature.videoGeneration.fromImage')}
                    </Button>
                    <Button variant={isFrames ? 'secondary' : 'outline'} size="sm" onClick={() => { setIsFrames(!isFrames); setIsIngredients(false); }}>
                        <Frame className="mr-2 h-4 w-4" />
                        {t('feature.videoGeneration.frames')}
                    </Button>
                </div>
                 {isIngredients && (
                    <div className="flex items-center gap-2 p-2 border rounded-lg">
                        <label htmlFor="image-upload-input" className="text-sm cursor-pointer text-muted-foreground hover:text-primary">
                            {t('workspace.upload.label')}
                        </label>
                        <input ref={fileInputRef} id="image-upload-input" type="file" className="hidden" onChange={handleFileChange} accept="image/*" disabled={isLoading} />
                        {inputImageDataUri && (
                            <div className="relative w-10 h-10">
                                <Image src={inputImageDataUri} alt="Input preview" fill style={{ objectFit: 'cover' }} className="rounded-md border" />
                                <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-5 w-5 rounded-full z-10" onClick={handleRemoveImage}>
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <div className="flex gap-4 p-2 border rounded-lg justify-center">
                <ToggleGroup type="single" value={aspectRatio} onValueChange={(value: '16:9' | '9:16') => value && setAspectRatio(value)} className="gap-1">
                    <ToggleGroupItem value="16:9" aria-label="Horizontal" className="p-2 h-auto flex-col gap-1">
                        <RectangleHorizontal />
                        <span className="text-xs">{t('feature.videoGeneration.horizontal')}</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem value="9:16" aria-label="Vertical" className="p-2 h-auto flex-col gap-1">
                        <RectangleVertical />
                        <span className="text-xs">{t('feature.videoGeneration.vertical')}</span>
                    </ToggleGroupItem>
                </ToggleGroup>
                <div className='flex flex-col gap-1'>
                    <span className="text-xs text-center text-muted-foreground">{t('feature.videoGeneration.outputCount')}</span>
                    <ToggleGroup type="single" value={String(numberOfVideos)} onValueChange={(value) => value && setNumberOfVideos(Number(value) as 1 | 2 | 3 | 4)} className="gap-1">
                        {[1, 2, 3, 4].map(n => (
                            <ToggleGroupItem key={n} value={String(n)} className="p-2 h-auto aspect-square">x{n}</ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                </div>
            </div>
             <Button onClick={handleGenerate} disabled={isLoading} size="lg" className="h-full">
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                 <Video className="h-5 w-5" />
              )}
            </Button>
        </div>
      </div>
    </div>
  );
}
