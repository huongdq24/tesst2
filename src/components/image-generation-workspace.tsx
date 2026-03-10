'use client';

import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, ImageIcon, X, Wand2, UploadCloud } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { brandedImageGeneration } from '@/ai/flows/branded-image-generation-flow';
import { optimalImagePromptGeneration } from '@/ai/flows/optimal-image-prompt-generation-flow';
import Image from 'next/image';
import { useI18n } from '@/contexts/i18n-context';
import { Separator } from './ui/separator';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase/config';

export function ImageGenerationWorkspace() {
  const [simplePrompt, setSimplePrompt] = useState('');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [inputImageUrl, setInputImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!user) {
      toast({
        variant: 'destructive',
        title: t('toast.upload.authRequired.title'),
        description: t('toast.upload.authRequired.description'),
      });
      return;
    }

    if (file.size > 4 * 1024 * 1024) { // 4MB limit
      toast({
          variant: 'destructive',
          title: t('toast.image.fileTooLarge.title'),
          description: t('toast.image.fileTooLarge.description'),
      });
      return;
    }
    
    setIsUploading(true);
    setInputImageUrl(null);
    toast({
        title: t('toast.upload.inProgress.title'),
        description: t('toast.upload.inProgress.description'),
    });

    try {
      const uniqueFileName = `${Date.now()}-${file.name}`;
      const fileRef = storageRef(storage, `users/${user.uid}/uploads/${uniqueFileName}`);
      
      const snapshot = await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      setInputImageUrl(downloadURL);
      toast({
        title: t('toast.upload.success.title'),
        description: t('toast.upload.success.description'),
      });
    } catch (error) {
        console.error("Firebase Storage upload failed:", error);
        toast({
          variant: 'destructive',
          title: t('toast.upload.error.title'),
          description: t('toast.upload.error.description'),
        });
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerateOptimalPrompt = async () => {
    if (!simplePrompt.trim()) return;

    setIsGeneratingPrompt(true);
    try {
        const result = await optimalImagePromptGeneration({
            description: simplePrompt,
        });
        setPrompt(result.optimalPrompt);
    } catch (error: any) {
        console.error(error);
        toast({
            variant: 'destructive',
            title: t('toast.image.promptGenerationFailed.title'),
            description: error.message || t('toast.image.unexpectedError'),
        });
    } finally {
        setIsGeneratingPrompt(false);
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
        existingImageUri: inputImageUrl || undefined,
        generationPrompt: prompt,
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
      setInputImageUrl(null);
      if (fileInputRef.current) {
          fileInputRef.current.value = '';
      }
  };

  const isBusy = isLoading || isGeneratingPrompt || isUploading;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
      <div className="lg:col-span-1 flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardContent className="p-6 flex flex-col flex-1 gap-4">

            {/* Reference Image Upload */}
            <div className="space-y-2">
              <Label htmlFor="image-upload-input">{t('workspace.image.inputLabel')}</Label>
              <div 
                className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted"
                onClick={() => fileInputRef.current?.click()}
              >
                {inputImageUrl && !isUploading ? (
                  <>
                    <Image src={inputImageUrl} alt="Input preview" fill style={{ objectFit: 'cover' }} className="rounded-md" />
                    <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full z-10" onClick={(e) => { e.stopPropagation(); handleRemoveImage(); }}>
                        <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : isUploading ? (
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <p className="text-sm mt-2">{t('workspace.image.uploading')}</p>
                    </div>
                ): (
                  <div className="flex flex-col items-center justify-center pt-5 pb-6 text-muted-foreground">
                      <UploadCloud className="w-8 h-8 mb-2" />
                      <p className="text-sm text-center">{t('workspace.image.uploadTooltip')}</p>
                  </div>
                )}
                <input ref={fileInputRef} id="image-upload-input" type="file" className="hidden" onChange={handleFileChange} accept="image/*" disabled={isBusy} />
              </div>
            </div>

            <Separator />

            {/* Simple prompt section */}
            <div className="space-y-2">
              <Label htmlFor="simple-prompt">{t('workspace.image.simplePromptLabel')}</Label>
              <Textarea
                id="simple-prompt"
                placeholder={t('workspace.image.simplePromptPlaceholder')}
                value={simplePrompt}
                onChange={(e) => setSimplePrompt(e.target.value)}
                rows={2}
                disabled={isBusy}
                className="resize-none"
              />
              <Button onClick={handleGenerateOptimalPrompt} disabled={isGeneratingPrompt || !simplePrompt.trim()} size="sm" className="w-full">
                {isGeneratingPrompt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                {t('workspace.image.generatePromptButton')}
              </Button>
            </div>

            <Separator />

            {/* Main prompt section */}
            <div className="space-y-2 flex-1 flex flex-col">
              <Label htmlFor="prompt">{t('workspace.image.promptLabel')}</Label>
              <Textarea
                id="prompt"
                placeholder={t('workspace.image.promptPlaceholder')}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isBusy}
                className="resize-none flex-1"
              />
            </div>
            
            <Button onClick={handleGenerate} disabled={isBusy || !prompt.trim()} className="w-full">
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
