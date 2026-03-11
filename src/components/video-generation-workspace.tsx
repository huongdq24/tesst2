'use client';

import { useState, useRef, ChangeEvent, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Video, Image as ImageIcon, X, RectangleHorizontal, RectangleVertical, Frame, UploadCloud, ArrowRight, Wand2, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { aiVideoGeneration } from '@/ai/flows/ai-video-generation-flow';
import { videoScriptGeneration } from '@/ai/flows/video-script-generation-flow';
import Image from 'next/image';
import { useI18n, TranslationKey } from '@/contexts/i18n-context';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface FrameInputProps {
  frameType: 'start' | 'end';
  imageDataUri: string | null;
  isProcessing: boolean;
  onFileChange: (event: ChangeEvent<HTMLInputElement>, frameType: 'start' | 'end') => void;
  onRemove: (frameType: 'start' | 'end') => void;
  isLoading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

const FrameInput: React.FC<FrameInputProps> = ({ frameType, imageDataUri, isProcessing, onFileChange, onRemove, isLoading, fileInputRef }) => {
  const { t } = useI18n();
  const inputId = `${frameType}-file-upload`;
  const labelText = frameType === 'start' ? t('workspace.video.startFrame') : t('workspace.video.endFrame');
  
  return (
    <div className="flex flex-col items-center gap-2">
      <Label htmlFor={inputId} className="font-semibold">{labelText}</Label>
      <div className="relative w-28 h-28 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer bg-muted/20">
        <label htmlFor={inputId} className="absolute inset-0 cursor-pointer" />
        {isProcessing ? (
          <Loader2 className="h-8 w-8 animate-spin" />
        ) : imageDataUri ? (
          <>
            <Image src={imageDataUri} alt={`${frameType} preview`} layout="fill" objectFit="cover" className="rounded-lg" />
            <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full z-10" onClick={(e) => { e.stopPropagation(); onRemove(frameType); }}>
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <UploadCloud className="h-8 w-8" />
        )}
      </div>
      <input ref={fileInputRef} id={inputId} type="file" className="hidden" onChange={(e) => onFileChange(e, frameType)} accept="image/*,video/*" disabled={isLoading} />
    </div>
  );
};


export function VideoGenerationWorkspace() {
  const [prompt, setPrompt] = useState('');
  const [scriptDescription, setScriptDescription] = useState('');
  const [motionAnalysis, setMotionAnalysis] = useState<string | null>(null);
  const [cameraMovement, setCameraMovement] = useState<string | null>(null);

  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isIngredients, setIsIngredients] = useState(false);
  const [isFrames, setIsFrames] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [numberOfVideos, setNumberOfVideos] = useState<1 | 2 | 3 | 4>(1);
  
  const [startImageDataUri, setStartImageDataUri] = useState<string | null>(null);
  const [endImageDataUri, setEndImageDataUri] = useState<string | null>(null);

  const [isProcessingStart, setIsProcessingStart] = useState(false);
  const [isProcessingEnd, setIsProcessingEnd] = useState(false);

  const [generatedVideos, setGeneratedVideos] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const { toast } = useToast();
  const { t } = useI18n();

  const startFileInputRef = useRef<HTMLInputElement>(null);
  const endFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Veo 3.0 has limitations, reset to supported values if needed.
    if (aspectRatio !== '16:9') {
      setAspectRatio('16:9');
    }
    if (numberOfVideos > 1) {
      setNumberOfVideos(1);
    }
  }, [aspectRatio, numberOfVideos]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>, frameType: 'start' | 'end') => {
    const file = event.target.files?.[0];
    if (!file) return;

    const inputType = file.type.startsWith('video/') ? 'video' : 'image';
    const setImageDataUri = frameType === 'start' ? setStartImageDataUri : setEndImageDataUri;
    const setIsProcessing = frameType === 'start' ? setIsProcessingStart : setIsProcessingEnd;

    const sizeLimit = inputType === 'image' ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    const toastTitleKey: TranslationKey = inputType === 'image' ? 'toast.image.fileTooLarge.title' : 'toast.video.videoTooLarge.title';
    const toastDescKey: TranslationKey = inputType === 'image' ? 'toast.image.fileTooLarge.description' : 'toast.video.videoTooLarge.description';

    if (file.size > sizeLimit) {
        toast({ variant: 'destructive', title: t(toastTitleKey), description: t(toastDescKey, { maxSize: '10MB' }) });
        return;
    }

    if (inputType === 'image') {
        const reader = new FileReader();
        reader.onloadend = () => setImageDataUri(reader.result as string);
        reader.readAsDataURL(file);
    } else { // video
        setIsProcessing(true);
        toast({ title: t('toast.video.extracting.title'), description: t('toast.video.extracting.description') });

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
            videoElement.currentTime = frameType === 'start' ? 0.1 : videoElement.duration;
        };

        const handleSeeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                setImageDataUri(canvas.toDataURL('image/jpeg'));
                const successDescKey = frameType === 'start' ? 'toast.video.extractStartSuccess.description' : 'toast.video.extractEndSuccess.description';
                toast({ title: t('toast.video.extractSuccess.title'), description: t(successDescKey) });
            } else {
                toast({ variant: 'destructive', title: t('toast.video.extractError.title'), description: t('toast.video.extractError.description') });
            }
            setIsProcessing(false);
            cleanup();
        };

        const handleError = () => {
            toast({ variant: 'destructive', title: t('toast.video.loadError.title'), description: t('toast.video.loadError.description') });
            setIsProcessing(false);
            cleanup();
        };
        
        videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
        videoElement.addEventListener('seeked', handleSeeked);
        videoElement.addEventListener('error', handleError);
        videoElement.src = URL.createObjectURL(file);
    }
  };

  const handleRemoveImage = (frameType: 'start' | 'end') => {
    if (frameType === 'start') {
        setStartImageDataUri(null);
        if (startFileInputRef.current) startFileInputRef.current.value = '';
    } else {
        setEndImageDataUri(null);
        if (endFileInputRef.current) endFileInputRef.current.value = '';
    }
  };

  const handleModeToggle = (mode: 'ingredients' | 'frames') => {
    const wasOn = mode === 'ingredients' ? isIngredients : isFrames;
    setStartImageDataUri(null);
    setEndImageDataUri(null);
    if(startFileInputRef.current) startFileInputRef.current.value = '';
    if(endFileInputRef.current) endFileInputRef.current.value = '';
    
    setIsIngredients(mode === 'ingredients' ? !wasOn : false);
    setIsFrames(mode === 'frames' ? !wasOn : false);
  };

  const handleGenerateScript = async () => {
    if (!scriptDescription.trim()) {
      return;
    }
    setIsGeneratingScript(true);
    setMotionAnalysis(null);
    setCameraMovement(null);
    setPrompt('');

    try {
      const result = await videoScriptGeneration({
        description: scriptDescription,
        imageUri: startImageDataUri ?? undefined,
      });
      setPrompt(result.optimized_english_prompt);
      setMotionAnalysis(result.motion_analysis);
      setCameraMovement(result.camera_movement);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: t('toast.video.scriptGenerationFailed.title'),
        description: error.message || t('toast.image.unexpectedError'),
      });
    } finally {
      setIsGeneratingScript(false);
    }
  };
  
  const handleCopy = () => {
    if (!prompt) return;
    navigator.clipboard.writeText(prompt);
    toast({
      title: t('toast.copy.success.title'),
      description: t('toast.copy.success.description'),
    });
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({ variant: 'destructive', title: t('toast.video.noPrompt.title'), description: t('toast.video.noPrompt.description') });
      return;
    }

    setIsLoading(true);
    setGeneratedVideos([]);

    try {
      const result = await aiVideoGeneration({
        textPrompt: prompt,
        startImageDataUri: isIngredients || isFrames ? startImageDataUri ?? undefined : undefined,
        endImageDataUri: isFrames ? endImageDataUri ?? undefined : undefined,
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
  
  const isProcessing = isProcessingStart || isProcessingEnd;
  const isGenerateDisabled = isLoading || isProcessing || !prompt.trim();

  return (
    <div className="flex flex-col h-full flex-1">
      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="space-y-2 flex flex-col">
            <Label htmlFor="script-description">{t('workspace.video.generateScriptButton')}</Label>
            <Textarea
              id="script-description"
              placeholder={t('workspace.video.scriptDescriptionPlaceholder')}
              value={scriptDescription}
              onChange={(e) => setScriptDescription(e.target.value)}
              rows={5}
              disabled={isGeneratingScript}
              className="resize-none text-base p-4 flex-1"
            />
            <Button
              onClick={handleGenerateScript}
              disabled={isGeneratingScript || !scriptDescription.trim()}
              size="lg"
            >
              {isGeneratingScript ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Wand2 className="h-5 w-5" />
              )}
              <span className="ml-2">{t('workspace.video.generateScriptButton')}</span>
            </Button>
          </div>

          <div className="space-y-2 flex flex-col">
            <Label htmlFor="prompt">{t('workspace.video.scriptOutputLabel')}</Label>
            <div className="relative flex-1 flex flex-col">
              <Textarea
                id="prompt"
                placeholder={t('workspace.video.promptPlaceholder')}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                disabled={isLoading || isProcessing}
                className="pr-12 resize-none text-base p-4 flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                onClick={handleCopy}
                disabled={!prompt}
                aria-label="Copy script"
              >
                <Copy className="h-4 w-4" />
              </Button>
               {motionAnalysis && cameraMovement && (
                <div className="text-xs p-3 mt-2 bg-muted/50 rounded-lg space-y-1.5 border">
                  <p><strong className="font-semibold">Phân tích chuyển động:</strong> {motionAnalysis}</p>
                  <p><strong className="font-semibold">Chuyển động Camera:</strong> <span className="text-primary font-medium">{cameraMovement}</span></p>
                </div>
              )}
            </div>
          </div>
        </div>


        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 flex flex-col gap-2">
                <div className='flex gap-2'>
                    <Button variant={isIngredients ? 'secondary' : 'outline'} size="sm" onClick={() => handleModeToggle('ingredients')} disabled={isGeneratingScript}>
                        <ImageIcon className="mr-2 h-4 w-4" />
                        {t('feature.videoGeneration.fromImage')}
                    </Button>
                    <Button variant={isFrames ? 'secondary' : 'outline'} size="sm" onClick={() => handleModeToggle('frames')} disabled={isGeneratingScript}>
                        <Frame className="mr-2 h-4 w-4" />
                        {t('feature.videoGeneration.extend')}
                    </Button>
                </div>
                {isIngredients && !isFrames && (
                <div className="flex items-center gap-2 p-2 border rounded-lg">
                    <label htmlFor="start-file-upload" className="text-sm cursor-pointer text-muted-foreground hover:text-primary">
                        {t('workspace.upload.labelImage')}
                    </label>
                    <input ref={startFileInputRef} id="start-file-upload" type="file" className="hidden" onChange={(e) => handleFileChange(e, 'start')} accept="image/*" disabled={isLoading || isProcessing} />
                    
                    {isProcessingStart ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                    ) : startImageDataUri && (
                        <div className="relative w-10 h-10">
                            <Image src={startImageDataUri} alt="Input preview" fill style={{ objectFit: 'cover' }} className="rounded-md border" />
                            <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-5 w-5 rounded-full z-10" onClick={() => handleRemoveImage('start')}>
                                <X className="h-3 w-3" />
                            </Button>
                        </div>
                    )}
                </div>
                )}
                {isFrames && (
                    <div className="flex items-center justify-center gap-4 p-2 border rounded-lg">
                    <FrameInput 
                        frameType="start"
                        imageDataUri={startImageDataUri}
                        isProcessing={isProcessingStart}
                        onFileChange={handleFileChange}
                        onRemove={handleRemoveImage}
                        isLoading={isLoading}
                        fileInputRef={startFileInputRef}
                    />
                    <ArrowRight className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                    <FrameInput 
                        frameType="end"
                        imageDataUri={endImageDataUri}
                        isProcessing={isProcessingEnd}
                        onFileChange={handleFileChange}
                        onRemove={handleRemoveImage}
                        isLoading={isLoading}
                        fileInputRef={endFileInputRef}
                    />
                </div>
                )}
            </div>

            <div className="lg:col-span-1 flex flex-col gap-2">
                <div className="flex gap-4 p-2 border rounded-lg justify-center">
                    <ToggleGroup type="single" value={aspectRatio} onValueChange={(value: '16:9' | '9:16') => value && setAspectRatio(value)} className="gap-1" disabled={isGeneratingScript}>
                        <ToggleGroupItem value="16:9" aria-label={t('feature.videoGeneration.horizontal')} className="p-2 h-auto flex-col gap-1">
                            <RectangleHorizontal />
                            <span className="text-xs">{t('feature.videoGeneration.horizontal')}</span>
                        </ToggleGroupItem>
                        <ToggleGroupItem value="9:16" aria-label={t('feature.videoGeneration.vertical')} className="p-2 h-auto flex-col gap-1" disabled>
                            <RectangleVertical />
                            <span className="text-xs">{t('feature.videoGeneration.vertical')}</span>
                        </ToggleGroupItem>
                    </ToggleGroup>
                    <div className='flex flex-col gap-1'>
                        <span className="text-xs text-center text-muted-foreground">{t('feature.videoGeneration.outputCount')}</span>
                        <ToggleGroup type="single" value={String(numberOfVideos)} onValueChange={(value) => value && setNumberOfVideos(Number(value) as 1 | 2 | 3 | 4)} className="gap-1" disabled={isGeneratingScript}>
                            {[1, 2, 3, 4].map(n => (
                                <ToggleGroupItem key={n} value={String(n)} className="p-2 h-auto aspect-square" disabled={n > 1}>x{n}</ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                    </div>
                </div>
                <Button onClick={handleGenerate} disabled={isGenerateDisabled || isGeneratingScript} size="lg" className="w-full">
                {(isLoading || isProcessing) ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                    <Video className="h-5 w-5" />
                )}
                <span className="ml-2">{t('workspace.video.generateButton.label')}</span>
                </Button>
            </div>
        </div>

      </div>
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
        {isLoading ? (
            <div className="col-span-full flex flex-col items-center justify-center h-full text-muted-foreground bg-muted/50 rounded-lg p-4">
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
    </div>
  );
}
