'use client';

import { useState, useRef, ChangeEvent, DragEvent, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, UploadCloud, Video, Heart, Download, Play, Sparkles, ArrowRight, Images, Library, Settings, X, Link2 } from 'lucide-react';
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
type VideoClip = { url: string; duration: string; geminiFileUri?: string | null; prompt?: string; originalVeoUrl?: string | null };

// Model definitions for display
const MODEL_OPTIONS = [
  { value: 'veo-3.1-fast-generate-preview', label: 'iGen Veo 3.1 Nhanh', desc: 'Tốc độ nhanh, chất lượng tốt' },
  { value: 'veo-3.1-generate-preview', label: 'iGen Veo 3.1 HQ', desc: 'Chất lượng cao nhất' },
  { value: 'veo-2.0-generate-preview', label: 'iGen Veo 2.0', desc: 'Phiên bản ổn định cũ' },
];

const DURATION_OPTIONS = [
  { value: '4', label: '4 giây' },
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
  const [videoDuration, setVideoDuration] = useState('8');
  const [videoQuality, setVideoQuality] = useState('1080p');
  const [showSettings, setShowSettings] = useState(false);

  // Extend Video state
  const [extendVideoUrl, setExtendVideoUrl] = useState<string | null>(null);
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

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollingErrorsRef = useRef(0);

  // Project state
  const [videoProject, setVideoProject] = useState<VideoClip[]>([]);
  const { toast } = useToast();
  const { user, userData } = useAuth();

  const promptRef = useRef(prompt);
  useEffect(() => { promptRef.current = prompt; }, [prompt]);

  // Firebase Realtime Listener for Gallery
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(firestore, 'generatedVideos'),
      where('ownerId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const videos: (VideoClip & { timestamp: number })[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.videoUrl) {
          videos.push({
            url: data.videoUrl,
            duration: '8s',
            prompt: data.prompt,
            originalVeoUrl: data.originalVeoUrl || null,
            timestamp: data.createdAt?.toMillis() || 0
          });
        }
      });
      videos.sort((a, b) => b.timestamp - a.timestamp);
      const finalVideos = videos.map(({ timestamp, ...clip }) => clip);
      setVideoProject(finalVideos);
    });
    return () => unsubscribe();
  }, [user]);

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
        aspectRatio: '16:9',
        modelName: videoModel,
        createdAt: serverTimestamp(),
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
            if (result.videoUrl) {
              saveVideoToFirebase(result.videoUrl, promptRef.current);
            }
            toast({ title: "✅ Tạo video hoàn tất!" });
            cleanupPolling();
            setOperationName(null);
          } else if (result.status === 'failed') {
            setJobStatus('failed');
            setIsGenerating(false);
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
            cleanupPolling();
            setOperationName(null);
          }
        }
      }, 10000);
    }
    return () => cleanupPolling();
  }, [operationName, jobStatus, userData?.geminiApiKey, toast]);

  // Select video to extend
  const handleExtendVideo = (clip: VideoClip) => {
    if (!clip.originalVeoUrl) {
      toast({ variant: 'destructive', title: 'Không thể nối tiếp', description: 'Video này không có URL gốc từ Veo. Chỉ video mới tạo sau bản cập nhật này mới hỗ trợ nối tiếp.' });
      return;
    }
    setExtendVideoUrl(clip.originalVeoUrl);
    setExtendVideoPrompt(clip.prompt || null);
    setPrompt('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast({ title: '🔗 Đã chọn video gốc để nối tiếp!', description: 'Nhập mô tả cho phần tiếp theo rồi nhấn Tạo Video.' });
  };

  const cancelExtend = () => {
    setExtendVideoUrl(null);
    setExtendVideoPrompt(null);
  };

  const handleGenerate = async () => {
    if (!user || !userData?.geminiApiKey) {
      toast({ variant: 'destructive', title: 'Yêu cầu đăng nhập & API Key' });
      return;
    }

    // Extend mode validation
    if (extendVideoUrl) {
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
    setJobStatus('processing');
    setErrorDetails(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      // EXTEND MODE
      if (extendVideoUrl) {
        toast({ title: "🔗 Đang nối tiếp video..." });

        const aiResult = await videoScriptGeneration({
          description: prompt || 'Continue this video seamlessly with natural motion',
          model: 'gemini-3.1-flash-lite-preview',
          apiKey: userData.geminiApiKey,
        });
        const finalPrompt = aiResult.optimized_english_prompt;

        const result = await startVideoGeneration({
          textPrompt: finalPrompt,
          referenceVideoUri: extendVideoUrl,
          aspectRatio: '16:9',
          modelName: videoModel,
          userId: user.uid,
          apiKey: userData.geminiApiKey,
          durationSeconds: videoDuration,
          resolution: videoQuality,
        });

        if (result.status === 'failed') {
          setJobStatus('failed');
          setIsGenerating(false);
          toast({ variant: 'destructive', title: "Lỗi nối tiếp video", description: result.error });
        } else if (result.status === 'completed' && result.videoUrl) {
          setJobStatus('completed');
          setIsGenerating(false);
          saveVideoToFirebase(result.videoUrl, finalPrompt);
          toast({ title: "✅ Nối tiếp video hoàn tất!" });
          cancelExtend();
        } else if (result.status === 'processing' && result.operationName) {
          setOperationName(result.operationName);
        }
        return;
      }

      // NORMAL MODE
      toast({ title: "✨ Đang tự động tối ưu kịch bản..." });

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

      toast({ title: "🎬 Đang tạo video..." });

      const result = await startVideoGeneration({
        textPrompt: finalPrompt,
        referenceImageUris: referenceImageUris,
        afterImageUri: afterImageUri,
        aspectRatio: '16:9',
        modelName: videoModel,
        userId: user.uid,
        apiKey: userData.geminiApiKey,
        durationSeconds: videoDuration,
        resolution: videoQuality,
      });

      if (result.status === 'failed') {
        setJobStatus('failed');
        setIsGenerating(false);
        toast({ variant: 'destructive', title: "Lỗi tạo video", description: result.error });
      } else if (result.status === 'completed' && result.videoUrl) {
        setJobStatus('completed');
        setIsGenerating(false);
        saveVideoToFirebase(result.videoUrl, finalPrompt);
        toast({ title: "✅ Tạo video hoàn tất!" });
      } else if (result.status === 'processing' && result.operationName) {
        setOperationName(result.operationName);
      }
    } catch (error: any) {
      console.error(error);
      setIsGenerating(false);
      setJobStatus('failed');
      toast({ variant: 'destructive', title: "Lỗi kết nối", description: error.message });
    }
  };

  // Helper to get current model label
  const currentModelLabel = MODEL_OPTIONS.find(m => m.value === videoModel)?.label || videoModel;

  return (
    <div className="w-full max-w-[900px] mx-auto flex flex-col pt-8 pb-24 px-4">

      {/* HEADER TABS (Mode Switcher) */}
      <div className="flex justify-center mb-10">
        <div className="inline-flex items-center p-1.5 bg-zinc-100/80 dark:bg-zinc-800/60 backdrop-blur-md rounded-full border border-zinc-200/80 dark:border-white/5 shadow-inner">
          <button
            onClick={() => setActiveMode('standard')}
            className={cn(
              "flex items-center rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-300",
              activeMode === 'standard'
                ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            )}
          >
            <Video className="w-4 h-4 mr-2" /> Tiêu chuẩn (1 Ảnh)
          </button>
          <button
            onClick={() => setActiveMode('before-after')}
            className={cn(
              "flex items-center rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-300",
              activeMode === 'before-after'
                ? "bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            )}
          >
            <Images className="w-4 h-4 mr-2" /> Trước / Sau
          </button>
        </div>
      </div>

      {/* LUXURY MAIN CARD */}
      <div className="relative bg-white/70 dark:bg-zinc-900/50 backdrop-blur-2xl border border-white/60 dark:border-zinc-800/60 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_40px_-12px_rgba(20,184,166,0.05)] rounded-[2.5rem] p-8 md:p-12 overflow-hidden">

        {/* Subtle decorative glows */}
        <div className="absolute top-[-20%] left-[-10%] w-[40%] h-[40%] bg-teal-400/10 dark:bg-teal-500/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-cyan-400/10 dark:bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative z-10 text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3 bg-gradient-to-br from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent">
            {extendVideoUrl ? 'Nối tiếp Video' : activeMode === 'standard' ? 'Biến ảnh tĩnh thành kiệt tác động' : 'Phép màu chuyển đổi liền mạch'}
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-base md:text-lg max-w-xl mx-auto font-medium">
            {extendVideoUrl ? 'Mô tả nội dung bạn muốn tiếp diễn từ video đã chọn.' : 'Mô tả ý tưởng hoặc tải ảnh sản phẩm lên, AI sinh tạo của chúng tôi sẽ xử lý phần còn lại.'}
          </p>
        </div>

        {/* EXTEND VIDEO BANNER */}
        {extendVideoUrl && (
          <div className="relative z-10 w-full max-w-2xl mx-auto mb-8">
            <div className="bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 border border-teal-200 dark:border-teal-800/50 rounded-2xl p-4 flex gap-4 items-center">
              <div className="relative w-32 aspect-video rounded-xl overflow-hidden bg-black shrink-0 shadow-md">
                <video src={extendVideoUrl} className="w-full h-full object-cover" muted playsInline />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Play className="w-6 h-6 text-white/80" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Link2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span className="font-bold text-teal-700 dark:text-teal-300 text-sm">Đang nối tiếp từ video gốc</span>
                </div>
                {extendVideoPrompt && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{extendVideoPrompt}</p>
                )}
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                  {currentModelLabel} · {videoDuration}s · {videoQuality}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={cancelExtend} className="h-8 w-8 rounded-full text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* UPLOAD AREA (hidden when extending) */}
        {!extendVideoUrl && (
          <>
            {activeMode === 'standard' ? (
              <div className="flex flex-col items-center gap-4 mb-10 w-full max-w-2xl mx-auto">
                <div
                  onClick={() => { setUploadTarget('standard'); fileInputRef.current?.click(); }}
                  className="w-full aspect-[21/9] bg-zinc-50/50 dark:bg-zinc-950/30 border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-teal-400/50 hover:bg-teal-50/30 dark:hover:bg-teal-500/5 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden group shadow-sm"
                >
                  {standardImage ? (
                    <Image src={standardImage} alt="Standard" fill className="object-cover" />
                  ) : (
                    <>
                      <div className="w-16 h-16 mb-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm border border-zinc-100 dark:border-zinc-800 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        {isUploading === 'standard' ? <Loader2 className="w-8 h-8 animate-spin text-teal-500" /> : <UploadCloud className="w-8 h-8 text-zinc-400 group-hover:text-teal-500 transition-colors" />}
                      </div>
                      <p className="font-bold text-lg text-zinc-700 dark:text-zinc-200">Tải ảnh lên làm khung hình đầu</p>
                      <p className="text-sm text-zinc-400 mt-1">Kéo thả hoặc nhấp để chọn ảnh (Tùy chọn)</p>
                    </>
                  )}
                </div>
                <Button variant="ghost" onClick={() => { setUploadTarget('standard'); setIsLibraryOpen(true); }} className="text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100/50 rounded-full px-6">
                  <Library className="w-4 h-4 mr-2" /> Chọn từ thư viện tài nguyên
                </Button>
              </div>
            ) : (
              <div className="w-full max-w-3xl mx-auto mb-10">
                <div className="flex flex-col md:flex-row items-center justify-center gap-6">
                  <div className="flex-1 w-full flex flex-col gap-3">
                    <div
                      onClick={() => { setUploadTarget('before'); fileInputRef.current?.click(); }}
                      className="w-full aspect-[4/3] bg-zinc-50/50 dark:bg-zinc-950/30 border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-teal-400/50 hover:bg-teal-50/30 dark:hover:bg-teal-500/5 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden group shadow-sm"
                    >
                      {beforeImage ? (
                        <Image src={beforeImage} alt="Before" fill className="object-cover" />
                      ) : (
                        <>
                          <div className="w-14 h-14 mb-3 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm border border-zinc-100 dark:border-zinc-800 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                            {isUploading === 'before' ? <Loader2 className="w-6 h-6 animate-spin text-teal-500" /> : <UploadCloud className="w-6 h-6 text-zinc-400 group-hover:text-teal-500" />}
                          </div>
                          <p className="font-bold text-zinc-700 dark:text-zinc-200">Ảnh Bắt đầu</p>
                        </>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => { setUploadTarget('before'); setIsLibraryOpen(true); }} className="text-zinc-500 rounded-full mx-auto w-fit">
                      <Library className="w-4 h-4 mr-2" /> Thư viện
                    </Button>
                  </div>

                  <div className="w-12 h-12 rounded-full bg-white dark:bg-zinc-800 shadow-md border border-zinc-100 dark:border-zinc-700 flex items-center justify-center flex-shrink-0 z-10 -my-4 md:my-0">
                    <ArrowRight className="w-5 h-5 text-teal-500 rotate-90 md:rotate-0" />
                  </div>

                  <div className="flex-1 w-full flex flex-col gap-3">
                    <div
                      onClick={() => { setUploadTarget('after'); fileInputRef.current?.click(); }}
                      className="w-full aspect-[4/3] bg-zinc-50/50 dark:bg-zinc-950/30 border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-cyan-400/50 hover:bg-cyan-50/30 dark:hover:bg-cyan-500/5 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden group shadow-sm"
                    >
                      {afterImage ? (
                        <Image src={afterImage} alt="After" fill className="object-cover" />
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
          </>
        )}

        {/* PROMPT INPUT BAR */}
        <div className="relative w-full max-w-3xl mx-auto">
          <div className="flex items-end bg-white dark:bg-zinc-950 rounded-[1.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-none border border-zinc-200 dark:border-zinc-800 p-2 pl-4 focus-within:ring-2 focus-within:ring-teal-500/20 transition-all duration-300">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={extendVideoUrl ? "Mô tả phần tiếp theo (VD: Camera bay lên cao hơn, phóng to chi tiết...)" : activeMode === 'standard' ? "Bạn muốn video chuyển động ra sao? (VD: Máy quay lướt qua sản phẩm...)" : "Mô tả sự chuyển đổi (VD: Quá trình sửa nhà từ cũ kỹ thành hiện đại...)"}
              className="flex-1 resize-none border-0 focus-visible:ring-0 bg-transparent text-base min-h-[64px] max-h-[120px] py-4 shadow-none scrollbar-hide"
              style={{ boxShadow: 'none' }}
            />
            <div className="pb-1 pr-1 pl-2 flex gap-2 shrink-0 items-center">
              {/* Settings gear button */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={cn(
                  "h-[44px] w-[44px] rounded-xl flex items-center justify-center transition-all duration-200 border",
                  showSettings
                    ? "bg-teal-50 dark:bg-teal-900/30 border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400"
                    : "bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                )}
              >
                <Settings className="w-5 h-5" />
              </button>

              <Button
                size="lg"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="h-[52px] rounded-xl px-6 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-bold text-base shadow-md shadow-teal-500/25 shrink-0"
              >
                {isGenerating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>{extendVideoUrl ? <Link2 className="w-5 h-5 mr-2" /> : <Sparkles className="w-5 h-5 mr-2" />} {extendVideoUrl ? 'Nối Video' : 'Tạo Video'}</>
                )}
              </Button>
            </div>
          </div>

          {/* SETTINGS PANEL (collapsible below the bar) */}
          {showSettings && (
            <div className="mt-3 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-lg p-5 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-sm text-zinc-700 dark:text-zinc-200 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-teal-500" /> Cài đặt nâng cao
                </h4>
                <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Model */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Model AI</label>
                  <Select value={videoModel} onValueChange={setVideoModel}>
                    <SelectTrigger className="h-11 rounded-xl border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 focus:ring-0 font-medium text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl shadow-xl">
                      {MODEL_OPTIONS.map(opt => (
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
                      {DURATION_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value} className="rounded-lg cursor-pointer">{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Quality */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Chất lượng</label>
                  <Select value={videoQuality} onValueChange={setVideoQuality}>
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
                  Cấu hình: <strong className="text-zinc-600 dark:text-zinc-300">{currentModelLabel}</strong> · <strong className="text-zinc-600 dark:text-zinc-300">{videoDuration}s</strong> · <strong className="text-zinc-600 dark:text-zinc-300">{videoQuality}</strong>
                </p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* GENERATING SKELETON */}
      {isGenerating && (
        <div className="w-full mt-12 aspect-[21/9] bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200/50 dark:border-zinc-800 rounded-[2rem] flex flex-col items-center justify-center">
          <div className="relative w-16 h-16 mb-6">
            <div className="absolute inset-0 border-4 border-teal-500/30 rounded-full animate-ping"></div>
            <div className="absolute inset-0 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-teal-500" />
            </div>
          </div>
          <h3 className="text-xl font-bold bg-gradient-to-r from-teal-600 to-cyan-500 bg-clip-text text-transparent">
            {extendVideoUrl ? 'Đang nối tiếp video...' : 'Đang thiết kế kiệt tác...'}
          </h3>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">Hệ thống AI đang phân tích và dựng hình video của bạn.</p>
        </div>
      )}

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

      {/* LUXURY GALLERY */}
      {videoProject.length > 0 && (
        <div className="mt-16 relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-[1px] bg-gradient-to-r from-transparent via-zinc-200 dark:via-zinc-800 to-transparent" />

          <div className="flex items-center justify-between mb-8 pt-8">
            <h3 className="text-2xl font-bold flex items-center tracking-tight">
              <Video className="w-6 h-6 mr-3 text-teal-500" />
              Thư viện Video
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videoProject.map((clip, i) => (
              <div key={i} className="group relative aspect-video bg-zinc-100 dark:bg-zinc-900 rounded-[1.5rem] overflow-hidden shadow-sm border border-zinc-200/60 dark:border-zinc-800/60 hover:shadow-xl hover:shadow-teal-500/10 transition-all duration-500">
                <video src={clip.url} className="w-full h-full object-cover" controls playsInline />
                {/* Action buttons overlay */}
                <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  {clip.originalVeoUrl && (
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); handleExtendVideo(clip); }}
                      className="h-9 w-9 rounded-xl bg-teal-500/80 backdrop-blur-md text-white border border-white/20 hover:bg-teal-600 shadow-lg"
                      title="Nối tiếp video này"
                    >
                      <Link2 className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="secondary" size="icon" className="h-9 w-9 rounded-xl bg-black/40 backdrop-blur-md text-white border border-white/10 hover:bg-black/60 shadow-lg">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
                {/* Extend label at bottom */}
                {clip.originalVeoUrl && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent pt-8 pb-3 px-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleExtendVideo(clip); }}
                      className="flex items-center gap-1.5 text-xs font-semibold text-white/90 hover:text-white transition-colors"
                    >
                      <Link2 className="w-3.5 h-3.5" /> Nối tiếp video này →
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
