'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Voicemail,
  Play,
  Pause,
  Download,
  Volume2,
  Trash2,
  RefreshCw,
  Music,
  Clock,
  Plus,
  BookOpen,
  Video,
} from 'lucide-react';
import { AddVoiceModal } from '@/components/modals/add-voice-modal';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/i18n-context';
import { VoiceGuideModal } from '@/components/modals/voice-guide-modal';
import { DownloadVoiceModal } from '@/components/modals/download-voice-modal';
import { VideoFromImageTab } from '@/components/video-from-image-tab';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import { Slider } from '@/components/ui/slider';
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

interface GeneratedVoice {
  id: string;
  text: string;
  voiceName: string;
  audioUrl: string;
  createdAt: any;
  title?: string;
  description?: string;
  emotion?: string;
  speed?: number;
}

export function VoiceCloningWorkspace() {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [emotion, setEmotion] = useState('Tự nhiên');
  const [speed, setSpeed] = useState([1.0]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('vi');
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isDeletingVoice, setIsDeletingVoice] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [history, setHistory] = useState<GeneratedVoice[]>([]);
  const [playingHistoryId, setPlayingHistoryId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const VOICE_SCRIPT_TEMPLATES = [
    { id: 'none', label: 'Tùy chỉnh (Tự nhập)', prompt: '' },
    { id: 'promo', label: '🗣️ Quảng cáo / Khuyến mãi', prompt: 'Duy nhất hôm nay! Nhận ngay ưu đãi siêu hời khi mua [SẢN PHẨM] tại [TÊN THƯƠNG HIỆU]. Số lượng có hạn, nhanh tay thử ngay!' },
    { id: 'intro', label: '🏢 Giới thiệu doanh nghiệp', prompt: 'Chào mừng quý đối tác đến với [TÊN DOANH NGHIỆP]. Với hơn [SỐ] năm kinh nghiệm, chúng tôi tự hào mang đến giải pháp tối ưu nhất cho doanh nghiệp của bạn.' },
    { id: 'review', label: '⭐ Review / Trải nghiệm', prompt: 'Mình đã thử hàng chục sản phẩm nhưng chỉ đến khi dùng [SẢN PHẨM] của [THƯƠNG HIỆU] thì mới thực sự ưng ý. Cùng mình xem thử nó có gì đặc biệt nhé!' },
    { id: 'knowledge', label: '📚 Chia sẻ chuyên môn', prompt: 'Bạn có biết 3 sai lầm khiến doanh số [NGÀNH NGHỀ] sụt giảm? Trong video này, tôi sẽ chỉ ra cách khắc phục triệt để giúp bạn bứt phá doanh thu.' },
    { id: 'cs', label: '🎧 Chăm sóc khách hàng', prompt: 'Cảm ơn quý khách đã gọi đến tổng đài chăm sóc khách hàng của [TÊN THƯƠNG HIỆU]. Để gặp tư vấn viên, xin quý khách vui lòng giữ máy. Xin cảm ơn.' },
  ];

  const [selectedTemplate, setSelectedTemplate] = useState('none');
  const [showAddVoiceModal, setShowAddVoiceModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [voiceToDelete, setVoiceToDelete] = useState<string | null>(null);
  const [downloadData, setDownloadData] = useState<{ url: string, filename: string } | null>(null);
  const [activeTab, setActiveTab] = useState('voice');
  const [prefillAudioUrl, setPrefillAudioUrl] = useState<string | null>(null);
  const [prefillText, setPrefillText] = useState('');

  const handleCreateVideoFromAudio = useCallback((audioUrl: string, audioText: string) => {
    setPrefillAudioUrl(audioUrl);
    setPrefillText(audioText);
    setActiveTab('video');
  }, []);

  const handleClearPrefill = useCallback(() => {
    setPrefillAudioUrl(null);
    setPrefillText('');
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyAudioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();
  const { t } = useI18n();
  const { user, userData } = useAuth();

  // Load ElevenLabs voices
  const loadVoices = async () => {
    if (!userData?.elevenLabsApiKey) {
      toast({
        variant: 'destructive',
        title: 'Thiếu API Key',
        description: 'Vui lòng thêm ElevenLabs API Key (iGen Code 2) trong phần cài đặt tài khoản.',
      });
      return;
    }

    setIsLoadingVoices(true);
    try {
      const response = await fetch('/api/elevenlabs/voices', {
        headers: { 'x-elevenlabs-api-key': userData.elevenLabsApiKey },
      });

      if (!response.ok) throw new Error('Failed to load voices');

      const data = await response.json();
      
      const filteredVoices = (data.voices || []).filter((v: any) => {
        if (['cloned', 'generated'].includes(v.category?.toLowerCase() || '')) {
          if (v.labels?.userId && v.labels.userId !== user?.uid) return false;
        }
        return true;
      });

      setVoices(filteredVoices);
      if (filteredVoices.length > 0 && !selectedVoiceId) {
        setSelectedVoiceId(filteredVoices[0].voice_id);
      }
    } catch (error: any) {
      console.error('[VoiceCloning] Load voices error:', error);
      toast({
        variant: 'destructive',
        title: 'Lỗi tải danh sách giọng nói',
        description: error.message,
      });
    } finally {
      setIsLoadingVoices(false);
    }
  };

  // Load voices on mount
  useEffect(() => {
    if (userData?.elevenLabsApiKey) {
      loadVoices();
    }
  }, [userData?.elevenLabsApiKey]);

  const handlePreviewVoice = async () => {
    const voice = voices.find(v => v.voice_id === selectedVoiceId);
    if (!voice) return;

    if (voice.preview_url) {
      const audio = new Audio(voice.preview_url);
      audio.play();
      return;
    }

    // Generate dynamic preview if no url exists
    setIsPreviewing(true);
    try {
      const response = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-elevenlabs-api-key': userData?.elevenLabsApiKey || '',
        },
        body: JSON.stringify({
          voice_id: selectedVoiceId,
          text: "Xin chào, đây là giọng nói thử nghiệm mà tôi vừa tạo thành công.",
          model_id: "eleven_turbo_v2_5",
          language_code: "vi",
        }),
      });
      if (!response.ok) throw new Error('Preview error');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
    } catch(err) {
       toast({ title: 'Lỗi', description: 'Không thể tạo bản nghe thử ngay lúc này', variant: 'destructive'});
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleDeleteVoice = async () => {
    if (!voiceToDelete) return;
    setIsDeletingVoice(true);
    try {
      const response = await fetch(`/api/elevenlabs/add-voice?voice_id=${voiceToDelete}`, {
        method: 'DELETE',
        headers: {
          'x-elevenlabs-api-key': userData?.elevenLabsApiKey || '',
        }
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete');
      }
      toast({ title: 'Thành công', description: 'Đã xóa giọng nói vĩnh viễn.'});
      setSelectedVoiceId('');
      await loadVoices();
    } catch(error: any) {
      console.error('[VoiceCloning] Xóa giọng thất bại:', error.message);
      toast({ title: 'Lỗi xóa giọng nói', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeletingVoice(false);
      setVoiceToDelete(null);
    }
  };

  // Load history from Firestore
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(firestore, 'generatedVoices'),
      where('ownerId', '==', user.uid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const items: GeneratedVoice[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as GeneratedVoice);
      });
      // Sort client-side to avoid needing a composite index
      items.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      setHistory(items);
    }, (error) => {
      console.error('[VoiceCloning] Firestore snapshot error:', error);
    });

    return () => unsub();
  }, [user]);

  // Audio player event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [generatedAudioUrl]);

  const handleGenerate = async () => {
    if (!text.trim()) {
      toast({ variant: 'destructive', title: 'Thiếu văn bản', description: 'Vui lòng nhập văn bản cần chuyển giọng nói.' });
      return;
    }
    if (!selectedVoiceId) {
      toast({ variant: 'destructive', title: 'Chưa chọn giọng', description: 'Vui lòng chọn một giọng nói.' });
      return;
    }
    if (!userData?.elevenLabsApiKey) {
      toast({ variant: 'destructive', title: 'Thiếu API Key', description: 'Vui lòng thêm ElevenLabs API Key.' });
      return;
    }

    setIsGenerating(true);
    setGeneratedAudioUrl(null);

    try {
      const response = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-elevenlabs-api-key': userData.elevenLabsApiKey,
        },
        body: JSON.stringify({
          voice_id: selectedVoiceId,
          text: text,
          language_code: selectedLanguage !== 'auto' ? selectedLanguage : undefined,
          speed: speed[0],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate audio');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      setGeneratedAudioUrl(audioUrl);

      toast({ title: '🎵 Tạo giọng nói thành công!', description: 'Audio đã sẵn sàng để nghe và lưu.' });

      // Auto-save to Firebase
      await saveToFirebase(audioBlob);
    } catch (error: any) {
      console.error('[VoiceCloning] Generate error:', error);
      toast({ variant: 'destructive', title: 'Lỗi tạo giọng nói', description: error.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const saveToFirebase = async (audioBlob: Blob) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const fileName = `voice-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`;
      const audioStorageRef = storageRef(storage, `users/${user.uid}/generated-voices/${fileName}`);
      await uploadBytes(audioStorageRef, audioBlob);
      const downloadURL = await getDownloadURL(audioStorageRef);

      const selectedVoice = voices.find((v) => v.voice_id === selectedVoiceId);

      await addDoc(collection(firestore, 'generatedVoices'), {
        ownerId: user.uid,
        title: title.trim(),
        description: description.trim(),
        emotion: emotion !== 'Tự nhiên' ? emotion : '',
        speed: speed[0],
        text: text,
        voiceName: selectedVoice?.name || 'Unknown',
        voiceId: selectedVoiceId,
        audioUrl: downloadURL,
        createdAt: serverTimestamp(),
      });

      toast({ title: '💾 Đã lưu', description: 'Audio đã được lưu vào thư viện.' });
    } catch (error: any) {
      console.error('[VoiceCloning] Save error:', error);
      toast({ variant: 'destructive', title: 'Lỗi lưu', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handlePlayHistory = (item: GeneratedVoice) => {
    if (playingHistoryId === item.id) {
      historyAudioRef.current?.pause();
      setPlayingHistoryId(null);
      return;
    }

    if (historyAudioRef.current) {
      historyAudioRef.current.pause();
    }
    const audio = new Audio(item.audioUrl);
    historyAudioRef.current = audio;
    audio.play();
    setPlayingHistoryId(item.id);
    audio.onended = () => setPlayingHistoryId(null);
  };

  const handleDeleteHistory = async (id: string) => {
    try {
      await deleteDoc(doc(firestore, 'generatedVoices', id));
      toast({ title: 'Đã xóa', description: 'Audio đã được xóa khỏi thư viện.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Lỗi xóa', description: error.message });
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isBusy = isGenerating || isSaving;

  const handleVoiceAdded = async (voiceId: string) => {
    // Refresh voice list and select the new voice
    await loadVoices();
    setSelectedVoiceId(voiceId);
  };

  return (
    <>
    <AddVoiceModal
      open={showAddVoiceModal}
      onOpenChange={setShowAddVoiceModal}
      onVoiceAdded={handleVoiceAdded}
    />
    <VoiceGuideModal open={showGuideModal} onOpenChange={setShowGuideModal} />
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
      <TabsList className="w-full max-w-md mb-6">
        <TabsTrigger value="voice" className="flex-1 gap-2">
          <Voicemail className="h-4 w-4" /> Tạo Giọng Nói
        </TabsTrigger>
        <TabsTrigger value="video" className="flex-1 gap-2">
          <Video className="h-4 w-4" /> Tạo Video từ Ảnh
        </TabsTrigger>
      </TabsList>

      <TabsContent value="voice" className="flex-1">
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
      {/* LEFT PANEL - Controls */}
      <div className="lg:col-span-1 flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardContent className="p-6 flex flex-col flex-1 gap-4">
            {!userData?.elevenLabsApiKey && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                ⚠️ Bạn chưa thêm ElevenLabs API Key (iGen Code 2). Vui lòng thêm API key trong menu tài khoản.
              </div>
            )}

            {/* Voice Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Chọn giọng nói</Label>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadVoices}
                    disabled={isLoadingVoices || !userData?.elevenLabsApiKey}
                  >
                    <RefreshCw className={cn('h-4 w-4', isLoadingVoices && 'animate-spin')} />
                  </Button>
                </div>
              </div>
              <Select
                value={selectedVoiceId}
                onValueChange={setSelectedVoiceId}
                disabled={isBusy || voices.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingVoices ? 'Đang tải...' : 'Chọn giọng nói'} />
                </SelectTrigger>
                <SelectContent>
                  {voices.map((voice) => (
                    <SelectItem key={voice.voice_id} value={voice.voice_id}>
                      <div className="flex items-center gap-2">
                        <span>{voice.name}</span>
                        <span className="text-xs text-muted-foreground capitalize">({voice.category})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Language Selection */}
              <div className="space-y-2 pt-2 border-t mt-4">
                <Label>Ngôn ngữ (giúp AI phát âm chuẩn hơn)</Label>
                <Select
                  value={selectedLanguage}
                  onValueChange={setSelectedLanguage}
                  disabled={isBusy}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn ngôn ngữ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Đa ngôn ngữ (Pha trộn Anh - Việt)</SelectItem>
                    <SelectItem value="vi">Chỉ đọc Tiếng Việt (Thuần Việt)</SelectItem>
                    <SelectItem value="en">Chỉ đọc Tiếng Anh</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Preview & Delete selected voice */}
              {selectedVoiceId && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={isPreviewing || isDeletingVoice}
                    onClick={handlePreviewVoice}
                  >
                    {isPreviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Volume2 className="mr-2 h-4 w-4" />}
                    Nghe thử giọng
                  </Button>

                  {(['cloned', 'generated'].includes(voices.find(v => v.voice_id === selectedVoiceId)?.category?.toLowerCase() || '')) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={isDeletingVoice || isPreviewing}
                      onClick={() => setVoiceToDelete(selectedVoiceId)}
                    >
                      {isDeletingVoice ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                      Xóa giọng
                    </Button>
                  )}
                </div>
              )}
              {/* Add new voice button & Guide */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
                  onClick={() => setShowAddVoiceModal(true)}
                  disabled={isBusy || !userData?.elevenLabsApiKey}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Thêm giọng nói mới
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  className="w-10 px-0 flex-shrink-0"
                  onClick={() => setShowGuideModal(true)}
                  title="Hướng dẫn sử dụng"
                >
                  <BookOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2 flex-1 flex flex-col">
              <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center mb-1">
                  <Label>Kịch bản đọc mẫu</Label>
                  <Select
                    value={selectedTemplate}
                    onValueChange={(val) => {
                      setSelectedTemplate(val);
                      const tmpl = VOICE_SCRIPT_TEMPLATES.find(t => t.id === val);
                      if (tmpl && tmpl.id !== 'none') {
                        setText(tmpl.prompt);
                      } else if (tmpl && tmpl.id === 'none') {
                        setText('');
                      }
                    }}
                    disabled={isBusy}
                  >
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <SelectValue placeholder="Chọn kịch bản..." />
                    </SelectTrigger>
                    <SelectContent>
                      {VOICE_SCRIPT_TEMPLATES.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground"><Label>Văn bản cần đọc</Label></span>
                  <span className="text-xs text-muted-foreground">{text.length} ký tự</span>
                </div>
                <Textarea
                  placeholder="Nhập văn bản bạn muốn chuyển thành giọng nói...&#10;Ví dụ: Xin chào, tôi là trợ lý ảo AI của bạn!"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setSelectedTemplate('none');
                  }}
                  className="min-h-[160px] resize-none"
                  disabled={isBusy}
                />
                <p className="text-[11px] text-primary/80 italic mt-1 bg-primary/5 p-2 rounded-md border border-primary/10">
                  💡 <b>Mẹo cực hay:</b> Chọn chế độ <b>"Chỉ đọc Tiếng Việt"</b> để giọng giữ độ tự nhiên 100%. Nếu có tiếng Anh xen kẽ, hãy <b>viết phiên âm</b> (VD: Marketing ➔ Mác-két-tinh, Livestream ➔ Lai-trym, VIP ➔ Víp) để AI đọc mượt mà không bị lơ lớ!
                </p>
              </div>

              {/* Tùy chỉnh & Thông tin lưu trữ */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Tiêu đề lưu trữ <span className="text-muted-foreground font-normal">(Tùy chọn)</span></Label>
                    <Input
                      placeholder="Ví dụ: Đoạn mở đầu Video"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={isBusy}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mô tả / Ghi chú <span className="text-muted-foreground font-normal">(Tùy chọn)</span></Label>
                    <Input
                      placeholder="Ví dụ: Đọc nhấn nhá đoạn kết"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={isBusy}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Cách đọc / Cảm xúc</Label>
                    <Select value={emotion} onValueChange={setEmotion} disabled={isBusy}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Tự nhiên">Tự nhiên (Mặc định)</SelectItem>
                        <SelectItem value="Vui vẻ, Hào hứng">Vui vẻ, Hào hứng</SelectItem>
                        <SelectItem value="Kể chuyện, Truyền cảm">Kể chuyện, Truyền cảm</SelectItem>
                        <SelectItem value="Nghiêm túc, Tin tức">Nghiêm túc, Tin tức</SelectItem>
                        <SelectItem value="Nhẹ nhàng, Sâu lắng">Nhẹ nhàng, Sâu lắng</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3 pt-1">
                    <div className="flex justify-between items-center">
                      <Label>Tốc độ đọc</Label>
                      <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded-full">{speed[0]}x</span>
                    </div>
                    <Slider
                      value={speed}
                      onValueChange={setSpeed}
                      max={1.2}
                      min={0.7}
                      step={0.1}
                      disabled={isBusy}
                      className="py-1"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Chậm (0.7)</span>
                      <span>Nhanh (1.2)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={isBusy || !text.trim() || !selectedVoiceId || !userData?.elevenLabsApiKey}
              className="w-full"
              size="lg"
            >
              {isGenerating ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Voicemail className="mr-2 h-5 w-5" />
              )}
              {isGenerating ? 'Đang tạo giọng nói...' : 'Tạo Giọng Nói'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* RIGHT PANEL - Output & History */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        {/* Audio Player */}
        <Card className={cn(
          "overflow-hidden transition-all duration-500",
          generatedAudioUrl ? "border-primary/30 shadow-lg" : ""
        )}>
          <CardContent className="p-6">
            {generatedAudioUrl ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-gradient-to-br from-primary/20 to-primary/5 p-3 rounded-xl">
                    <Music className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Audio đã tạo</h3>
                    <p className="text-sm text-muted-foreground">
                      {voices.find(v => v.voice_id === selectedVoiceId)?.name || 'Unknown Voice'}
                    </p>
                  </div>
                </div>

                <audio ref={audioRef} src={generatedAudioUrl} preload="metadata" />

                {/* Waveform-style player */}
                <div className="bg-gradient-to-r from-muted/50 to-muted/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-4">
                    <Button
                      variant="default"
                      size="icon"
                      className="h-12 w-12 rounded-full shadow-lg"
                      onClick={handlePlayPause}
                    >
                      {isPlaying ? (
                        <Pause className="h-5 w-5" />
                      ) : (
                        <Play className="h-5 w-5 ml-0.5" />
                      )}
                    </Button>

                    <div className="flex-1 space-y-1">
                      <Slider
                        value={[currentTime]}
                        max={duration || 100}
                        step={0.1}
                        onValueChange={(vals) => {
                          if (audioRef.current) {
                            audioRef.current.currentTime = vals[0];
                            setCurrentTime(vals[0]);
                          }
                        }}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <a href={generatedAudioUrl} download={`igen-voice-${Date.now()}.mp3`}>
                    <Button variant="outline" size="sm">
                      <Download className="mr-2 h-4 w-4" />
                      Tải xuống
                    </Button>
                  </a>
                  {isSaving && (
                    <Button variant="ghost" size="sm" disabled>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Đang lưu...
                    </Button>
                  )}
                </div>
              </div>
            ) : isGenerating ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                  <div className="relative bg-primary/10 p-6 rounded-full">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  </div>
                </div>
                <p className="text-muted-foreground font-medium">Đang tạo giọng nói...</p>
                <p className="text-xs text-muted-foreground">Quá trình này mất khoảng 5-15 giây</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Voicemail className="h-16 w-16 mb-4 opacity-50" />
                <p className="font-medium">Audio sẽ xuất hiện ở đây</p>
                <p className="text-sm">Chọn giọng nói, nhập văn bản và nhấn &quot;Tạo Giọng Nói&quot;</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Lịch sử tạo giọng nói</h3>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {history.length}
              </span>
            </div>

            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Chưa có audio nào. Hãy tạo giọng nói đầu tiên của bạn!
              </p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                      playingHistoryId === item.id ? "bg-primary/5 border-primary/30" : "hover:bg-muted/50"
                    )}
                  >
                    <Button
                      variant={playingHistoryId === item.id ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8 rounded-full flex-shrink-0"
                      onClick={() => handlePlayHistory(item)}
                    >
                      {playingHistoryId === item.id ? (
                        <Pause className="h-3 w-3" />
                      ) : (
                        <Play className="h-3 w-3 ml-0.5" />
                      )}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate font-medium">{item.title || item.text}</p>
                      {item.description && (
                         <p className="text-xs text-muted-foreground truncate mb-0.5">Mô tả: {item.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5 truncate">
                        <span>{item.voiceName}</span>
                        {item.speed && item.speed !== 1 && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                            <span className="text-xs">{item.speed}x</span>
                          </>
                        )}
                        {item.emotion && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                            <span className="text-primary/80 font-medium">{item.emotion}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        onClick={() => handleCreateVideoFromAudio(item.audioUrl, item.text)}
                        title="Tạo video từ audio này"
                      >
                        <Video className="h-3.5 w-3.5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7"
                        onClick={() => setDownloadData({
                          url: item.audioUrl,
                          filename: (item.title || item.text || 'igen-voice').slice(0, 30).trim()
                        })}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
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
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!voiceToDelete} onOpenChange={(open) => !open && setVoiceToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa hệ thống</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này sẽ xóa vĩnh viễn giọng nói giả lập này khỏi hệ thống ElevenLabs và không thể khôi phục lại. Bạn có chắc chắn muốn tiếp tục?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Khước từ</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVoice} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {isDeletingVoice ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Xác nhận xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DownloadVoiceModal
        open={!!downloadData}
        onOpenChange={(open) => !open && setDownloadData(null)}
        audioUrl={downloadData?.url || ''}
        defaultFilename={downloadData?.filename || 'voice'}
      />

    </div>
      </TabsContent>

      <TabsContent value="video" className="flex-1">
        <VideoFromImageTab
          voices={voices}
          selectedVoiceId={selectedVoiceId}
          prefillAudioUrl={prefillAudioUrl}
          prefillText={prefillText}
          onClearPrefill={handleClearPrefill}
        />
      </TabsContent>
    </Tabs>
    </>
  );
}
