'use client';

import { useState, useRef, ChangeEvent, DragEvent, useEffect, useCallback } from 'react';
import { recordUsage, estimateTokens } from '@/lib/usage-tracker';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Video, X, UploadCloud, Wand2, Copy, Images, Download, ArrowRight, ImagePlus, ChevronDown, ChevronUp, Play, Pencil, Paperclip, Plus, Heart, Mic } from 'lucide-react';
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
import { CostEstimationPanel } from "./cost-estimation-panel";
import { ImageLibraryModal } from '@/components/modals/image-library-modal';
import { Card, CardContent } from './ui/card';
import { Separator } from './ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { VideoEditorModal, type VideoEditorSubmitParams } from '@/components/modals/video-editor-modal';
import { generateWizardQuestion, compileWizardPrompt } from '@/ai/flows/interactive-prompt-wizard-flow';

// Input mode types
type InputMode = 'standard' | 'before-after';

export function VideoGenerationWorkspace() {
  const VIDEO_TEMPLATES = [
    { id: 'none', label: 'Tùy chỉnh (Tự nhập)', prompt: '' },
    { id: 'fashion_promo', label: '👗 Lookbook Thời trang', prompt: 'Video lookbook thời trang quay chậm (slow motion) của người mẫu đang bước đi tự tin mặc [SẢN PHẨM], phong cách cinematic, ánh sáng studio, chuyên nghiệp' },
    { id: 'product_showcase', label: '📦 Giới thiệu sản phẩm', prompt: 'Cảnh quay cận cảnh (macro) xoay quanh [SẢN PHẨM], tôn vinh chất liệu và thiết kế, ánh sáng mềm mại, background nền nã sang trọng' },
    { id: 'realestate_tour', label: '🏢 Flycam Bất động sản', prompt: 'Cảnh quay flycam (drone) mượt mà lướt qua qua dự án [TÊN DỰ ÁN], thời điểm hoàng hôn (golden hour), kiến trúc hiện đại, không gian đắt giá' },
    { id: 'fnb_making', label: '🍔 Quá trình chế biến (F&B)', prompt: 'Cảnh quay cinematic quá trình chế biến món [MÓN ĂN], nước sốt đang nhỏ xuống hấp dẫn, khói bốc lên mờ ảo, 120fps slow-motion' },
    { id: 'corporate', label: '🤝 Giới thiệu doanh nghiệp', prompt: 'Cảnh quay văn phòng làm việc hiện đại của [CÔNG TY], nhân viên đang thảo luận nhiệt tình vui vẻ, ánh sáng tự nhiên đầy hứng khởi, nhịp độ năng động' },
    { id: 'event_highlight', label: '🎉 Recap Sự kiện', prompt: 'Video tổng hợp khoảnh khắc ấn tượng nhất tại sự kiện [TÊN SỰ KIỆN], góc quay đa dạng, người tham gia vui mừng, không khí cực kỳ sôi động' },
  ];


  const BA_VIDEO_TEMPLATES = [
    { id: 'none', label: 'Tùy chỉnh (Tự nhập)', prompt: '' },
    { id: 'interior', label: '🛋️ Nội thất', prompt: 'Video chuyển đổi mượt mà từ căn phòng thô ráp sang một không gian tuyệt đẹp, đầy đủ nội thất sang trọng với ánh sáng ấm áp.' },
    { id: 'makeover', label: '💄 Trang điểm', prompt: 'Sự biến đổi ngoạn mục từ khuôn mặt mộc tự nhiên sang phong cách trang điểm lộng lẫy, sắc nét, chuyển cảnh mượt mà.' },
    { id: 'restoration', label: '🛠️ Phục hồi', prompt: 'Từ một đồ vật gỉ sét, cũ nát lột xác kỳ diệu thành đồ vật sáng bóng mới tinh, phục hồi hoàn hảo từng góc cạnh.' },
    { id: 'landscape', label: '🌳 Cảnh quan', prompt: 'Sự thay đổi thời gian (timelapse) từ khu đất trống khô cằn thành một không gian sân vườn xanh mướt, ngập tràn sức sống.' },
    { id: 'architecture', label: '🏗️ Kiến trúc', prompt: 'Tiến độ xây dựng tua nhanh từ bãi đất trống trở thành một công trình kiến trúc hiện đại, hoành tráng phản chiếu ánh mặt trời.' },
  ];

  const [selectedTemplate, setSelectedTemplate] = useState('none');
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
  const [scriptModel, setScriptModel] = useState('gemini-3-flash-preview');
  const [videoModel, setVideoModel] = useState('veo-3.1-fast-generate-preview');
  const [videoDuration, setVideoDuration] = useState('8');
  const [frameRate, setFrameRate] = useState('24');
  const [outputResolution, setOutputResolution] = useState('720p');

  // New UI states for redesigned interface
  type VideoClip = { url: string; duration: string; geminiFileUri?: string | null };
  const [videoProject, setVideoProject] = useState<VideoClip[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'images' | 'videos' | 'favorites'>('all');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [isEditingScript, setIsEditingScript] = useState(false);
  const [editorClipUrl, setEditorClipUrl] = useState<string | null>(null);

  // Wizard state
  type WizardQA = { question: string; answer: string };
  const [wizardActive, setWizardActive] = useState(false);
  const [wizardTemplate, setWizardTemplate] = useState<{ id: string; label: string } | null>(null);
  const [wizardAnswers, setWizardAnswers] = useState<WizardQA[]>([]);
  const [wizardCurrentQuestion, setWizardCurrentQuestion] = useState<{ question: string; options: string[]; isDone: boolean; allowImageUpload?: boolean; imageUploadHint?: string } | null>(null);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardCustomInput, setWizardCustomInput] = useState('');
  const [wizardStepImage, setWizardStepImage] = useState<string | null>(null);
  const [wizardUploadingImage, setWizardUploadingImage] = useState(false);
  const wizardFileInputRef = useRef<HTMLInputElement>(null);
  const [wizardVoiceText, setWizardVoiceText] = useState('');
  const [wizardVoiceType, setWizardVoiceType] = useState('Giọng nam ấm áp, lôi cuốn');

  // Before & After mode states
  const [inputMode, setInputMode] = useState<InputMode>('standard');
  const [isBeforeAfterCollapsed, setIsBeforeAfterCollapsed] = useState(false);
  const [beforeImageUrl, setBeforeImageUrl] = useState<string | null>(null);
  const [afterImageUrl, setAfterImageUrl] = useState<string | null>(null);
  const [isUploadingBefore, setIsUploadingBefore] = useState(false);
  const [isUploadingAfter, setIsUploadingAfter] = useState(false);
  const [isDraggingBefore, setIsDraggingBefore] = useState(false);
  const [isDraggingAfter, setIsDraggingAfter] = useState(false);
  const [libraryTarget, setLibraryTarget] = useState<'standard' | 'before' | 'after' | 'wizard'>('standard');

  // Elapsed time counter (like image workspace)
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // New state for async job handling (batch support)
  type BatchOp = {
    id: string;
    operationName: string;
    status: 'processing' | 'completed' | 'failed';
    videoUrl?: string;
    error?: string;
    refImage?: string;
    pollingErrors: number;
  };
  const [batchOperations, setBatchOperations] = useState<BatchOp[]>([]);
  const [operationName, setOperationName] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const pollingErrorsRef = useRef(0);
  const MAX_POLLING_ERRORS = 3;
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const batchPollingRef = useRef<NodeJS.Timeout | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { toast } = useToast();
  const { t } = useI18n();
  const { user, userData } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // FIX #6: Use refs to always access current values in polling callback
  const promptRef = useRef(prompt);
  const userRef = useRef(user);
  const videoModelRef = useRef(videoModel);
  const aspectRatioRef = useRef(aspectRatio);
  // Bypass refs
  const handleGenerateRef = useRef<((isAutoBypass?: boolean) => Promise<void>) | null>(null);
  const editingClipIndexRef = useRef<number | null>(null);
  const isSafetyBypassModeRef = useRef(false);

  useEffect(() => { promptRef.current = prompt; }, [prompt]);
  const [extendingVideoUrl, setExtendingVideoUrl] = useState<string | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { videoModelRef.current = videoModel; }, [videoModel]);
  useEffect(() => { aspectRatioRef.current = aspectRatio; }, [aspectRatio]);

  useEffect(() => {
    if (inputMode === 'before-after' && videoModel === 'veo-2.0-generate-001') {
      setVideoModel('veo-3.1-fast-generate-preview');
    }
  }, [inputMode, videoModel]);

  const cleanupPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (batchPollingRef.current) {
      clearInterval(batchPollingRef.current);
      batchPollingRef.current = null;
    }
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // FIX #6: Save video to Firebase using refs for current values
  const saveVideoToFirebase = useCallback(async (videoUrl: string) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    setIsSaving(true);
    try {
      // Fetch the video blob via our internal proxy to bypass CORS
      const proxyUrl = `/api/proxy-video?url=${encodeURIComponent(videoUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error(`Lỗi tải video từ server: ${response.statusText}`);
      const blob = await response.blob();

      const fileName = `generated-video-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`;
      const videoRef = storageRef(storage, `users/${currentUser.uid}/generated-videos/${fileName}`);
      await uploadBytes(videoRef, blob);
      const downloadURL = await getDownloadURL(videoRef);

      let geminiFileUri = null;
      if (videoUrl.includes('generativelanguage.googleapis.com')) {
        const match = videoUrl.match(/(https:\/\/generativelanguage\.googleapis\.com\/v1beta\/files\/[a-zA-Z0-9]+)/);
        if (match) {
          geminiFileUri = match[1];
        }
      }

      await addDoc(collection(firestore, 'generatedVideos'), {
        ownerId: currentUser.uid,
        prompt: promptRef.current,
        videoUrl: downloadURL,
        geminiFileUri: geminiFileUri,
        aspectRatio: aspectRatioRef.current,
        modelName: videoModelRef.current,
        createdAt: serverTimestamp(),
      });

      toast({ title: '💾 Đã lưu video', description: 'Video đã được lưu vào thư viện của bạn.' });
      // Track usage for cost analytics
      recordUsage({
        userId: currentUser.uid,
        userEmail: currentUser.email || '',
        type: 'video',
        model: videoModelRef.current,
        amount: Number(videoDuration) || 8,
        prompt: promptRef.current,
      });
    } catch (saveError: any) {
      console.error('[VideoGen] Failed to save video to Firebase:', saveError);
      toast({ variant: 'destructive', title: 'Lỗi lưu trữ', description: `Tạo video thành công nhưng không thể lưu: ${saveError.message}` });
    } finally {
      setIsSaving(false);
    }
  }, [toast]); // Only depends on toast (stable from hook)

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
              // Add or replace clip to the project timeline
              setVideoProject(prev => {
                const editIdx = editingClipIndexRef.current;
                if (editIdx !== null) {
                  const newProject = [...prev];
                  newProject[editIdx] = { url: result.videoUrl!, duration: videoDuration + 's' };
                  return newProject;
                }
                return [...prev, { url: result.videoUrl!, duration: videoDuration + 's' }];
              });
              setExtendingVideoUrl(null); // Clear extend mode after successful generation
              editingClipIndexRef.current = null; // Clear edit index
              // Save to Firebase Storage → Firestore
              saveVideoToFirebase(result.videoUrl);
            }

            if (result.error) {
              setErrorDetails(result.error || null);
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
            const errorMsg = result.error || "Đã xảy ra lỗi không xác định.";

            // === AUTO-BYPASS LRO SAFETY ERROR ===
            const isCelebrityError = errorMsg.toLowerCase().includes('celebrity') ||
              errorMsg.toLowerCase().includes('likeness') ||
              errorMsg.toLowerCase().includes('children') ||
              errorMsg.toLowerCase().includes('bộ lọc an toàn');

            if (isCelebrityError && !isSafetyBypassModeRef.current && (inputImageUrls.length > 0 || inputMode === 'before-after')) {
              console.warn(`[VideoGen Poll] Detected RAI safety block. Auto-retrying without reference image...`);
              isSafetyBypassModeRef.current = true;
              toast({
                title: "Vượt qua bộ lọc an toàn...",
                description: "Đang tự động khởi tạo lại video chỉ dựa trên kịch bản chữ (bỏ qua ảnh gốc).",
                defaultOpen: true
              });
              cleanupPolling();
              setOperationName(null);
              if (handleGenerateRef.current) {
                handleGenerateRef.current(true);
              }
              return; // Skip normal failure flow
            }

            setJobStatus('failed');
            stopTimer();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationName, jobStatus, userData?.geminiApiKey, saveVideoToFirebase]);

  // ── BATCH POLLING: Poll all pending batch operations ──
  useEffect(() => {
    const hasPending = batchOperations.some(op => op.status === 'processing');
    if (!hasPending || jobStatus !== 'processing') return;

    batchPollingRef.current = setInterval(async () => {
      let updated = false;

      const updatedOps = await Promise.all(
        batchOperations.map(async (op) => {
          if (op.status !== 'processing') return op;

          try {
            const result = await checkVideoStatus(op.operationName, userData?.geminiApiKey || '');

            if (result.status === 'completed' && result.videoUrl) {
              updated = true;
              setGeneratedVideoUrls(prev => [...prev, result.videoUrl!]);
              setVideoProject(prev => [...prev, { url: result.videoUrl!, duration: videoDuration + 's' }]);
              saveVideoToFirebase(result.videoUrl);
              toast({ title: `✅ Video hoàn tất!`, description: `1 video mới đã sẵn sàng.` });
              return { ...op, status: 'completed' as const, videoUrl: result.videoUrl };
            } else if (result.status === 'failed') {
              updated = true;
              const errorMsg = result.error || 'Unknown error';
              console.warn(`[Batch Poll] Op ${op.id} failed:`, errorMsg);

              // ── RAI SAFETY AUTO-BYPASS: Retry without reference image ──
              const isRaiError = errorMsg.toLowerCase().includes('safety') ||
                errorMsg.toLowerCase().includes('rai') ||
                errorMsg.toLowerCase().includes('policy') ||
                errorMsg.toLowerCase().includes('celebrity') ||
                errorMsg.toLowerCase().includes('likeness') ||
                errorMsg.toLowerCase().includes('filtered');

              if (isRaiError && op.refImage && !op.id.includes('-retry')) {
                console.log(`[Batch Poll] RAI detected for op ${op.id}. Auto-retrying text-only...`);
                toast({ title: '🔄 Vượt bộ lọc an toàn...', description: 'Đang thử lại 1 video không dùng ảnh tham chiếu.' });

                try {
                  // Build prompt from current state
                  const retryPrompt = promptRef.current || '';
                  const retryResult = await startVideoGeneration({
                    textPrompt: retryPrompt,
                    referenceImageUris: undefined, // No image → bypass RAI
                    referenceVideoUri: undefined,
                    afterImageUri: undefined,
                    aspectRatio: aspectRatioRef.current,
                    modelName: videoModelRef.current,
                    userId: user!.uid,
                    apiKey: userData?.geminiApiKey || '',
                    durationSeconds: videoDuration,
                    frameRate: videoModelRef.current.includes('veo-2') ? frameRate : undefined,
                    resolution: !videoModelRef.current.includes('veo-2') ? outputResolution : undefined,
                  });

                  if (retryResult.status === 'processing' && retryResult.operationName) {
                    return { ...op, id: op.id + '-retry', operationName: retryResult.operationName, status: 'processing' as const, refImage: undefined, pollingErrors: 0 };
                  } else if (retryResult.status === 'completed' && retryResult.videoUrl) {
                    setGeneratedVideoUrls(prev => [...prev, retryResult.videoUrl!]);
                    setVideoProject(prev => [...prev, { url: retryResult.videoUrl!, duration: videoDuration + 's' }]);
                    saveVideoToFirebase(retryResult.videoUrl);
                    return { ...op, id: op.id + '-retry', status: 'completed' as const, videoUrl: retryResult.videoUrl };
                  }
                } catch (retryErr: any) {
                  console.error(`[Batch Poll] Retry failed for op ${op.id}:`, retryErr.message);
                }
              }

              return { ...op, status: 'failed' as const, error: errorMsg };
            }
            return op; // Still processing
          } catch (err: any) {
            const newErrors = op.pollingErrors + 1;
            if (newErrors >= MAX_POLLING_ERRORS) {
              updated = true;
              return { ...op, status: 'failed' as const, error: 'Mất kết nối', pollingErrors: newErrors };
            }
            return { ...op, pollingErrors: newErrors };
          }
        })
      );

      if (updated) {
        setBatchOperations(updatedOps);

        const stillPending = updatedOps.filter(op => op.status === 'processing');
        if (stillPending.length === 0) {
          const completedCount = updatedOps.filter(op => op.status === 'completed').length;
          const failedCount = updatedOps.filter(op => op.status === 'failed').length;
          setJobStatus(completedCount > 0 ? 'completed' : 'failed');
          stopTimer();
          if (batchPollingRef.current) {
            clearInterval(batchPollingRef.current);
            batchPollingRef.current = null;
          }
          toast({
            title: `🏁 Hoàn tất tạo video hàng loạt`,
            description: `${completedCount} thành công, ${failedCount} thất bại.`,
          });
        }
      }
    }, 15000);

    return () => {
      if (batchPollingRef.current) {
        clearInterval(batchPollingRef.current);
        batchPollingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchOperations, jobStatus, userData?.geminiApiKey, saveVideoToFirebase]);

  // Effect to adjust settings based on the selected video model and resolution
  useEffect(() => {
    const isVeo2 = videoModel.includes('veo-2');

    if (isVeo2) {
      if (outputResolution !== '720p') {
        setOutputResolution('720p');
      }
      // For Veo 2, ensure duration is valid. Resolution is not configurable by user.
      if (!['5', '6', '8'].includes(videoDuration)) {
        setVideoDuration('8');
      }
    } else { // For Veo 3.x models
      // If resolution is high, duration MUST be 8s.
      if (outputResolution === '1080p') {
        if (videoDuration !== '8') {
          setVideoDuration('8');
          toast({
            title: 'Thời lượng đã tự động điều chỉnh',
            description: 'Độ phân giải 1080p yêu cầu thời lượng video là 8 giây.',
          });
        }
      }
      // If duration is not valid for Veo 3, reset it.
      else if (!['4', '6', '8'].includes(videoDuration)) {
        setVideoDuration('8');
      }
    }
  }, [videoModel, outputResolution, videoDuration, toast]);

  // Effect to ensure Veo 2.0 is not used with before-after mode
  useEffect(() => {
    if (inputMode === 'before-after' && videoModel.includes('veo-2')) {
      setVideoModel('veo-3.1-fast-generate-preview');
      toast({
        title: 'Mô hình đã thay đổi',
        description: 'Chế độ Trước & Sau yêu cầu mô hình từ iGen Veo 3.1 trở lên.',
      });
    }
  }, [inputMode, videoModel, toast]);

  // Reset state when starting a new generation
  const resetGenerationState = () => {
    // If extending, keep the existing project clips. Otherwise reset.
    if (!extendingVideoUrl) {
      setGeneratedVideoUrls([]);
      setVideoProject([]);
    }
    setOperationName(null);
    setBatchOperations([]);
    setJobStatus('idle');
    setErrorDetails(null);
    pollingErrorsRef.current = 0;
    setElapsedTime(0);
    setIsEditingScript(false);
    stopTimer();
    cleanupPolling();
  };

  // Before/After file refs
  const beforeFileInputRef = useRef<HTMLInputElement>(null);
  const afterFileInputRef = useRef<HTMLInputElement>(null);

  // Upload handler for before/after images
  const handleBeforeAfterUpload = async (file: File, target: 'before' | 'after') => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Yêu cầu đăng nhập', description: 'Bạn cần đăng nhập để tải ảnh lên.' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Tệp không hợp lệ', description: `'${file.name}' không phải là một tệp ảnh.` });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File quá lớn', description: `'${file.name}' lớn hơn 4MB.` });
      return;
    }

    if (target === 'before') setIsUploadingBefore(true);
    else setIsUploadingAfter(true);

    try {
      const fileName = `input-${target}-${Date.now()}-${file.name}`;
      const imageRef = storageRef(storage, `users/${user.uid}/inputs/${fileName}`);
      await uploadBytes(imageRef, file);
      const downloadURL = await getDownloadURL(imageRef);
      await addDoc(collection(firestore, 'inputImages'), {
        ownerId: user.uid,
        imageUrl: downloadURL,
        createdAt: serverTimestamp(),
      });

      if (target === 'before') setBeforeImageUrl(downloadURL);
      else setAfterImageUrl(downloadURL);

      toast({ title: `Tải lên ảnh ${target === 'before' ? 'TRƯỚC' : 'SAU'} thành công` });
    } catch (error) {
      console.error('Upload failed:', error);
      toast({ variant: 'destructive', title: 'Lỗi tải ảnh', description: 'Không thể tải ảnh lên.' });
    } finally {
      if (target === 'before') setIsUploadingBefore(false);
      else setIsUploadingAfter(false);
    }
  };

  const handleBeforeAfterDragOver = (event: DragEvent<HTMLDivElement>, target: 'before' | 'after') => {
    event.preventDefault();
    if (target === 'before') setIsDraggingBefore(true);
    else setIsDraggingAfter(true);
  };

  const handleBeforeAfterDragLeave = (event: DragEvent<HTMLDivElement>, target: 'before' | 'after') => {
    event.preventDefault();
    if (target === 'before') setIsDraggingBefore(false);
    else setIsDraggingAfter(false);
  };

  const handleBeforeAfterDrop = (event: DragEvent<HTMLDivElement>, target: 'before' | 'after') => {
    event.preventDefault();
    if (target === 'before') setIsDraggingBefore(false);
    else setIsDraggingAfter(false);
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      handleBeforeAfterUpload(files[0], target);
    }
  };

  const handleBeforeAfterFileChange = (event: ChangeEvent<HTMLInputElement>, target: 'before' | 'after') => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleBeforeAfterUpload(files[0], target);
    }
    if (event.target) event.target.value = '';
  };

  // Handle library image selection for before/after
  const handleImageSelectFromLibraryBA = (imageUrl: string) => {
    if (libraryTarget === 'before') {
      setBeforeImageUrl(imageUrl);
    } else if (libraryTarget === 'after') {
      setAfterImageUrl(imageUrl);
    } else {
      // standard mode
      if (!inputImageUrls.includes(imageUrl)) {
        setInputImageUrls((prevUrls) => [...prevUrls, imageUrl]);
      }
    }
  };

  const handleGenerate = async (bypassParam?: boolean | any, customPrompt?: string) => {
    // If triggered by a real user button click, bypassParam is an Event object, not true.
    const isAutoBypass = bypassParam === true;

    if (!isAutoBypass) {
      isSafetyBypassModeRef.current = false;
    }

    if (inputMode === 'standard' && !prompt.trim() && !scriptDescription.trim() && !customPrompt?.trim()) {
      toast({ variant: 'destructive', title: t('toast.video.noPrompt.title'), description: t('toast.video.noPrompt.description') });
      return;
    }
    if (!userData?.geminiApiKey) {
      toast({
        variant: 'destructive',
        title: 'Thiếu API Key',
        description: 'Vui lòng thêm iGen Key của bạn trong phần cài đặt tài khoản trước khi tạo video.',
      });
      return;
    }
    if (!user) {
      toast({ variant: 'destructive', title: 'Yêu cầu đăng nhập', description: 'Bạn cần đăng nhập để tạo video.' });
      return;
    }

    // Validate before/after mode
    if (inputMode === 'before-after' && !isAutoBypass) {
      if (!beforeImageUrl || !afterImageUrl) {
        toast({ variant: 'destructive', title: 'Thiếu ảnh', description: 'Vui lòng tải lên cả ảnh TRƯỚC và ảnh SAU để tạo video chuyển đổi.' });
        return;
      }
    }

    resetGenerationState();
    setJobStatus('processing');
    setElapsedTime(0);
    // Start elapsed time counter
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    // Smooth scroll to the current project area
    const mainCanvas = document.getElementById('main-canvas');
    if (mainCanvas) mainCanvas.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Build prompt
    let finalPrompt = customPrompt || prompt.trim() || scriptDescription.trim();

    if (wizardVoiceText.trim() && !finalPrompt.includes('[MANDATORY SCRIPT/AUDIO INSTRUCTION]')) {
      const voiceDesc = wizardVoiceType.trim() ? ` a ${wizardVoiceType} voice` : 'a clear voice';
      finalPrompt += `\n\n[MANDATORY SCRIPT/AUDIO INSTRUCTION]: The main character in the scene speaks clearly directly to the camera/audience with ${voiceDesc}. They say EXACTLY the following dialogue: "${wizardVoiceText.trim()}". Their lip movements must perfectly match this dialogue.`;
    }

    // ── BATCH MODE: Multiple images in standard mode (no extend, no before-after) ──
    const isBatchMode = !isAutoBypass && inputMode === 'standard' && inputImageUrls.length > 1 && !extendingVideoUrl;

    if (isBatchMode) {
      console.log(`[VideoGen] BATCH MODE: Spawning ${inputImageUrls.length} parallel video requests.`);
      toast({ title: `🎬 Tạo ${inputImageUrls.length} video hàng loạt...`, description: `Mỗi ảnh tham chiếu sẽ tạo 1 video riêng biệt.` });

      const newBatchOps: BatchOp[] = [];

      // Spawn all requests in parallel
      const promises = inputImageUrls.map(async (imageUrl, idx) => {
        const opId = `batch-${Date.now()}-${idx}`;
        try {
          const result = await startVideoGeneration({
            textPrompt: finalPrompt,
            referenceImageUris: [imageUrl],
            referenceVideoUri: undefined,
            afterImageUri: undefined,
            aspectRatio: aspectRatio,
            modelName: videoModel,
            userId: user.uid,
            apiKey: userData.geminiApiKey,
            durationSeconds: videoDuration,
            frameRate: videoModel.includes('veo-2') ? frameRate : undefined,
            resolution: !videoModel.includes('veo-2') ? outputResolution : undefined,
          });

          if (result.status === 'completed' && result.videoUrl) {
            newBatchOps.push({ id: opId, operationName: '', status: 'completed', videoUrl: result.videoUrl, refImage: imageUrl, pollingErrors: 0 });
            saveVideoToFirebase(result.videoUrl);
          } else if (result.status === 'processing' && result.operationName) {
            newBatchOps.push({ id: opId, operationName: result.operationName, status: 'processing', refImage: imageUrl, pollingErrors: 0 });
          } else {
            newBatchOps.push({ id: opId, operationName: '', status: 'failed', error: result.error || 'Phản hồi không hợp lệ', refImage: imageUrl, pollingErrors: 0 });
          }
        } catch (err: any) {
          console.error(`[VideoGen Batch] Error for image ${idx}:`, err);
          newBatchOps.push({ id: opId, operationName: '', status: 'failed', error: err.message || 'Lỗi không mong muốn', refImage: imageUrl, pollingErrors: 0 });
        }
      });

      await Promise.all(promises);

      // Add already-completed videos to project immediately
      const completedNow = newBatchOps.filter(op => op.status === 'completed' && op.videoUrl);
      if (completedNow.length > 0) {
        setGeneratedVideoUrls(prev => [...prev, ...completedNow.map(op => op.videoUrl!)]);
        setVideoProject(prev => [...prev, ...completedNow.map(op => ({ url: op.videoUrl!, duration: videoDuration + 's' }))]);
      }

      const stillProcessing = newBatchOps.filter(op => op.status === 'processing');
      if (stillProcessing.length === 0) {
        // All done immediately (unlikely but possible)
        const anyFailed = newBatchOps.some(op => op.status === 'failed');
        setJobStatus(anyFailed && completedNow.length === 0 ? 'failed' : 'completed');
        stopTimer();
        if (completedNow.length > 0) {
          toast({ title: `✅ Tạo xong ${completedNow.length}/${inputImageUrls.length} video!` });
        }
      } else {
        setBatchOperations(newBatchOps);
        toast({ title: `⏳ ${stillProcessing.length} video đang xử lý...`, description: `${completedNow.length} đã hoàn tất ngay lập tức.` });
      }

      return; // Exit — batch polling useEffect will handle the rest
    }

    // ── SINGLE MODE (original behavior) ──
    let referenceImages: string[] | undefined;

    if (isAutoBypass === true) {
      referenceImages = undefined;
      finalPrompt = prompt.trim() || '';
      console.log("[VideoGen] Executing text-only fallback generation state...");
    } else if (inputMode === 'before-after' && beforeImageUrl && afterImageUrl) {
      referenceImages = [beforeImageUrl];
      finalPrompt = prompt.trim() || '';
    } else if (inputImageUrls.length > 0) {
      referenceImages = [inputImageUrls[0]]; // Single image → single video
    }

    toast({ title: "Bắt đầu tạo video...", description: "Quá trình này có thể mất vài phút." });

    try {
      const result = await startVideoGeneration({
        textPrompt: finalPrompt,
        referenceImageUris: referenceImages,
        referenceVideoUri: extendingVideoUrl || undefined,
        afterImageUri: (inputMode === 'before-after' && afterImageUrl) ? afterImageUrl : undefined,
        aspectRatio: aspectRatio,
        modelName: videoModel,
        userId: user.uid,
        apiKey: userData.geminiApiKey,
        durationSeconds: videoDuration,
        frameRate: videoModel.includes('veo-2') ? frameRate : undefined,
        resolution: !videoModel.includes('veo-2') ? outputResolution : undefined,
      });

      if (result.status === 'failed') {
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
        setGeneratedVideoUrls([result.videoUrl]);
        setJobStatus('completed');
        stopTimer();
        toast({ title: "✅ Tạo video hoàn tất!", description: "Video của bạn đã sẵn sàng." });
        saveVideoToFirebase(result.videoUrl);
      } else if (result.status === 'processing' && result.operationName) {
        setOperationName(result.operationName);
        toast({ title: "🎬 Video đang được tạo...", description: "Quá trình này có thể mất 2-5 phút." });
      } else {
        setErrorDetails('Phản hồi từ server không hợp lệ.');
        setJobStatus('failed');
        stopTimer();
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

  // Wire up the ref
  handleGenerateRef.current = handleGenerate;

  const resetWorkspaceForExtend = () => {
    setScriptDescription('');
    setInputImageUrls([]);
    setBeforeImageUrl(null);
    setAfterImageUrl(null);
    setSelectedTemplate('none');

    // Veo 2 does not support native extension, force fall-forward to Veo 3.1 Fast
    if (videoModel.includes('veo-2')) {
      setVideoModel('veo-3.1-fast-generate-preview');
    }
  };

  const handleEditorSubmit = async (params: VideoEditorSubmitParams) => {
    if (!editorClipUrl || !user || !userData?.geminiApiKey) return;

    // Find index of the clip being edited
    const editIndex = videoProject.findIndex(c => c.url === editorClipUrl);
    const isEditMode = params.tool !== 'extend';

    let finalPrompt = params.prompt;
    if (params.selection && (params.tool === 'insert' || params.tool === 'remove')) {
      finalPrompt += ` [Apply to region: x=${Math.round(params.selection.relativeX * 100)}%, y=${Math.round(params.selection.relativeY * 100)}%, w=${Math.round(params.selection.relativeW * 100)}%, h=${Math.round(params.selection.relativeH * 100)}%]`;
    }
    if (params.tool === 'camera' && params.cameraPrompt) {
      finalPrompt += ` [Camera: ${params.cameraPrompt}]`;
    }

    resetWorkspaceForExtend();
    setPrompt(finalPrompt);

    if (isEditMode) {
      editingClipIndexRef.current = editIndex !== -1 ? editIndex : null;
      setExtendingVideoUrl(null);
    } else {
      editingClipIndexRef.current = null;
      setExtendingVideoUrl(editorClipUrl);
    }

    setEditorClipUrl(null);
    setJobStatus('processing');
    setElapsedTime(0);
    setErrorDetails(null);
    setIsSaving(false);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);

    try {
      const result = await startVideoGeneration({
        textPrompt: finalPrompt,
        // If it's edit mode, we use the captured frame as image constraint instead of a video extension
        referenceImageUris: isEditMode && params.capturedFrameDataUrl ? [params.capturedFrameDataUrl] : undefined,
        referenceVideoUri: isEditMode ? undefined : editorClipUrl,
        aspectRatio: aspectRatio,
        modelName: videoModel,
        userId: user.uid,
        apiKey: userData.geminiApiKey,
        durationSeconds: videoDuration,
        frameRate: videoModel.includes('veo-2') ? frameRate : undefined,
        resolution: !videoModel.includes('veo-2') ? outputResolution : undefined,
      });

      if (result.status === 'processing' && result.operationName) {
        setOperationName(result.operationName);
        toast({ title: "🎬 Đang thao tác video...", description: `Đang xử lý ${params.tool} thông qua AI. Có thể mất 2-5 phút.` });
      } else if (result.status === 'failed') {
        setJobStatus('failed');
        stopTimer();
        setErrorDetails(result.error || null);
        toast({ variant: 'destructive', title: "Lỗi tạo video", description: result.error });
      }
    } catch (e: any) {
      setJobStatus('failed');
      stopTimer();
      setErrorDetails(e.message);
    }
  };

  const activateExtendMode = async (videoUrlToExtend: string) => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Yêu cầu đăng nhập', description: 'Bạn cần đăng nhập để mở rộng video.' });
      return;
    }

    if (!videoUrlToExtend.includes('generativelanguage.googleapis.com/v1beta/files/')) {
      toast({ variant: 'destructive', title: 'Không thể nối tiếp', description: 'Tính năng nối tiếp (Extend Video) chỉ hỗ trợ những video được tạo bằng các model Veo 3.1 trở lên.' });
      return;
    }

    resetWorkspaceForExtend();
    setPrompt('');
    setExtendingVideoUrl(videoUrlToExtend);

    // Smooth scroll to the top of the page (prompt input area)
    window.scrollTo({ top: 0, behavior: 'smooth' });

    toast({
      title: 'Đã bật chế độ Nối tiếp (Mở rộng)',
      description: 'Vui lòng nhập diễn biến mới cho đoạn video tiếp theo, sau đó bấm Tạo video.'
    });
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
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleRemoveImage = (urlToRemove: string) => {
    setInputImageUrls((prevUrls) => prevUrls.filter((url) => url !== urlToRemove));
  };

  const handleImageSelectFromLibrary = (imageUrl: string) => {
    handleImageSelectFromLibraryBA(imageUrl);
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
      // Build image URIs based on input mode
      let imageUrisForScript: string[] | undefined;
      let enhancedDescription = scriptDescription;

      if (inputMode === 'before-after') {
        const beforeAfterImages: string[] = [];
        // Send AFTER image first so Gemini analyzes the target state in detail
        if (afterImageUrl) beforeAfterImages.push(afterImageUrl);
        if (beforeImageUrl) beforeAfterImages.push(beforeImageUrl);
        imageUrisForScript = beforeAfterImages.length > 0 ? beforeAfterImages : undefined;

        // Enhance description for before/after context - emphasize matching after image
        if (beforeImageUrl && afterImageUrl) {
          enhancedDescription = [
            `[BEFORE & AFTER TRANSFORMATION VIDEO]`,
            `The FIRST image is the TARGET/AFTER state (the completed, fully furnished result that the video MUST end with).`,
            `The SECOND image is the BEFORE state (the initial empty/unfurnished room where the video starts).`,
            `CRITICAL: Analyze the FIRST image (AFTER/target state) in extreme detail - describe every piece of furniture, every decorative item, every plant, their exact colors, materials, and positions.`,
            `The generated video script must describe a time-lapse transformation from the empty room to the EXACT furnished state shown in the first image.`,
            `The final frame of the video MUST be IDENTICAL to the first image provided.`,
            `Camera must remain STATIC throughout - no camera movement.`,
            `User description: ${scriptDescription}`,
          ].join(' ');
        }
      } else {
        imageUrisForScript = inputImageUrls.length > 0 ? inputImageUrls : undefined;
      }

      const result = await videoScriptGeneration({
        description: enhancedDescription,
        imageUris: imageUrisForScript,
        model: scriptModel,
        apiKey: userData?.geminiApiKey,
      });
      setPrompt(result.optimized_english_prompt);
      setMotionAnalysis(result.motion_analysis);
      setCameraMovement(result.camera_movement);
      
      if (user) {
        const inputTokens = estimateTokens(enhancedDescription);
        const outputTokens = estimateTokens(result.optimized_english_prompt);
        recordUsage({
          userId: user.uid,
          userEmail: user.email || '',
          type: 'text',
          model: scriptModel,
          amount: inputTokens + outputTokens,
          prompt: scriptDescription,
        });
      }
    } catch (error: any) {
      console.error(error);
      let errorMsg = error.message || t('toast.image.unexpectedError');
      if (typeof errorMsg === 'string' && (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED'))) {
        errorMsg = 'API Gemini của bạn đã hết lượt (Lỗi 429). Vui lòng chọn mô hình khác ở menu Mô hình tạo kịch bản (VD: flash-lite) hoặc thử lại sau ít phút.';
      }
      toast({
        variant: 'destructive',
        title: t('toast.video.scriptGenerationFailed.title'),
        description: errorMsg,
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

  // ─── WIZARD HANDLERS ────────────────────────────────────────────────────────
  const startWizard = async (tmpl: { id: string; label: string; prompt: string }) => {
    setInputMode('standard');
    setSelectedTemplate(tmpl.id);
    setWizardActive(true);
    setWizardTemplate({ id: tmpl.id, label: tmpl.label });
    setWizardAnswers([]);
    setWizardCurrentQuestion(null);
    setWizardCustomInput('');
    setWizardStepImage(null);
    setWizardVoiceText('');
    setWizardVoiceType('Giọng nam ấm áp, lôi cuốn');
    setWizardLoading(true);

    try {
      const result = await generateWizardQuestion({
        templateId: tmpl.id,
        templateLabel: tmpl.label,
        previousAnswers: [],
        imageUris: inputImageUrls.length > 0 ? inputImageUrls : undefined,
        videoDuration,
        aspectRatio,
        isExtending: !!extendingVideoUrl,
        apiKey: userData?.geminiApiKey,
      });
      setWizardCurrentQuestion(result);
    } catch (err: any) {
      console.error('[Wizard] Start error:', err);
      toast({ variant: 'destructive', title: 'Lỗi khởi tạo wizard', description: err.message });
      setWizardActive(false);
    } finally {
      setWizardLoading(false);
    }
  };

  const handleWizardAnswer = async (answer: string) => {
    if (!wizardTemplate || !wizardCurrentQuestion) return;

    const newAnswers = [...wizardAnswers, { question: wizardCurrentQuestion.question, answer }];
    setWizardAnswers(newAnswers);
    setWizardCustomInput('');
    setWizardStepImage(null);
    setWizardLoading(true);

    try {
      const result = await generateWizardQuestion({
        templateId: wizardTemplate.id,
        templateLabel: wizardTemplate.label,
        previousAnswers: newAnswers,
        imageUris: inputImageUrls.length > 0 ? inputImageUrls : undefined,
        videoDuration,
        aspectRatio,
        isExtending: !!extendingVideoUrl,
        apiKey: userData?.geminiApiKey,
      });
      setWizardCurrentQuestion(result);
    } catch (err: any) {
      console.error('[Wizard] Next question error:', err);
      toast({ variant: 'destructive', title: 'Lỗi khi tải câu hỏi tiếp theo', description: 'Bạn có thể thử lại hoặc nhấn Hoàn tất để sử dụng các câu trả lời hiện tại.' });
    } finally {
      setWizardLoading(false);
    }
  };

  const handleWizardComplete = async (answersOverride?: WizardQA[], autoGenerate = false) => {
    if (!wizardTemplate) return;
    const answers = answersOverride || wizardAnswers;
    if (answers.length === 0) {
      cancelWizard();
      return;
    }

    setWizardLoading(true);
    try {
      const result = await compileWizardPrompt({
        templateId: wizardTemplate.id,
        templateLabel: wizardTemplate.label,
        answers,
        imageUris: inputImageUrls.length > 0 ? inputImageUrls : undefined,
        videoDuration,
        aspectRatio,
        isExtending: !!extendingVideoUrl,
        apiKey: userData?.geminiApiKey,
      });

      let compiledPrompt = result.compiledPrompt;
      if (wizardVoiceText.trim()) {
        const voiceDesc = wizardVoiceType.trim() ? ` a ${wizardVoiceType} voice` : 'a clear voice';
        compiledPrompt += `\n\n[MANDATORY SCRIPT/AUDIO INSTRUCTION]: The main character in the scene speaks clearly directly to the camera/audience with ${voiceDesc}. They say EXACTLY the following dialogue: "${wizardVoiceText.trim()}". Their lip movements must perfectly match this dialogue.`;
      }

      setScriptDescription(compiledPrompt);

      if (!autoGenerate) {
        toast({ title: '✅ Prompt đã được tạo!', description: 'Bạn có thể chỉnh sửa hoặc ấn ✨ để tạo kịch bản AI.' });
      } else {
        // AUTO GENERATION FLOW: Use compiled prompt directly, skip AI script optimization
        toast({ title: '🎬 Đang tạo video...', description: 'Sử dụng prompt wizard trực tiếp.' });
        setPrompt(compiledPrompt);

        // Start Video Generation directly with compiled prompt
        await handleGenerate(false, compiledPrompt);
      }
    } catch (err: any) {
      console.error('[Wizard] Compile error:', err);
      // Fallback: stitch answers manually
      const fallback = answers.map(a => `${a.answer}`).join(', ');
      setScriptDescription(`${wizardTemplate.label}: ${fallback}`);
    } finally {
      setWizardActive(false);
      setWizardLoading(false);
      setWizardTemplate(null);
      setWizardAnswers([]);
      setWizardCurrentQuestion(null);
      setWizardCustomInput('');
      setWizardStepImage(null);
    }
  };

  const cancelWizard = () => {
    setWizardActive(false);
    setWizardTemplate(null);
    setWizardAnswers([]);
    setWizardCurrentQuestion(null);
    setWizardCustomInput('');
    setWizardStepImage(null);
    setWizardVoiceText('');
    setWizardVoiceType('Giọng nam ấm áp, lôi cuốn');
    setWizardLoading(false);
  };

  const projectImages = Array.from(new Set([
    ...inputImageUrls,
    ...(beforeImageUrl ? [beforeImageUrl] : []),
    ...(afterImageUrl ? [afterImageUrl] : [])
  ]));

  const toggleFavorite = (url: string) => {
    setFavorites(prev => prev.includes(url) ? prev.filter(f => f !== url) : [...prev, url]);
  };

  const hasNoCredit = (userData?.credits ?? 0) <= 0 && userData?.role !== 'Admin';
  const isBusy = jobStatus === 'processing' || isGeneratingScript || isUploading || isUploadingBefore || isUploadingAfter || isSaving || hasNoCredit;
  const isGenerateDisabled = isBusy || (inputMode === 'standard' && !prompt.trim() && !scriptDescription.trim()) || (inputMode === 'before-after' && (!beforeImageUrl || !afterImageUrl));

  return (
    <div className="flex flex-col flex-1 min-h-[calc(100vh-140px)] relative bg-white dark:bg-zinc-950 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-xl">
      <ImageLibraryModal
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        onImageSelect={(url) => {
          if (libraryTarget === 'standard') setInputImageUrls(p => [...p, url]);
          else if (libraryTarget === 'before') setBeforeImageUrl(url);
          else if (libraryTarget === 'after') setAfterImageUrl(url);
          else if (libraryTarget === 'wizard') {
            setWizardStepImage(url);
            if (!inputImageUrls.includes(url)) setInputImageUrls(prev => [...prev, url]);
          }
          setIsLibraryOpen(false);
        }}
        onVideoExtend={activateExtendMode}
      />
      <input ref={beforeFileInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleBeforeAfterFileChange(e, 'before')} disabled={isBusy} />
      <input ref={afterFileInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleBeforeAfterFileChange(e, 'after')} disabled={isBusy} />
      <input ref={fileInputRef} id="image-upload-input" type="file" className="hidden" multiple onChange={handleFileChange} accept="image/*" disabled={isBusy} />

      {/* --- ERROR OVERLAY --- */}
      {errorDetails && (
        <div className="absolute inset-0 z-50 bg-white/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-red-50 dark:bg-red-950/80 border border-red-200 dark:border-red-500/30 text-zinc-900 dark:text-white max-w-lg text-center shadow-2xl">
            <X className="h-12 w-12 text-red-500" />
            <p className="font-semibold text-lg">Đã xảy ra lỗi</p>
            <p className="text-sm text-red-600 dark:text-red-200/80 whitespace-pre-wrap">{errorDetails}</p>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="bg-white hover:bg-zinc-100" onClick={() => setErrorDetails(null)}>Đóng</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => handleGenerateRef.current?.(false)} disabled={(!prompt.trim() && inputMode === 'standard')}>Thử lại</Button>
            </div>
          </div>
        </div>
      )}

      {/* --- IMAGE VIEWER OVERLAY --- */}
      {viewingImage && (
        <div className="absolute inset-0 z-[60] bg-black/95 backdrop-blur-lg flex items-center justify-center p-6 animate-in fade-in" onClick={() => setViewingImage(null)}>
          <div className="relative max-w-5xl max-h-[90vh] w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img src={viewingImage} alt="Preview" className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
            <div className="absolute top-4 right-4 flex gap-2">
              <Button variant="ghost" size="icon" className="h-10 w-10 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-md" onClick={() => toggleFavorite(viewingImage)}>
                <Heart className={cn("h-5 w-5 transition-colors", favorites.includes(viewingImage) ? "fill-red-500 text-red-500" : "")} />
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-md" onClick={() => setViewingImage(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* --- MAIN CANVAS (GALLERY) --- */}
      <div className="flex-1 overflow-y-auto p-6 md:p-10 pb-40 w-full scrollbar-thin rounded-xl" id="main-canvas">
        {videoProject.length > 0 || jobStatus === 'processing' || projectImages.length > 0 ? (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                  <Video className="h-4 w-4 text-white" />
                </div>
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">Dự án hiện tại</h2>
                <span className="text-xs font-medium text-cyan-700 dark:text-cyan-200 bg-cyan-100 dark:bg-cyan-500/20 px-2.5 py-1 rounded-full border border-cyan-200 dark:border-cyan-500/20">{videoProject.length + projectImages.length} items</span>
              </div>

              {/* Tabs */}
              <div className="flex bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-lg sm:ml-4 overflow-x-auto scrollbar-none shadow-inner opacity-90 hover:opacity-100 transition-opacity">
                <Button variant={activeTab === 'all' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('all')} className={cn("h-7 text-xs px-3 rounded-md transition-all", activeTab === 'all' && "bg-white dark:bg-zinc-700 text-cyan-600 dark:text-cyan-300 shadow-sm")}>Tất cả</Button>
                <Button variant={activeTab === 'images' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('images')} className={cn("h-7 text-xs px-3 rounded-md transition-all", activeTab === 'images' && "bg-white dark:bg-zinc-700 text-cyan-600 dark:text-cyan-300 shadow-sm")}>Hình ảnh</Button>
                <Button variant={activeTab === 'videos' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('videos')} className={cn("h-7 text-xs px-3 rounded-md transition-all", activeTab === 'videos' && "bg-white dark:bg-zinc-700 text-cyan-600 dark:text-cyan-300 shadow-sm")}>Video</Button>
                <Button variant={activeTab === 'favorites' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('favorites')} className={cn("h-7 text-xs px-3 rounded-md transition-all", activeTab === 'favorites' && "bg-white dark:bg-zinc-700 text-red-500 shadow-sm")}>
                  <Heart className={cn("h-3 w-3 mr-1.5", activeTab === 'favorites' ? "fill-red-500" : "")} /> Yêu thích
                </Button>
              </div>

              <Button variant="ghost" size="sm" className="ml-auto text-zinc-500 hover:text-cyan-600 hover:bg-cyan-50 rounded-full px-4 border border-transparent shrink-0" onClick={() => { setVideoProject([]); setGeneratedVideoUrls([]); setInputImageUrls([]); setBeforeImageUrl(null); setAfterImageUrl(null); setActiveTab('all'); }}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Dự án mới
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

              {/* Generating Placeholder(s) - batch aware */}
              {jobStatus === 'processing' && (activeTab === 'all' || activeTab === 'videos') && (
                <>
                  {batchOperations.length > 0 ? (
                    <>
                      {/* Batch progress summary bar */}
                      <div className="col-span-full">
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800/40">
                          <Loader2 className="h-4 w-4 animate-spin text-cyan-500 shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-cyan-800 dark:text-cyan-300">
                              Tạo video hàng loạt: {batchOperations.filter(op => op.status === 'completed').length}/{batchOperations.length} hoàn tất
                            </p>
                            <div className="w-full bg-cyan-100 dark:bg-cyan-900/40 rounded-full h-1.5 mt-1.5">
                              <div
                                className="bg-gradient-to-r from-cyan-400 to-cyan-500 h-1.5 rounded-full transition-all duration-700"
                                style={{ width: `${(batchOperations.filter(op => op.status !== 'processing').length / batchOperations.length) * 100}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-[10px] font-mono text-cyan-600 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-900/40 px-2 py-0.5 rounded-full border border-cyan-200 dark:border-cyan-800">{elapsedTime}s</div>
                        </div>
                      </div>
                      {/* Individual batch operation cards */}
                      {batchOperations.filter(op => op.status === 'processing').map((op) => (
                        <div key={op.id} className="relative w-full aspect-video bg-zinc-50 dark:bg-zinc-900/40 rounded-xl overflow-hidden border-2 border-dashed border-cyan-200 dark:border-cyan-900/50 flex flex-col items-center justify-center shadow-inner animate-in fade-in zoom-in slide-in-from-bottom-2 cursor-wait">
                          {op.refImage && (
                            <img src={op.refImage} alt="ref" className="absolute inset-0 w-full h-full object-cover opacity-20 blur-sm" />
                          )}
                          <div className="relative z-10 flex flex-col items-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-cyan-500" />
                            <p className="text-xs font-medium text-cyan-700 dark:text-cyan-400">Đang xử lý...</p>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    /* Single video processing placeholder */
                    <div className="relative w-full aspect-video bg-zinc-50 dark:bg-zinc-900/40 rounded-xl overflow-hidden border-2 border-dashed border-cyan-200 dark:border-cyan-900/50 flex flex-col items-center justify-center shadow-inner animate-in fade-in zoom-in slide-in-from-bottom-2 group cursor-wait">
                      <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/5 to-cyan-500/5 opacity-50 group-hover:opacity-100 transition-opacity"></div>
                      <Loader2 className="h-8 w-8 animate-spin text-cyan-500 mb-3" />
                      <p className="text-sm font-medium text-cyan-800 dark:text-cyan-400">Đang tạo video của bạn...</p>
                      <div className="text-[10px] font-mono text-cyan-600 dark:text-cyan-300 mt-2 bg-cyan-50 dark:bg-cyan-900/40 px-2.5 py-1 rounded-full border border-cyan-100 dark:border-cyan-800">{elapsedTime}s</div>
                      {isSaving && <p className="text-[10px] text-cyan-500/70 mt-1 absolute bottom-4">Đang lưu trữ dữ liệu...</p>}
                    </div>
                  )}
                </>
              )}

              {/* Render Images */}
              {(activeTab === 'all' || activeTab === 'images' || activeTab === 'favorites') && projectImages.filter(url => activeTab === 'favorites' ? favorites.includes(url) : true).map((url, index) => (
                <div key={`img-${index}`} className="group relative w-full aspect-video rounded-xl bg-zinc-100 dark:bg-zinc-900 overflow-hidden border border-zinc-200 dark:border-white/10 shadow-sm animate-in fade-in zoom-in-95 cursor-pointer" onClick={() => setViewingImage(url)}>
                  <img src={url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="Reference" />

                  {/* Overlay Gradient */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                  {/* Heart Icon */}
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-sm transition-transform active:scale-95" onClick={(e) => { e.stopPropagation(); toggleFavorite(url); }}>
                      <Heart className={cn("h-4 w-4 transition-colors", favorites.includes(url) ? "fill-red-500 text-red-500" : "")} />
                    </Button>
                  </div>

                  {/* Badge */}
                  <div className="absolute bottom-3 left-3 flex gap-1.5 pointer-events-none z-10">
                    <span className="text-[10px] font-bold text-white bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded shadow-sm uppercase tracking-wider">Hình ảnh</span>
                  </div>

                  {/* Download Button */}
                  <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <a href={url} download onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="h-8 w-8 bg-white/20 hover:bg-white/40 text-white rounded-full backdrop-blur-md">
                        <Download className="h-4 w-4" />
                      </Button>
                    </a>
                  </div>
                </div>
              ))}

              {/* Render Videos */}
              {(activeTab === 'all' || activeTab === 'videos' || activeTab === 'favorites') && videoProject.filter(clip => activeTab === 'favorites' ? favorites.includes(clip.url) : true).map((clip, index) => (
                <div key={index} className="group flex flex-col gap-2 animate-in fade-in zoom-in-95">
                  <div
                    className="relative w-full aspect-video bg-zinc-100 dark:bg-zinc-900 rounded-xl overflow-hidden border border-zinc-200 dark:border-white/10 hover:border-cyan-500/50 transition-all cursor-pointer shadow-sm hover:shadow-cyan-900/20"
                    onClick={() => setEditorClipUrl(clip.url)}
                  >
                    <video src={clip.url} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700 ease-out" />

                    <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/10 to-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3 rounded-xl pointer-events-none">
                      <div className="flex justify-between items-start pointer-events-auto w-full">
                        <span className="bg-white/90 dark:bg-black/60 text-cyan-700 dark:text-white/90 text-[10px] uppercase font-bold px-2.5 py-1 rounded shadow-sm">
                          Clip {index + 1}
                        </span>

                        <div className="flex gap-1.5">
                          <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-sm transition-transform active:scale-95" onClick={(e) => { e.stopPropagation(); toggleFavorite(clip.url); }}>
                            <Heart className={cn("h-4 w-4 transition-colors", favorites.includes(clip.url) ? "fill-red-500 text-red-500" : "")} />
                          </Button>
                          <a href={clip.url} download onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon" className="h-8 w-8 bg-white/20 hover:bg-white/40 text-white rounded-full backdrop-blur-md">
                              <Download className="h-4 w-4" />
                            </Button>
                          </a>
                        </div>
                      </div>

                      <div className="self-center pointer-events-auto" onClick={(e) => { e.stopPropagation(); setEditorClipUrl(clip.url); }}>
                        <div className="h-12 w-12 rounded-full bg-white/40 backdrop-blur-md flex items-center justify-center -translate-y-2 group-hover:translate-y-0 transition-transform duration-300 shadow-xl shadow-black/20 hover:bg-white/60 hover:scale-110">
                          <Play className="h-5 w-5 text-white ml-0.5" />
                        </div>
                      </div>

                      <p className="text-[11px] font-medium text-white/90 line-clamp-1 translate-y-2 group-hover:translate-y-0 transition-transform duration-300 delay-75 drop-shadow-md pb-1">{clip.duration}</p>
                    </div>
                  </div>

                  {!videoModel.includes('veo-2') && index === videoProject.length - 1 && (
                    <Button
                      variant="outline"
                      className="w-full border-dashed border-zinc-300 dark:border-white/10 bg-transparent hover:bg-cyan-50 dark:hover:bg-cyan-900/20 hover:text-cyan-700 dark:hover:text-cyan-400 text-zinc-500 h-9 text-xs rounded-xl transition-colors"
                      onClick={() => activateExtendMode(clip.url)}
                    >
                      <Plus className="mr-2 h-3 w-3" /> Tạo cảnh nối tiếp
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center max-w-3xl mx-auto text-center space-y-6 animate-in fade-in zoom-in-95 duration-700">
            <div className="relative group cursor-default">
              <div className="absolute inset-0 bg-cyan-400/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
              <div className="relative h-24 w-24 bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-900/30 dark:to-cyan-900/30 rounded-full flex items-center justify-center border border-cyan-200 dark:border-cyan-800 shadow-xl shadow-cyan-500/10">
                <Wand2 className="h-10 w-10 text-cyan-500 animate-pulse" />
              </div>
            </div>
            <div>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-cyan-500">iGen +</h1>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">Không gian làm việc vô cực. Chỉ cần mô tả ý tưởng, AI sẽ kết xuất video chuẩn điện ảnh với độ phân giải lên đến 1080p.</p>
              <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-4">Ấn nút <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-zinc-100 text-zinc-500 mx-1"><Plus className="h-3 w-3" /></span> để chọn ảnh tham chiếu và mẫu prompt</p>
            </div>
          </div>
        )}
      </div>

      {/* --- WIZARD PANEL OVERLAY --- */}
      {wizardActive && (
        <div className="absolute inset-0 z-[55] bg-white/40 dark:bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-white/10 rounded-[28px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] overflow-hidden animate-in slide-in-from-bottom-8 zoom-in-95 duration-500 flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-50 dark:border-white/5 shrink-0 bg-white dark:bg-zinc-900 relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 to-cyan-400"></div>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-400 flex items-center justify-center shadow-md shadow-cyan-500/10">
                  <Wand2 className="h-5 w-5 text-white" />
                </div>
                <div className="flex flex-col">
                  <p className="text-base font-bold text-zinc-800 dark:text-white flex items-center gap-2">
                    {wizardTemplate?.label || 'Prompt Wizard'}
                  </p>
                  <p className="text-[11px] text-cyan-600 dark:text-cyan-400 font-semibold tracking-wide uppercase">Dự kiến ~5 bước</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full" onClick={cancelWizard}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-6 scrollbar-thin scrollbar-thumb-zinc-200">

              {/* Progress Breadcrumbs (Chat history style) */}
              {wizardAnswers.length > 0 && (
                <div className="flex flex-col gap-5">
                  {wizardAnswers.map((qa, i) => (
                    <div key={i} className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
                      {/* Question bubble */}
                      <div className="flex gap-3">
                        <div className="h-7 w-7 rounded-full bg-cyan-50 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</div>
                        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed pt-1.5">{qa.question}</p>
                      </div>
                      {/* Answer bubble */}
                      <div className="ml-10">
                        <p className="text-[14px] text-zinc-800 dark:text-zinc-200 font-bold">{qa.answer}</p>
                      </div>
                    </div>
                  ))}
                  {/* Subtle separator before current question */}
                  <div className="h-px bg-zinc-100 dark:bg-white/5 w-full mx-auto my-2"></div>
                </div>
              )}

              {/* Current Question Block */}
              <div>
                {wizardLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <div className="relative">
                      <div className="h-12 w-12 rounded-full border-2 border-cyan-100 border-t-cyan-500 animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center"><Wand2 className="h-4 w-4 text-cyan-500 opacity-50" /></div>
                    </div>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
                      {wizardAnswers.length === 0 ? 'Đang phân tích và khởi tạo...' : wizardCurrentQuestion?.isDone ? 'Đang tổng hợp prompt hoàn chỉnh...' : 'AI đang suy nghĩ câu hỏi tiếp theo...'}
                    </p>
                  </div>
                ) : wizardCurrentQuestion && !wizardCurrentQuestion.isDone ? (
                  <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h3 className="text-xl sm:text-2xl font-bold text-zinc-800 dark:text-white leading-tight tracking-tight">
                      {wizardCurrentQuestion.question}
                    </h3>

                    {/* Option Buttons (Pill Style) */}
                    <div className="flex flex-wrap gap-2.5">
                      {wizardCurrentQuestion.options.map((opt, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          onClick={() => handleWizardAnswer(opt)}
                          className="h-auto py-2.5 px-5 text-[13px] font-semibold rounded-full border border-cyan-200 dark:border-cyan-800 bg-white dark:bg-zinc-900 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/40 hover:border-cyan-400 dark:hover:border-cyan-600 transition-all whitespace-normal text-left shadow-sm hover:shadow-md active:scale-95"
                        >
                          {opt}
                        </Button>
                      ))}
                    </div>

                    {/* Image Upload for this step (Purple Dashed Style) */}
                    {wizardCurrentQuestion.allowImageUpload && (
                      <div className="mt-2 animate-in fade-in slide-in-from-bottom-2">
                        <input type="file" accept="image/*" ref={wizardFileInputRef} className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || !user) return;
                          setWizardUploadingImage(true);
                          try {
                            const fileName = `wizard-${Date.now()}-${file.name}`;
                            const imgRef = storageRef(storage, `users/${user.uid}/inputs/${fileName}`);
                            await uploadBytes(imgRef, file);
                            const url = await getDownloadURL(imgRef);
                            setWizardStepImage(url);
                            if (!inputImageUrls.includes(url)) setInputImageUrls(prev => [...prev, url]);
                          } catch { toast({ variant: 'destructive', title: 'Lỗi tải ảnh' }); }
                          finally { setWizardUploadingImage(false); }
                          if (e.target) e.target.value = '';
                        }} />

                        {wizardStepImage ? (
                          <div className="relative inline-block rounded-2xl overflow-hidden border-2 border-purple-200 shadow-md p-1 bg-white">
                            <img src={wizardStepImage} alt="step" className="h-32 rounded-xl w-auto object-cover" />
                            <button onClick={() => setWizardStepImage(null)} className="absolute top-2 right-2 h-7 w-7 bg-black/50 backdrop-blur-md text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors shadow-sm"><X className="h-4 w-4" /></button>
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row gap-2">
                            <div
                              onClick={() => wizardFileInputRef.current?.click()}
                              className="flex-1 flex items-center justify-center gap-3 p-4 rounded-2xl border-2 border-dashed border-purple-300 dark:border-purple-700 bg-purple-50/30 text-purple-600 hover:bg-purple-50 hover:border-purple-400 transition-all cursor-pointer group"
                            >
                              {wizardUploadingImage ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                              ) : (
                                <ImagePlus className="h-5 w-5 group-hover:scale-110 transition-transform" />
                              )}
                              <span className="text-sm font-semibold">Tải từ thiết bị</span>
                            </div>
                            <div
                              onClick={() => { setLibraryTarget('wizard'); setIsLibraryOpen(true); }}
                              className="flex-1 flex items-center justify-center gap-3 p-4 rounded-2xl border-2 border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50/30 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-400 transition-all cursor-pointer group"
                            >
                              <Images className="h-5 w-5 group-hover:scale-110 transition-transform" />
                              <span className="text-sm font-semibold">Chọn từ Thư viện</span>
                            </div>
                          </div>
                        )}
                        <p className="text-[11px] text-zinc-400 font-medium text-center mt-3">
                          💡 Ý AI: {wizardCurrentQuestion.imageUploadHint || 'Tải ảnh minh họa'}
                        </p>
                      </div>
                    )}

                    {/* Custom Input */}
                    <div className="flex gap-2 items-center mt-3 relative">
                      <input
                        type="text"
                        value={wizardCustomInput}
                        onChange={(e) => setWizardCustomInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && wizardCustomInput.trim()) {
                            handleWizardAnswer(wizardCustomInput.trim());
                          }
                        }}
                        placeholder="Hoặc nhập câu trả lời của bạn..."
                        className="w-full h-14 pl-5 pr-16 text-sm bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 transition-all"
                      />
                      <Button
                        size="icon"
                        onClick={() => { if (wizardCustomInput.trim()) handleWizardAnswer(wizardCustomInput.trim()); }}
                        disabled={!wizardCustomInput.trim()}
                        className="absolute right-2 h-10 w-10 rounded-xl bg-cyan-400 hover:bg-cyan-500 text-white shadow-md disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none transition-all"
                      >
                        <ArrowRight className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-10 gap-4 text-center px-4">
                    <div className="h-16 w-16 rounded-full bg-cyan-50 flex items-center justify-center relative">
                      <div className="absolute inset-0 bg-cyan-400/20 blur-xl rounded-full"></div>
                      <Wand2 className="h-7 w-7 text-cyan-500 relative z-10" />
                    </div>
                    <h3 className="text-xl font-bold text-zinc-800 dark:text-white">Tuyệt vời, đã đủ thông tin!</h3>
                    <p className="text-sm text-zinc-500 max-w-sm">Nhấn Hoàn tất để hệ thống viết ra kịch bản video chuyên nghiệp cho bạn.</p>

                    <div className="w-full max-w-md mt-6 text-left border border-cyan-100 dark:border-cyan-800/40 p-5 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm transition-all hover:shadow-md">
                      <div className="flex items-center gap-2 mb-2">
                         <div className="bg-cyan-100 dark:bg-cyan-900/50 p-1.5 rounded-lg"><Mic className="h-4 w-4 text-cyan-600 dark:text-cyan-400" /></div>
                         <span className="font-bold text-zinc-800 dark:text-zinc-200">Nhân vật phát âm (Tuỳ chọn)</span>
                      </div>
                      <p className="text-[11px] text-cyan-600 dark:text-cyan-400 mb-4 bg-cyan-50 dark:bg-cyan-900/20 px-2.5 py-1.5 rounded-lg border border-cyan-100 dark:border-cyan-800/30 font-medium">✨ Veo 3 tự động tạo âm thanh & nhép môi nhân vật theo đúng đoạn hội thoại nhập dưới đây!</p>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5 block">Nội dung lời thoại:</label>
                          <textarea 
                            placeholder="Ví dụ: Xin chào mừng các bạn đã đến với sản phẩm mới..."
                            value={wizardVoiceText}
                            onChange={(e) => setWizardVoiceText(e.target.value)}
                            className="w-full text-sm border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 rounded-xl p-3 h-20 resize-none outline-none focus:ring-2 focus:ring-cyan-400/50 transition-all text-zinc-800 dark:text-zinc-200"
                          />
                        </div>
                        <div>
                          <label className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5 block">Loại giọng đọc (Phong cách):</label>
                          <input 
                            type="text"
                            placeholder="VD: Nam tính trầm ấm, Nữ truyền cảm..."
                            value={wizardVoiceType}
                            onChange={(e) => setWizardVoiceType(e.target.value)}
                            className="w-full text-sm border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-cyan-400/50 transition-all text-zinc-800 dark:text-zinc-200"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-50 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-950/20 shrink-0">
              <Button variant="ghost" size="sm" className="text-[13px] font-semibold text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100/50 px-4 rounded-xl" onClick={cancelWizard}>
                Hủy bỏ
              </Button>
              <div className="flex gap-3">
                {/* Back Button */}
                {wizardAnswers.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={wizardLoading}
                    onClick={() => {
                      const prev = [...wizardAnswers];
                      prev.pop();
                      setWizardAnswers(prev);
                      if (prev.length === 0) {
                        startWizard({ id: wizardTemplate!.id, label: wizardTemplate!.label, prompt: '' });
                      } else {
                        setWizardLoading(true);
                        generateWizardQuestion({
                          templateId: wizardTemplate!.id,
                          templateLabel: wizardTemplate!.label,
                          previousAnswers: prev,
                          imageUris: inputImageUrls.length > 0 ? inputImageUrls : undefined,
                          videoDuration,
                          aspectRatio,
                          isExtending: !!extendingVideoUrl,
                          apiKey: userData?.geminiApiKey,
                        }).then(r => setWizardCurrentQuestion(r)).finally(() => setWizardLoading(false));
                      }
                    }}
                    className="text-[13px] font-semibold h-10 px-5 rounded-xl border-zinc-200 dark:border-white/10"
                  >
                    ← Quay lại
                  </Button>
                )}

                {/* Complete Buttons */}
                {(wizardAnswers.length >= 1 || wizardCurrentQuestion?.isDone) && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={wizardLoading}
                      onClick={() => handleWizardComplete()}
                      className="text-[13px] font-semibold h-10 px-5 rounded-xl border-zinc-200 dark:border-white/10"
                    >
                      {wizardLoading && !wizardActive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Hoàn tất Prompt
                    </Button>
                    <Button
                      size="sm"
                      disabled={wizardLoading}
                      onClick={() => handleWizardComplete(undefined, true)}
                      className="text-[13px] font-bold h-10 px-6 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-500 hover:to-cyan-600 text-white shadow-[0_8px_16px_rgba(45,212,191,0.25)] hover:shadow-[0_8px_20px_rgba(45,212,191,0.35)] hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:translate-y-0 disabled:shadow-none"
                    >
                      {wizardLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="mr-2 h-4 w-4" />
                      )}
                      Hoàn tất & Tạo Video
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- EXTEND ALERT --- */}
      {extendingVideoUrl && (
        <div className="absolute bottom-[110px] left-1/2 -translate-x-1/2 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-cyan-200 dark:border-cyan-800 rounded-2xl p-2.5 shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5">
          <div className="h-10 w-16 bg-zinc-100 rounded-lg overflow-hidden ring-1 ring-black/5 relative group">
            <video src={extendingVideoUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-sm">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="h-1.5 w-1.5 bg-cyan-500 rounded-full animate-pulse"></div>
              <span className="font-semibold text-cyan-700 dark:text-cyan-400 text-xs uppercase tracking-wider">Đang nối tiếp clip</span>
            </div>
            <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">Cảnh tiếp theo diễn ra thế nào?</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => { setExtendingVideoUrl(null); editingClipIndexRef.current = null; }} className="h-8 w-8 text-zinc-400 hover:text-zinc-700 rounded-full hover:bg-zinc-100 ml-2">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* --- FLOATING BOTTOM INPUT BAR --- */}
      <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-white via-white/90 dark:from-black dark:via-black/90 to-transparent pointer-events-none flex justify-center z-40 pt-16">
        <div className="w-full max-w-4xl bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl border border-zinc-200 dark:border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] rounded-2xl pointer-events-auto flex flex-col overflow-visible transition-all">


          {/* Before & After Upload Area (Expands if B/A mode) */}
          {inputMode === 'before-after' && (
            <div className="bg-zinc-50/50 dark:bg-zinc-950/20 border-b border-zinc-100 dark:border-white/5 rounded-t-2xl relative flex flex-col transition-all duration-300">

              {/* Collapse/Expand Toggle Button */}
              <div className={cn("flex justify-center z-10 transition-all duration-300", isBeforeAfterCollapsed ? "-mb-3 mt-0 py-2" : "-mb-3 mt-2")}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsBeforeAfterCollapsed(!isBeforeAfterCollapsed)}
                  className="h-6 px-3 text-[10px] uppercase font-bold text-zinc-500 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-full shadow-sm hover:text-cyan-600 hover:border-cyan-200 dark:hover:border-cyan-800 transition-colors bg-opacity-90 backdrop-blur-sm"
                >
                  {isBeforeAfterCollapsed ? (
                    <><ChevronDown className="h-4 w-4 mr-1" /> Mở rộng ảnh</>
                  ) : (
                    <><ChevronUp className="h-4 w-4 mr-1" /> Thu gọn ảnh</>
                  )}
                </Button>
              </div>

              <div className={cn("flex gap-4 items-center justify-center overflow-x-auto scrollbar-none transition-all duration-300", isBeforeAfterCollapsed ? "h-0 opacity-0 overflow-hidden" : "p-4 min-h-[160px] opacity-100")}>
                <div
                  className={cn("rounded-xl border-2 border-dashed transition-all group bg-white dark:bg-black/30 relative overflow-hidden",
                    beforeImageUrl ? "border-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.1)] flex-none w-fit" : "border-zinc-200 hover:border-orange-300 flex-1 min-h-[120px] flex items-center justify-center"
                  )}
                >
                  {isUploadingBefore ? <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                    : beforeImageUrl ? (
                      <div className="relative flex">
                        <img src={beforeImageUrl} alt="B" className="max-h-[350px] w-auto block object-contain transition-opacity" />
                        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 flex transition-opacity items-center justify-center">
                          <Button size="icon" variant="destructive" className="h-8 w-8 rounded-full shadow-lg" onClick={(e) => { e.stopPropagation(); setBeforeImageUrl(null); }}><X className="h-4 w-4" /></Button>
                        </div>
                        <span className="absolute bottom-2 left-2 text-[10px] font-bold text-white bg-black/60 backdrop-blur-md px-2 py-0.5 rounded shadow-sm z-10 uppercase tracking-tighter">TRƯỚC</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center w-full h-full py-6 px-4">
                        <div
                          className="flex flex-col items-center justify-center group-hover:scale-105 transition-transform flex-1 w-full cursor-pointer py-1"
                          onClick={() => !beforeImageUrl && beforeFileInputRef.current?.click()}
                          title="Tải ảnh từ thiết bị"
                        >
                          <UploadCloud className="h-6 w-6 text-orange-400/70 mb-1.5" />
                          <span className="text-[10px] text-zinc-500 font-bold uppercase">Tải Ảnh Trước</span>
                        </div>
                        <div className="w-full border-t border-zinc-200/50 dark:border-white/5 my-3"></div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setLibraryTarget('before'); setIsLibraryOpen(true); }}
                          className="text-[10px] font-semibold text-orange-500 h-7 w-full rounded-lg hover:bg-orange-50 dark:hover:bg-orange-950/30"
                        >
                          Mở thư viện
                        </Button>
                      </div>
                    )}
                </div>

                <div className="flex items-center text-zinc-400 shrink-0 px-1">
                  <div className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-black/40 flex items-center justify-center shadow-inner">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>

                <div
                  className={cn("rounded-xl border-2 border-dashed transition-all group bg-white dark:bg-black/30 relative overflow-hidden",
                    afterImageUrl ? "border-cyan-400 shadow-[0_0_15px_rgba(20,184,166,0.1)] flex-none w-fit" : "border-zinc-200 hover:border-cyan-300 flex-1 min-h-[120px] flex items-center justify-center"
                  )}
                >
                  {isUploadingAfter ? <Loader2 className="h-4 w-4 animate-spin text-cyan-500" />
                    : afterImageUrl ? (
                      <div className="relative flex">
                        <img src={afterImageUrl} alt="A" className="max-h-[350px] w-auto block object-contain transition-opacity" />
                        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 flex transition-opacity items-center justify-center">
                          <Button size="icon" variant="destructive" className="h-8 w-8 rounded-full shadow-lg" onClick={(e) => { e.stopPropagation(); setAfterImageUrl(null); }}><X className="h-4 w-4" /></Button>
                        </div>
                        <span className="absolute bottom-2 left-2 text-[10px] font-bold text-white bg-black/70 backdrop-blur-md px-2 py-0.5 rounded shadow-sm z-10 uppercase tracking-tighter">SAU</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center w-full h-full py-6 px-4">
                        <div
                          className="flex flex-col items-center justify-center group-hover:scale-105 transition-transform flex-1 w-full cursor-pointer py-1"
                          onClick={() => !afterImageUrl && afterFileInputRef.current?.click()}
                          title="Tải ảnh từ thiết bị"
                        >
                          <UploadCloud className="h-6 w-6 text-cyan-500/60 mb-1.5" />
                          <span className="text-[10px] text-zinc-500 font-bold uppercase">Tải Ảnh Sau</span>
                        </div>
                        <div className="w-full border-t border-zinc-200/50 dark:border-white/5 my-3"></div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setLibraryTarget('after'); setIsLibraryOpen(true); }}
                          className="text-[10px] font-semibold text-cyan-600 h-7 w-full rounded-lg hover:bg-cyan-50 dark:hover:bg-cyan-950/30"
                        >
                          Mở thư viện
                        </Button>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* AI Script Output Popover Content (If active) */}
          {prompt && (
            <div className={cn("px-4 py-3 border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-950/20 flex flex-col gap-2 backdrop-blur-md", inputMode === 'standard' ? "rounded-t-2xl" : "border-t border-zinc-200 dark:border-white/10")}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/30 px-2 py-0.5 rounded text-center">✨ Kịch bản AI / Prompt</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-cyan-600 rounded-full hover:bg-cyan-50" onClick={() => setIsEditingScript(!isEditingScript)}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-cyan-600 rounded-full hover:bg-cyan-50" onClick={handleCopy}><Copy className="h-3 w-3" /></Button>
                </div>
              </div>
              {isEditingScript ? (
                <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="text-xs bg-white dark:bg-black/40 border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-300 min-h-[60px] max-h-[150px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 rounded-lg focus-visible:ring-cyan-500/30 p-2.5" />
              ) : (
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed max-h-[100px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 font-medium">{prompt}</p>
              )}
            </div>
          )}

          {/* Main Input Row */}
          <div className="p-2 sm:p-2.5 flex items-end gap-2 relative">

            {/* Left Action Button (Toggle popover for attachments / mode) */}
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-11 w-11 shrink-0 rounded-xl transition-all", showImageUpload ? "bg-cyan-50 text-cyan-600 dark:bg-white/10 dark:text-white" : "hover:bg-zinc-100 text-zinc-500 bg-zinc-50 dark:bg-black/30")}
              onClick={() => setShowImageUpload(!showImageUpload)}
            >
              <Plus className={cn("h-5 w-5 transition-transform duration-300", showImageUpload && "rotate-45")} />
            </Button>

            {/* Attachment Popover */}
            {showImageUpload && (
              <div className="absolute bottom-[110%] left-[-4px] sm:left-0 mb-2 p-3 sm:p-4 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200 dark:border-white/10 rounded-2xl shadow-2xl w-[92vw] sm:w-[320px] max-w-[340px] animate-in zoom-in-95 origin-bottom-left z-50">
                <div className="flex items-center gap-2 mb-3 bg-zinc-100 dark:bg-black/40 p-1 rounded-lg">
                  <Button variant="ghost" size="sm" className={cn("flex-1 text-xs justify-center h-8 rounded-md transition-colors", inputMode === 'standard' ? "bg-white text-cyan-600 shadow-sm" : "text-zinc-500 hover:text-cyan-600")} onClick={() => { setInputMode('standard'); }}>
                    Tiêu chuẩn
                  </Button>
                  <Button variant="ghost" size="sm" className={cn("flex-1 text-xs justify-center h-8 rounded-md transition-colors", inputMode === 'before-after' ? "bg-white text-cyan-600 shadow-sm" : "text-zinc-500 hover:text-cyan-600")} onClick={() => { setInputMode('before-after'); }}>
                    Trước Sau
                  </Button>
                </div>

                {inputMode === 'standard' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Ảnh tham chiếu</p>
                      <div className="flex items-center gap-2">
                        <Button variant="link" size="sm" className="h-5 text-[10px] text-cyan-500 px-0" onClick={() => { setLibraryTarget('standard'); setIsLibraryOpen(true); }}>Mở thư viện</Button>
                        <span className="text-zinc-300">|</span>
                        <Button variant="link" size="sm" className="h-5 text-[10px] text-purple-500 px-0" onClick={() => setShowImageUpload(prev => !prev)}>Template</Button>
                      </div>
                    </div>
                    {inputImageUrls.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {inputImageUrls.map(url => (
                          <div key={url} className="relative h-14 w-14 shrink-0 rounded-lg bg-zinc-100 overflow-hidden border border-zinc-200 group">
                            <Image src={url} alt="ref" fill className="object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer" onClick={(e) => { e.stopPropagation(); handleRemoveImage(url); }}><X className="h-4 w-4 text-white" /></div>
                          </div>
                        ))}
                        <div className="h-14 w-14 shrink-0 rounded-lg border border-dashed border-zinc-300 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-50 text-zinc-400 transition-colors" onClick={() => fileInputRef.current?.click()}><Plus className="h-4 w-4" /></div>
                      </div>
                    ) : (
                      <div className="h-20 w-full rounded-xl border border-dashed border-zinc-300 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-50 text-zinc-400 hover:text-cyan-600 transition-colors" onClick={() => fileInputRef.current?.click()}>
                        <UploadCloud className="h-6 w-6 mb-1 opacity-70" />
                        <span className="text-[10px] font-medium">Tải ảnh tham chiếu</span>
                      </div>
                    )}

                    {/* Template Grid inside popover */}
                    <div className="border-t border-zinc-100 dark:border-white/5 pt-3 mt-3">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Hãy ghi ngành nghề mà bạn muốn</p>

                      {/* Custom industry input */}
                      <div className="flex gap-1.5 mb-3">
                        <input
                          type="text"
                          placeholder="VD: Spa, Nha khoa, Gym..."
                          className="flex-1 h-8 px-3 text-[11px] bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-400/50 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                              const val = (e.target as HTMLInputElement).value.trim();
                              setShowImageUpload(false);
                              startWizard({ id: 'custom', label: val, prompt: '' });
                            }
                          }}
                        />
                        <Button size="sm" className="h-8 px-3 text-[10px] rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white shrink-0 shadow-sm" onClick={(e) => {
                          const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                          if (input?.value.trim()) { setShowImageUpload(false); startWizard({ id: 'custom', label: input.value.trim(), prompt: '' }); }
                        }}>
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </div>

                      <p className="text-[9px] text-zinc-400 mb-1.5">Hoặc chọn mẫu có sẵn:</p>
                      <div className="grid grid-cols-2 gap-1.5 max-h-[160px] overflow-y-auto scrollbar-thin pr-1">
                        {VIDEO_TEMPLATES.filter(t => t.id !== 'none').map(tmpl => (
                          <div
                            key={tmpl.id}
                            onClick={() => { setShowImageUpload(false); startWizard(tmpl); }}
                            className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-white/5 hover:border-cyan-400/40 hover:bg-cyan-50 dark:hover:bg-cyan-900/10 p-2 rounded-lg cursor-pointer text-left transition-all group shadow-sm hover:shadow"
                          >
                            <p className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors leading-tight">{tmpl.label}</p>
                          </div>
                        ))}
                      </div>

                      {/* Native Veo 3 Voice Synthesis */}
                      <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-white/5">
                        <div className="flex items-center gap-1.5 mb-2">
                           <Mic className="h-3.5 w-3.5 text-cyan-500" />
                           <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Nhân vật phát âm (Veo 3)</p>
                        </div>
                        <input
                          type="text"
                          placeholder="Nội dung lời thoại (VD: Xin chào...)"
                          value={wizardVoiceText}
                          onChange={(e) => setWizardVoiceText(e.target.value)}
                          className="w-full mb-1.5 h-8 px-2.5 text-[11px] bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-md focus:outline-none focus:ring-1 focus:ring-cyan-400/50 placeholder:text-zinc-400"
                        />
                        <input
                          type="text"
                          placeholder="Loại giọng (VD: Nam ấm áp...)"
                          value={wizardVoiceType}
                          onChange={(e) => setWizardVoiceType(e.target.value)}
                          className="w-full h-8 px-2.5 text-[11px] bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-md focus:outline-none focus:ring-1 focus:ring-cyan-400/50 placeholder:text-zinc-400"
                        />
                      </div>

                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Input Field */}
            <div className="flex-1 bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-xl relative flex items-center focus-within:ring-1 focus-within:ring-cyan-400/50 transition-all shadow-inner">
              <Textarea
                value={scriptDescription}
                onChange={(e) => setScriptDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (scriptDescription.trim() && !isGeneratingScript) handleGenerateScript();
                  }
                }}
                placeholder={inputMode === 'standard' ? "Nhập ý tưởng... (Bấm ✨ AI sẽ viết kịch bản)" : "Tùy chọn: Thêm yêu cầu chuyển đổi..."}
                className="resize-none border-0 bg-transparent shadow-none text-[13px] md:text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-500 min-h-[44px] max-h-[120px] overflow-y-auto py-3 pl-3 pr-10 focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-zinc-200 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-800 [&::-webkit-scrollbar-thumb]:rounded-full"
                rows={scriptDescription.length > 50 ? 2 : 1}
                disabled={isBusy}
              />

              {/* AI Magic Wand inside the input */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleGenerateScript}
                disabled={isBusy || !scriptDescription.trim() || isGeneratingScript}
                className={cn("absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg transition-all", isGeneratingScript ? "bg-cyan-50 text-cyan-500" : "hover:bg-zinc-200 text-zinc-400 hover:text-cyan-500", (!scriptDescription.trim() && "opacity-50 grayscale"))}
                title="Viết kịch bản bằng AI"
              >
                {isGeneratingScript ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              </Button>
            </div>

            {/* Settings Popover Toggle */}
            <div className="relative group/settings">
              <Button
                variant="outline"
                size="sm"
                className={cn("h-11 px-3 shrink-0 rounded-xl border-zinc-200 dark:border-white/10 relative transition-all gap-1.5 hidden sm:flex bg-white hover:bg-zinc-50 text-zinc-600 hover:text-cyan-600 shadow-sm")}
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              >
                <span className="text-xs font-semibold">{videoDuration}s</span>
                <div className="h-3 w-px bg-zinc-300 rounded"></div>
                <span className="text-[10px]">{aspectRatio === '16:9' ? 'L' : 'P'}</span>
              </Button>

              <Button
                variant="outline"
                size="icon"
                className={cn("h-11 w-11 shrink-0 rounded-xl border-zinc-200 dark:border-white/10 relative transition-all sm:hidden bg-white shadow-sm hover:text-cyan-600 text-zinc-600", showAdvancedSettings ? "bg-zinc-100 ring-2 ring-cyan-500/20" : "")}
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              >
                <span className="text-sm font-bold opacity-80">⚙️</span>
              </Button>

              {showAdvancedSettings && (
                <div className="absolute right-[-44px] sm:right-0 bottom-[110%] mb-2 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200 dark:border-white/10 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.15)] w-[92vw] sm:w-[320px] max-w-[340px] p-4 animate-in zoom-in-95 origin-bottom-right z-50">
                  <p className="text-[10px] font-bold text-zinc-400 mb-3 uppercase tracking-wider flex items-center justify-between">
                    <span>Thông số Video</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-zinc-400" onClick={() => setShowAdvancedSettings(false)}><X className="h-3 w-3"/></Button>
                  </p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-zinc-500 font-semibold">KHUNG HÌNH</Label>
                        <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as '16:9' | '9:16')}>
                          <SelectTrigger className="h-9 text-xs bg-zinc-50 dark:bg-black/40 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-lg shadow-sm"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-100 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-xl">
                            <SelectItem value="16:9">Ngang 16:9</SelectItem>
                            <SelectItem value="9:16">Dọc 9:16</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-zinc-500 font-semibold">ĐỘ PHÂN GIẢI</Label>
                        <Select value={outputResolution} onValueChange={setOutputResolution}>
                          <SelectTrigger className="h-9 text-xs bg-zinc-50 dark:bg-black/40 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-lg shadow-sm"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-100 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-xl">
                            <SelectItem value="720p">720p</SelectItem>
                            <SelectItem value="1080p">1080p</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-zinc-500 font-semibold">THỜI LƯỢNG MẶC ĐỊNH</Label>
                      <Select value={videoDuration} onValueChange={setVideoDuration}>
                        <SelectTrigger className="h-9 text-xs bg-zinc-50 dark:bg-black/40 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-lg shadow-sm"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-100 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-xl">
                          <SelectItem value="4">4 Giây (Tiết kiệm)</SelectItem>
                          <SelectItem value="6">6 Giây (Tiêu chuẩn)</SelectItem>
                          <SelectItem value="8">8 Giây (Tối đa)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-zinc-500 font-semibold">CỐT LÕI AI</Label>
                      <Select value={videoModel} onValueChange={setVideoModel}>
                        <SelectTrigger className="h-9 text-xs bg-cyan-50 dark:bg-black/40 border-cyan-200 dark:border-cyan-800/40 text-cyan-700 dark:text-cyan-300 rounded-lg shadow-sm font-medium"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-100 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-xl">
                          <SelectItem value="veo-3.1-fast-generate-preview">iGen Veo 3.1 Fast</SelectItem>
                          <SelectItem value="veo-3.1-lite-generate-preview">iGen Veo 3.1 Lite</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SEND BUTTON */}
            <Button
              className={cn("h-11 w-11 sm:w-auto px-0 sm:px-5 shrink-0 rounded-xl font-bold shadow-md transition-all focus:ring-2 ring-cyan-500/50 ring-offset-2 ring-offset-white active:scale-95",
                isGenerateDisabled ? "bg-zinc-100 text-zinc-400" : "bg-gradient-to-r from-cyan-500 to-cyan-500 hover:from-cyan-600 hover:to-cyan-600 text-white shadow-cyan-500/20 hover:shadow-lg hover:shadow-cyan-500/40"
              )}
              onClick={() => handleGenerateRef.current?.(false)}
              disabled={isGenerateDisabled}
            >
              {isBusy ? <Loader2 className="h-5 w-5 sm:h-4 sm:w-4 animate-spin text-white" /> : (
                <>
                  <Video className="h-5 w-5 sm:hidden" />
                  <span className="hidden sm:inline">Tạo Video</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <VideoEditorModal
        clipUrl={editorClipUrl || ''}
        isOpen={!!editorClipUrl}
        onClose={() => setEditorClipUrl(null)}
        onSubmit={handleEditorSubmit}
        isGenerating={jobStatus === 'processing'}
      />
    </div>
  );
}
