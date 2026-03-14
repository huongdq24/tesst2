'use client';

import { useState, useRef, ChangeEvent, DragEvent, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Video, X, UploadCloud, Wand2, Copy, Images, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { aiVideoGeneration } from '@/app/actions/video-generation';
import { videoScriptGeneration } from '@/ai/flows/video-script-generation-flow';
import Image from 'next/image';
import { useI18n } from '@/contexts/i18n-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import { ImageLibraryModal } from '@/components/modals/image-library-modal';
import { Card, CardContent } from './ui/card';
import { Separator } from './ui/separator';

export function VideoGenerationWorkspace() {
  const [prompt, setPrompt] = useState('');
  const [scriptDescription, setScriptDescription] = useState('');
  const [motionAnalysis, setMotionAnalysis] = useState<string | null>(null);
  const [cameraMovement, setCameraMovement] = useState<string | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [inputImageUrls, setInputImageUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [generatedVideoUrls, setGeneratedVideoUrls] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [scriptModel, setScriptModel] = useState('gemini-3.1-pro-preview');
  const [videoModel, setVideoModel] = useState('veo-3.1-generate-preview');
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(8);
  const [resolution, setResolution] = useState('1080p');

  const { toast } = useToast();
  const { t } = useI18n();
  const { user, userData } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isVeo2 = videoModel === 'veo-2.0-generate-001';

  useEffect(() => {
    if (isVeo2) {
      setResolution('720p');
    } else {
      setDurationSeconds(8); // Lock duration for non-Veo2 models
      setResolution('1080p');
      if (aspectRatio === '9:16') {
        setAspectRatio('16:9');
      }
    }
  }, [isVeo2, aspectRatio]);

  useEffect(() => {
    // Cleanup interval on component unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const handleFilesUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!user) {
      toast({ variant: 'destructive', title: 'Yêu cầu đăng nhập', description: 'Bạn cần đăng nhập để tải ảnh lên.' });
      return;
    }
    const filesToUpload = Array.from(files).filter(file => {
      if (!file.type.startsWith('image/')) {
        toast({ variant: 'destructive', title: 'Tệp không hợp lệ', description: `'${file.name}' không phải là một tệp ảnh.` });
        return false;
      }
      if (file.size > 4 * 1024 * 1024) {
        toast({ variant: 'destructive', title: 'File quá lớn', description: `'${file.name}' lớn hơn 4MB.` });
        return false;
      }
      return true;
    });

    if (filesToUpload.length === 0) return;
    setIsUploading(true);
    
    try {
      const uploadPromises = filesToUpload.map(async (file) => {
        const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
        const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
        const { storage, firestore } = await import('@/lib/firebase/config');

        const fileName = `input-${Date.now()}-${file.name}`;
        const imageRef = ref(storage, `users/${user.uid}/inputs/${fileName}`);
        await uploadBytes(imageRef, file);
        const downloadURL = await getDownloadURL(imageRef);
        await addDoc(collection(firestore, 'inputImages'), {
          ownerId: user.uid,
          imageUrl: downloadURL,
          createdAt: serverTimestamp(),
        });
        return downloadURL;
      });

      const newUrls = await Promise.all(uploadPromises);
      setInputImageUrls(prevUrls => [...prevUrls, ...newUrls]);
      toast({ title: `Tải lên ${newUrls.length} ảnh thành công`, description: 'Ảnh của bạn đã sẵn sàng để sử dụng.' });
    } catch (error) {
      console.error('Upload failed:', error);
      let errorMessage = 'Không thể tải ảnh lên.';
      if (error instanceof Error && error.message.includes('storage/unauthorized')) {
        errorMessage = 'Lỗi phân quyền. Vui lòng kiểm tra lại cấu hình CORS của Firebase Storage.';
      }
      toast({ variant: 'destructive', title: 'Lỗi tải ảnh', description: errorMessage });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFilesUpload(event.dataTransfer.files);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFilesUpload(event.target.files);
    if(event.target) {
      event.target.value = '';
    }
  };
  
  const handleRemoveImage = (urlToRemove: string) => {
    setInputImageUrls((prevUrls) => prevUrls.filter((url) => url !== urlToRemove));
  };

  const handleImageSelectFromLibrary = (imageUrl: string) => {
    if (!inputImageUrls.includes(imageUrl)) {
        setInputImageUrls((prevUrls) => [...prevUrls, imageUrl]);
    }
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
        imageUris: inputImageUrls.length > 0 ? inputImageUrls : undefined,
        model: scriptModel,
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
    if (!userData?.geminiApiKey) {
      toast({
        variant: 'destructive',
        title: 'Thiếu API Key',
        description: 'Vui lòng thêm Gemini API Key của bạn trong phần cài đặt tài khoản trước khi tạo video.',
      });
      return;
    }
    if (!user) {
      toast({ variant: 'destructive', title: 'Yêu cầu đăng nhập', description: 'Bạn cần đăng nhập để tạo video.' });
      return;
    }

    setIsLoading(true);
    setGeneratedVideoUrls([]);
    setElapsedTime(0);

    timerRef.current = setInterval(() => {
      setElapsedTime(prevTime => prevTime + 0.1);
    }, 100);

    try {
      const result = await aiVideoGeneration({
        textPrompt: prompt,
        referenceImageUris: inputImageUrls.length > 0 ? inputImageUrls : undefined,
        aspectRatio: aspectRatio,
        apiKey: userData.geminiApiKey,
        modelName: videoModel,
        durationSeconds: isVeo2 ? durationSeconds : undefined,
       userId: user.uid,
      });

      if (result.videoUrl) {
             setGeneratedVideoUrls([result.videoUrl]);
               toast({ title: 'Đã tạo và lưu video!', description: 'Video của bạn đã được lưu thành công vào thư viện.' });
             } else {
               throw new Error("Video generation succeeded, but no video URL was returned.");
            }

    } catch (error: any) {
      console.error('[VideoGeneration] Full error:', error);
      let description = error.message || 'Đã xảy ra lỗi không mong muốn.';
      if (error.message && (error.message.includes('RESOURCE_EXHAUSTED') || error.message.includes('429'))) {
        description = 'Bạn đã vượt quá giới hạn yêu cầu của API. Vui lòng đợi vài phút trước khi thử lại.';
      } else if (error.message && (error.message.includes('504') || error.message.includes('timeout') || error.message.includes('timed out'))) {
        description = 'Yêu cầu mất quá nhiều thời gian. Veo đang xử lý video — vui lòng kiểm tra thư viện của bạn sau vài phút.';
      }
      toast({
        variant: 'destructive',
        title: t('toast.video.generationFailed.title'),
        description: description,
      });
    } finally {
      setIsLoading(false);
      if(timerRef.current){
        clearInterval(timerRef.current);
      }
    }
  };
  
  const isBusy = isLoading || isGeneratingScript || isUploading;
  const isGenerateDisabled = isBusy || !prompt.trim();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
      <ImageLibraryModal
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        onImageSelect={handleImageSelectFromLibrary}
      />
      <div className="lg:col-span-1 flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardContent className="p-6 flex flex-col flex-1 gap-4">
            {!userData?.geminiApiKey && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                ⚠️ Bạn chưa thêm Gemini API Key. Vui lòng thêm API key trong menu tài khoản để sử dụng tính năng tạo video.
              </div>
            )}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="image-upload-input">{t('workspace.image.inputLabel')}</Label>
                <Button variant="outline" size="sm" onClick={() => setIsLibraryOpen(true)} disabled={isBusy}>
                  <Images className="mr-2 h-4 w-4" />
                  Library
                </Button>
              </div>
              <div
                className={cn(
                  'relative flex flex-col items-center justify-center w-full min-h-32 p-2 border-2 border-dashed rounded-lg transition-colors',
                  isDragging ? 'border-primary bg-primary/10' : 'hover:bg-muted'
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {isUploading ? (
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <p className="text-sm mt-2">{t('workspace.image.uploading')}</p>
                  </div>
                ) : inputImageUrls.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 w-full">
                    {inputImageUrls.map((url) => (
                      <div key={url} className="relative aspect-square">
                        <Image src={url} alt="Input preview" fill style={{ objectFit: 'contain' }} className="rounded-md p-1 bg-white" />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full z-10"
                          onClick={(e) => { e.stopPropagation(); handleRemoveImage(url); }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                     <div 
                      className="flex aspect-square flex-col items-center justify-center rounded-lg border border-dashed text-muted-foreground hover:bg-muted/50 hover:text-primary transition-colors cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                     >
                       <UploadCloud className="w-6 h-6" />
                       <span className="text-xs text-center mt-1">Thêm</span>
                     </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full w-full text-muted-foreground text-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <UploadCloud className="w-8 h-8 mb-2" />
                    <p className="text-sm">{isDragging ? t('workspace.image.dropLabel') : t('workspace.image.uploadTooltip')}</p>
                  </div>
                )}
                <input ref={fileInputRef} id="image-upload-input" type="file" className="hidden" multiple onChange={handleFileChange} accept="image/*" disabled={isBusy} />
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="script-description">{t('workspace.video.generateScriptButton')}</Label>
              <Textarea
                id="script-description"
                placeholder={t('workspace.video.scriptDescriptionPlaceholder')}
                value={scriptDescription}
                onChange={(e) => setScriptDescription(e.target.value)}
                rows={3}
                disabled={isBusy}
                className="resize-none"
              />
              <div className="space-y-2">
                <Label htmlFor="script-model">Mô hình tạo kịch bản</Label>
                <Select value={scriptModel} onValueChange={setScriptModel} disabled={isBusy}>
                  <SelectTrigger id="script-model" className="w-full">
                    <SelectValue placeholder="Chọn mô hình" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-3.1-pro-preview">iGen-3.1-pro-preview</SelectItem>
                    <SelectItem value="gemini-3.1-flash-lite-preview">iGen-3.1-flash-lite-preview</SelectItem>
                    <SelectItem value="gemini-3-flash-preview">iGen-3-flash-preview</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleGenerateScript}
                disabled={isGeneratingScript || !scriptDescription.trim()}
                size="sm"
                className="w-full"
              >
                {isGeneratingScript ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                {t('workspace.video.generateScriptButton')}
              </Button>
            </div>
            {motionAnalysis && cameraMovement && (
              <div className="text-xs p-3 bg-muted/50 rounded-lg space-y-1.5 border">
                <p><strong className="font-semibold">Phân tích chuyển động:</strong> {motionAnalysis}</p>
                <p><strong className="font-semibold">Chuyển động Camera:</strong> <span className="text-primary font-medium">{cameraMovement}</span></p>
              </div>
            )}
            <Separator />
            <div className="space-y-2 flex-1 flex flex-col">
              <Label htmlFor="prompt">{t('workspace.video.scriptOutputLabel')}</Label>
              <div className="relative flex-1 flex flex-col">
                  <Textarea
                    id="prompt"
                    placeholder={t('workspace.video.promptPlaceholder')}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isBusy}
                    className="pr-12 resize-none flex-1"
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
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="video-model">Mô hình tạo video</Label>
                <Select value={videoModel} onValueChange={setVideoModel} disabled={isBusy}>
                  <SelectTrigger id="video-model" className="w-full">
                    <SelectValue placeholder="Chọn mô hình video" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="veo-3.1-generate-preview">iGen Veo 3.1</SelectItem>
                    <SelectItem value="veo-3.1-fast-generate-preview">iGen Veo 3.1 Fast</SelectItem>
                    <SelectItem value="veo-2.0-generate-001">iGen Veo 2.0</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="aspect-ratio">Tỷ lệ khung hình</Label>
                <Select 
                    value={aspectRatio} 
                    onValueChange={(value) => setAspectRatio(value as '16:9' | '9:16')} 
                    disabled={isBusy || !isVeo2}
                >
                  <SelectTrigger id="aspect-ratio" className="w-full">
                    <SelectValue placeholder="Chọn tỷ lệ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16:9">16:9 ({t('feature.videoGeneration.horizontal')})</SelectItem>
                    <SelectItem value="9:16">9:16 ({t('feature.videoGeneration.vertical')})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                  <Label htmlFor="duration">Thời lượng (giây)</Label>
                  <Select
                      value={String(durationSeconds)}
                      onValueChange={(value) => setDurationSeconds(Number(value))}
                      disabled={isBusy || !isVeo2}
                  >
                      <SelectTrigger id="duration" className="w-full">
                          <SelectValue placeholder="Chọn thời lượng" />
                      </SelectTrigger>
                      <SelectContent>
                          {[5, 6, 7, 8].map(sec => (
                              <SelectItem key={sec} value={String(sec)}>{sec} giây</SelectItem>
                          ))}
                      </SelectContent>
                  </Select>
              </div>
               <div className="space-y-2">
                  <Label htmlFor="resolution">Độ phân giải (dự kiến)</Label>
                  <Select value={resolution} disabled>
                      <SelectTrigger id="resolution" className="w-full">
                          <SelectValue placeholder="Độ phân giải" />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="720p">720p</SelectItem>
                          <SelectItem value="1080p">1080p</SelectItem>
                          <SelectItem value="4k">4K</SelectItem>
                      </SelectContent>
                  </Select>
              </div>
            </div>
            <Button onClick={handleGenerate} disabled={isGenerateDisabled} className="w-full mt-2">
              {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                  <Video className="mr-2 h-4 w-4" />
              )}
              {t('workspace.video.generateButton.label')}
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="lg:col-span-2 bg-muted/50 rounded-lg flex items-center justify-center min-h-[400px] lg:min-h-0 p-4">
        {isLoading ? (
            <div className="flex flex-col items-center gap-4 text-muted-foreground">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
                <p className="mt-4">{t('workspace.video.loadingMessage')}</p>
                <div className="flex items-center gap-2 font-mono text-lg">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                    </span>
                    <span>{elapsedTime.toFixed(1)}s</span>
                </div>
            </div>
        ) : generatedVideoUrls.length > 0 ? (
          <div className={cn(
              "grid w-full h-full gap-4",
              generatedVideoUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
          )}>
            {generatedVideoUrls.map((videoUrl, index) => (
              <div key={index} className="relative group rounded-lg overflow-hidden border bg-black/10 aspect-video">
                <video src={videoUrl} controls className="w-full h-full object-contain" />
                <div className="absolute bottom-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a href={videoUrl} download={`igen-video-${Date.now()}-${index + 1}.mp4`} target="_blank" rel="noopener noreferrer">
                    <Button variant="secondary" size="icon" title="Tải video xuống">
                      <Download className="h-5 w-5" />
                    </Button>
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
            <div className="text-center text-muted-foreground">
              <Video className="h-16 w-16 mx-auto mb-4" />
              <p>{t('workspace.video.outputPlaceholder')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
