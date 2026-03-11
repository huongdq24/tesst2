'use client';
import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, ImageIcon, X, Wand2, UploadCloud, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { brandedImageGeneration } from '@/ai/flows/branded-image-generation-flow';
import { optimalImagePromptGeneration } from '@/ai/flows/optimal-image-prompt-generation-flow';
import Image from 'next/image';
import { useI18n } from '@/contexts/i18n-context';
import { Separator } from './ui/separator';
import { ref as storageRef, uploadBytes, getDownloadURL, uploadString } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { storage, firestore } from '@/lib/firebase/config';
export function ImageGenerationWorkspace() {
  const [simplePrompt, setSimplePrompt] = useState('');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [inputImageUrl, setInputImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { user, userData } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!user) {
      toast({ variant: 'destructive', title: 'Yêu cầu đăng nhập', description: 'Bạn cần đăng nhập để tải ảnh lên.' });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File quá lớn', description: 'Vui lòng chọn ảnh nhỏ hơn 4MB.' });
      return;
    }
    setIsUploading(true);
    setInputImageUrl(null);
    try {
      // Convert file to base64 data URI for use with Gemini
      const reader = new FileReader();
      reader.onloadend = () => {
        setInputImageUrl(reader.result as string);
        setIsUploading(false);
        toast({ title: 'Tải ảnh thành công', description: 'Ảnh đầu vào đã sẵn sàng.' });
      };
      reader.onerror = () => {
        setIsUploading(false);
        toast({ variant: 'destructive', title: 'Lỗi tải ảnh', description: 'Không thể đọc file.' });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Upload failed:', error);
      setIsUploading(false);
      toast({ variant: 'destructive', title: 'Lỗi tải ảnh', description: 'Không thể tải ảnh lên.' });
    }
  };
  const handleGenerateOptimalPrompt = async () => {
    if (!simplePrompt.trim()) return;
    if (!userData?.geminiApiKey) {
      toast({
        variant: 'destructive',
        title: 'Thiếu API Key',
        description: 'Vui lòng thêm Gemini API Key của bạn trong phần cài đặt tài khoản.',
      });
      return;
    }
    setIsGeneratingPrompt(true);
    try {
      const result = await optimalImagePromptGeneration({
        description: simplePrompt,
        apiKey: userData.geminiApiKey,
      });
      setPrompt(result.optimalPrompt);
    } catch (error: any) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Lỗi tạo prompt', description: error.message });
    } finally {
      setIsGeneratingPrompt(false);
    }
  };
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({ variant: 'destructive', title: 'Thiếu prompt', description: 'Vui lòng nhập mô tả cho ảnh.' });
      return;
    }
    if (!userData?.geminiApiKey) {
      toast({
        variant: 'destructive',
        title: 'Thiếu API Key',
        description: 'Vui lòng thêm Gemini API Key của bạn trong phần cài đặt tài khoản trước khi tạo ảnh.',
      });
      return;
    }
    if (!user) {
      toast({ variant: 'destructive', title: 'Yêu cầu đăng nhập', description: 'Bạn cần đăng nhập để tạo ảnh.' });
      return;
    }
    setIsLoading(true);
    setGeneratedImageUrl(null);
    try {
      const result = await brandedImageGeneration({
        existingImageUri: inputImageUrl || undefined,
        generationPrompt: prompt,
        apiKey: userData.geminiApiKey,
      });
      const generatedDataUri = result.generatedImageUri;
      setGeneratedImageUrl(generatedDataUri);
      // Save generated image to Firebase Storage and Firestore
      try {
        const fileName = `generated-${Date.now()}.png`;
        const imageRef = storageRef(storage, `users/${user.uid}/generated/${fileName}`);
        // Upload the base64 data URI directly
        await uploadString(imageRef, generatedDataUri, 'data_url');
        const downloadURL = await getDownloadURL(imageRef);
        // Save metadata to Firestore
        await addDoc(collection(firestore, 'generatedImages'), {
          ownerId: user.uid,
          prompt: prompt,
          imageUrl: downloadURL,
          createdAt: serverTimestamp(),
        });
        toast({ title: 'Ảnh đã được lưu', description: 'Ảnh đã được lưu vào thư viện của bạn.' });
      } catch (saveError) {
        console.error('Failed to save image:', saveError);
        // Don't fail the whole operation if save fails — image is still shown
        toast({ title: 'Tạo ảnh thành công', description: 'Ảnh đã tạo nhưng không thể lưu vào thư viện.' });
      }
    } catch (error: any) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Lỗi tạo ảnh', description: error.message });
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
  const handleDownload = () => {
    if (!generatedImageUrl) return;
    const link = document.createElement('a');
    link.href = generatedImageUrl;
    link.download = `igen-image-${Date.now()}.png`;
    link.click();
  };
  const isBusy = isLoading || isGeneratingPrompt || isUploading;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
      <div className="lg:col-span-1 flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardContent className="p-6 flex flex-col flex-1 gap-4">
            {/* API Key Warning */}
            {!userData?.geminiApiKey && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                ⚠️ Bạn chưa thêm Gemini API Key. Vui lòng thêm API key trong menu tài khoản để sử dụng tính năng tạo ảnh.
              </div>
            )}
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
                ) : (
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
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-2 h-4 w-4" />}
              {t('workspace.image.generateButton')}
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="lg:col-span-2 bg-muted/50 rounded-lg flex flex-col items-center justify-center min-h-[400px] lg:min-h-0 p-4">
        {isLoading ? (
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
            <p>{t('workspace.image.loadingMessage')}</p>
            <p className="text-sm">{t('workspace.image.loadingSubMessage')}</p>
          </div>
        ) : generatedImageUrl ? (
          <div className="relative w-full h-full flex flex-col gap-3">
            <div className="relative flex-1 min-h-[350px]">
              <Image src={generatedImageUrl} alt="Generated image" fill style={{ objectFit: 'contain' }} />
            </div>
            <Button variant="outline" size="sm" onClick={handleDownload} className="self-center">
              <Download className="mr-2 h-4 w-4" />
              Tải ảnh xuống
            </Button>
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