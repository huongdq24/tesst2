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
      finalPrompt += ` [Apply to region: x=${Math.round(params.selection.relativeX*100)}%, y=${Math.round(params.selection.relativeY*100)}%, w=${Math.round(params.selection.relativeW*100)}%, h=${Math.round(params.selection.relativeH*100)}%]`;
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
        setErrorDetails(result.error);
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
    if(event.target) {
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
      <ImageLibraryModal
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        onImageSelect={handleImageSelectFromLibrary}
        onVideoExtend={activateExtendMode}
      />
      {/* Hidden file inputs for Before/After mode */}
      <input ref={beforeFileInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleBeforeAfterFileChange(e, 'before')} disabled={isBusy} />
      <input ref={afterFileInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleBeforeAfterFileChange(e, 'after')} disabled={isBusy} />
      <div className="lg:col-span-1 flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardContent className="p-6 flex flex-col flex-1 gap-4">
            {!userData?.geminiApiKey && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                ⚠️ Bạn chưa thêm Gemini API Key. Vui lòng thêm API key trong menu tài khoản để sử dụng tính năng tạo video.
              </div>
            )}

            {/* === INPUT MODE TABS === */}
            <div className="space-y-2">
              <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as InputMode)} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="standard" className="text-xs">
                    <Video className="mr-1.5 h-3.5 w-3.5" />
                    Tiêu chuẩn
                  </TabsTrigger>
                  <TabsTrigger value="before-after" className="text-xs">
                    <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                    Trước & Sau
                  </TabsTrigger>
                </TabsList>

                {/* ======= STANDARD MODE (REDESIGNED 3-STEP FLOW) ======= */}
                <TabsContent value="standard" className="mt-4 space-y-4">

                  {/* --- Extend Mode Banner --- */}
                  {extendingVideoUrl && (
                    <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-xl p-3 flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
                       <div className="h-12 w-20 bg-black rounded-lg overflow-hidden flex-shrink-0 ring-2 ring-sky-400">
                         <video src={extendingVideoUrl} className="w-full h-full object-cover" muted />
                       </div>
                       <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <div className="h-2 w-2 bg-sky-500 rounded-full animate-pulse" />
                            <strong className="text-sky-700 dark:text-sky-300 font-semibold text-sm">🔗 Nối tiếp video này</strong>
                          </div>
                          <span className="text-muted-foreground text-xs">Nhập kịch bản mới cho đoạn tiếp theo</span>
                       </div>
                       <Button variant="ghost" size="sm" onClick={() => setExtendingVideoUrl(null)} className="h-7 px-2 hover:bg-destructive/20 hover:text-destructive shrink-0 text-xs">
                          ✕ Hủy
                       </Button>
                    </div>
                  )}

                  {/* --- STEP 1: Describe your video idea --- */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">1</div>
                      <Label className="font-semibold text-sm">Mô tả ý tưởng video</Label>
                    </div>
                    
                    {/* Template chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {VIDEO_TEMPLATES.filter(t => t.id !== 'none').map(tmpl => (
                        <button
                          key={tmpl.id}
                          onClick={() => { setSelectedTemplate(tmpl.id); setScriptDescription(tmpl.prompt); }}
                          disabled={isBusy}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-xs border transition-all hover:shadow-sm",
                            selectedTemplate === tmpl.id 
                              ? "bg-primary text-primary-foreground border-primary" 
                              : "bg-background hover:bg-muted border-border"
                          )}
                        >
                          {tmpl.label}
                        </button>
                      ))}
                    </div>

                    <Textarea
                      id="script-description"
                      placeholder="Mô tả video bạn muốn tạo. VD: Cô gái mặc áo dài bước đi trên phố cổ Hội An, giọng nói miền Bắc..."
                      value={scriptDescription}
                      onChange={(e) => { setScriptDescription(e.target.value); setSelectedTemplate('none'); }}
                      rows={3}
                      disabled={isBusy}
                      className="resize-none text-sm"
                    />
                    
                    {/* Collapsible image upload */}
                    <button 
                      onClick={() => setShowImageUpload(!showImageUpload)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      <span>Đính kèm ảnh tham chiếu</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showImageUpload && "rotate-180")} />
                    </button>
                    
                    {showImageUpload && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                        <div className="flex justify-end">
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setLibraryTarget('standard'); setIsLibraryOpen(true); }} disabled={isBusy}>
                            <Images className="mr-1 h-3 w-3" /> Thư viện
                          </Button>
                        </div>
                        <div
                          className={cn(
                            'relative flex flex-col items-center justify-center w-full min-h-20 p-2 border-2 border-dashed rounded-lg transition-colors',
                            isDragging ? 'border-primary bg-primary/10' : 'hover:bg-muted'
                          )}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                        >
                          {isUploading ? (
                            <div className="flex flex-col items-center justify-center text-muted-foreground">
                              <Loader2 className="w-6 h-6 animate-spin" />
                              <p className="text-xs mt-1">{t('workspace.image.uploading')}</p>
                            </div>
                          ) : inputImageUrls.length > 0 ? (
                            <div className="grid grid-cols-4 gap-1.5 w-full">
                              {inputImageUrls.map((url) => (
                                <div key={url} className="relative aspect-square">
                                  <Image src={url} alt="ref" fill style={{ objectFit: 'contain' }} className="rounded p-0.5 bg-white" />
                                  <Button variant="destructive" size="icon" className="absolute -top-1 -right-1 h-5 w-5 rounded-full z-10" onClick={(e) => { e.stopPropagation(); handleRemoveImage(url); }}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                              <div className="flex aspect-square flex-col items-center justify-center rounded border border-dashed text-muted-foreground hover:bg-muted/50 cursor-pointer text-xs" onClick={() => fileInputRef.current?.click()}>
                                <Plus className="w-4 h-4" />
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center text-muted-foreground text-center cursor-pointer py-2" onClick={() => fileInputRef.current?.click()}>
                              <UploadCloud className="w-6 h-6 mb-1" />
                              <p className="text-xs">Kéo thả hoặc nhấp để tải ảnh</p>
                            </div>
                          )}
                          <input ref={fileInputRef} id="image-upload-input" type="file" className="hidden" multiple onChange={handleFileChange} accept="image/*" disabled={isBusy} />
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>



                {/* === BEFORE & AFTER MODE === */}
                <TabsContent value="before-after" className="mt-3 space-y-3">
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5 text-xs text-blue-700 dark:text-blue-300">
                    💡 Tải lên ảnh <strong>TRƯỚC</strong> (trạng thái ban đầu) và ảnh <strong>SAU</strong> (trạng thái hoàn thiện). AI sẽ tạo video chuyển đổi mượt mà giữa 2 trạng thái.
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {/* BEFORE Image */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-orange-600 dark:text-orange-400">📷 Ảnh TRƯỚC</Label>
                        <Button
                          variant="ghost" size="sm" className="h-6 px-2 text-xs"
                          onClick={() => { setLibraryTarget('before'); setIsLibraryOpen(true); }}
                          disabled={isBusy}
                        >
                          <Images className="mr-1 h-3 w-3" /> Thư viện
                        </Button>
                      </div>
                      <div
                        className={cn(
                          'relative flex flex-col items-center justify-center w-full aspect-[4/3] border-2 border-dashed rounded-lg transition-all cursor-pointer overflow-hidden',
                          isDraggingBefore ? 'border-orange-500 bg-orange-500/10 scale-[1.02]' : 'border-orange-300 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/20',
                          beforeImageUrl && 'border-solid border-orange-400'
                        )}
                        onDragOver={(e) => handleBeforeAfterDragOver(e, 'before')}
                        onDragLeave={(e) => handleBeforeAfterDragLeave(e, 'before')}
                        onDrop={(e) => handleBeforeAfterDrop(e, 'before')}
                        onClick={() => !beforeImageUrl && beforeFileInputRef.current?.click()}
                      >
                        {isUploadingBefore ? (
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <p className="text-xs mt-1.5">Đang tải...</p>
                          </div>
                        ) : beforeImageUrl ? (
                          <>
                            <Image src={beforeImageUrl} alt="Before" fill style={{ objectFit: 'cover' }} className="rounded-md" />
                            <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center">
                              <Button
                                variant="destructive"
                                size="icon"
                                className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 hover:!opacity-100 z-10"
                                style={{ opacity: undefined }}
                                onClick={(e) => { e.stopPropagation(); setBeforeImageUrl(null); }}
                                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                onMouseLeave={(e) => (e.currentTarget.style.opacity = '')}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-orange-600/80 to-transparent p-1.5">
                              <span className="text-[10px] font-bold text-white uppercase tracking-wider">Trước</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-orange-500/70 dark:text-orange-400/50">
                            <ImagePlus className="w-7 h-7 mb-1" />
                            <p className="text-[10px] font-medium">Ảnh ban đầu</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* AFTER Image */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">🎯 Ảnh SAU</Label>
                        <Button
                          variant="ghost" size="sm" className="h-6 px-2 text-xs"
                          onClick={() => { setLibraryTarget('after'); setIsLibraryOpen(true); }}
                          disabled={isBusy}
                        >
                          <Images className="mr-1 h-3 w-3" /> Thư viện
                        </Button>
                      </div>
                      <div
                        className={cn(
                          'relative flex flex-col items-center justify-center w-full aspect-[4/3] border-2 border-dashed rounded-lg transition-all cursor-pointer overflow-hidden',
                          isDraggingAfter ? 'border-emerald-500 bg-emerald-500/10 scale-[1.02]' : 'border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20',
                          afterImageUrl && 'border-solid border-emerald-400'
                        )}
                        onDragOver={(e) => handleBeforeAfterDragOver(e, 'after')}
                        onDragLeave={(e) => handleBeforeAfterDragLeave(e, 'after')}
                        onDrop={(e) => handleBeforeAfterDrop(e, 'after')}
                        onClick={() => !afterImageUrl && afterFileInputRef.current?.click()}
                      >
                        {isUploadingAfter ? (
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <p className="text-xs mt-1.5">Đang tải...</p>
                          </div>
                        ) : afterImageUrl ? (
                          <>
                            <Image src={afterImageUrl} alt="After" fill style={{ objectFit: 'cover' }} className="rounded-md" />
                            <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center">
                              <Button
                                variant="destructive"
                                size="icon"
                                className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 hover:!opacity-100 z-10"
                                style={{ opacity: undefined }}
                                onClick={(e) => { e.stopPropagation(); setAfterImageUrl(null); }}
                                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                onMouseLeave={(e) => (e.currentTarget.style.opacity = '')}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-emerald-600/80 to-transparent p-1.5">
                              <span className="text-[10px] font-bold text-white uppercase tracking-wider">Sau</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-emerald-500/70 dark:text-emerald-400/50">
                            <ImagePlus className="w-7 h-7 mb-1" />
                            <p className="text-[10px] font-medium">Ảnh hoàn thiện</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Arrow indicator between images */}
                  {beforeImageUrl && afterImageUrl && (
                    <div className="flex items-center justify-center gap-2 py-1">
                      <div className="h-px flex-1 bg-gradient-to-r from-orange-400 to-transparent" />
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                        <span className="text-orange-500">TRƯỚC</span>
                        <ArrowRight className="h-4 w-4 text-primary animate-pulse" />
                        <span className="text-emerald-500">SAU</span>
                      </div>
                      <div className="h-px flex-1 bg-gradient-to-l from-emerald-400 to-transparent" />
                    </div>
                  )}
                
                  {/* Before & After Idea / Prompt */}
                  <div className="space-y-3 pt-2">
                    <Label className="font-semibold text-xs">Mô tả hướng chuyển đổi (Tùy chọn)</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {BA_VIDEO_TEMPLATES.filter(t => t.id !== 'none').map(tmpl => (
                        <button
                          key={tmpl.id}
                          onClick={(e) => { e.preventDefault(); setSelectedTemplate(tmpl.id); setScriptDescription(tmpl.prompt); }}
                          disabled={isBusy}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-[10px] xl:text-xs border transition-all hover:shadow-sm",
                            selectedTemplate === tmpl.id 
                              ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                              : "bg-background hover:bg-muted border-border text-muted-foreground"
                          )}
                        >
                          {tmpl.label}
                        </button>
                      ))}
                    </div>
                    <Textarea
                      placeholder="Gợi ý ngữ cảnh cho AI. VD: Căn phòng biến đổi phong cách Vintage, màu trầm ấm..."
                      value={scriptDescription}
                      onChange={(e) => { setScriptDescription(e.target.value); setSelectedTemplate('none'); }}
                      rows={2}
                      disabled={isBusy}
                      className="resize-none text-xs"
                    />
                  </div>
                </TabsContent>
              </Tabs>

              <div className="space-y-5 pt-4">
                <Separator />


                  {/* --- STEP 2: AI Generate Script --- */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">2</div>
                      <Label className="font-semibold text-sm">AI Tạo kịch bản</Label>
                    </div>
                    
                    <Button
                      onClick={handleGenerateScript}
                      disabled={isGeneratingScript || !scriptDescription.trim()}
                      className="w-full bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white shadow-sm"
                    >
                      {isGeneratingScript ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="mr-2 h-4 w-4" />
                      )}
                      ✨ Tạo kịch bản AI
                    </Button>

                    {/* Motion analysis results */}
                    {motionAnalysis && cameraMovement && (
                      <div className="text-xs p-2.5 bg-violet-50 dark:bg-violet-950/20 rounded-lg space-y-1 border border-violet-200 dark:border-violet-800">
                        <p><strong>🎬 Chuyển động:</strong> {motionAnalysis}</p>
                        <p><strong>📷 Camera:</strong> <span className="text-violet-600 dark:text-violet-400 font-medium">{cameraMovement}</span></p>
                      </div>
                    )}

                    {/* AI Script output */}
                    {prompt && (
                      <div className="relative bg-muted/50 rounded-lg border p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-muted-foreground">Kịch bản AI</span>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsEditingScript(!isEditingScript)} title={isEditingScript ? "Xong" : "Chỉnh sửa"}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy} disabled={!prompt} title="Sao chép">
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {isEditingScript ? (
                          <Textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            disabled={isBusy}
                            className="resize-none text-xs min-h-[80px]"
                          />
                        ) : (
                          <p className="text-xs text-foreground/80 leading-relaxed line-clamp-5">{prompt}</p>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <Separator />

                  {/* --- STEP 3: Generate Video --- */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">3</div>
                      <Label className="font-semibold text-sm">Tạo Video</Label>
                    </div>
                    
                    {/* Collapsible Advanced Settings */}
                    <button 
                      onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                    >
                      <span>⚙️ Cài đặt nâng cao</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAdvancedSettings && "rotate-180")} />
                      {!showAdvancedSettings && (
                        <span className="text-[10px] text-muted-foreground/60 ml-auto">{videoModel.includes('veo-2') ? 'Veo 2.0' : videoModel.includes('fast') ? 'Veo 3.1 Fast' : 'Veo 3.1'} • {aspectRatio === '16:9' ? 'Ngang' : 'Dọc'} • {videoDuration}s</span>
                      )}
                    </button>

                    {showAdvancedSettings && (
                      <div className="space-y-3 p-3 bg-muted/30 rounded-lg border animate-in fade-in slide-in-from-top-1">
                        {/* Script Model */}
                        <div className="space-y-1">
                          <Label className="text-xs">Mô hình tạo kịch bản</Label>
                          <Select value={scriptModel} onValueChange={setScriptModel} disabled={isBusy}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="gemini-3.1-pro-preview">iGen-3.1-pro-preview</SelectItem>
                              <SelectItem value="gemini-3.1-flash-lite-preview">iGen-3.1-flash-lite-preview</SelectItem>
                              <SelectItem value="gemini-3-flash-preview">iGen-3-flash-preview</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {/* Video Model */}
                        <div className="space-y-1">
                          <Label className="text-xs">Mô hình tạo video</Label>
                          <Select value={videoModel} onValueChange={setVideoModel} disabled={isBusy}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {inputMode !== 'before-after' && <SelectItem value="veo-2.0-generate-001">iGen Veo 2.0</SelectItem>}
                              <SelectItem value="veo-3.1-generate-preview">iGen Veo 3.1</SelectItem>
                              <SelectItem value="veo-3.1-fast-generate-preview">iGen Veo 3.1 Fast</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {/* Aspect Ratio & Duration */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Tỷ lệ khung hình</Label>
                            <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as '16:9' | '9:16')} disabled={isBusy}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="16:9">{t('feature.videoGeneration.horizontal')}</SelectItem>
                                <SelectItem value="9:16">{t('feature.videoGeneration.vertical')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Thời lượng</Label>
                            <Select value={videoDuration} onValueChange={setVideoDuration} disabled={isBusy || (!videoModel.includes('veo-2') && (outputResolution === '1080p' || outputResolution === '4k'))}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {videoModel.includes('veo-2') ? (<><SelectItem value="5">5s</SelectItem><SelectItem value="6">6s</SelectItem><SelectItem value="8">8s</SelectItem></>) 
                                : (<><SelectItem value="4">4s</SelectItem><SelectItem value="6">6s</SelectItem><SelectItem value="8">8s</SelectItem></>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        {/* Resolution (Veo 3 only) */}
                        {!videoModel.includes('veo-2') && (
                          <div className="space-y-1">
                            <Label className="text-xs">Độ phân giải</Label>
                            <Select value={outputResolution} onValueChange={setOutputResolution} disabled={isBusy}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="720p">720p</SelectItem>
                                <SelectItem value="1080p">1080p</SelectItem>
                                <SelectItem value="4k">4k</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Main Generate Button */}
                    <Button 
                      onClick={handleGenerate} 
                      disabled={isGenerateDisabled} 
                      className="w-full h-11 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-md text-sm font-semibold"
                    >
                      {jobStatus === 'processing' ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Video className="mr-2 h-4 w-4" />
                      )}
                      🎬 {extendingVideoUrl ? 'Nối tiếp Video' : t('workspace.video.generateButton.label')}
                    </Button>
                  </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="lg:col-span-2 bg-muted/50 rounded-lg flex flex-col min-h-[400px] lg:min-h-0 p-4 gap-4">
        {/* Error Details Panel */}
        {errorDetails && jobStatus !== 'processing' && (
          <div className={cn(
            "w-full max-w-2xl rounded-lg p-4 text-sm border mx-auto",
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
                {jobStatus === 'failed' && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={handleGenerate} disabled={!prompt.trim()}>
                    🔄 Thử lại
                  </Button>
                )}
              </div>
              <Button variant="ghost" size="icon" className="flex-shrink-0 h-6 w-6" onClick={() => setErrorDetails(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {jobStatus === 'processing' ? (
          <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground flex-1">
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
        ) : videoProject.length > 0 ? (
          /* ======= VIDEO PROJECT TIMELINE ======= */
          <div className="flex flex-col gap-4 flex-1">
            {/* Project Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">📽️ Dự án Video</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {videoProject.length} clip{videoProject.length > 1 ? 's' : ''} • {videoProject.reduce((sum, c) => sum + parseInt(c.duration), 0)}s
                </span>
              </div>
              {videoProject.length > 0 && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setVideoProject([]); setGeneratedVideoUrls([]); }}>
                  Dự án mới
                </Button>
              )}
            </div>

            {/* Timeline Strip */}
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
              {videoProject.map((clip, index) => (
                <div key={index} className="flex items-center gap-1 shrink-0">
                  <div 
                    className="relative group rounded-xl overflow-hidden border-2 border-border hover:border-primary transition-colors bg-black w-[200px] aspect-video shadow-md cursor-pointer"
                    onClick={() => setEditorClipUrl(clip.url)}
                  >
                    <video src={clip.url} className="w-full h-full object-contain pointer-events-none" />
                    {/* Duration badge */}
                    <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                      Clip {index + 1} • {clip.duration}
                    </div>
                    {/* Action overlay */}
                    <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a href={clip.url} download={`igen-clip-${index + 1}.mp4`} target="_blank" rel="noopener noreferrer">
                        <Button variant="secondary" size="icon" className="h-7 w-7 bg-black/60 text-white hover:bg-black/80 border-none" title="Tải xuống">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    </div>
                  </div>
                  {/* Arrow connector between clips */}
                  {index < videoProject.length - 1 && (
                    <div className="flex flex-col items-center text-muted-foreground shrink-0">
                      <ArrowRight className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </div>
              ))}
              
              {/* "Add next clip" button on the timeline (only for Veo 3) */}
              {!videoModel.includes('veo-2') && videoProject.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <button
                    onClick={() => {
                      const lastClip = videoProject[videoProject.length - 1];
                      activateExtendMode(lastClip.url);
                    }}
                    className="flex flex-col items-center justify-center w-[120px] aspect-video rounded-xl border-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group"
                  >
                    <Plus className="h-6 w-6 text-primary/60 group-hover:text-primary transition-colors" />
                    <span className="text-[10px] font-medium text-primary/60 group-hover:text-primary mt-1">Nối tiếp</span>
                  </button>
                </div>
              )}
            </div>

            {/* Saving indicator */}
            {isSaving && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Đang lưu video vào thư viện...</span>
              </div>
            )}
          </div>
        ) : jobStatus !== 'failed' && (
          <div className="text-center text-muted-foreground flex-1 flex flex-col items-center justify-center">
            <Video className="h-16 w-16 mx-auto mb-4 opacity-30" />
            <p className="text-sm">{t('workspace.video.outputPlaceholder')}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Các video sẽ hiển thị dạng dự án theo từng clip</p>
          </div>
        )}
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
