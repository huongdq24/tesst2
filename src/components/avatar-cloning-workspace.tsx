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
  RefreshCw,
  Volume2,
  Clock,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/i18n-context';
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

interface Voice {
  voice_id: string;
  name: string;
  category: string;
  preview_url?: string;
}

interface GeneratedAvatarVideo {
  id: string;
  text: string;
  voiceName: string;
  videoUrl: string;
  thumbnailUrl?: string;
  createdAt: any;
}

type PipelineStep = 'idle' | 'generating_audio' | 'uploading_audio' | 'generating_video' | 'polling_video' | 'saving' | 'completed' | 'failed';

export function AvatarCloningWorkspace() {
  const [text, setText] = useState('');
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [avatarImageUrl, setAvatarImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>('idle');
  const [pipelineMessage, setPipelineMessage] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [history, setHistory] = useState<GeneratedAvatarVideo[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const { t } = useI18n();
  const { user, userData } = useAuth();

  // Load ElevenLabs voices
  const loadVoices = async () => {
    if (!userData?.elevenLabsApiKey) return;
    setIsLoadingVoices(true);
    try {
      const response = await fetch('/api/elevenlabs/voices', {
        headers: { 'x-elevenlabs-api-key': userData.elevenLabsApiKey },
      });
      if (!response.ok) throw new Error('Failed to load voices');
      const data = await response.json();
      setVoices(data.voices || []);
      if (data.voices?.length > 0 && !selectedVoiceId) {
        setSelectedVoiceId(data.voices[0].voice_id);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Lỗi tải giọng nói', description: error.message });
    } finally {
      setIsLoadingVoices(false);
    }
  };

  useEffect(() => {
    if (userData?.elevenLabsApiKey) loadVoices();
  }, [userData?.elevenLabsApiKey]);

  // Load history from Firestore
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
      // Sort client-side to avoid needing a composite index
      items.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      setHistory(items);
    }, (error) => {
      console.error('[AvatarCloning] Firestore snapshot error:', error);
    });
    return () => unsub();
  }, [user]);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    stopTimer();
    setElapsedTime(0);
    timerRef.current = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);
  };

  // Clean up timers and polling on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  // Handle image upload
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
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) handleImageUpload(e.dataTransfer.files[0]);
  };
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleImageUpload(e.target.files[0]);
    if (e.target) e.target.value = '';
  };

  // MAIN PIPELINE: ElevenLabs TTS → HeyGen Video
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
      // Step 1: Generate audio from ElevenLabs
      setPipelineStep('generating_audio');
      setPipelineMessage('Đang tạo giọng nói từ ElevenLabs...');

      const ttsResponse = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-elevenlabs-api-key': userData.elevenLabsApiKey,
        },
        body: JSON.stringify({ voice_id: selectedVoiceId, text }),
      });

      if (!ttsResponse.ok) throw new Error('Không thể tạo giọng nói từ ElevenLabs.');
      const audioBlob = await ttsResponse.blob();

      // Step 2: Upload audio to HeyGen
      setPipelineStep('uploading_audio');
      setPipelineMessage('Đang tải audio lên HeyGen...');

      const uploadForm = new FormData();
      uploadForm.append('file', audioBlob, 'audio.mp3');

      const uploadResponse = await fetch('/api/heygen/upload-audio', {
        method: 'POST',
        headers: { 'x-heygen-api-key': userData.heyGenApiKey },
        body: uploadForm,
      });

      if (!uploadResponse.ok) throw new Error('Không thể tải audio lên HeyGen.');
      const uploadData = await uploadResponse.json();
      const audioUrl = uploadData.data?.url || uploadData.url;

      if (!audioUrl) throw new Error('Không nhận được URL audio từ HeyGen.');

      // Step 3: Generate video with HeyGen
      setPipelineStep('generating_video');
      setPipelineMessage('Đang khởi tạo video với HeyGen...');

      const generateResponse = await fetch('/api/heygen/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-heygen-api-key': userData.heyGenApiKey,
        },
        body: JSON.stringify({
          avatar_image_url: avatarImageUrl,
          audio_url: audioUrl,
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
      setPipelineMessage('Video đang được xử lý bởi HeyGen...');

      await pollVideoStatus(videoId);

    } catch (error: any) {
      console.error('[AvatarCloning] Pipeline error:', error);
      setPipelineStep('failed');
      setPipelineMessage(error.message);
      stopTimer();
      toast({ variant: 'destructive', title: 'Lỗi tạo video', description: error.message });
    }
  };

  const pollVideoStatus = async (videoId: string) => {
    const maxAttempts = 60; // 5 minutes max
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

            // Save to Firebase
            await saveVideoToFirebase(data.video_url, data.thumbnail_url);
            resolve();
          } else if (data.status === 'failed') {
            clearInterval(pollingRef.current!);
            pollingRef.current = null;
            reject(new Error(data.error || 'Video generation failed'));
          }
          // else: still processing, keep polling
        } catch (pollError: any) {
          console.error('[AvatarCloning] Poll error:', pollError);
          // Don't reject on individual poll errors, just continue
        }
      }, 5000); // Poll every 5 seconds
    });
  };

  const saveVideoToFirebase = async (videoUrl: string, thumbnailUrl?: string) => {
    if (!user) return;
    setPipelineStep('saving');
    setPipelineMessage('Đang lưu video vào thư viện...');

    try {
      // Download video and upload to Firebase Storage
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
      console.error('[AvatarCloning] Save error:', error);
      toast({ variant: 'destructive', title: 'Lỗi lưu video', description: error.message });
    }
  };

  const handleDeleteHistory = async (id: string) => {
    try {
      await deleteDoc(doc(firestore, 'generatedAvatarVideos', id));
      toast({ title: 'Đã xóa', description: 'Video đã được xóa khỏi thư viện.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Lỗi xóa', description: error.message });
    }
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
      {/* LEFT PANEL */}
      <div className="lg:col-span-1 flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardContent className="p-6 flex flex-col flex-1 gap-4">
            {(!userData?.elevenLabsApiKey || !userData?.heyGenApiKey) && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                ⚠️ Cần cả ElevenLabs API Key (iGen Code 2) và HeyGen API Key (iGen Code 3) để sử dụng tính năng này.
              </div>
            )}

            {/* Avatar Image Upload */}
            <div className="space-y-2">
              <Label>Ảnh Avatar</Label>
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
                    <Image
                      src={avatarImageUrl}
                      alt="Avatar"
                      fill
                      className="object-cover rounded-lg"
                    />
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
                    <p className="text-sm font-medium">Tải lên ảnh chân dung</p>
                    <p className="text-xs text-center">Nên dùng ảnh chân dung rõ nét, mặt nhìn thẳng</p>
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

            {/* Voice Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Chọn giọng nói (ElevenLabs)</Label>
                <Button variant="ghost" size="sm" onClick={loadVoices} disabled={isLoadingVoices}>
                  <RefreshCw className={cn('h-4 w-4', isLoadingVoices && 'animate-spin')} />
                </Button>
              </div>
              <Select value={selectedVoiceId} onValueChange={setSelectedVoiceId} disabled={isBusy || voices.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingVoices ? 'Đang tải...' : 'Chọn giọng nói'} />
                </SelectTrigger>
                <SelectContent>
                  {voices.map((voice) => (
                    <SelectItem key={voice.voice_id} value={voice.voice_id}>
                      {voice.name} ({voice.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedVoiceId && voices.find(v => v.voice_id === selectedVoiceId)?.preview_url && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    const voice = voices.find(v => v.voice_id === selectedVoiceId);
                    if (voice?.preview_url) new Audio(voice.preview_url).play();
                  }}
                >
                  <Volume2 className="mr-2 h-4 w-4" /> Nghe thử
                </Button>
              )}
            </div>

            <Separator />

            {/* Text Input */}
            <div className="space-y-2 flex-1 flex flex-col">
              <Label>Kịch bản nói</Label>
              <Textarea
                placeholder="Nhập văn bản mà avatar sẽ nói... Ví dụ: Xin chào! Tôi là đại diện thương hiệu của bạn."
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={isBusy}
                className="resize-none flex-1 min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground">{text.length} ký tự</p>
            </div>

            {/* Aspect Ratio */}
            <div className="space-y-2">
              <Label>Tỷ lệ khung hình</Label>
              <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as any)} disabled={isBusy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">Ngang (16:9)</SelectItem>
                  <SelectItem value="9:16">Dọc (9:16)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={isBusy || !text.trim() || !selectedVoiceId || !avatarImageUrl || !userData?.elevenLabsApiKey || !userData?.heyGenApiKey}
              className="w-full"
              size="lg"
            >
              {isBusy ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-5 w-5" />
              )}
              {isBusy ? 'Đang xử lý...' : 'Tạo Video Avatar'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* RIGHT PANEL */}
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
                        {isActive && (
                          <Loader2 className="h-4 w-4 animate-spin text-primary ml-auto" />
                        )}
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
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800">
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
                  <video
                    src={generatedVideoUrl}
                    controls
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="flex gap-2">
                  <a href={generatedVideoUrl} download={`igen-avatar-${Date.now()}.mp4`} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      <Download className="mr-2 h-4 w-4" /> Tải xuống
                    </Button>
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ScanFace className="h-16 w-16 mb-4 opacity-50" />
                <p className="font-medium text-lg">Video Avatar sẽ xuất hiện ở đây</p>
                <p className="text-sm mt-1">Upload ảnh, chọn giọng nói, nhập kịch bản → Tạo Video Avatar</p>
                <div className="mt-6 flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">1</span>
                    <span>ElevenLabs tạo giọng</span>
                  </div>
                  <span>→</span>
                  <div className="flex items-center gap-1">
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">2</span>
                    <span>HeyGen tạo video</span>
                  </div>
                  <span>→</span>
                  <div className="flex items-center gap-1">
                    <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">3</span>
                    <span>Video hoàn tất</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* History */}
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
                            const video = document.createElement('video');
                            video.src = item.videoUrl;
                            video.controls = true;
                            video.style.position = 'fixed';
                            video.style.top = '50%';
                            video.style.left = '50%';
                            video.style.transform = 'translate(-50%, -50%)';
                            video.style.maxWidth = '90vw';
                            video.style.maxHeight = '90vh';
                            video.style.zIndex = '9999';
                            video.style.borderRadius = '12px';
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
                          <a href={item.videoUrl} download target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteHistory(item.id)}
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
    </div>
  );
}
