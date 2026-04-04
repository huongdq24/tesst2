'use client';

import { useState, useRef, ChangeEvent, DragEvent, useEffect, useCallback } from 'react';
import { recordUsage } from '@/lib/usage-tracker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, UploadCloud, Video, Heart, Download, Play, Sparkles, ArrowRight, Images, Library, Settings, X, Link2, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { startVideoGeneration } from '@/app/actions/video-generation';
import { checkVideoStatus } from '@/app/actions/check-video-status';
import { videoScriptGeneration } from '@/ai/flows/video-script-generation-flow';
import Image from 'next/image';
import { useAuth } from '@/contexts/auth-context';
import { storage, firestore } from '@/lib/firebase/config';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageLibraryModal } from '@/components/modals/image-library-modal';

// Types
type InputMode = 'standard' | 'before-after';
type VideoClip = { url: string; duration: string; geminiFileUri?: string | null; prompt?: string; originalVeoUrl?: string | null; aspectRatio?: string };

// Model definitions for display
const MODEL_OPTIONS = [
  { value: 'veo-3.1-fast-generate-preview', label: 'iGen Veo 3.1 Nhanh', desc: 'Tốc độ nhanh, chất lượng tốt' },
  { value: 'veo-3.1-generate-preview', label: 'iGen Veo 3.1 HQ', desc: 'Chất lượng cao nhất' },
  { value: 'veo-2.0-generate-001', label: 'iGen Veo 2.0', desc: 'Phiên bản ổn định cũ (chỉ 720p)' },
];

const DURATION_OPTIONS_VEO3 = [
  { value: '4', label: '4 giây' },
  { value: '6', label: '6 giây' },
  { value: '8', label: '8 giây' },
];

const DURATION_OPTIONS_VEO2 = [
  { value: '4', label: '4 giây' },
  { value: '5', label: '5 giây' },
  { value: '6', label: '6 giây' },
  { value: '8', label: '8 giây' },
];

const QUALITY_OPTIONS = [
  { value: '1080p', label: '1080p (Full HD)' },
  { value: '720p', label: '720p (HD)' },
];

export function SimpleVideoWorkspace() {
  const [activeMode, setActiveMode] = useState<InputMode>('standard');
  const [prompt, setPrompt] = useState('');

  // Image states
  const [standardImage, setStandardImage] = useState<string | null>(null);
  const [beforeImage, setBeforeImage] = useState<string | null>(null);
  const [afterImage, setAfterImage] = useState<string | null>(null);

  // Settings state
  const [videoModel, setVideoModel] = useState('veo-3.1-fast-generate-preview');
  const [videoAspectRatio, setVideoAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [videoDuration, setVideoDuration] = useState('4');
  const [videoQuality, setVideoQuality] = useState('1080p');

  // Extend Video state
  const [extendingVideoUrl, setExtendingVideoUrl] = useState<string | null>(null);
  const [extendVideoPrompt, setExtendVideoPrompt] = useState<string | null>(null);

  // Upload & Library states
  const [isUploading, setIsUploading] = useState<'standard' | 'before' | 'after' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<'standard' | 'before' | 'after'>('standard');
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  // Generation states
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobStatus, setJobStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [operationName, setOperationName] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [generationStage, setGenerationStage] = useState<'script' | 'uploading' | 'rendering' | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollingErrorsRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Project state
  const [videoProject, setVideoProject] = useState<VideoClip[]>([]);
  const [hiddenVideoUrls, setHiddenVideoUrls] = useState<Set<string>>(new Set());
  const visibleVideos = videoProject.filter(v => !hiddenVideoUrls.has(v.url));
  const { toast } = useToast();
  const { user, userData } = useAuth();

  const promptRef = useRef(prompt);
  useEffect(() => { promptRef.current = prompt; }, [prompt]);

  // Firebase Realtime Listener Removed. Workspace now acts as a temporary session.

  // Adjust quality & duration settings based on selected model
  const isVeo2Selected = videoModel.includes('veo-2');
  const durationOptions = isVeo2Selected ? DURATION_OPTIONS_VEO2 : DURATION_OPTIONS_VEO3;

  useEffect(() => {
    if (isVeo2Selected) {
      // Veo 2: force 720p quality
      if (videoQuality !== '720p') {
        setVideoQuality('720p');
        toast({
          title: 'Chất lượng đã tự động điều chỉnh',
          description: 'Model Veo 2.0 chỉ hỗ trợ chất lượng 720p.',
        });
      }
      // Veo 2 doesn't support 4s in certain contexts but the API will handle fallback;
      // However if user selected a duration not valid for Veo 2, correct it
    } else {
      // Veo 3.x: if user had selected 5s (only valid for Veo 2), switch to 4s
      if (videoDuration === '5') {
        setVideoDuration('4');
        toast({
          title: 'Thời lượng đã tự động điều chỉnh',
          description: 'Model Veo 3.x không hỗ trợ 5 giây. Đã chuyển về 4 giây.',
        });
      }
    }
  }, [isVeo2Selected, videoQuality, videoDuration, toast]);

  // Upload handler
  const handleFileUpload = async (file: File, target: 'standard' | 'before' | 'after') => {
    if (!user) return;
    setIsUploading(target);
    try {
      const fileName = `content-studio/images/${Date.now()}-${file.name}`;
      const imageRef = storageRef(storage, `users/${user.uid}/${fileName}`);
      await uploadBytes(imageRef, file);
      const downloadURL = await getDownloadURL(imageRef);

      if (target === 'standard') setStandardImage(downloadURL);
      if (target === 'before') setBeforeImage(downloadURL);
      if (target === 'after') setAfterImage(downloadURL);

      toast({ title: 'Tải ảnh thành công!' });
    } catch (error) {
      console.error('Upload error', error);
      toast({ variant: 'destructive', title: 'Lỗi tải ảnh', description: 'Vui lòng thử lại.' });
    } finally {
      setIsUploading(null);
    }
  };

  const onFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0], uploadTarget);
    }
    if (event.target) event.target.value = '';
  };

  const handleLibrarySelect = (imageUrl: string) => {
    if (uploadTarget === 'standard') setStandardImage(imageUrl);
    if (uploadTarget === 'before') setBeforeImage(imageUrl);
    if (uploadTarget === 'after') setAfterImage(imageUrl);
    setIsLibraryOpen(false);
  };

  const saveVideoToFirebase = async (videoUrl: string, finalPrompt: string) => {
    if (!user) return;
    try {
      // Store the ORIGINAL Veo URL for future video extension (Veo requires its own generated URLs)
      const originalVeoUrl = videoUrl;

      const proxyUrl = `/api/proxy-video?url=${encodeURIComponent(videoUrl)}`;
      const response = await fetch(proxyUrl);
      const blob = await response.blob();
      const fileName = `generated-video-${Date.now()}.mp4`;
      const videoRef = storageRef(storage, `users/${user.uid}/generated-videos/${fileName}`);
      await uploadBytes(videoRef, blob);
      const downloadURL = await getDownloadURL(videoRef);

      await addDoc(collection(firestore, 'generatedVideos'), {
        ownerId: user.uid,
        prompt: finalPrompt,
        videoUrl: downloadURL,
        originalVeoUrl: originalVeoUrl, // CRITICAL: needed for extend/continuation
        aspectRatio: videoAspectRatio,
        modelName: videoModel,
        createdAt: serverTimestamp(),
      });
      // Track usage for cost analytics
      recordUsage({
        userId: user.uid,
        userEmail: user.email || '',
        type: 'video',
        model: videoModel,
        amount: Number(videoDuration) || 8,
        prompt: finalPrompt,
      });
    } catch (err) {
      console.error('Save error', err);
    }
  };

  const cleanupPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  // Polling Effect
  useEffect(() => {
    if (operationName && jobStatus === 'processing') {
      pollingRef.current = setInterval(async () => {
        try {
          const result = await checkVideoStatus(operationName, userData?.geminiApiKey || '');
          pollingErrorsRef.current = 0;

          if (result.status === 'completed') {
            setJobStatus('completed');
            setIsGenerating(false);
            stopTimer();
            if (result.videoUrl) {
              setVideoProject(prev => [{
                url: `/api/proxy-video?url=${encodeURIComponent(result.videoUrl!)}`,
                duration: videoDuration + 's',
                prompt: promptRef.current,
                originalVeoUrl: result.videoUrl,
                aspectRatio: videoAspectRatio
              }, ...prev]);
              saveVideoToFirebase(result.videoUrl, promptRef.current);
            }
            toast({ title: "✅ Tạo video hoàn tất!" });
            cleanupPolling();
            setOperationName(null);
          } else if (result.status === 'failed') {
            setJobStatus('failed');
            setIsGenerating(false);
            stopTimer();
            setErrorDetails(result.error || "Lỗi không xác định");
            toast({ variant: 'destructive', title: "❌ Tạo video thất bại", description: result.error });
            cleanupPolling();
            setOperationName(null);
          }
        } catch (error) {
          pollingErrorsRef.current += 1;
          if (pollingErrorsRef.current >= 3) {
            setJobStatus('failed');
            setIsGenerating(false);
            stopTimer();
            cleanupPolling();
            setOperationName(null);
          }
        }
      }, 5000);
    }
    return () => cleanupPolling();
  }, [operationName, jobStatus, userData?.geminiApiKey, toast, saveVideoToFirebase]);

  const activateExtendMode = (clip: VideoClip) => {
    const originalVeoUrl = clip.originalVeoUrl || '';
    if (!originalVeoUrl.includes('generativelanguage.googleapis.com/v1beta/files/')) {
      toast({ variant: 'destructive', title: 'Không thể nối tiếp', description: 'Tính năng nối tiếp (Extend Video) chỉ hỗ trợ những video được tạo trực tiếp bằng các model Veo 3.1 trở lên.' });
      return;
    }

    if (videoModel.includes('veo-2')) {
      setVideoModel('veo-3.1-fast-generate-preview');
      toast({ title: 'Đã tự động chuyển model', description: 'Tính năng nối tiếp chỉ khả dụng với model từ Veo 3.1.' });
    }

    setExtendingVideoUrl(originalVeoUrl);
    setExtendVideoPrompt(clip.prompt || null);
    setPrompt('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast({ title: '🔗 Đã chọn video gốc để nối tiếp!', description: 'Nhập mô tả cho phần tiếp theo rồi nhấn Tạo Video.' });
  };

  const cancelExtend = () => {
    setExtendingVideoUrl(null);
    setExtendVideoPrompt(null);
  };

  const resetGenerationState = () => {
    setJobStatus('idle');
    setOperationName(null);
    setErrorDetails(null);
    setGenerationStage(null);
    stopTimer();
    setElapsedTime(0);
  }

  const handleGenerate = async () => {
    if (!user || !userData?.geminiApiKey) {
      toast({ variant: 'destructive', title: 'Yêu cầu đăng nhập & API Key' });
      return;
    }

    // Extend mode validation
    if (extendingVideoUrl) {
      if (!prompt.trim()) {
        toast({ variant: 'destructive', title: 'Thiếu mô tả', description: 'Vui lòng nhập mô tả cho phần video tiếp theo.' });
        return;
      }
    } else {
      if (activeMode === 'standard' && !standardImage && !prompt.trim()) {
        toast({ variant: 'destructive', title: 'Thiếu thông tin', description: 'Vui lòng tải ảnh lên hoặc nhập mô tả.' });
        return;
      }
      if (activeMode === 'before-after' && (!beforeImage || !afterImage)) {
        toast({ variant: 'destructive', title: 'Thiếu ảnh', description: 'Vui lòng tải đủ 2 ảnh Trước và Sau.' });
        return;
      }
    }

    setIsGenerating(true);
    resetGenerationState();
    timerRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      // EXTEND MODE
      if (extendingVideoUrl) {
        toast({ title: "✨ Đang tối ưu kịch bản..." });
        setGenerationStage('script');

        const aiResult = await videoScriptGeneration({
          description: `Video part 1 was about: "${extendVideoPrompt}". Part 2 should be: "${prompt || 'Continue smoothly'}". MAKE SURE to maintain the same subject and character!`,
          model: 'gemini-3.1-flash-lite-preview',
          apiKey: userData.geminiApiKey,
        });
        const finalPrompt = aiResult.optimized_english_prompt;
        promptRef.current = finalPrompt; // IMPORTANT for polling to save the right prompt

        toast({ title: "🔗 Đang gửi yêu cầu nối tiếp video...", description: "Sử dụng model Veo 3.1 (chỉ model này hỗ trợ nối tiếp)" });
        setGenerationStage('uploading');

        // Video extension ONLY works with veo-3.1-generate-preview (per Google API docs)
        const result = await startVideoGeneration({
          textPrompt: finalPrompt,
          referenceVideoUri: extendingVideoUrl,
          referenceImageUris: standardImage ? [standardImage] : undefined, // Keep original character image
          aspectRatio: videoAspectRatio,
          modelName: 'veo-3.1-generate-preview', // Force: only model supporting extension
          userId: user.uid,
          apiKey: userData.geminiApiKey,
        });

        if (result.status === 'failed') {
          setJobStatus('failed');
          setIsGenerating(false);
          stopTimer();
          toast({ variant: 'destructive', title: "Lỗi nối tiếp video", description: result.error });
        } else if (result.status === 'completed' && result.videoUrl) {
          setJobStatus('completed');
          setIsGenerating(false);
          stopTimer();
          setVideoProject(prev => [{
            url: `/api/proxy-video?url=${encodeURIComponent(result.videoUrl!)}`,
            duration: videoDuration + 's',
            prompt: finalPrompt,
            originalVeoUrl: result.videoUrl,
            aspectRatio: videoAspectRatio
          }, ...prev]);
          saveVideoToFirebase(result.videoUrl, finalPrompt);
          toast({ title: "✅ Nối tiếp video hoàn tất!" });
          cancelExtend();
        } else if (result.status === 'processing' && result.operationName) {
          setOperationName(result.operationName);
          setJobStatus('processing');
          setGenerationStage('rendering');
        }
        return;
      }

      // NORMAL MODE
      toast({ title: "✨ Đang tối ưu kịch bản..." });
      setGenerationStage('script');

      let finalPrompt = prompt;
      let referenceImageUris: string[] = [];
      let afterImageUri: string | undefined = undefined;

      if (activeMode === 'standard') {
        if (standardImage) referenceImageUris.push(standardImage);
        if (prompt.trim() || standardImage) {
          const aiResult = await videoScriptGeneration({
            description: prompt || 'Tạo một video chuyển động đẹp mắt cho hình ảnh này',
            model: 'gemini-3.1-flash-lite-preview',
            imageUris: referenceImageUris.length > 0 ? referenceImageUris : undefined,
            apiKey: userData.geminiApiKey,
          });
          finalPrompt = aiResult.optimized_english_prompt;
        }
      } else {
        referenceImageUris = [beforeImage!];
        afterImageUri = afterImage!;
        finalPrompt = prompt.trim() || 'Chuyển đổi mượt mà từ ảnh trước sang ảnh sau';
      }

      toast({ title: "🎬 Đang gửi yêu cầu tạo video..." });
      setGenerationStage('uploading');

      const result = await startVideoGeneration({
        textPrompt: finalPrompt,
        referenceImageUris: referenceImageUris,
        afterImageUri: afterImageUri,
        aspectRatio: videoAspectRatio,
        modelName: videoModel,
        userId: user.uid,
        apiKey: userData.geminiApiKey,
        durationSeconds: videoDuration,
        resolution: videoQuality,
      });

      if (result.status === 'failed') {
        setJobStatus('failed');
        setIsGenerating(false);
        stopTimer();
        toast({ variant: 'destructive', title: "Lỗi tạo video", description: result.error });
      } else if (result.status === 'completed' && result.videoUrl) {
        setJobStatus('completed');
        setIsGenerating(false);
        stopTimer();
        setVideoProject(prev => [{
          url: `/api/proxy-video?url=${encodeURIComponent(result.videoUrl!)}`,
          duration: videoDuration + 's',
          prompt: finalPrompt,
          originalVeoUrl: result.videoUrl,
          aspectRatio: videoAspectRatio
        }, ...prev]);
        saveVideoToFirebase(result.videoUrl, finalPrompt);
        toast({ title: "✅ Tạo video hoàn tất!" });
      } else if (result.status === 'processing' && result.operationName) {
        setOperationName(result.operationName);
        setJobStatus('processing');
        setGenerationStage('rendering');
      }
    } catch (error: any) {
      console.error(error);
      setIsGenerating(false);
      stopTimer();
      setJobStatus('failed');
      toast({ variant: 'destructive', title: "Lỗi kết nối", description: error.message });
    }
  };

  // Helper to get current model label
  const currentModelLabel = MODEL_OPTIONS.find(m => m.value === videoModel)?.label || videoModel;

  const isBusy = isGenerating || isUploading;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
      <div className="lg:col-span-1">
        <Card className="border shadow-sm">
          <CardContent className="p-5 space-y-5">

            {/* HEADER TABS (Mode Switcher) */}
            <div className="flex justify-center">
              <div className="inline-flex items-center p-1.5 bg-zinc-100/80 dark:bg-zinc-800/60 backdrop-blur-md rounded-full border border-zinc-200/80 dark:border-white/5 shadow-inner">
                <button
                  onClick={() => setActiveMode('standard')}
                  className={cn(
                    "flex items-center rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-300",
                    activeMode === 'standard'
                      ? "bg-white dark:bg-zinc-900 text-cyan-600 dark:text-cyan-400 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  )}
                >
                  <Video className="w-4 h-4 mr-2" /> Tiêu chuẩn (1 Ảnh)
                </button>
                <button
                  onClick={() => {
                    setActiveMode('before-after');
                    if (videoModel.includes('veo-2')) {
                      setVideoModel('veo-3.1-fast-generate-preview');
                      toast({ title: 'Đã tự động chuyển model', description: 'Tính năng Trước/Sau (2 Ảnh) chỉ khả dụng với model từ Veo 3.1.' });
                    }
                  }}
                  className={cn(
                    "flex items-center rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-300",
                    activeMode === 'before-after'
                      ? "bg-white dark:bg-zinc-900 text-cyan-600 dark:text-cyan-400 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  )}
                >
                  <Images className="w-4 h-4 mr-2" /> Trước / Sau
                </button>
              </div>
            </div>

            {/* UPLOAD AREA */}
            <div className="space-y-4">
              {activeMode === 'standard' ? (
                <div className="flex flex-col items-center gap-4 w-full">
                  <div
                    onClick={() => { setUploadTarget('standard'); fileInputRef.current?.click(); }}
                    className="w-full aspect-[21/9] bg-zinc-50/50 dark:bg-zinc-950/30 border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-cyan-400/50 hover:bg-cyan-50/30 dark:hover:bg-cyan-500/5 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden group shadow-sm"
                  >
                    {standardImage ? (
                      <>
                        <Image src={standardImage} alt="Standard" fill className="object-cover" />
                        <button
                          onClick={(e) => { e.stopPropagation(); setStandardImage(null); }}
                          className="absolute top-3 right-3 p-1.5 bg-black/50 hover:bg-red-500 text-white rounded-full backdrop-blur-md transition-colors z-10"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 mb-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm border border-zinc-100 dark:border-zinc-800 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                          {isUploading === 'standard' ? <Loader2 className="w-8 h-8 animate-spin text-cyan-500" /> : <UploadCloud className="w-8 h-8 text-zinc-400 group-hover:text-cyan-500 transition-colors" />}
                        </div>
                        <p className="font-bold text-lg text-zinc-700 dark:text-zinc-200">Tải ảnh lên làm khung hình đầu</p>
                        <p className="text-sm text-zinc-400 mt-1">Kéo thả hoặc nhấp để chọn ảnh (Tùy chọn)</p>
                      </>
                    )}
                  </div>
                  <Button variant="ghost" onClick={() => { setUploadTarget('standard'); setIsLibraryOpen(true); }} className="w-full text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100/50 rounded-xl px-6">
                    <Library className="w-4 h-4 mr-2" /> Chọn từ thư viện tài nguyên
                  </Button>
                </div>
              ) : (
                <div className="w-full">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex-1 w-full flex flex-col gap-3">
                      <div
                        onClick={() => { setUploadTarget('before'); fileInputRef.current?.click(); }}
                        className="w-full aspect-square bg-zinc-50/50 dark:bg-zinc-950/30 border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-orange-400/50 hover:bg-orange-50/30 dark:hover:bg-orange-500/5 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden group shadow-sm"
                      >
                        {beforeImage ? (
                          <>
                            <Image src={beforeImage} alt="Before" fill className="object-cover" />
                            <button
                              onClick={(e) => { e.stopPropagation(); setBeforeImage(null); }}
                              className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500 text-white rounded-full backdrop-blur-md transition-colors z-10"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="w-14 h-14 mb-3 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm border border-zinc-100 dark:border-zinc-800 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                              {isUploading === 'before' ? <Loader2 className="w-6 h-6 animate-spin text-orange-500" /> : <UploadCloud className="w-6 h-6 text-zinc-400 group-hover:text-orange-500" />}
                            </div>
                            <p className="font-bold text-zinc-700 dark:text-zinc-200">Ảnh Bắt đầu</p>
                          </>
                        )}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => { setUploadTarget('before'); setIsLibraryOpen(true); }} className="text-zinc-500 rounded-full mx-auto w-fit">
                        <Library className="w-4 h-4 mr-2" /> Thư viện
                      </Button>
                    </div>

                    <div className="flex-1 w-full flex flex-col gap-3">
                      <div
                        onClick={() => { setUploadTarget('after'); fileInputRef.current?.click(); }}
                        className="w-full aspect-square bg-zinc-50/50 dark:bg-zinc-950/30 border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-cyan-400/50 hover:bg-cyan-50/30 dark:hover:bg-cyan-500/5 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden group shadow-sm"
                      >
                        {afterImage ? (
                          <>
                            <Image src={afterImage} alt="After" fill className="object-cover" />
                            <button
                              onClick={(e) => { e.stopPropagation(); setAfterImage(null); }}
                              className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500 text-white rounded-full backdrop-blur-md transition-colors z-10"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="w-14 h-14 mb-3 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm border border-zinc-100 dark:border-zinc-800 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                              {isUploading === 'after' ? <Loader2 className="w-6 h-6 animate-spin text-cyan-500" /> : <UploadCloud className="w-6 h-6 text-zinc-400 group-hover:text-cyan-500" />}
                            </div>
                            <p className="font-bold text-zinc-700 dark:text-zinc-200">Ảnh Kết thúc</p>
                          </>
                        )}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => { setUploadTarget('after'); setIsLibraryOpen(true); }} className="text-zinc-500 rounded-full mx-auto w-fit">
                        <Library className="w-4 h-4 mr-2" /> Thư viện
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* PROMPT INPUT BAR */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Ý tưởng video</label>
              <div className="flex items-end bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all duration-300">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={activeMode === 'standard' ? "Máy quay lướt qua sản phẩm..." : "Chuyển đổi từ cũ sang mới..."}
                  className="flex-1 resize-none border-0 focus-visible:ring-0 bg-transparent text-sm min-h-[80px] py-3 shadow-none scrollbar-hide"
                  style={{ boxShadow: 'none' }}
                />
              </div>
            </div>

            {/* SETTINGS PANEL */}
            <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Aspect Ratio */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Khung hình</label>
                  <Select value={videoAspectRatio} onValueChange={(val: any) => setVideoAspectRatio(val)}>
                    <SelectTrigger className="h-11 rounded-xl border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 focus:ring-0 font-medium text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl shadow-xl">
                      <SelectItem value="16:9" className="rounded-lg cursor-pointer">16:9 (Ngang)</SelectItem>
                      <SelectItem value="9:16" className="rounded-lg cursor-pointer">9:16 (Dọc)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Model */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Model AI</label>
                  <Select value={videoModel} onValueChange={setVideoModel}>
                    <SelectTrigger className="h-11 rounded-xl border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 focus:ring-0 font-medium text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl shadow-xl">
                      {(activeMode === 'before-after' ? MODEL_OPTIONS.filter(opt => !opt.value.includes('veo-2')) : MODEL_OPTIONS).map(opt => (
                        <SelectItem key={opt.value} value={opt.value} className="rounded-lg cursor-pointer">
                          <div>
                            <span className="font-medium">{opt.label}</span>
                            <span className="text-xs text-zinc-400 ml-2">({opt.desc})</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Duration */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Thời lượng</label>
                  <Select value={videoDuration} onValueChange={setVideoDuration}>
                    <SelectTrigger className="h-11 rounded-xl border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 focus:ring-0 font-medium text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl shadow-xl">
                      {durationOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value} className="rounded-lg cursor-pointer">{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Quality */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Chất lượng</label>
                  <Select value={videoQuality} onValueChange={setVideoQuality} disabled={videoModel.includes('veo-2')}>
                    <SelectTrigger className="h-11 rounded-xl border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 focus:ring-0 font-medium text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl shadow-xl">
                      {QUALITY_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value} className="rounded-lg cursor-pointer">{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Current config summary */}
              <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center">
                  Cấu hình: <strong className="text-zinc-600 dark:text-zinc-300">{videoAspectRatio === '16:9' ? 'Ngang' : 'Dọc'}</strong> · <strong className="text-zinc-600 dark:text-zinc-300">{currentModelLabel}</strong> · <strong className="text-zinc-600 dark:text-zinc-300">{videoDuration}s</strong> · <strong className="text-zinc-600 dark:text-zinc-300">{isVeo2Selected ? '720p (mặc định)' : videoQuality}</strong>
                </p>
              </div>
            </div>

            <Button
              size="lg"
              onClick={handleGenerate}
              disabled={isBusy}
              className="w-full mt-4 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-bold text-base h-11"
            >
              {isGenerating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <><Sparkles className="w-5 h-5 mr-2" /> Tạo Video</>
              )}
            </Button>

          </CardContent>
        </Card>
      </div>

      {/* RIGHT PANEL: PREVIEW & OUTPUT */}
      <div className="lg:col-span-2 bg-muted/50 rounded-lg flex flex-col items-center justify-center min-h-[400px] lg:min-h-0 p-4 relative overflow-hidden">

        {/* GENERATING SKELETON */}
        {isGenerating && (() => {
          // Estimated times per stage (seconds)
          const STAGE_TIMES = { script: 10, uploading: 5, rendering: 120 };
          const TOTAL_ESTIMATED = STAGE_TIMES.script + STAGE_TIMES.uploading + STAGE_TIMES.rendering; // 135s

          // Calculate estimated progress percentage based on stage + elapsed time
          let estimatedPercent = 0;
          if (generationStage === 'script') {
            estimatedPercent = Math.min((elapsedTime / STAGE_TIMES.script) * 7, 7); // 0-7%
          } else if (generationStage === 'uploading') {
            estimatedPercent = 7 + Math.min(((elapsedTime - STAGE_TIMES.script) / STAGE_TIMES.uploading) * 5, 5); // 7-12%
          } else if (generationStage === 'rendering') {
            const renderStart = STAGE_TIMES.script + STAGE_TIMES.uploading;
            const renderElapsed = Math.max(0, elapsedTime - renderStart);
            estimatedPercent = 12 + Math.min((renderElapsed / STAGE_TIMES.rendering) * 83, 83); // 12-95%
          }
          estimatedPercent = Math.min(Math.round(estimatedPercent), 95);

          // Estimated time remaining
          const estimatedRemaining = Math.max(0, TOTAL_ESTIMATED - elapsedTime);
          const remainMin = Math.floor(estimatedRemaining / 60);
          const remainSec = estimatedRemaining % 60;

          const stageLabel = generationStage === 'script' ? 'Đang tối ưu kịch bản'
            : generationStage === 'uploading' ? 'Đang gửi yêu cầu'
            : generationStage === 'rendering' ? 'Google AI đang render'
            : 'Đang khởi tạo';

          return (
            <div className="flex flex-col items-center w-full z-10 max-w-3xl animate-in fade-in duration-500">
              <div className={cn(
                "relative rounded-2xl overflow-hidden shadow-2xl w-full flex flex-col items-center justify-center",
                videoAspectRatio === '9:16' ? "max-w-[320px] aspect-[9/16] mx-auto" : "aspect-video"
              )}>
                {/* Background: reference image blurred or solid gray */}
                {(standardImage || beforeImage) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={standardImage || beforeImage!} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-15 blur-lg grayscale scale-110" />
                ) : null}

                {/* Clean white overlay */}
                <div className="absolute inset-0 bg-white" />

                {/* Shimmer sweep effect */}
                <div className="absolute inset-0 overflow-hidden">
                  <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-cyan-100/40 to-transparent" />
                </div>

                {/* Content overlay */}
                <div className="relative z-10 flex flex-col items-center justify-center gap-5 px-6 py-10 w-full">

                  {/* Percentage circle */}
                  <div className="relative w-28 h-28">
                    {/* Background circle */}
                    <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(6,182,212,0.15)" strokeWidth="6" />
                      <circle
                        cx="60" cy="60" r="52"
                        fill="none"
                        stroke="rgb(6,182,212)"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 52}`}
                        strokeDashoffset={`${2 * Math.PI * 52 * (1 - estimatedPercent / 100)}`}
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    {/* Percent text */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold font-mono text-cyan-600 tabular-nums">{estimatedPercent}%</span>
                    </div>
                  </div>

                  {/* Stage label */}
                  <div className="text-center space-y-1.5">
                    <h3 className="text-base font-semibold text-zinc-700 tracking-wide animate-pulse" style={{ animationDuration: '1.5s' }}>
                      {stageLabel}...
                    </h3>
                    <p className="text-sm text-zinc-400 font-mono tabular-nums">
                      {estimatedRemaining > 0
                        ? `Còn khoảng ${remainMin > 0 ? `${remainMin} phút ` : ''}${remainSec}s`
                        : 'Sắp hoàn tất...'}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full max-w-[240px]">
                    <div className="h-1.5 bg-cyan-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 to-cyan-500 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${estimatedPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Elapsed time small */}
                  <p className="text-xs text-zinc-400 font-mono tabular-nums mt-1">
                    {Math.floor(elapsedTime / 60).toString().padStart(2, '0')}:{(elapsedTime % 60).toString().padStart(2, '0')} đã trôi qua
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ERROR MESSAGE */}
        {errorDetails && (
          <div className="w-full mt-8 bg-red-50/80 dark:bg-red-900/20 backdrop-blur-md border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 p-5 rounded-2xl flex items-start gap-4 shadow-sm">
            <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg shrink-0">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <strong className="block mb-1 text-lg">Đã xảy ra lỗi</strong>
              <span className="text-sm">{errorDetails}</span>
            </div>
          </div>
        )}

        {/* LATEST GENERATED VIDEO */}
        {!isGenerating && visibleVideos.length > 0 && (
          <div className="flex flex-col items-center w-full z-10 max-w-3xl">
            <div className={cn(
              "relative bg-black rounded-lg overflow-hidden shadow-xl border border-zinc-200/20 w-full",
              visibleVideos[0].aspectRatio === '9:16' ? "max-w-[320px] aspect-[9/16] mx-auto" : "aspect-video"
            )}>
              <video src={visibleVideos[0].url} className="w-full h-full object-cover" controls playsInline autoPlay muted loop />
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-4 w-full">
              {visibleVideos[0].originalVeoUrl && (
                <Button
                  onClick={() => activateExtendMode(visibleVideos[0])}
                  className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white"
                >
                  <Link2 className="w-4 h-4 mr-2" />
                  Tạo video nối tiếp
                </Button>
              )}
              <Button
                variant="outline"
                asChild
              >
                <a href={visibleVideos[0].url} download target="_blank" rel="noopener noreferrer">
                  <Download className="w-4 h-4 mr-2" />
                  Tải xuống
                </a>
              </Button>
              <Button
                variant="outline"
                onClick={() => setHiddenVideoUrls(prev => new Set(prev).add(visibleVideos[0].url))}
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 dark:border-red-900/50"
              >
                <X className="w-4 h-4 mr-2" />
                Đóng video này
              </Button>
            </div>
          </div>
        )}

        {/* EMPTY STATE */}
        {!isGenerating && visibleVideos.length === 0 && !errorDetails && (
          <div className="text-center text-muted-foreground z-10">
            <Video className="h-16 w-16 mx-auto mb-4 text-zinc-300 dark:text-zinc-700" />
            <p>Video tạo thành công sẽ hiển thị ở đây</p>
          </div>
        )}

      </div>

      <ImageLibraryModal
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        onImageSelect={handleLibrarySelect}
      />

      {/* HIDDEN INPUT */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={onFileInputChange}
        accept="image/*"
        className="hidden"
      />
    </div>
  );
}
