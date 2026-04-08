'use client';

import { useState, useRef, ChangeEvent, DragEvent, useEffect, useCallback } from 'react';
import { recordUsage, estimateTokens } from '@/lib/usage-tracker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, UploadCloud, Video, Heart, Download, Play, Sparkles, ArrowRight, Images, Library, Settings, X, Link2, Plus, ChevronUp, ChevronDown, Wand2, ImageIcon } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Separator } from "@/components/ui/separator";
import { CostEstimationPanel } from "./cost-estimation-panel";

// Types
type InputMode = 'standard' | 'before-after';
type VideoClip = { url: string; duration: string; geminiFileUri?: string | null; prompt?: string; originalVeoUrl?: string | null; aspectRatio?: string };

// Model definitions for display
const MODEL_OPTIONS = [
  { value: 'veo-3.1-generate-preview', label: 'iGen Veo 3.1 HQ', desc: 'Chất lượng cao nhất' },
  { value: 'veo-3.1-fast-generate-preview', label: 'iGen Veo 3.1 Nhanh', desc: 'Tốc độ nhanh, chất lượng tốt' },
  { value: 'veo-3.1-lite-generate-preview', label: 'iGen Veo 3.1 Lite', desc: 'Tiết kiệm chi phí' },
  { value: 'veo-3.0-generate-001', label: 'iGen Veo 3.0', desc: 'Phiên bản Veo 3 chuẩn' },
  { value: 'veo-3.0-fast-generate-001', label: 'iGen Veo 3.0 Fast', desc: 'Veo 3 tốc độ cao' },
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
  { value: '4K', label: '4K (UHD)' },
  { value: '1080p', label: '1080p (Full HD)' },
  { value: '720p', label: '720p (HD)' },
];

const VIDEO_TEMPLATES = [
  { id: 'none', label: 'Tùy chỉnh (Tự nhập)', prompt: '' },
  { id: 'cinematic', label: '🎬 Điện ảnh (Cinematic)', prompt: 'Cảnh quan hùng vĩ, ánh sáng hoàng hôn ấm áp, máy quay bay cao lướt qua những ngọn núi tuyết, phong cách Flycam.' },
  { id: 'product', label: '📦 Quay sản phẩm (Creative)', prompt: 'Quay cận cảnh sản phẩm thời trang, máy quay xoay tròn 360 độ, ánh sáng studio chuyên nghiệp, phông nền tối giản, chuyển động mượt mà.' },
  { id: 'fashion', label: '👗 Fashion Walk', prompt: 'Người mẫu đi bộ trên sàn runway, ánh sáng đèn flash lung linh, bối cảnh studio cao cấp, chuyển động slow-motion.' },
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

  // Prompt generation states
  const [promptModel, setPromptModel] = useState('gemini-3.1-flash-lite-preview');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('none');

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

  // Use refs for stable callback dependencies
  const userRef = useRef(user);
  const videoModelRef = useRef(videoModel);
  const videoAspectRatioRef = useRef(videoAspectRatio);
  const videoDurationRef = useRef(videoDuration);

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { videoModelRef.current = videoModel; }, [videoModel]);
  useEffect(() => { videoAspectRatioRef.current = videoAspectRatio; }, [videoAspectRatio]);
  useEffect(() => { videoDurationRef.current = videoDuration; }, [videoDuration]);

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

  const saveVideoToFirebase = useCallback(async (videoUrl: string, finalPrompt: string) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    try {
      // Store the ORIGINAL Veo URL for future video extension (Veo requires its own generated URLs)
      const originalVeoUrl = videoUrl;

      const proxyUrl = `/api/proxy-video?url=${encodeURIComponent(videoUrl)}`;
      const response = await fetch(proxyUrl);
      const blob = await response.blob();
      const fileName = `generated-video-${Date.now()}.mp4`;
      const videoRef = storageRef(storage, `users/${currentUser.uid}/generated-videos/${fileName}`);
      await uploadBytes(videoRef, blob);
      const downloadURL = await getDownloadURL(videoRef);

      await addDoc(collection(firestore, 'generatedVideos'), {
        ownerId: currentUser.uid,
        prompt: finalPrompt,
        videoUrl: downloadURL,
        originalVeoUrl: originalVeoUrl, // CRITICAL: needed for extend/continuation
        aspectRatio: videoAspectRatioRef.current,
        modelName: videoModelRef.current,
        createdAt: serverTimestamp(),
      });
      // Track usage for cost analytics
      recordUsage({
        userId: currentUser.uid,
        userEmail: currentUser.email || '',
        type: 'video',
        model: videoModelRef.current,
        amount: Number(videoDurationRef.current) || 8,
        prompt: finalPrompt,
      });
    } catch (err) {
      console.error('Save error', err);
    }
  }, []);

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
                duration: videoDurationRef.current + 's',
                prompt: promptRef.current,
                originalVeoUrl: result.videoUrl,
                aspectRatio: videoAspectRatioRef.current
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  };

  const handleGenerateOptimalPrompt = async () => {
    if (!prompt.trim()) {
      toast({ variant: 'destructive', title: 'Thiếu mô tả', description: 'Vui lòng nhập mô tả ý tưởng trước khi tối ưu.' });
      return;
    }
    
    setIsGeneratingPrompt(true);
    try {
      const referenceImageUris: string[] = [];
      if (activeMode === 'standard' && standardImage) referenceImageUris.push(standardImage);
      if (activeMode === 'before-after' && beforeImage) referenceImageUris.push(beforeImage);

      const result = await videoScriptGeneration({
        description: prompt,
        imageUris: referenceImageUris.length > 0 ? referenceImageUris : undefined,
        model: promptModel,
        apiKey: userData?.geminiApiKey,
      });
      setPrompt(result.optimized_english_prompt);
      
      if (user) {
        // Use amount: 1 for flat pricing (fixed cost per generation)
        recordUsage({
          userId: user.uid,
          userEmail: user.email || '',
          type: 'text',
          model: promptModel,
          amount: 1,
          prompt: prompt,
        });
      }
      
      toast({ title: '✅ Đã tối ưu kịch bản!' });
    } catch (error: any) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Lỗi tạo prompt', description: error.message });
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

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

        // Deduct credits for auto-prompt optimization (flat 1 unit)
        if (user) {
          recordUsage({
            userId: user.uid,
            userEmail: user.email || '',
            type: 'text',
            model: 'gemini-3.1-flash-lite-preview',
            amount: 1,
            prompt: `Part 1: ${extendVideoPrompt}. Part 2: ${prompt}`,
          });
        }
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

          // Deduct credits for auto-prompt optimization (flat 1 unit)
          if (user) {
            recordUsage({
              userId: user.uid,
              userEmail: user.email || '',
              type: 'text',
              model: 'gemini-3.1-flash-lite-preview',
              amount: 1,
              prompt: prompt || 'Video description',
            });
          }
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

  // Helpers
  const currentModelLabel = MODEL_OPTIONS.find(m => m.value === videoModel)?.label || videoModel;
  const hasNoCredit = (userData?.credits ?? 0) <= 0 && userData?.role !== 'Admin';
  const isBusy = !!isGenerating || !!isUploading || hasNoCredit;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
      <div className="lg:col-span-1">
        <Card className="border shadow-sm overflow-hidden">
          <CardContent className="p-5 space-y-6">

            {/* MODE SWITCHER */}
            <div className="flex justify-center mb-2">
              <div className="inline-flex items-center p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                <button
                  onClick={() => setActiveMode('standard')}
                  className={cn(
                    "px-4 py-1.5 text-[11px] font-bold rounded-md transition-all",
                    activeMode === 'standard' ? "bg-white dark:bg-zinc-900 shadow-sm text-cyan-600" : "text-zinc-500 hover:text-zinc-700"
                  )}
                >
                  Tiêu chuẩn
                </button>
                <button
                  onClick={() => setActiveMode('before-after')}
                  className={cn(
                    "px-4 py-1.5 text-[11px] font-bold rounded-md transition-all",
                    activeMode === 'before-after' ? "bg-white dark:bg-zinc-900 shadow-sm text-cyan-600" : "text-zinc-500 hover:text-zinc-700"
                  )}
                >
                  Trước / Sau
                </button>
              </div>
            </div>

            {/* SECTION: INPUT IMAGE */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Ảnh đầu vào</Label>
                {activeMode === 'standard' && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => { setUploadTarget('standard'); setIsLibraryOpen(true); }}
                    className="h-8 px-3 rounded-lg border-zinc-200 bg-zinc-50/50 hover:bg-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800"
                  >
                    <Library className="w-3.5 h-3.5 mr-2 text-zinc-500" />
                    <span className="text-xs font-semibold">Thư viện</span>
                  </Button>
                )}
              </div>

              {activeMode === 'standard' ? (
                <div
                  onClick={() => { setUploadTarget('standard'); fileInputRef.current?.click(); }}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); if(e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0], 'standard'); }}
                  className="w-full aspect-[2/1] bg-zinc-50/30 dark:bg-zinc-950/20 border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-cyan-400/50 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden group"
                >
                  {standardImage ? (
                    <>
                      <Image src={standardImage} alt="Input" fill className="object-cover" />
                      <button onClick={(e) => { e.stopPropagation(); setStandardImage(null); }} className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500 text-white rounded-full backdrop-blur-md z-10"><X className="w-3.5 h-3.5" /></button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center text-center px-4">
                      <div className="w-10 h-10 mb-2 rounded-xl bg-white dark:bg-zinc-900 shadow-sm border border-zinc-100 dark:border-zinc-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                        {isUploading === 'standard' ? <Loader2 className="w-5 h-5 animate-spin text-cyan-500" /> : <UploadCloud className="w-5 h-5 text-zinc-400 group-hover:text-cyan-500" />}
                      </div>
                      <p className="text-[10px] text-zinc-400 font-medium">Nhấp hoặc kéo thả ảnh để tải lên</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {/* BEFORE SLOT */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-tight">Bắt đầu</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={(e) => { e.stopPropagation(); setUploadTarget('before'); setIsLibraryOpen(true); }}
                        className="h-7 px-2 rounded-md hover:bg-cyan-50 hover:text-cyan-600 text-zinc-400"
                      >
                        <Library className="w-3.5 h-3.5 mr-1" />
                        <span className="text-[10px] font-bold">Thư viện</span>
                      </Button>
                    </div>
                    <div
                      onClick={() => { setUploadTarget('before'); fileInputRef.current?.click(); }}
                      className="aspect-square bg-zinc-50/30 dark:bg-zinc-950/20 border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-cyan-400/50 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden group"
                    >
                      {beforeImage ? (
                        <>
                          <Image src={beforeImage} alt="Before" fill className="object-cover" />
                          <button onClick={(e) => { e.stopPropagation(); setBeforeImage(null); }} className="absolute top-1 right-1 p-1 bg-black/50 hover:bg-red-500 text-white rounded-full backdrop-blur-sm z-10 transition-colors"><X className="w-3 h-3" /></button>
                        </>
                      ) : (
                        <div className="flex flex-col items-center">
                          <UploadCloud className="w-4 h-4 text-zinc-400 mb-1 group-hover:text-cyan-500 transition-colors" />
                          <span className="text-[8px] text-zinc-400 font-medium">Tải lên</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* AFTER SLOT */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-tight">Kết thúc</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={(e) => { e.stopPropagation(); setUploadTarget('after'); setIsLibraryOpen(true); }}
                        className="h-7 px-2 rounded-md hover:bg-cyan-50 hover:text-cyan-600 text-zinc-400"
                      >
                        <Library className="w-3.5 h-3.5 mr-1" />
                        <span className="text-[10px] font-bold">Thư viện</span>
                      </Button>
                    </div>
                    <div
                      onClick={() => { setUploadTarget('after'); fileInputRef.current?.click(); }}
                      className="aspect-square bg-zinc-50/30 dark:bg-zinc-950/20 border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-cyan-400/50 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden group"
                    >
                      {afterImage ? (
                        <>
                          <Image src={afterImage} alt="After" fill className="object-cover" />
                          <button onClick={(e) => { e.stopPropagation(); setAfterImage(null); }} className="absolute top-1 right-1 p-1 bg-black/50 hover:bg-red-500 text-white rounded-full backdrop-blur-sm z-10 transition-colors"><X className="w-3 h-3" /></button>
                        </>
                      ) : (
                        <div className="flex flex-col items-center">
                          <UploadCloud className="w-4 h-4 text-zinc-400 mb-1 group-hover:text-cyan-500 transition-colors" />
                          <span className="text-[8px] text-zinc-400 font-medium">Tải lên</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Separator className="bg-zinc-100 dark:bg-zinc-800" />

            {/* SECTION: IDEAS */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Ý tưởng của bạn</Label>
                <Select 
                  value={selectedTemplate} 
                  onValueChange={(val) => {
                    setSelectedTemplate(val);
                    const template = VIDEO_TEMPLATES.find(t => t.id === val);
                    if (template && template.prompt) setPrompt(template.prompt);
                  }}
                >
                  <SelectTrigger className="h-7 w-32 text-[10px] font-bold rounded-md border-zinc-200 bg-zinc-50/50">
                    <SelectValue placeholder="Chọn mẫu" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg">
                    {VIDEO_TEMPLATES.map(t => <SelectItem key={t.id} value={t.id} className="text-[10px] font-medium">{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Mô tả ngắn gọn nội dung video bạn muốn..."
                className="min-h-[90px] text-xs rounded-xl border-zinc-200 bg-white dark:bg-zinc-900/50 dark:border-zinc-800 focus:ring-cyan-500/20 transition-all resize-none p-3"
              />
            </div>

            {/* SECTION: PROMPT MODEL & OPTIMIZER */}
            <div className="space-y-3 bg-zinc-50/50 dark:bg-zinc-900/30 p-3 rounded-2xl border border-zinc-100 dark:border-zinc-800/50">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-tight">Model tối ưu</Label>
                <Select value={promptModel} onValueChange={setPromptModel}>
                  <SelectTrigger className="h-6 w-32 text-[9px] font-bold border-none bg-transparent shadow-none p-0 flex justify-end">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg">
                    <SelectItem value="gemini-3.1-pro-preview" className="text-[10px]">Gemini 3.1 Pro</SelectItem>
                    <SelectItem value="gemini-3.1-flash-lite-preview" className="text-[10px]">Gemini 3.1 Lite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Button 
                onClick={handleGenerateOptimalPrompt} 
                disabled={isGeneratingPrompt || !prompt.trim()}
                className="w-full h-9 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 border border-cyan-500/20 font-bold text-xs transition-all shadow-none"
              >
                {isGeneratingPrompt ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 mr-2" />}
                Tối ưu kịch bản
              </Button>
            </div>

            <Separator className="bg-zinc-100 dark:bg-zinc-800" />

            {/* SECTION: VIDEO SETTINGS */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-zinc-500 uppercase tracking-tight">Mô hình AI</Label>
                <Select value={videoModel} onValueChange={setVideoModel}>
                  <SelectTrigger className="h-9 rounded-xl border-zinc-200 bg-zinc-50/50 text-xs font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {(activeMode === 'before-after' ? MODEL_OPTIONS.filter(opt => !opt.value.includes('veo-2')) : MODEL_OPTIONS).map(opt => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs font-medium">{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight">Khung hình</Label>
                  <Select value={videoAspectRatio} onValueChange={(val: any) => setVideoAspectRatio(val)}>
                    <SelectTrigger className="h-9 rounded-xl border-zinc-200 bg-zinc-50/50 text-xs font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl text-xs">
                      <SelectItem value="16:9">16:9 Ngang</SelectItem>
                      <SelectItem value="9:16">9:16 Dọc</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight">Thời lượng</Label>
                  <Select value={videoDuration} onValueChange={setVideoDuration}>
                    <SelectTrigger className="h-9 rounded-xl border-zinc-200 bg-zinc-50/50 text-xs font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl text-xs">
                      {durationOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight">Độ phân giải</Label>
                <div className="grid grid-cols-2 gap-2">
                  {QUALITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => !isVeo2Selected && setVideoQuality(opt.value)}
                      disabled={isVeo2Selected}
                      className={cn(
                        "h-9 rounded-xl border text-[10px] font-bold transition-all",
                        videoQuality === opt.value 
                          ? "bg-cyan-50 border-cyan-500 text-cyan-600 shadow-sm" 
                          : "border-zinc-200 bg-zinc-50/50 text-zinc-400 hover:bg-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800",
                        isVeo2Selected && "opacity-40 cursor-not-allowed grayscale"
                      )}
                    >
                      {opt.label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2">
              <CostEstimationPanel 
                items={[
                  { model: videoModel, amount: parseInt(videoDuration) || 0, options: { resolution: videoQuality } },
                  // Dựa trên text hiện tại + số ảnh đang có để ước tính token input, output khoảng 3x-4x text
                  ...(prompt.trim() || standardImage || beforeImage ? [{ 
                    model: promptModel, 
                    amount: estimateTokens(prompt) * 4 + 150,
                    inputAmount: estimateTokens(prompt) + ((activeMode === 'standard' && standardImage ? 1 : 0) + (activeMode === 'before-after' && (beforeImage || afterImage) ? 2 : 0)) * 262
                  }] : [])
                ]}
                title="Dự kiến tiêu thụ"
              />
            </div>

            {/* ACTION BUTTON */}
            <Button
              size="lg"
              onClick={handleGenerate}
              disabled={isBusy}
              className="w-full h-11 rounded-2xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all mt-4"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> Tạo Video Ngay</>
              )}
            </Button>

            <p className="text-[9px] text-zinc-400 text-center font-medium">
              Model: <span className="text-zinc-600 dark:text-zinc-300 uppercase">{currentModelLabel}</span>
            </p>

          </CardContent>
        </Card>
      </div>

      {/* RIGHT PANEL: PREVIEW & OUTPUT */}
      <div className="lg:col-span-2 bg-muted/30 dark:bg-zinc-900/30 rounded-[32px] border border-zinc-200/50 dark:border-zinc-800/50 flex flex-col items-center justify-center min-h-[450px] lg:min-h-0 p-6 relative overflow-hidden backdrop-blur-sm">

        {/* GENERATING SKELETON */}
        {isGenerating && (() => {
          const STAGE_TIMES = { script: 10, uploading: 5, rendering: 120 };
          const TOTAL_ESTIMATED = STAGE_TIMES.script + STAGE_TIMES.uploading + STAGE_TIMES.rendering;

          let estimatedPercent = 0;
          if (generationStage === 'script') {
            estimatedPercent = Math.min((elapsedTime / STAGE_TIMES.script) * 7, 7);
          } else if (generationStage === 'uploading') {
            estimatedPercent = 7 + Math.min(((elapsedTime - STAGE_TIMES.script) / STAGE_TIMES.uploading) * 5, 5);
          } else if (generationStage === 'rendering') {
            const renderStart = STAGE_TIMES.script + STAGE_TIMES.uploading;
            const renderElapsed = Math.max(0, elapsedTime - renderStart);
            estimatedPercent = 12 + Math.min((renderElapsed / STAGE_TIMES.rendering) * 83, 83);
          }
          estimatedPercent = Math.min(Math.round(estimatedPercent), 95);

          const estimatedRemaining = Math.max(0, TOTAL_ESTIMATED - elapsedTime);
          const remainMin = Math.floor(estimatedRemaining / 60);
          const remainSec = estimatedRemaining % 60;

          const stageLabel = generationStage === 'script' ? 'Đang tối ưu kịch bản'
            : generationStage === 'uploading' ? 'Đang gửi yêu cầu'
            : generationStage === 'rendering' ? 'Đang render video'
            : 'Đang chuẩn bị';

          return (
            <div className="flex flex-col items-center w-full z-10 max-w-xl animate-in fade-in zoom-in-95 duration-500">
              <div className={cn(
                "relative rounded-[2rem] overflow-hidden shadow-2xl w-full flex flex-col items-center justify-center border-4 border-white dark:border-zinc-800 bg-white dark:bg-zinc-950",
                videoAspectRatio === '9:16' ? "max-w-[280px] aspect-[9/16] mx-auto" : "aspect-video"
              )}>
                {(standardImage || beforeImage) && (
                  <img src={standardImage || beforeImage!} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-10 blur-xl scale-110" />
                )}

                <div className="relative z-10 flex flex-col items-center justify-center gap-6 p-8 w-full text-center">
                  <div className="relative w-24 h-24">
                    <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="4" className="text-zinc-100 dark:text-zinc-800" />
                      <circle
                        cx="50" cy="50" r="45"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={283}
                        strokeDashoffset={283 * (1 - estimatedPercent / 100)}
                        className="text-cyan-500 transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl font-black text-zinc-800 dark:text-zinc-100 tabular-nums">{estimatedPercent}%</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 tracking-tight animate-pulse">{stageLabel}...</h3>
                    <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">
                      {estimatedRemaining > 0 ? `~ ${remainMin > 0 ? `${remainMin}P ` : ''}${remainSec}S còn lại` : 'Sắp xong...'}
                    </p>
                  </div>

                  <div className="w-full max-w-[180px] h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500 transition-all duration-1000 ease-out" style={{ width: `${estimatedPercent}%` }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ERROR MESSAGE */}
        {errorDetails && (
          <div className="w-full max-w-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 p-6 rounded-[2rem] flex flex-col items-center text-center gap-3 animate-in slide-in-from-bottom-4 duration-500">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/50 rounded-2xl flex items-center justify-center text-red-600">
              <X className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-bold text-red-800 dark:text-red-400">Không thể tạo video</h4>
            <p className="text-sm text-red-600/80 dark:text-red-400/80">{errorDetails}</p>
            <Button onClick={() => setErrorDetails(null)} variant="outline" className="mt-2 rounded-xl text-red-600 border-red-200">Thử lại</Button>
          </div>
        )}

        {/* OUTPUT */}
        {!isGenerating && visibleVideos.length > 0 && (
          <div className="flex flex-col items-center w-full z-10 max-w-2xl animate-in fade-in zoom-in-95 duration-500">
            <div className={cn(
              "relative bg-black rounded-[2rem] overflow-hidden shadow-2xl border-4 border-white dark:border-zinc-800 w-full",
              visibleVideos[0].aspectRatio === '9:16' ? "max-w-[280px] aspect-[9/16] mx-auto" : "aspect-video"
            )}>
              <video src={visibleVideos[0].url} className="w-full h-full object-cover" controls playsInline autoPlay muted loop />
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {visibleVideos[0].originalVeoUrl && (
                <Button
                  onClick={() => activateExtendMode(visibleVideos[0])}
                  className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 rounded-xl px-6 font-bold text-xs"
                >
                  <Link2 className="w-4 h-4 mr-2" /> Nối tiếp
                </Button>
              )}
              <Button asChild variant="outline" className="rounded-xl px-6 font-bold text-xs border-zinc-200">
                <a href={visibleVideos[0].url} download target="_blank" rel="noopener noreferrer">
                  <Download className="w-4 h-4 mr-2" /> Tải về
                </a>
              </Button>
              <Button
                variant="ghost"
                onClick={() => setHiddenVideoUrls(prev => new Set(prev).add(visibleVideos[0].url))}
                className="text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-xl"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* EMPTY STATE */}
        {!isGenerating && visibleVideos.length === 0 && !errorDetails && (
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-900 rounded-3xl flex items-center justify-center mx-auto transition-transform hover:scale-105 duration-300">
              <Video className="w-10 h-10 text-zinc-300 dark:text-zinc-700" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Sẵn sàng sáng tạo</h3>
              <p className="text-xs text-zinc-400/60">Tải ảnh và nhập ý tưởng để bắt đầu</p>
            </div>
          </div>
        )}
      </div>

      <ImageLibraryModal open={isLibraryOpen} onOpenChange={setIsLibraryOpen} onImageSelect={handleLibrarySelect} />
      <input type="file" ref={fileInputRef} onChange={onFileInputChange} accept="image/*" className="hidden" />
    </div>
  );
}
