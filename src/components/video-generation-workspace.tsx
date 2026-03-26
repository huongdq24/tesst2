'use client';

import { useState, useRef, ChangeEvent, DragEvent, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Video, X, UploadCloud, Wand2, Copy, Images, Download, ArrowRight, ImagePlus, ChevronDown, Play, Pencil, Paperclip, Plus } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { VideoEditorModal, type VideoEditorSubmitParams } from '@/components/modals/video-editor-modal';

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
  const [scriptModel, setScriptModel] = useState('gemini-3.1-flash-lite-preview');
  const [videoModel, setVideoModel] = useState('veo-3.1-fast-generate-preview');
  const [videoDuration, setVideoDuration] = useState('8');
  const [frameRate, setFrameRate] = useState('24');
  const [outputResolution, setOutputResolution] = useState('720p');

  // New UI states for redesigned interface
  type VideoClip = { url: string; duration: string; geminiFileUri?: string | null };
  const [videoProject, setVideoProject] = useState<VideoClip[]>([]);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [isEditingScript, setIsEditingScript] = useState(false);
  const [editorClipUrl, setEditorClipUrl] = useState<string | null>(null);

  // Before & After mode states
  const [inputMode, setInputMode] = useState<InputMode>('standard');
  const [beforeImageUrl, setBeforeImageUrl] = useState<string | null>(null);
  const [afterImageUrl, setAfterImageUrl] = useState<string | null>(null);
  const [isUploadingBefore, setIsUploadingBefore] = useState(false);
  const [isUploadingAfter, setIsUploadingAfter] = useState(false);
  const [isDraggingBefore, setIsDraggingBefore] = useState(false);
  const [isDraggingAfter, setIsDraggingAfter] = useState(false);
  const [libraryTarget, setLibraryTarget] = useState<'standard' | 'before' | 'after'>('standard');

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

  const handleGenerate = async (bypassParam?: boolean | any) => {
    // If triggered by a real user button click, bypassParam is an Event object, not true.
    const isAutoBypass = bypassParam === true;

    if (!isAutoBypass) {
      isSafetyBypassModeRef.current = false;
    }

    if (inputMode === 'standard' && !prompt.trim()) {
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
    toast({ title: "Bắt đầu tạo video...", description: "Quá trình này có thể mất vài phút." });

    // Build reference images and prompt based on input mode
    let referenceImages: string[] | undefined;
    let finalPrompt = prompt;

    if (isAutoBypass === true) {
      referenceImages = undefined; // Strip images to bypass filter
      finalPrompt = prompt.trim() || '';
      console.log("[VideoGen] Executing text-only fallback generation state...");
    } else if (inputMode === 'before-after' && beforeImageUrl && afterImageUrl) {
      // BEFORE image = reference image = first frame of the video
      referenceImages = [beforeImageUrl];
      // The AFTER image will be sent via afterImageUri to the flow,
      // which will use Gemini to analyze it and build a detailed prompt.
      // The user's prompt (if any) is passed along as additional context.
      finalPrompt = prompt.trim() || '';
    } else if (inputImageUrls.length > 0) {
      referenceImages = inputImageUrls;
    }

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

  const isBusy = jobStatus === 'processing' || isGeneratingScript || isUploading || isUploadingBefore || isUploadingAfter || isSaving;
  const isGenerateDisabled = isBusy || (inputMode === 'standard' && !prompt.trim()) || (inputMode === 'before-after' && (!beforeImageUrl || !afterImageUrl));

  return (
    <div className="flex flex-col flex-1 min-h-[calc(100vh-140px)] relative bg-white dark:bg-zinc-950 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-xl">
      <ImageLibraryModal
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        onImageSelect={(url) => { if (libraryTarget === 'standard') setInputImageUrls(p => [...p, url]); else if (libraryTarget === 'before') setBeforeImageUrl(url); else setAfterImageUrl(url); setIsLibraryOpen(false); }}
        onVideoExtend={activateExtendMode}
      />
      <input ref={beforeFileInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleBeforeAfterFileChange(e, 'before')} disabled={isBusy} />
      <input ref={afterFileInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleBeforeAfterFileChange(e, 'after')} disabled={isBusy} />
      <input ref={fileInputRef} id="image-upload-input" type="file" className="hidden" multiple onChange={handleFileChange} accept="image/*" disabled={isBusy} />

      {/* --- ERROR / LOADING OVERLAY --- */}
      {(jobStatus === 'processing' || errorDetails) && (
        <div className="absolute inset-0 z-50 bg-white/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          {jobStatus === 'processing' ? (
            <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white dark:bg-zinc-900 border border-teal-100 dark:border-teal-900/30 text-zinc-900 dark:text-white shadow-2xl">
              <Loader2 className="h-12 w-12 animate-spin text-teal-500" />
              <p className="text-sm font-medium">{t('workspace.video.loadingMessage') || 'Đang tạo video...'}</p>
              <div className="text-xs font-mono text-teal-700 bg-teal-50 px-3 py-1 rounded-full">{elapsedTime}s</div>
              {isSaving && <p className="text-xs text-teal-600">Đang lưu video...</p>}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-red-50 dark:bg-red-950/80 border border-red-200 dark:border-red-500/30 text-zinc-900 dark:text-white max-w-lg text-center shadow-2xl">
              <X className="h-12 w-12 text-red-500" />
              <p className="font-semibold text-lg">Đã xảy ra lỗi</p>
              <p className="text-sm text-red-600 dark:text-red-200/80 whitespace-pre-wrap">{errorDetails}</p>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" className="bg-white hover:bg-zinc-100" onClick={() => setErrorDetails(null)}>Đóng</Button>
                <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => handleGenerateRef.current?.(false)} disabled={(!prompt.trim() && inputMode === 'standard')}>Thử lại</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- MAIN CANVAS (GALLERY) --- */}
      <div className="flex-1 overflow-y-auto p-6 md:p-10 pb-40 w-full scrollbar-thin rounded-xl">
        {videoProject.length > 0 ? (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-teal-500/20">
                <Video className="h-4 w-4 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">Dự án hiện tại</h2>
              <span className="text-xs font-medium text-teal-700 dark:text-teal-200 bg-teal-100 dark:bg-teal-500/20 px-2.5 py-1 rounded-full border border-teal-200 dark:border-teal-500/20">{videoProject.length} clips</span>

              <Button variant="ghost" size="sm" className="ml-auto text-zinc-500 hover:text-teal-600 hover:bg-teal-50 rounded-full px-4 border border-transparent" onClick={() => { setVideoProject([]); setGeneratedVideoUrls([]); }}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Dự án mới
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {videoProject.map((clip, index) => (
                <div key={index} className="group flex flex-col gap-2">
                  <div
                    className="relative w-full aspect-video bg-zinc-100 dark:bg-zinc-900 rounded-xl overflow-hidden border border-zinc-200 dark:border-white/10 hover:border-teal-500/50 transition-all cursor-pointer shadow-md hover:shadow-teal-900/10"
                    onClick={() => setEditorClipUrl(clip.url)}
                  >
                    <video src={clip.url} className="w-full h-full object-cover rounded-xl group-hover:scale-[1.03] transition-transform duration-700 ease-out" />

                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3 rounded-xl pointer-events-none">
                      <div className="flex justify-between items-start pointer-events-auto">
                        <span className="bg-white/90 dark:bg-black/60 text-teal-700 dark:text-white/90 text-[10px] uppercase font-bold px-2.5 py-1 rounded shadow-sm">
                          Clip {index + 1}
                        </span>
                        <a href={clip.url} download onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-7 w-7 bg-white/40 hover:bg-white/80 text-zinc-900 rounded-full backdrop-blur-sm">
                            <Download className="h-3 w-3" />
                          </Button>
                        </a>
                      </div>

                      <div className="self-center pointer-events-auto" onClick={(e) => { e.stopPropagation(); setEditorClipUrl(clip.url); }}>
                        <div className="h-12 w-12 rounded-full bg-white/40 backdrop-blur-md flex items-center justify-center translate-y-4 group-hover:translate-y-0 transition-transform duration-300 shadow-xl shadow-black/20 hover:bg-white/60 hover:scale-110">
                          <Play className="h-5 w-5 text-zinc-900 ml-1" />
                        </div>
                      </div>

                      <p className="text-[11px] font-medium text-white line-clamp-1 translate-y-2 group-hover:translate-y-0 transition-transform duration-300 delay-75 drop-shadow-md">{clip.duration}</p>
                    </div>
                  </div>

                  {!videoModel.includes('veo-2') && index === videoProject.length - 1 && (
                    <Button
                      variant="outline"
                      className="w-full border-dashed border-zinc-300 dark:border-white/20 bg-transparent hover:bg-teal-50 hover:text-teal-700 text-zinc-500 h-9 text-xs rounded-xl transition-colors"
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
              <div className="absolute inset-0 bg-teal-400/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
              <div className="relative h-24 w-24 bg-gradient-to-br from-teal-50 to-cyan-100 dark:from-teal-900/30 dark:to-cyan-900/30 rounded-full flex items-center justify-center border border-teal-200 dark:border-teal-800 shadow-xl shadow-teal-500/10">
                <Wand2 className="h-10 w-10 text-teal-500 animate-pulse" />
              </div>
            </div>
            <div>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-cyan-500">iGen +</h1>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">Không gian làm việc vô cực. Chỉ cần mô tả ý tưởng, AI sẽ kết xuất video chuẩn điện ảnh với độ phân giải lên đến 4k.</p>
            </div>

            {/* TEMPLATES GRID IN EMPTY STATE */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full mt-8 max-w-2xl px-4">
              {VIDEO_TEMPLATES.filter(t => t.id !== 'none').slice(0, 6).map(tmpl => (
                <div
                  key={tmpl.id}
                  onClick={() => { setInputMode('standard'); setSelectedTemplate(tmpl.id); setScriptDescription(tmpl.prompt); }}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 hover:border-teal-400/50 hover:bg-teal-50 dark:hover:bg-teal-900/10 p-3 sm:p-4 rounded-xl cursor-pointer text-left transition-all duration-300 group shadow-sm hover:shadow-md"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{tmpl.label}</p>
                    <ArrowRight className="h-3 w-3 text-zinc-400 group-hover:text-teal-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-[11px] text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 line-clamp-2 leading-relaxed">{tmpl.prompt}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* --- EXTEND ALERT --- */}
      {extendingVideoUrl && (
        <div className="absolute bottom-[110px] left-1/2 -translate-x-1/2 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-teal-200 dark:border-teal-800 rounded-2xl p-2.5 shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5">
          <div className="h-10 w-16 bg-zinc-100 rounded-lg overflow-hidden ring-1 ring-black/5 relative group">
            <video src={extendingVideoUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-sm">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="h-1.5 w-1.5 bg-teal-500 rounded-full animate-pulse"></div>
              <span className="font-semibold text-teal-700 dark:text-teal-400 text-xs uppercase tracking-wider">Đang nối tiếp clip</span>
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
            <div className="p-4 border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-950/20 flex gap-4 rounded-t-2xl items-center justify-center overflow-x-auto scrollbar-none min-h-[160px]">
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
                  afterImageUrl ? "border-teal-400 shadow-[0_0_15px_rgba(20,184,166,0.1)] flex-none w-fit" : "border-zinc-200 hover:border-teal-300 flex-1 min-h-[120px] flex items-center justify-center"
                )}
              >
                {isUploadingAfter ? <Loader2 className="h-4 w-4 animate-spin text-teal-500" />
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
                        <UploadCloud className="h-6 w-6 text-teal-500/60 mb-1.5" />
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">Tải Ảnh Sau</span>
                      </div>
                      <div className="w-full border-t border-zinc-200/50 dark:border-white/5 my-3"></div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setLibraryTarget('after'); setIsLibraryOpen(true); }}
                        className="text-[10px] font-semibold text-teal-600 h-7 w-full rounded-lg hover:bg-teal-50 dark:hover:bg-teal-950/30"
                      >
                        Mở thư viện
                      </Button>
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* AI Script Output Popover Content (If active) */}
          {prompt && (
            <div className={cn("px-4 py-3 border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-950/20 flex flex-col gap-2 backdrop-blur-md", inputMode === 'standard' ? "rounded-t-2xl" : "border-t border-zinc-200 dark:border-white/10")}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/30 px-2 py-0.5 rounded text-center">✨ Kịch bản AI / Prompt</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-teal-600 rounded-full hover:bg-teal-50" onClick={() => setIsEditingScript(!isEditingScript)}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-teal-600 rounded-full hover:bg-teal-50" onClick={handleCopy}><Copy className="h-3 w-3" /></Button>
                </div>
              </div>
              {isEditingScript ? (
                <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="text-xs bg-white dark:bg-black/40 border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-300 min-h-[60px] max-h-[150px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 rounded-lg focus-visible:ring-teal-500/30 p-2.5" />
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
              className={cn("h-11 w-11 shrink-0 rounded-xl transition-all", showImageUpload ? "bg-teal-50 text-teal-600 dark:bg-white/10 dark:text-white" : "hover:bg-zinc-100 text-zinc-500 bg-zinc-50 dark:bg-black/30")}
              onClick={() => setShowImageUpload(!showImageUpload)}
            >
              <Plus className={cn("h-5 w-5 transition-transform duration-300", showImageUpload && "rotate-45")} />
            </Button>

            {/* Attachment Popover */}
            {showImageUpload && (
              <div className="absolute bottom-[110%] left-0 mb-1 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-2xl shadow-xl w-[280px] animate-in slide-in-from-bottom-2 z-50">
                <div className="flex items-center gap-2 mb-3 bg-zinc-100 dark:bg-black/40 p-1 rounded-lg">
                  <Button variant="ghost" size="sm" className={cn("flex-1 text-xs justify-center h-8 rounded-md transition-colors", inputMode === 'standard' ? "bg-white text-teal-600 shadow-sm" : "text-zinc-500 hover:text-teal-600")} onClick={() => { setInputMode('standard'); }}>
                    Tiêu chuẩn
                  </Button>
                  <Button variant="ghost" size="sm" className={cn("flex-1 text-xs justify-center h-8 rounded-md transition-colors", inputMode === 'before-after' ? "bg-white text-teal-600 shadow-sm" : "text-zinc-500 hover:text-teal-600")} onClick={() => { setInputMode('before-after'); }}>
                    Trước Sau
                  </Button>
                </div>

                {inputMode === 'standard' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Ảnh tham chiếu</p>
                      <Button variant="link" size="sm" className="h-5 text-[10px] text-teal-500 px-0" onClick={() => { setLibraryTarget('standard'); setIsLibraryOpen(true); }}>Mở thư viện</Button>
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
                      <div className="h-20 w-full rounded-xl border border-dashed border-zinc-300 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-50 text-zinc-400 hover:text-teal-600 transition-colors" onClick={() => fileInputRef.current?.click()}>
                        <UploadCloud className="h-6 w-6 mb-1 opacity-70" />
                        <span className="text-[10px] font-medium">Tải ảnh tham chiếu</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Input Field */}
            <div className="flex-1 bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-xl relative flex items-center focus-within:ring-1 focus-within:ring-teal-400/50 transition-all shadow-inner">
              <Textarea
                value={scriptDescription}
                onChange={(e) => setScriptDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (scriptDescription.trim() && !isGeneratingScript) handleGenerateScript();
                  }
                }}
                placeholder={inputMode === 'standard' ? "Bạn muốn tạo gì? (Bấm ✨ AI sẽ viết kịch bản giúp bạn)" : "Tùy chọn: Nhập thêm yêu cầu chuyển đổi (VD: Phong cách Vintage...)"}
                className="resize-none border-0 bg-transparent shadow-none text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-500 min-h-[44px] max-h-[150px] overflow-y-auto py-3 pl-3 pr-10 focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-zinc-200 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-800 [&::-webkit-scrollbar-thumb]:rounded-full"
                rows={scriptDescription.length > 80 ? 3 : 1}
                disabled={isBusy}
              />

              {/* AI Magic Wand inside the input */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleGenerateScript}
                disabled={isBusy || !scriptDescription.trim() || isGeneratingScript}
                className={cn("absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg transition-all", isGeneratingScript ? "bg-teal-50 text-teal-500" : "hover:bg-zinc-200 text-zinc-400 hover:text-teal-500", (!scriptDescription.trim() && "opacity-50 grayscale"))}
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
                className={cn("h-11 px-3 shrink-0 rounded-xl border-zinc-200 dark:border-white/10 relative transition-all gap-1.5 hidden sm:flex bg-white hover:bg-zinc-50 text-zinc-600 hover:text-teal-600 shadow-sm")}
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              >
                <span className="text-xs font-semibold">{videoDuration}s</span>
                <div className="h-3 w-px bg-zinc-300 rounded"></div>
                <span className="text-[10px]">{aspectRatio === '16:9' ? 'L' : 'P'}</span>
              </Button>

              <Button
                variant="outline"
                size="icon"
                className={cn("h-11 w-11 shrink-0 rounded-xl border-zinc-200 dark:border-white/10 relative transition-all sm:hidden bg-white shadow-sm hover:text-teal-600 text-zinc-600", showAdvancedSettings ? "bg-zinc-100" : "")}
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              >
                <span className="text-xs font-bold">⚙️</span>
              </Button>

              {showAdvancedSettings && (
                <div className="absolute right-0 bottom-[110%] mb-1 bg-white dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200 dark:border-white/10 rounded-2xl shadow-xl w-[300px] p-4 animate-in slide-in-from-bottom-2 z-50 origin-bottom-right">
                  <p className="text-[10px] font-bold text-zinc-400 mb-3 uppercase tracking-wider">Thông số Video</p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-zinc-500">KHUNG HÌNH</Label>
                        <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as '16:9' | '9:16')}>
                          <SelectTrigger className="h-9 text-xs bg-zinc-50 dark:bg-black/40 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-lg"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-100 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-xl">
                            <SelectItem value="16:9">Ngang 16:9</SelectItem>
                            <SelectItem value="9:16">Dọc 9:16</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-zinc-500">ĐỘ PHÂN GIẢI</Label>
                        <Select value={outputResolution} onValueChange={setOutputResolution} disabled={videoModel.includes('veo-2')}>
                          <SelectTrigger className="h-9 text-xs bg-zinc-50 dark:bg-black/40 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-lg"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-100 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-xl">
                            <SelectItem value="720p">720p</SelectItem>
                            <SelectItem value="1080p">1080p</SelectItem>
                            <SelectItem value="4k">4k HDR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-zinc-500">THỜI LƯỢNG MẶC ĐỊNH</Label>
                      <Select value={videoDuration} onValueChange={setVideoDuration}>
                        <SelectTrigger className="h-9 text-xs bg-zinc-50 dark:bg-black/40 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-lg"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-100 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-xl">
                          <SelectItem value="4">4 Giây (Tiết kiệm)</SelectItem>
                          <SelectItem value="6">6 Giây (Tiêu chuẩn)</SelectItem>
                          <SelectItem value="8">8 Giây (Tối đa)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-zinc-500">CỐT LÕI AI</Label>
                      <Select value={videoModel} onValueChange={setVideoModel}>
                        <SelectTrigger className="h-9 text-xs bg-teal-50 dark:bg-black/40 border-teal-200 dark:border-white/10 text-teal-700 dark:text-teal-300 rounded-lg font-medium"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-100 dark:border-white/10 text-zinc-700 dark:text-zinc-200 rounded-xl">
                          <SelectItem value="veo-3.1-generate-preview">iGen Veo 3.1 Pro (Cao cấp)</SelectItem>
                          <SelectItem value="veo-3.1-fast-generate-preview">iGen Veo 3.1 Fast (Nhanh)</SelectItem>
                          {inputMode !== 'before-after' && (
                            <SelectItem value="veo-2.0-generate-001">iGen Veo 2.0 Legacy</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SEND BUTTON */}
            <Button
              className={cn("h-11 w-11 sm:w-auto px-0 sm:px-5 shrink-0 rounded-xl font-bold shadow-md transition-all focus:ring-2 ring-teal-500/50 ring-offset-2 ring-offset-white active:scale-95",
                isGenerateDisabled ? "bg-zinc-100 text-zinc-400" : "bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white shadow-teal-500/20 hover:shadow-lg hover:shadow-teal-500/40"
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
