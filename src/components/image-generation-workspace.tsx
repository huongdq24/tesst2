'use client';

import { useState }from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, UploadCloud, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { brandedImageGeneration } from '@/ai/flows/branded-image-generation-flow';
import Image from 'next/image';
import { useI18n } from '@/contexts/i18n-context';

export function ImageGenerationWorkspace() {
  const [prompt, setPrompt] = useState('');
  const [inputFile, setInputFile] = useState<File | null>(null);
  const [inputImageDataUri, setInputImageDataUri] = useState<string | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 4 * 1024 * 1024) { // 4MB limit for Gemini
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
        stylePreferences: prompt, // Use prompt for both for simplicity
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
      <div className="lg:col-span-1 flex flex-col gap-6">
        <Card>
          <CardContent className="p-6 space-y-4">
            <div>
              <Label htmlFor="prompt">{t('workspace.image.promptLabel')}</Label>
              <Textarea
                id="prompt"
                placeholder={t('workspace.image.promptPlaceholder')}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                disabled={isLoading}
              />
            </div>
            <div>
              <Label htmlFor="dropzone-file">{t('workspace.image.inputLabel')}</Label>
              <label
                htmlFor="dropzone-file"
                className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted"
              >
                {inputImageDataUri ? (
                  <div className="relative w-full h-full p-2">
                    <Image src={inputImageDataUri} alt="Input preview" fill style={{ objectFit: 'contain' }} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <UploadCloud className="w-10 h-10 mb-3 text-muted-foreground" />
                    <p className="mb-2 text-sm text-muted-foreground text-center px-2">{t('workspace.upload.label')}</p>
                  </div>
                )}
                <input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} accept="image/*" disabled={isLoading} />
              </label>
              {inputFile && (
                <div className="mt-2 text-xs text-muted-foreground flex justify-between items-center">
                  <span>{t('workspace.image.selectedFile')}{inputFile.name}</span>
                  <Button variant="link" size="sm" className="h-auto p-0" onClick={() => { setInputFile(null); setInputImageDataUri(null); }}>
                    {t('workspace.image.removeButton')}
                  </Button>
                </div>
              )}
            </div>
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
      <div className="lg:col-span-2 bg-muted/50 rounded-lg flex items-center justify-center min-h-[400px] lg:min-h-[550px] p-4">
        {isLoading ? (
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
            <p>{t('workspace.image.loadingMessage')}</p>
            <p className="text-sm">{t('workspace.image.loadingSubMessage')}</p>
          </div>
        ) : generatedImageUrl ? (
          <div className="relative w-full h-full min-h-[400px] lg:min-h-[550px]">
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
