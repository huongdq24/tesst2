'use client';

import { useState, useRef, useEffect, ChangeEvent, DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  ScanFace,
  Video,
  UploadCloud,
  X,
  Download,
  Play,
  Pause,
  Clock,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { storage, firestore } from '@/lib/firebase/config';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { Card, CardContent } from './ui/card';
import { Separator } from './ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Voice {
  voice_id: string;
  name: string;
  category: string;
  preview_url?: string;
  labels?: Record<string, string>;
}

interface GeneratedAvatarVideo {
  id: string;
  text: string;
  voiceName: string;
  videoUrl: string;
  thumbnailUrl?: string;
  aspectRatio?: string;
  createdAt: any;
}

type PipelineStep = 'idle' | 'generating_audio' | 'uploading_audio' | 'generating_video' | 'polling_video' | 'saving' | 'completed' | 'failed';

interface VideoFromImageTabProps {
  voices: Voice[];
  selectedVoiceId: string;
  /** Optional: pre-filled audio URL from voice history */
  prefillAudioUrl?: string | null;
  prefillText?: string;
  onClearPrefill?: () => void;
}

export function VideoFromImageTab({
  voices,
  selectedVoiceId,
  prefillAudioUrl,
  prefillText,
  onClearPrefill,
}: VideoFromImageTabProps) {
  const AVATAR_SCRIPT_TEMPLATES = [
    { id: 'none', label: 'Tùy chỉnh (Tự nhập)', prompt: '' },
    { id: 'welcome', label: '👋 Chào mừng đối tác', prompt: 'Kính chào quý vị. Tôi là đại diện của [THƯƠNG HIỆU]. Rất hân hạnh được đồng hành cùng quý vị trong dự án lần này và hy vọng chúng ta sẽ có sự hợp tác đáng nhớ.' },
    { id: 'sale', label: '🎉 Chốt sale mạnh mẽ', prompt: 'Tin vui dành cho các tín đồ [NGÀNH HÀNG]! Chương trình flash sale lớn nhất năm đã bắt đầu. Đừng bỏ lỡ cơ hội sở hữu ngay [SẢN PHẨM] với mức giá không tưởng!' },
    { id: 'news', label: '📰 Cập nhật tin tức/Báo cáo', prompt: 'Bản tin kinh doanh nóng trong tuần: [SỰ KIỆN]. Những thay đổi này sẽ ảnh hưởng trực tiếp tới chiến lược sắp tới của chúng ta như thế nào?' },
    { id: 'training', label: '📚 Đào tạo nội bộ', prompt: 'Xin chào mọi người. Bài học hôm nay chúng ta sẽ tập trung vào kỹ năng [KỸ NĂNG]. Đây là yếu tố then chốt giúp tăng tỷ lệ chuyển đổi khách hàng tại khu vực.' },
    { id: 'apology', label: '🙏 Xin lỗi/Giải trình', prompt: 'Chúng tôi xin chân thành cáo lỗi về [SỰ KIỆN]. [THƯƠNG HIỆU] đang nỗ lực hết mình để khắc phục nhanh nhất. Kính mong quý đối tác thông cảm.' },
  ];

  const [selectedTemplate, setSelectedTemplate] = useState('none');
  const [text, setText] = useState('');
  const [avatarImageUrl, setAvatarImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>('idle');
  const [pipelineMessage, setPipelineMessage] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [history, setHistory] = useState<GeneratedAvatarVideo[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [videoToDelete, setVideoToDelete] = useState<string | null>(null);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const { user, userData } = useAuth();

  // Handle incoming prefill from Voice History
  useEffect(() => {
    if (prefillText) {
      setText(prefillText);
    }
  }, [prefillText]);

  // Auto-generate when prefillAudioUrl is provided
  useEffect(() => {
    if (prefillAudioUrl && avatarImageUrl && pipelineStep === 'idle') {
      handleGenerateFromExistingAudio(prefillAudioUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillAudioUrl, avatarImageUrl]);

  // Load video history from Firestore
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(firestore, 'generatedAvatarVideos'),
      where('ownerId', '==', user.uid)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const items: GeneratedAvatarVideo[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as GeneratedAvatarVideo);
      });
      items.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      setHistory(items);
    }, (error) => {
      console.error('[VideoFromImage] Firestore snapshot error:', error);
    });
    return () => unsub();
  }, [user]);

  // Timer helpers
  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };
  const startTimer = () => {
    stopTimer(); setElapsedTime(0);
    timerRef.current = setInterval(() => setElapsedTime((p) => p + 1), 1000);
  };

  useEffect(() => {
    return () => { stopTimer(); if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } };
  }, []);

  // ========== IMAGE UPLOAD ==========
  const handleImageUpload = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Vui lòng tải lên file ảnh.' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Ảnh quá lớn', description: 'Vui lòng tải lên ảnh nhỏ hơn 10MB.' });
      return;
    }
    setIsUploadingImage(true);
    try {
      const fileName = `avatar-${Date.now()}-${file.name}`;
      const imageRef = storageRef(storage, `users/${user.uid}/avatars/${fileName}`);
      await uploadBytes(imageRef, file);
      const downloadURL = await getDownloadURL(imageRef);
      setAvatarImageUrl(downloadURL);
      toast({ title: '✅ Tải ảnh thành công', description: 'Ảnh avatar đã sẵn sàng.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Lỗi tải ảnh', description: error.message });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files?.[0]) handleImageUpload(e.dataTransfer.files[0]);
  };
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleImageUpload(e.target.files[0]);
    if (e.target) e.target.value = '';
  };

  // ========== MAIN PIPELINE: TTS → HeyGen ==========
  const handleGenerate = async () => {
    if (!text.trim() || !selectedVoiceId || !avatarImageUrl) {
      toast({ variant: 'destructive', title: 'Thiếu thông tin', description: 'Vui lòng upload ảnh, chọn giọng nói và nhập văn bản.' });
      return;
    }
    if (!userData?.elevenLabsApiKey || !userData?.heyGenApiKey) {
      toast({ variant: 'destructive', title: 'Thiếu API Keys', description: 'Cần cả ElevenLabs (iGen Code 2) và HeyGen (iGen Code 3) API Keys.' });
      return;
    }

    setGeneratedVideoUrl(null);
    setPipelineStep('idle');
    setPipelineMessage('');
    startTimer();

    try {
      // Step 1: ElevenLabs TTS
      setPipelineStep('generating_audio');
      setPipelineMessage('Đang tạo giọng nói từ ElevenLabs...');

      const ttsResponse = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-elevenlabs-api-key': userData.elevenLabsApiKey,
        },
        body: JSON.stringify({ voice_id: selectedVoiceId, text: text.trim() }),
      });
      if (!ttsResponse.ok) throw new Error('Không thể tạo giọng nói từ ElevenLabs.');
      const audioBlob = await ttsResponse.blob();

      // Step 2: Upload audio to HeyGen
      await uploadAndGenerate(audioBlob);

    } catch (error: any) {
      console.error('[VideoFromImage] Pipeline error:', error);
      setPipelineStep('failed');
      setPipelineMessage(error.message);
      stopTimer();
      toast({ variant: 'destructive', title: 'Lỗi tạo video', description: error.message });
    }
  };

  // Generate from an existing audio URL (from voice history)
  const handleGenerateFromExistingAudio = async (audioUrl: string) => {
    if (!avatarImageUrl) {
      toast({ variant: 'destructive', title: 'Thiếu ảnh', description: 'Vui lòng upload ảnh chân dung trước khi tạo video.' });
      return;
    }
    if (!userData?.heyGenApiKey) {
      toast({ variant: 'destructive', title: 'Thiếu HeyGen API Key', description: 'Cần HeyGen (iGen Code 3) API Key.' });
      return;
    }

    setGeneratedVideoUrl(null);
    setPipelineStep('idle');
    setPipelineMessage('');
    startTimer();

    try {
      // Download existing audio
      setPipelineStep('generating_audio');
      setPipelineMessage('Đang tải audio có sẵn...');
      const response = await fetch(audioUrl);
      if (!response.ok) throw new Error('Không thể tải audio có sẵn.');
      const audioBlob = await response.blob();

      // Continue pipeline from step 2
      await uploadAndGenerate(audioBlob);
      onClearPrefill?.();

    } catch (error: any) {
      console.error('[VideoFromImage] Prefill pipeline error:', error);
      setPipelineStep('failed');
      setPipelineMessage(error.message);
      stopTimer();
      toast({ variant: 'destructive', title: 'Lỗi tạo video', description: error.message });
    }
  };

  // Shared pipeline: Upload audio to HeyGen → Generate → Poll
  const uploadAndGenerate = async (audioBlob: Blob) => {
    // Step 2: Upload audio to HeyGen
    setPipelineStep('uploading_audio');
    setPipelineMessage('Đang tải audio lên HeyGen...');

    const uploadForm = new FormData();
    uploadForm.append('file', audioBlob, 'audio.mp3');

    const uploadResponse = await fetch('/api/heygen/upload-audio', {
      method: 'POST',
      headers: { 'x-heygen-api-key': userData!.heyGenApiKey! },
      body: uploadForm,
    });
    if (!uploadResponse.ok) throw new Error('Không thể tải audio lên HeyGen.');
    const uploadData = await uploadResponse.json();
    const audioHeyGenUrl = uploadData.data?.url || uploadData.url;
    if (!audioHeyGenUrl) throw new Error('Không nhận được URL audio từ HeyGen.');

    // Step 3: Generate video with HeyGen
    setPipelineStep('generating_video');
    setPipelineMessage('Đang khởi tạo video với HeyGen...');

    const generateResponse = await fetch('/api/heygen/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-heygen-api-key': userData!.heyGenApiKey!,
      },
      body: JSON.stringify({
        avatar_image_url: avatarImageUrl,
        audio_url: audioHeyGenUrl,
        aspect_ratio: aspectRatio,
      }),
    });
    if (!generateResponse.ok) {
      const errData = await generateResponse.json().catch(() => ({}));
      throw new Error(errData.error || 'Không thể tạo video từ HeyGen.');
    }
    const generateData = await generateResponse.json();
    const videoId = generateData.video_id;
    if (!videoId) throw new Error('Không nhận được video_id từ HeyGen.');

    // Step 4: Poll for video completion
    setPipelineStep('polling_video');
    setPipelineMessage('Video đang được xử lý bởi HeyGen (thường 1-5 phút)...');
    await pollVideoStatus(videoId);
  };

  const pollVideoStatus = async (videoId: string) => {
    const maxAttempts = 60;
    let attempts = 0;

    return new Promise<void>((resolve, reject) => {
      pollingRef.current = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          reject(new Error('Video generation timed out after 5 minutes.'));
          return;
        }
        try {
          const response = await fetch(`/api/heygen/status?video_id=${videoId}`, {
            headers: { 'x-heygen-api-key': userData!.heyGenApiKey! },
          });
          if (!response.ok) throw new Error('Failed to check status');
          const data = await response.json();

          if (data.status === 'completed' && data.video_url) {
            clearInterval(pollingRef.current!);
            pollingRef.current = null;
            setGeneratedVideoUrl(data.video_url);
            setPipelineStep('completed');
            setPipelineMessage('Video đã tạo thành công!');
            stopTimer();
            toast({ title: '🎬 Tạo video thành công!', description: 'Video avatar đã sẵn sàng.' });
            await saveVideoToFirebase(data.video_url, data.thumbnail_url);
            resolve();
          } else if (data.status === 'failed') {
            clearInterval(pollingRef.current!);
            pollingRef.current = null;
            reject(new Error(data.error || 'Video generation failed'));
          }
        } catch (pollError: any) {
          console.error('[VideoFromImage] Poll error:', pollError.message);
        }
      }, 5000);
    });
  };

  const saveVideoToFirebase = async (videoUrl: string, thumbnailUrl?: string) => {
    if (!user) return;
    setPipelineStep('saving');
    setPipelineMessage('Đang lưu video vào thư viện...');
    try {
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error('Cannot download video');
      const blob = await response.blob();
      const fileName = `avatar-video-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`;
      const videoRef = storageRef(storage, `users/${user.uid}/avatar-videos/${fileName}`);
      await uploadBytes(videoRef, blob);
      const downloadURL = await getDownloadURL(videoRef);
      const selectedVoice = voices.find((v) => v.voice_id === selectedVoiceId);
      await addDoc(collection(firestore, 'generatedAvatarVideos'), {
        ownerId: user.uid,
        text,
        voiceName: selectedVoice?.name || 'Unknown',
        videoUrl: downloadURL,
        thumbnailUrl: thumbnailUrl || null,
        aspectRatio,
        createdAt: serverTimestamp(),
      });
      toast({ title: '💾 Đã lưu', description: 'Video avatar đã được lưu vào thư viện.' });
    } catch (error: any) {
      console.error('[VideoFromImage] Save error:', error);
      toast({ variant: 'destructive', title: 'Lỗi lưu video', description: error.message });
    }
  };

  const handleDeleteHistory = async (id: string) => {
    try {
      await deleteDoc(doc(firestore, 'generatedAvatarVideos', id));
      toast({ title: 'Đã xóa', description: 'Video đã được xóa khỏi thư viện.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Lỗi xóa', description: error.message });
    } finally {
      setVideoToDelete(null);
    }
  };

  const handleDownloadVideo = (url: string, name: string) => {
    const proxyUrl = `/api/proxy-download?filename=${encodeURIComponent(name)}&url=${encodeURIComponent(url)}`;
    window.location.href = proxyUrl;
  };

  const isBusy = pipelineStep !== 'idle' && pipelineStep !== 'completed' && pipelineStep !== 'failed';

  const pipelineSteps: { key: PipelineStep; label: string; icon: string }[] = [
    { key: 'generating_audio', label: 'Tạo giọng nói (ElevenLabs)', icon: '🎤' },
    { key: 'uploading_audio', label: 'Tải audio lên HeyGen', icon: '☁️' },
    { key: 'generating_video', label: 'Khởi tạo video', icon: '🎬' },
    { key: 'polling_video', label: 'Đang xử lý video', icon: '⏳' },
    { key: 'saving', label: 'Lưu vào thư viện', icon: '💾' },
  ];
  const getPipelineStepIndex = () => pipelineSteps.findIndex(s => s.key === pipelineStep);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
      {/* LEFT PANEL - Controls */}
      <div className="lg:col-span-1 flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardContent className="p-6 flex flex-col flex-1 gap-4">
            {(!userData?.elevenLabsApiKey || !userData?.heyGenApiKey) && (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-400">
                ⚠️ Cần cả ElevenLabs API Key (iGen Code 2) và HeyGen API Key (iGen Code 3) để sử dụng tính năng này.
              </div>
            )}

            {/* Prefill notice */}
            {prefillAudioUrl && (
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-400 flex items-center justify-between">
                <span>🎵 Đang sử dụng audio có sẵn từ lịch sử giọng nói.{!avatarImageUrl && ' Hãy upload ảnh để bắt đầu.'}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={onClearPrefill}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            {/* Avatar Image Upload */}
            <div className="space-y-2">
              <Label>Ảnh chân dung (Avatar)</Label>
              <div
                className={cn(
                  'relative flex flex-col items-center justify-center w-full min-h-[180px] border-2 border-dashed rounded-lg transition-colors cursor-pointer',
                  isDragging ? 'border-primary bg-primary/10' : 'hover:bg-muted/50',
                  avatarImageUrl ? 'p-2' : 'p-4'
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isBusy && fileInputRef.current?.click()}
              >
                {isUploadingImage ? (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-sm">Đang tải ảnh...</p>
                  </div>
                ) : avatarImageUrl ? (
                  <div className="relative w-full aspect-square max-w-[200px] mx-auto">
                    <Image src={avatarImageUrl} alt="Avatar" fill className="object-cover rounded-lg" />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full z-10"
                      onClick={(e) => { e.stopPropagation(); setAvatarImageUrl(null); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <div className="bg-primary/10 p-4 rounded-full">
                      <UploadCloud className="h-8 w-8 text-primary" />
                    </div>
                    <p className="text-sm font-medium">Kéo thả hoặc nhấn để tải ảnh chân dung</p>
                    <p className="text-xs text-center">Ảnh mặt rõ nét, nhìn thẳng, dưới 10MB</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={isBusy}
                />
              </div>
            </div>

            <Separator />

            {/* Script Input */}
            <div className="space-y-2 flex-1 flex flex-col">
              <div className="flex justify-between items-center mb-1">
                <Label>Kịch bản nói mẫu</Label>
                <Select
                  value={selectedTemplate}
                  onValueChange={(val) => {
                    setSelectedTemplate(val);
                    const tmpl = AVATAR_SCRIPT_TEMPLATES.find(t => t.id === val);
                    if (tmpl && tmpl.id !== 'none') {
                      setText(tmpl.prompt);
                    } else if (tmpl && tmpl.id === 'none') {
                      setText('');
                    }
                  }}
                  disabled={isBusy || !!prefillAudioUrl}
                >
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    <SelectValue placeholder="Chọn kịch bản..." />
                  </SelectTrigger>
                  <SelectContent>
                    {AVATAR_SCRIPT_TEMPLATES.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                placeholder="Nhập văn bản mà avatar sẽ nói...&#10;Ví dụ: Xin chào! Tôi là đại diện thương hiệu của bạn."
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setSelectedTemplate('none');
                }}
                disabled={isBusy || !!prefillAudioUrl}
                className="resize-none flex-1 min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground">{text.length} ký tự</p>
            </div>

            {/* Aspect Ratio */}
            <div className="space-y-2">
              <Label>Tỷ lệ khung hình</Label>
              <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as any)} disabled={isBusy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">Ngang (16:9) — YouTube, PC</SelectItem>
                  <SelectItem value="9:16">Dọc (9:16) — TikTok, Reels</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Generate Button */}
            <Button
              onClick={prefillAudioUrl ? () => handleGenerateFromExistingAudio(prefillAudioUrl) : handleGenerate}
              disabled={isBusy || (!prefillAudioUrl && !text.trim()) || !selectedVoiceId || !avatarImageUrl || !userData?.heyGenApiKey}
              className="w-full"
              size="lg"
            >
              {isBusy ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-5 w-5" />
              )}
              {isBusy ? 'Đang xử lý...' : prefillAudioUrl ? 'Tạo Video từ Audio có sẵn' : 'Tạo Video Avatar'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* RIGHT PANEL - Output & History */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        {/* Video Output / Pipeline Status */}
        <Card className={cn(
          "overflow-hidden transition-all duration-500",
          generatedVideoUrl ? "border-primary/30 shadow-lg" : ""
        )}>
          <CardContent className="p-6">
            {isBusy ? (
              <div className="flex flex-col items-center justify-center py-8 gap-6">
                {/* Pipeline Progress */}
                <div className="w-full max-w-sm space-y-3">
                  {pipelineSteps.map((step, index) => {
                    const currentIndex = getPipelineStepIndex();
                    const isActive = index === currentIndex;
                    const isDone = index < currentIndex;
                    const isPending = index > currentIndex;
                    return (
                      <div
                        key={step.key}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg transition-all duration-300",
                          isActive && "bg-primary/10 border border-primary/30 scale-105",
                          isDone && "opacity-60",
                          isPending && "opacity-30"
                        )}
                      >
                        <span className="text-xl w-8 text-center">
                          {isDone ? '✅' : isActive ? step.icon : '⬜'}
                        </span>
                        <span className={cn(
                          "text-sm",
                          isActive && "font-semibold text-primary",
                          isDone && "line-through"
                        )}>
                          {step.label}
                        </span>
                        {isActive && <Loader2 className="h-4 w-4 animate-spin text-primary ml-auto" />}
                      </div>
                    );
                  })}
                </div>
                {/* Timer */}
                <div className="flex items-center gap-2 font-mono text-lg text-muted-foreground">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
                  </span>
                  <span>{elapsedTime}s</span>
                </div>
              </div>
            ) : pipelineStep === 'failed' ? (
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-400">
                <p className="font-semibold mb-1">❌ Lỗi tạo video</p>
                <p className="text-sm">{pipelineMessage}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={handleGenerate}>
                  🔄 Thử lại
                </Button>
              </div>
            ) : generatedVideoUrl ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-gradient-to-br from-primary/20 to-primary/5 p-3 rounded-xl">
                    <Video className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Video Avatar</h3>
                    <p className="text-sm text-muted-foreground">
                      Giọng: {voices.find(v => v.voice_id === selectedVoiceId)?.name} • Thời gian: {elapsedTime}s
                    </p>
                  </div>
                </div>
                <div className="rounded-xl overflow-hidden border bg-black/5 aspect-video">
                  <video src={generatedVideoUrl} controls className="w-full h-full object-contain" />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadVideo(generatedVideoUrl, `igen-avatar-${Date.now()}.mp4`)}
                  >
                    <Download className="mr-2 h-4 w-4" /> Tải xuống
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ScanFace className="h-16 w-16 mb-4 opacity-50" />
                <p className="font-medium text-lg">Video Avatar sẽ xuất hiện ở đây</p>
                <p className="text-sm mt-1">Upload ảnh chân dung, nhập kịch bản → Tạo Video</p>
                <div className="mt-6 flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full font-medium">1</span>
                    <span>ElevenLabs tạo giọng</span>
                  </div>
                  <span>→</span>
                  <div className="flex items-center gap-1">
                    <span className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-1 rounded-full font-medium">2</span>
                    <span>HeyGen tạo video</span>
                  </div>
                  <span>→</span>
                  <div className="flex items-center gap-1">
                    <span className="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-full font-medium">3</span>
                    <span>Video hoàn tất</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Video History */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Lịch sử Video Avatar</h3>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {history.length}
              </span>
            </div>

            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Chưa có video nào. Hãy tạo video avatar đầu tiên!
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-1">
                {history.map((item) => (
                  <div key={item.id} className="group rounded-lg border overflow-hidden hover:shadow-md transition-shadow">
                    <div className="aspect-video bg-black/5 relative">
                      <video
                        src={item.videoUrl}
                        className="w-full h-full object-cover"
                        preload="metadata"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-12 w-12 rounded-full"
                          onClick={() => {
                            // Simple overlay video player
                            const video = document.createElement('video');
                            video.src = item.videoUrl;
                            video.controls = true;
                            Object.assign(video.style, { position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', maxWidth:'90vw', maxHeight:'90vh', zIndex:'9999', borderRadius:'12px' });
                            const overlay = document.createElement('div');
                            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9998';
                            overlay.onclick = () => { overlay.remove(); video.remove(); };
                            document.body.append(overlay, video);
                            video.play();
                          }}
                        >
                          <Play className="h-5 w-5 ml-0.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="text-sm truncate">{item.text}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground">{item.voiceName}</span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleDownloadVideo(item.videoUrl, `${(item.text || 'igen-video').slice(0,25)}.mp4`)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setVideoToDelete(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!videoToDelete} onOpenChange={(open) => !open && setVideoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa video</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này sẽ xóa vĩnh viễn video này khỏi thư viện và không thể khôi phục lại. Bạn có chắc chắn muốn tiếp tục?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => videoToDelete && handleDeleteHistory(videoToDelete)}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Xác nhận xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
