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

export function VideoGenerationWorkspace() {
  const [prompt, setPrompt] = useState('');
  const [isIngredients, setIsIngredients] = useState(false);
  const [isFrames, setIsFrames] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [numberOfVideos, setNumberOfVideos] = useState<1 | 2 | 3 | 4>(1);
  const [inputImageDataUri, setInputImageDataUri] = useState<string | null>(null);
  const [generatedVideos, setGeneratedVideos] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
            variant: 'destructive',
            title: t('toast.image.fileTooLarge.title'),
            description: 'Please upload an image smaller than 10MB.',
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

  const handleVideoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        toast({
          variant: 'destructive',
          title: t('toast.video.videoTooLarge.title'),
          description: t('toast.video.videoTooLarge.description'),
        });
        return;
      }

      setIsProcessingVideo(true);
      toast({
        title: t('toast.video.extracting.title'),
        description: t('toast.video.extracting.description'),
      });

      const videoElement = document.createElement('video');
      videoElement.preload = 'metadata';
      videoElement.muted = true;
      videoElement.playsInline = true;

      const cleanup = () => {
        videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
        videoElement.removeEventListener('seeked', handleSeeked);
        videoElement.removeEventListener('error', handleError);
        URL.revokeObjectURL(videoElement.src);
      };

      const handleLoadedMetadata = () => {
        videoElement.currentTime = videoElement.duration;
      };

      const handleSeeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          const frameDataUri = canvas.toDataURL('image/jpeg');
          setInputImageDataUri(frameDataUri);
          toast({
            title: t('toast.video.extractSuccess.title'),
            description: t('toast.video.extractSuccess.description'),
          });
        } else {
          toast({
            variant: 'destructive',
            title: t('toast.video.extractError.title'),
            description: t('toast.video.extractError.description'),
          });
        }
        setIsProcessingVideo(false);
        cleanup();
      };

      const handleError = () => {
        toast({
          variant: 'destructive',
          title: t('toast.video.loadError.title'),
          description: t('toast.video.loadError.description'),
        });
        setIsProcessingVideo(false);
        cleanup();
      };
      
      videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
      videoElement.addEventListener('seeked', handleSeeked);
      videoElement.addEventListener('error', handleError);

      videoElement.src = URL.createObjectURL(file);
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
        title: t('toast.video.noPrompt'),
        description: t('toast.video.noPrompt'),
      });
      return;
    }

    setIsLoading(true);
    setGeneratedVideos([]);

    try {
      const result = await aiVideoGeneration({
        textPrompt: prompt,
        imageDataUri: (isIngredients || isFrames) ? inputImageDataUri ?? undefined : undefined,
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

  const isGenerateDisabled = isLoading || isProcessingVideo || !prompt.trim();

  return (
    <div className="flex flex-col h-full flex-1">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
        {isLoading ? (
          <div className="col-span-full flex flex-col items-center justify-center h-full text-muted-foreground bg-muted/50 rounded-lg">
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
          <div className="col-span-full text-center text-muted-foreground h-full flex flex-col justify-center items-center bg-muted/50 rounded-lg p-4">
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
            disabled={isLoading || isProcessingVideo}
            className="pr-12 resize-none text-base p-4"
          />
        </div>

        <div className="mt-2 flex flex-col sm:flex-row gap-2">
            <div className="flex-1 flex flex-col gap-2">
                <div className='flex gap-2'>
                    <Button variant={isIngredients ? 'secondary' : 'outline'} size="sm" onClick={() => { setIsIngredients(!isIngredients); setIsFrames(false); handleRemoveImage(); }}>
                        <ImageIcon className="mr-2 h-4 w-4" />
                        {t('feature.videoGeneration.fromImage')}
                    </Button>
                    <Button variant={isFrames ? 'secondary' : 'outline'} size="sm" onClick={() => { setIsFrames(!isFrames); setIsIngredients(false); handleRemoveImage(); }}>
                        <Frame className="mr-2 h-4 w-4" />
                        {t('feature.videoGeneration.extend')}
                    </Button>
                </div>
                 {(isIngredients || isFrames) && (
                    <div className="flex items-center gap-2 p-2 border rounded-lg">
                        <label htmlFor="file-upload-input" className="text-sm cursor-pointer text-muted-foreground hover:text-primary">
                            {isIngredients ? t('workspace.upload.labelImage') : t('workspace.upload.labelVideo')}
                        </label>
                        <input ref={fileInputRef} id="file-upload-input" type="file" className="hidden" onChange={isIngredients ? handleImageFileChange : handleVideoFileChange} accept={isIngredients ? "image/*" : "video/*"} disabled={isLoading || isProcessingVideo} />
                        
                        {isProcessingVideo ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : inputImageDataUri && (
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
             <Button onClick={handleGenerate} disabled={isGenerateDisabled} size="lg" className="h-full">
              {(isLoading || isProcessingVideo) ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                 <Video className="h-5 w-5" />
              )}
              <span className="ml-2">{t('workspace.video.generateButton')}</span>
            </Button>
        </div>
      </div>
    </div>
  );
}
