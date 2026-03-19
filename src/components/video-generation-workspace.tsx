'use client';

import { useState, useRef, ChangeEvent, DragEvent, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Video, X, UploadCloud, Wand2, Copy, Images, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { startVideoGeneration } from '@/app/actions/video-generation';
import { checkVideoStatus } from '@/app/actions/check-video-status';
import { videoScriptGeneration } from '@/ai/flows/video-script-generation-flow';
import Image from 'next/image';
import { useI18n } from '@/contexts/i18n-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from '@/contexts/auth-context';
import { storage, firestore } from '@/lib/firebase/config';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
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
  const [scriptModel, setScriptModel] = useState('gemini-3.1-pro-preview');
  const [videoModel, setVideoModel] = useState('veo-3.1-fast-generate-preview');
  const [videoDuration, setVideoDuration] = useState('8');
  const [frameRate, setFrameRate] = useState('24');
  const [outputResolution, setOutputResolution] = useState('720p');

  // Elapsed time counter (like image workspace)
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // New state for async job handling
  const [operationName, setOperationName] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const pollingErrorsRef = useRef(0);
  const MAX_POLLING_ERRORS = 3;
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { toast } = useToast();
  const { t } = useI18n();
  const { user, userData } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cleanupPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Save video to Firebase Storage → Firestore (client-side, like image workspace)
  const saveVideoToFirebase = async (videoUrl: string) => {
    if (!user) return;
    setIsSaving(true);
    try {
      // Fetch the video blob via our internal proxy to bypass CORS
      const proxyUrl = `/api/proxy-video?url=${encodeURIComponent(videoUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error(`Lỗi tải video từ server: ${response.statusText}`);
      const blob = await response.blob();

      const fileName = `generated-video-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`;
      const videoRef = storageRef(storage, `users/${user.uid}/generated-videos/${fileName}`);
      await uploadBytes(videoRef, blob);
      const downloadURL = await getDownloadURL(videoRef);

      await addDoc(collection(firestore, 'generatedVideos'), {
        ownerId: user.uid,
        prompt: prompt,
        videoUrl: downloadURL,
        aspectRatio: aspectRatio,
        modelName: videoModel,
        createdAt: serverTimestamp(),
      });

      toast({ title: '💾 Đã lưu video', description: 'Video đã được lưu vào thư viện của bạn.' });
    } catch (saveError: any) {
      console.error('[VideoGen] Failed to save video to Firebase:', saveError);
      toast({ variant: 'destructive', title: 'Lỗi lưu trữ', description: `Tạo video thành công nhưng không thể lưu: ${saveError.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  // Effect to handle polling based on operationName
  useEffect(() => {
    if (operationName && jobStatus === 'processing') {
      pollingRef.current = setInterval(async () => {
        try {
          const result = await checkVideoStatus(operationName, userData?.geminiApiKey || '');
          pollingErrorsRef.current = 0; // Reset error count on success

          if (result.status === 'processing') {
            // Timer keeps running, nothing else to do
          } else if (result.status === 'completed') {
            setJobStatus('completed');
            stopTimer();
            if (result.videoUrl) {
              setGeneratedVideoUrls(prev => [...prev, result.videoUrl!]);
              // Save to Firebase Storage → Firestore
              saveVideoToFirebase(result.videoUrl);
            }

            if (result.error) {
              setErrorDetails(result.error);
              toast({
                variant: 'default',
                title: "⚠️ Video tạo thành công (có cảnh báo)",
                description: result.error,
              });
            } else {
              toast({ title: "✅ Tạo video hoàn tất!", description: "Video của bạn đã sẵn sàng." });
            }
            cleanupPolling();
            setOperationName(null);
          } else if (result.status === 'failed') {
            setJobStatus('failed');
            stopTimer();
            const errorMsg = result.error || "Đã xảy ra lỗi không xác định.";
            setErrorDetails(errorMsg);
            toast({
              variant: 'destructive',
              title: "❌ Tạo video thất bại",
              description: errorMsg.length > 150 ? errorMsg.substring(0, 150) + '...' : errorMsg,
            });
            cleanupPolling();
            setOperationName(null);
          }
        } catch (error: any) {
          console.error("Polling error:", error);
          pollingErrorsRef.current += 1;
          const newErrorCount = pollingErrorsRef.current;

          if (newErrorCount >= MAX_POLLING_ERRORS) {
             setJobStatus('failed');
             stopTimer();
             const errorMsg = "Mất kết nối đến máy chủ sau nhiều lần thử. Vui lòng kiểm tra lại sau hoặc thử làm mới trang.";
             setErrorDetails(errorMsg);
             toast({ variant: 'destructive', title: "Lỗi kết nối", description: errorMsg });
             cleanupPolling();
             setOperationName(null);
          } else {
             // Just show a small warning and continue polling
             toast({ variant: 'default', title: `Kết nối không ổn định (lỗi ${newErrorCount}/${MAX_POLLING_ERRORS})`, description: "Đang thử kết nối lại..." });
          }
        }
      }, 15000); // Poll every 15 seconds
    }

    return () => cleanupPolling();
  }, [operationName, jobStatus, userData?.geminiApiKey]); // BUG #16 FIX: Removed toast

  // Effect to adjust settings based on the selected video model and resolution
  useEffect(() => {
    const isVeo2 = videoModel.includes('veo-2');
    
    if (isVeo2) {
      // For Veo 2, ensure duration is valid. Resolution is not configurable by user.
      if (!['5', '6', '8'].includes(videoDuration)) {
        setVideoDuration('8');
      }
    } else { // For Veo 3.x models
      // If resolution is high, duration MUST be 8s.
      if ((outputResolution === '1080p' || outputResolution === '4k')) {
        if (videoDuration !== '8') {
          setVideoDuration('8');
          toast({
            title: 'Thời lượng đã tự động điều chỉnh',
            description: 'Độ phân giải 1080p và 4k yêu cầu thời lượng video là 8 giây.',
          });
        }
      } 
      // If duration is not valid for Veo 3, reset it.
      else if (!['4', '6', '8'].includes(videoDuration)) {
        setVideoDuration('8');
      }
    }
  }, [videoModel, outputResolution, videoDuration, toast]);

  // Reset state when starting a new generation
  const resetGenerationState = () => {
    setGeneratedVideoUrls([]);
    setOperationName(null);
    setJobStatus('idle');
    setErrorDetails(null);
    pollingErrorsRef.current = 0;
    setElapsedTime(0);
    stopTimer();
    cleanupPolling();
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

    resetGenerationState();
    setJobStatus('processing');
    setElapsedTime(0);
    // Start elapsed time counter
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    toast({ title: "Bắt đầu tạo video...", description: "Quá trình này có thể mất vài phút." });

    try {
      const result = await startVideoGeneration({
        textPrompt: prompt,
        referenceImageUris: inputImageUrls.length > 0 ? inputImageUrls : undefined,
        aspectRatio: aspectRatio,
        modelName: videoModel,
        userId: user.uid,
        apiKey: userData.geminiApiKey,
        durationSeconds: videoDuration,
        frameRate: videoModel.includes('veo-2') ? frameRate : undefined,
        resolution: !videoModel.includes('veo-2') ? outputResolution : undefined,
      });

      if (result.status === 'failed') {
        // Server returned an error
        const errorMessage = result.error || 'Đã xảy ra lỗi không mong muốn.';
        setErrorDetails(errorMessage);
        toast({
          variant: 'destructive',
          title: "Không thể tạo video",
          description: errorMessage.length > 150 ? errorMessage.substring(0, 150) + '...' : errorMessage,
        });
        setJobStatus('failed');
        stopTimer();
      } else if (result.status === 'completed' && result.videoUrl) {
        // Video returned directly (synchronous)
        setGeneratedVideoUrls([result.videoUrl]);
        setJobStatus('completed');
        stopTimer();
        toast({ title: "✅ Tạo video hoàn tất!", description: "Video của bạn đã sẵn sàng." });
        // Save to Firebase Storage → Firestore
        saveVideoToFirebase(result.videoUrl);
      } else if (result.status === 'processing' && result.operationName) {
        // LRO - start polling
        setOperationName(result.operationName);
        toast({ title: "🎬 Video đang được tạo...", description: "Quá trình này có thể mất 2-5 phút." });
      } else {
        setErrorDetails('Phản hồi từ server không hợp lệ.');
        setJobStatus('failed');
      }
    } catch (error: any) {
      console.error('[VideoGeneration] Start error:', error);
      const errorMessage = error.message || 'Đã xảy ra lỗi không mong muốn.';
      setErrorDetails(errorMessage);
      toast({
        variant: 'destructive',
        title: "Không thể bắt đầu tạo video",
        description: "Chi tiết lỗi đã được hiển thị trong khu vực kết quả.",
      });
      setJobStatus('failed');
      stopTimer();
    }
  };

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
        const fileName = `input-${Date.now()}-${file.name}`;
        const imageRef = storageRef(storage, `users/${user.uid}/inputs/${fileName}`);
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
        apiKey: userData?.geminiApiKey,
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
  
  const isBusy = jobStatus === 'processing' || isGeneratingScript || isUploading || isSaving;
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
            <div className="space-y-2">
              <Label htmlFor="video-model">Mô hình tạo video</Label>
              <Select value={videoModel} onValueChange={setVideoModel} disabled={isBusy}>
                <SelectTrigger id="video-model" className="w-full">
                  <SelectValue placeholder="Chọn mô hình video" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="veo-2.0-generate-001">iGen Veo 2.0</SelectItem>
                  <SelectItem value="veo-3.1-generate-preview">iGen Veo 3.1</SelectItem>
                  <SelectItem value="veo-3.1-fast-generate-preview">iGen Veo 3.1 Fast</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="aspect-ratio">Tỷ lệ khung hình</Label>
                <Select 
                    value={aspectRatio} 
                    onValueChange={(value) => setAspectRatio(value as '16:9' | '9:16')} 
                    disabled={isBusy}
                >
                  <SelectTrigger id="aspect-ratio" className="w-full">
                    <SelectValue placeholder="Chọn tỷ lệ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16:9">{t('feature.videoGeneration.horizontal')}</SelectItem>
                    <SelectItem value="9:16">{t('feature.videoGeneration.vertical')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="video-duration">Video duration</Label>
                <Select 
                  value={videoDuration} 
                  onValueChange={setVideoDuration} 
                  disabled={isBusy || (!videoModel.includes('veo-2') && (outputResolution === '1080p' || outputResolution === '4k'))}
                >
                    <SelectTrigger id="video-duration" className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {videoModel.includes('veo-2') ? (
                            <>
                                <SelectItem value="5">5s</SelectItem>
                                <SelectItem value="6">6s</SelectItem>
                                <SelectItem value="8">8s</SelectItem>
                            </>
                        ) : (
                            <>
                                <SelectItem value="4">4s</SelectItem>
                                <SelectItem value="6">6s</SelectItem>
                                <SelectItem value="8">8s</SelectItem>
                            </>
                        )}
                    </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                {!videoModel.includes('veo-2') && (
                  <div className="space-y-2 col-span-2">
                      <Label htmlFor="output-resolution">Output resolution</Label>
                      <Select value={outputResolution} onValueChange={setOutputResolution} disabled={isBusy}>
                          <SelectTrigger id="output-resolution" className="w-full">
                              <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="720p">720p</SelectItem>
                              <SelectItem value="1080p">1080p</SelectItem>
                              <SelectItem value="4k">4k</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>
                )}
            </div>

            <Button onClick={handleGenerate} disabled={isGenerateDisabled} className="w-full mt-2">
              {jobStatus === 'processing' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                  <Video className="mr-2 h-4 w-4" />
              )}
              {t('workspace.video.generateButton.label')}
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="lg:col-span-2 bg-muted/50 rounded-lg flex flex-col items-center justify-center min-h-[400px] lg:min-h-0 p-4 gap-4">
        {/* Error Details Panel */}
        {errorDetails && jobStatus !== 'processing' && (
          <div className={cn(
            "w-full max-w-2xl rounded-lg p-4 text-sm border",
            jobStatus === 'failed'
              ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-200"
              : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200"
          )}>
            <div className="flex items-start gap-2">
              <span className="text-lg flex-shrink-0">
                {jobStatus === 'failed' ? '❌' : '⚠️'}
              </span>
              <div className="flex-1">
                <p className="font-semibold mb-1">
                  {jobStatus === 'failed' ? 'Chi tiết lỗi tạo video' : 'Cảnh báo'}
                </p>
                <p className="whitespace-pre-wrap break-words">{errorDetails}</p>

                {/* Nút thử lại khi lỗi */}
                {jobStatus === 'failed' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={handleGenerate}
                    disabled={!prompt.trim()}
                  >
                    🔄 Thử lại
                  </Button>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="flex-shrink-0 h-6 w-6"
                onClick={() => setErrorDetails(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {jobStatus === 'processing' ? (
            <div className="flex flex-col items-center gap-4 text-muted-foreground w-full max-w-md">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
                <p className="mt-4 text-center">{t('workspace.video.loadingMessage')}</p>
                <div className="flex items-center gap-2 font-mono text-lg">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                    </span>
                    <span>{elapsedTime}s</span>
                </div>
                {isSaving && <p className="text-xs text-muted-foreground">Đang lưu video...</p>}
            </div>
        ) : generatedVideoUrls.length > 0 ? (
          <>
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
          {isSaving && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Đang lưu video vào thư viện...</span>
            </div>
          )}
          </>
        ) : jobStatus !== 'failed' && (
            <div className="text-center text-muted-foreground">
              <Video className="h-16 w-16 mx-auto mb-4" />
              <p>{t('workspace.video.outputPlaceholder')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
