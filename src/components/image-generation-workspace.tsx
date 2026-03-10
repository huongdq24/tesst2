'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, ImageIcon, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { brandedImageGeneration } from '@/ai/flows/branded-image-generation-flow';
import Image from 'next/image';
import { useI18n } from '@/contexts/i18n-context';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ImageGenerationWorkspace() {
  const [prompt, setPrompt] = useState('');
  const [inputFile, setInputFile] = useState<File | null>(null);
  const [inputImageDataUri, setInputImageDataUri] = useState<string | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 4 * 1024 * 1024) { // 4MB limit
        toast({
            variant: 'destructive',
            title: t('toast.image.fileTooLarge.title'),
            description: t('toast.image.fileTooLarge.description'),
        });
        return;
      }
      setInputFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setInputImageDataUri(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        variant: 'destructive',
        title: t('toast.image.promptRequired.title'),
        description: t('toast.image.promptRequired.description'),
      });
      return;
    }

    setIsLoading(true);
    setGeneratedImageUrl(null);

    try {
      const result = await brandedImageGeneration({
        existingImageUri: inputImageDataUri || undefined,
        generationPrompt: prompt,
        stylePreferences: prompt,
      });
      setGeneratedImageUrl(result.generatedImageUri);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: t('toast.image.generationFailed.title'),
        description: error.message || t('toast.image.unexpectedError'),
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleRemoveImage = () => {
      setInputFile(null);
      setInputImageDataUri(null);
      if (fileInputRef.current) {
          fileInputRef.current.value = '';
      }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
      <div className="lg:col-span-1 flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardContent className="p-6 flex flex-col flex-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prompt">{t('workspace.image.promptLabel')}</Label>
              <div className="relative">
                <Textarea
                  id="prompt"
                  placeholder={t('workspace.image.promptPlaceholder')}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={8}
                  disabled={isLoading}
                  className="pr-12 resize-none"
                />
                <input ref={fileInputRef} id="image-upload-input" type="file" className="hidden" onChange={handleFileChange} accept="image/*" disabled={isLoading} />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button asChild variant="ghost" size="icon" className="absolute bottom-2 right-2 text-muted-foreground cursor-pointer h-8 w-8 hover:bg-accent hover:text-accent-foreground">
                          <label htmlFor="image-upload-input">
                              <ImageIcon className="h-5 w-5" />
                              <span className="sr-only">{t('workspace.image.inputLabel')}</span>
                          </label>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('workspace.image.uploadTooltip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {inputImageDataUri && (
                <div className="relative w-24 h-24">
                    <Image src={inputImageDataUri} alt="Input preview" fill style={{ objectFit: 'cover' }} className="rounded-md border" />
                    <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full z-10" onClick={handleRemoveImage}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}
            
            <div className="flex-1"></div> {/* Spacer to push button to bottom */}

            <Button onClick={handleGenerate} disabled={isLoading || !prompt.trim()} className="w-full">
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImageIcon className="mr-2 h-4 w-4" />
              )}
              {t('workspace.image.generateButton')}
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="lg:col-span-2 bg-muted/50 rounded-lg flex items-center justify-center min-h-[400px] lg:min-h-0 p-4">
        {isLoading ? (
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
            <p>{t('workspace.image.loadingMessage')}</p>
            <p className="text-sm">{t('workspace.image.loadingSubMessage')}</p>
          </div>
        ) : generatedImageUrl ? (
          <div className="relative w-full h-full">
            <Image src={generatedImageUrl} alt="Generated image" fill style={{ objectFit: 'contain' }} />
          </div>
        ) : (
          <div className="text-center text-muted-foreground">
            <ImageIcon className="h-16 w-16 mx-auto mb-4" />
            <p>{t('workspace.image.outputPlaceholder')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
