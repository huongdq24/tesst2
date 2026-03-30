'use client';

import { useState, useRef, useEffect, ChangeEvent, DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Loader2, ScanFace, Video, UploadCloud, X, Download, Play,
  RefreshCw, Volume2, Clock, Trash2, Sparkles, Plus, Search,
  Settings, ChevronRight, Mic, User, Image as ImageIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/i18n-context';
import { storage, firestore } from '@/lib/firebase/config';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  collection, addDoc, serverTimestamp, query, where, onSnapshot, deleteDoc, doc,
} from 'firebase/firestore';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import Image from 'next/image';

// ─── Types ───
interface HeyGenAvatar {
  avatar_id: string;
  avatar_name: string;
  preview_image_url: string;
  gender: string;
  avatar_type: string;
}

interface HeyGenVoice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  preview_audio: string | null;
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  preview_url?: string;
}

interface Scene {
  id: string;
  // Avatar
  avatarSource: 'photo' | 'heygen';
  talkingPhotoUrl: string | null;
  heygenAvatarId: string | null;
  heygenAvatarPreview: string | null;
  // Voice
  voiceSource: 'elevenlabs' | 'heygen';
  elevenLabsVoiceId: string | null;
  heygenVoiceId: string | null;
  // Script
  script: string;
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

function createEmptyScene(): Scene {
  return {
    id: `scene-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    avatarSource: 'photo',
    talkingPhotoUrl: null,
    heygenAvatarId: null,
    heygenAvatarPreview: null,
    voiceSource: 'elevenlabs',
    elevenLabsVoiceId: null,
    heygenVoiceId: null,
    script: '',
  };
}

export function AvatarCloningWorkspace() {
  // Scenes
  const [scenes, setScenes] = useState<Scene[]>([createEmptyScene()]);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);

  // HeyGen data
  const [heygenAvatars, setHeygenAvatars] = useState<HeyGenAvatar[]>([]);
  const [heygenVoices, setHeygenVoices] = useState<HeyGenVoice[]>([]);
  const [isLoadingAvatars, setIsLoadingAvatars] = useState(false);
  const [isLoadingHeygenVoices, setIsLoadingHeygenVoices] = useState(false);
  const [avatarSearch, setAvatarSearch] = useState('');
  const [voiceSearch, setVoiceSearch] = useState('');
  const [voiceLangFilter, setVoiceLangFilter] = useState('all');

  // ElevenLabs data
  const [elVoices, setElVoices] = useState<ElevenLabsVoice[]>([]);
  const [isLoadingElVoices, setIsLoadingElVoices] = useState(false);

  // Upload
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Pipeline
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>('idle');
  const [pipelineMessage, setPipelineMessage] = useState('');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // History
  const [history, setHistory] = useState<GeneratedAvatarVideo[]>([]);

  // UI tabs
  const [isAvatarPanelOpen, setIsAvatarPanelOpen] = useState(false);
  
  // Generate Modal State
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [videoTitle, setVideoTitle] = useState('Untitled Video');
  const [videoResolution, setVideoResolution] = useState('720p');
  const [videoFps, setVideoFps] = useState('25');
  const [videoFormat, setVideoFormat] = useState('MP4');
  const [watermarkOn, setWatermarkOn] = useState(true);
  const [avatarPanelTab, setAvatarPanelTab] = useState<'my' | 'public'>('my');
  const [voiceTab, setVoiceTab] = useState<'elevenlabs' | 'heygen'>('elevenlabs');

  const { toast } = useToast();
  const { t } = useI18n();
  const { user, userData } = useAuth();

  const activeScene = scenes[activeSceneIndex];

  // ─── Data Loading ───
  const loadElVoices = async () => {
    if (!userData?.elevenLabsApiKey) return;
    setIsLoadingElVoices(true);
    try {
      const res = await fetch('/api/elevenlabs/voices', {
        headers: { 'x-elevenlabs-api-key': userData.elevenLabsApiKey },
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setElVoices(data.voices || []);
    } catch { /* silent */ } finally { setIsLoadingElVoices(false); }
  };

  const loadHeygenAvatars = async () => {
    if (!userData?.heyGenApiKey) return;
    setIsLoadingAvatars(true);
    try {
      const res = await fetch('/api/heygen/avatars', {
        headers: { 'x-heygen-api-key': userData.heyGenApiKey },
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setHeygenAvatars(data.avatars || []);
    } catch { /* silent */ } finally { setIsLoadingAvatars(false); }
  };

  const loadHeygenVoices = async () => {
    if (!userData?.heyGenApiKey) return;
    setIsLoadingHeygenVoices(true);
    try {
      const res = await fetch('/api/heygen/voices', {
        headers: { 'x-heygen-api-key': userData.heyGenApiKey },
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setHeygenVoices(data.voices || []);
    } catch { /* silent */ } finally { setIsLoadingHeygenVoices(false); }
  };

  useEffect(() => { if (userData?.elevenLabsApiKey) loadElVoices(); }, [userData?.elevenLabsApiKey]);
  useEffect(() => {
    if (userData?.heyGenApiKey) { loadHeygenAvatars(); loadHeygenVoices(); }
  }, [userData?.heyGenApiKey]);

  // Firebase history
  useEffect(() => {
    if (!user) return;
    const q = query(collection(firestore, 'generatedAvatarVideos'), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const items: GeneratedAvatarVideo[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as GeneratedAvatarVideo));
      items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setHistory(items);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => { return () => { stopTimer(); if (pollingRef.current) clearInterval(pollingRef.current); }; }, []);

  // ─── Scene Helpers ───
  const updateScene = (index: number, updates: Partial<Scene>) => {
    setScenes(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s));
  };

  const addScene = () => {
    const newScene = createEmptyScene();
    // Copy avatar/voice config from current scene
    if (activeScene) {
      newScene.avatarSource = activeScene.avatarSource;
      newScene.talkingPhotoUrl = activeScene.talkingPhotoUrl;
      newScene.heygenAvatarId = activeScene.heygenAvatarId;
      newScene.heygenAvatarPreview = activeScene.heygenAvatarPreview;
      newScene.voiceSource = activeScene.voiceSource;
      newScene.elevenLabsVoiceId = activeScene.elevenLabsVoiceId;
      newScene.heygenVoiceId = activeScene.heygenVoiceId;
    }
    setScenes(prev => [...prev, newScene]);
    setActiveSceneIndex(scenes.length);
  };

  const removeScene = (index: number) => {
    if (scenes.length <= 1) return;
    setScenes(prev => prev.filter((_, i) => i !== index));
    setActiveSceneIndex(prev => Math.min(prev, scenes.length - 2));
  };

  // ─── Image Upload ───
  const handleImageUpload = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith('image/')) { toast({ variant: 'destructive', title: 'Lỗi', description: 'Vui lòng tải lên file ảnh.' }); return; }
    setIsUploadingImage(true);
    try {
      const fileName = `avatar-${Date.now()}-${file.name}`;
      const imageRef = storageRef(storage, `users/${user.uid}/avatars/${fileName}`);
      await uploadBytes(imageRef, file);
      const downloadURL = await getDownloadURL(imageRef);
      updateScene(activeSceneIndex, { talkingPhotoUrl: downloadURL, avatarSource: 'photo' });
      setIsAvatarPanelOpen(false);
      toast({ title: '✅ Tải ảnh thành công' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Lỗi tải ảnh', description: error.message });
    } finally { setIsUploadingImage(false); }
  };

  const handleDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: DragEvent) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.[0]) handleImageUpload(e.dataTransfer.files[0]); };
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]); if (e.target) e.target.value = ''; };

  // ─── Timer ───
  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const startTimer = () => { stopTimer(); setElapsedTime(0); timerRef.current = setInterval(() => setElapsedTime(p => p + 1), 1000); };

  // ─── PIPELINE ───
  const handleGenerate = async () => {
    // Check validation first
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      if (s.avatarSource === 'photo' && !s.talkingPhotoUrl) {
        toast({ variant: 'destructive', title: `Scene ${i + 1}: Thiếu ảnh avatar` }); return;
      }
      if (s.avatarSource === 'heygen' && !s.heygenAvatarId) {
        toast({ variant: 'destructive', title: `Scene ${i + 1}: Chưa chọn avatar HeyGen` }); return;
      }
      if (s.voiceSource === 'elevenlabs' && !s.elevenLabsVoiceId) {
        toast({ variant: 'destructive', title: `Scene ${i + 1}: Chưa chọn giọng ElevenLabs` }); return;
      }
      if (s.voiceSource === 'heygen' && !s.heygenVoiceId) {
        toast({ variant: 'destructive', title: `Scene ${i + 1}: Chưa chọn giọng HeyGen` }); return;
      }
      if (!s.script.trim()) {
        toast({ variant: 'destructive', title: `Scene ${i + 1}: Chưa nhập kịch bản` }); return;
      }
    }

    if (!userData?.heyGenApiKey) {
      toast({ variant: 'destructive', title: 'Thiếu HeyGen API Key' }); return;
    }

    // Open Settings Modal
    setIsGenerateModalOpen(true);
  };

  const submitGenerate = async () => {
    // Validate all scenes
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      if (s.avatarSource === 'photo' && !s.talkingPhotoUrl) {
        toast({ variant: 'destructive', title: `Scene ${i + 1}: Thiếu ảnh avatar` }); return;
      }
      if (s.avatarSource === 'heygen' && !s.heygenAvatarId) {
        toast({ variant: 'destructive', title: `Scene ${i + 1}: Chưa chọn avatar HeyGen` }); return;
      }
      if (s.voiceSource === 'elevenlabs' && !s.elevenLabsVoiceId) {
        toast({ variant: 'destructive', title: `Scene ${i + 1}: Chưa chọn giọng ElevenLabs` }); return;
      }
      if (s.voiceSource === 'heygen' && !s.heygenVoiceId) {
        toast({ variant: 'destructive', title: `Scene ${i + 1}: Chưa chọn giọng HeyGen` }); return;
      }
      if (!s.script.trim()) {
        toast({ variant: 'destructive', title: `Scene ${i + 1}: Chưa nhập kịch bản` }); return;
      }
    }

    if (!userData?.heyGenApiKey) {
      toast({ variant: 'destructive', title: 'Thiếu HeyGen API Key (iGen Code 3)' }); return;
    }

    setGeneratedVideoUrl(null);
    setPipelineStep('idle');
    startTimer();

    try {
      // Build scenes payload
      const scenesPayload: any[] = [];

      for (let i = 0; i < scenes.length; i++) {
        const s = scenes[i];

        // Step 1: If using a user-uploaded photo, upload it to HeyGen first to get talking_photo_id
        let talkingPhotoId: string | undefined;
        if (s.avatarSource === 'photo' && s.talkingPhotoUrl) {
          setPipelineStep('generating_audio'); // Reuse step for UI
          setPipelineMessage(`Scene ${i + 1}: Đang tải ảnh lên HeyGen...`);

          const imgUploadRes = await fetch('/api/heygen/upload-image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-heygen-api-key': userData.heyGenApiKey,
            },
            body: JSON.stringify({ imageUrl: s.talkingPhotoUrl }),
          });
          if (!imgUploadRes.ok) {
            const errData = await imgUploadRes.json().catch(() => ({}));
            throw new Error(errData.error || `Scene ${i + 1}: Tải ảnh lên HeyGen thất bại.`);
          }
          const imgData = await imgUploadRes.json();
          talkingPhotoId = imgData.talking_photo_id;
          if (!talkingPhotoId) throw new Error(`Scene ${i + 1}: Không nhận được talking_photo_id.`);
          console.log(`[Pipeline] Scene ${i + 1}: Got talking_photo_id: ${talkingPhotoId}`);
        }

        // Step 2: If using ElevenLabs voice, generate TTS audio first
        if (s.voiceSource === 'elevenlabs') {
          if (!userData?.elevenLabsApiKey) {
            throw new Error('Cần ElevenLabs API Key (iGen Code 2) để dùng giọng ElevenLabs.');
          }

          setPipelineStep('generating_audio');
          setPipelineMessage(`Scene ${i + 1}: Đang tạo giọng nói từ ElevenLabs...`);

          const ttsRes = await fetch('/api/elevenlabs/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-elevenlabs-api-key': userData.elevenLabsApiKey },
            body: JSON.stringify({ voice_id: s.elevenLabsVoiceId, text: s.script }),
          });
          if (!ttsRes.ok) throw new Error(`Scene ${i + 1}: ElevenLabs TTS thất bại.`);
          const audioBlob = await ttsRes.blob();

          setPipelineStep('uploading_audio');
          setPipelineMessage(`Scene ${i + 1}: Đang tải audio lên HeyGen...`);

          // Convert blob to base64 for reliable transport through Next.js API route
          const ab = await audioBlob.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(ab).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );

          const uploadRes = await fetch('/api/heygen/upload-audio', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-heygen-api-key': userData.heyGenApiKey,
            },
            body: JSON.stringify({ audioBase64: base64 }),
          });
          if (!uploadRes.ok) {
            const errData = await uploadRes.json().catch(() => ({}));
            throw new Error(errData.error || `Scene ${i + 1}: Tải audio lên HeyGen thất bại.`);
          }
          const uploadData = await uploadRes.json();
          const audioUrl = uploadData.data?.url || uploadData.url;
          if (!audioUrl) throw new Error(`Scene ${i + 1}: Không nhận được URL audio.`);

          scenesPayload.push({
            character_type: s.avatarSource === 'photo' ? 'talking_photo' : 'avatar',
            talking_photo_id: s.avatarSource === 'photo' ? talkingPhotoId : undefined,
            avatar_id: s.avatarSource === 'heygen' ? s.heygenAvatarId : undefined,
            voice_type: 'audio',
            audio_url: audioUrl,
          });
        } else {
          // HeyGen TTS voice — no need to generate audio separately
          scenesPayload.push({
            character_type: s.avatarSource === 'photo' ? 'talking_photo' : 'avatar',
            talking_photo_id: s.avatarSource === 'photo' ? talkingPhotoId : undefined,
            avatar_id: s.avatarSource === 'heygen' ? s.heygenAvatarId : undefined,
            voice_type: 'text',
            voice_id: s.heygenVoiceId,
            script: s.script,
          });
        }
      }

      // Generate video
      setPipelineStep('generating_video');
      setPipelineMessage('Đang gửi yêu cầu tạo video HeyGen...');

      let width = 1280; let height = 720;
      if (videoResolution === '1080p') { width = 1920; height = 1080; }
      else if (videoResolution === '4k') { width = 3840; height = 2160; }
      if (aspectRatio === '9:16') { const temp = width; width = height; height = temp; }

      const genRes = await fetch('/api/heygen/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-heygen-api-key': userData.heyGenApiKey },
        body: JSON.stringify({ 
          scenes: scenesPayload, 
          dimension: { width, height },
          title: videoTitle,
          test: watermarkOn
        }),
      });
      if (!genRes.ok) {
        const errData = await genRes.json().catch(() => ({}));
        throw new Error(errData.error || 'HeyGen video generation failed.');
      }
      const genData = await genRes.json();
      if (!genData.video_id) throw new Error('Không nhận được video_id từ HeyGen.');

      // Poll
      setPipelineStep('polling_video');
      setPipelineMessage('Video đang được xử lý bởi HeyGen...');
      await pollVideoStatus(genData.video_id);

    } catch (error: any) {
      setPipelineStep('failed');
      setPipelineMessage(error.message);
      stopTimer();
      toast({ variant: 'destructive', title: 'Lỗi tạo video', description: error.message });
    }
  };

  const pollVideoStatus = async (videoId: string) => {
    let attempts = 0;
    return new Promise<void>((resolve, reject) => {
      pollingRef.current = setInterval(async () => {
        attempts++;
        if (attempts > 60) { clearInterval(pollingRef.current!); reject(new Error('Timeout after 5 minutes.')); return; }
        try {
          const res = await fetch(`/api/heygen/status?video_id=${videoId}`, { headers: { 'x-heygen-api-key': userData!.heyGenApiKey! } });
          if (!res.ok) return;
          const data = await res.json();
          if (data.status === 'completed' && data.video_url) {
            clearInterval(pollingRef.current!);
            setGeneratedVideoUrl(data.video_url);
            setPipelineStep('completed');
            setPipelineMessage('Video đã tạo thành công!');
            stopTimer();
            toast({ title: '🎬 Tạo video thành công!' });
            await saveToFirebase(data.video_url, data.thumbnail_url);
            resolve();
          } else if (data.status === 'failed') {
            clearInterval(pollingRef.current!);
            reject(new Error(data.error || 'Video generation failed'));
          }
        } catch { /* continue */ }
      }, 5000);
    });
  };

  const saveToFirebase = async (videoUrl: string, thumbnailUrl?: string) => {
    if (!user) return;
    setPipelineStep('saving');
    setPipelineMessage('Đang lưu video...');
    try {
      const res = await fetch(videoUrl);
      const blob = await res.blob();
      const fileName = `avatar-video-${Date.now()}.mp4`;
      const videoRef = storageRef(storage, `users/${user.uid}/avatar-videos/${fileName}`);
      await uploadBytes(videoRef, blob);
      const downloadURL = await getDownloadURL(videoRef);
      const firstScript = scenes.map(s => s.script).join(' | ');
      await addDoc(collection(firestore, 'generatedAvatarVideos'), {
        ownerId: user.uid, text: firstScript, voiceName: 'Mixed', videoUrl: downloadURL,
        thumbnailUrl: thumbnailUrl || null, aspectRatio, createdAt: serverTimestamp(),
      });
    } catch (err: any) { console.error('Save error', err); }
  };

  const handleDeleteHistory = async (id: string) => {
    try { await deleteDoc(doc(firestore, 'generatedAvatarVideos', id)); toast({ title: 'Đã xóa' }); } catch { /* silent */ }
  };

  const isBusy = pipelineStep !== 'idle' && pipelineStep !== 'completed' && pipelineStep !== 'failed';

  const pipelineSteps: { key: PipelineStep; label: string; icon: string }[] = [
    { key: 'generating_audio', label: 'Tạo giọng nói', icon: '🎤' },
    { key: 'uploading_audio', label: 'Tải audio lên HeyGen', icon: '☁️' },
    { key: 'generating_video', label: 'Khởi tạo video', icon: '🎬' },
    { key: 'polling_video', label: 'Đang xử lý video', icon: '⏳' },
    { key: 'saving', label: 'Lưu vào thư viện', icon: '💾' },
  ];
  const getPipelineStepIndex = () => pipelineSteps.findIndex(s => s.key === pipelineStep);

  // Filtered data
  const filteredAvatars = heygenAvatars.filter(a => !avatarSearch || a.avatar_name.toLowerCase().includes(avatarSearch.toLowerCase()));
  const filteredHeygenVoices = heygenVoices.filter(v => {
    if (voiceSearch && !v.name.toLowerCase().includes(voiceSearch.toLowerCase())) return false;
    if (voiceLangFilter !== 'all' && v.language !== voiceLangFilter) return false;
    return true;
  });
  const voiceLanguages = [...new Set(heygenVoices.map(v => v.language))].sort();

  // ─── RENDER ───
  return (
    <div className="w-full max-w-[1200px] mx-auto flex flex-col gap-6 pb-24">

      {/* API KEY WARNING */}
      {(!userData?.heyGenApiKey) && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-sm text-amber-800 dark:text-amber-300">
          ⚠️ Cần HeyGen API Key (iGen Code 3) để sử dụng tính năng này. Vào <strong>Cài đặt API Keys</strong> để thêm.
        </div>
      )}

      {/* ─── MAIN CONTENT ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* LEFT: Config Panel (3 cols) */}
        <div className="lg:col-span-3 flex flex-col gap-5">

          {/* AVATAR SELECTION — Compact */}
          <div className="bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl border border-white/60 dark:border-zinc-800/60 rounded-2xl p-4 shadow-sm">
            <div
              className="flex items-center gap-3 cursor-pointer"
              role="button"
              onClick={() => setIsAvatarPanelOpen(true)}
            >
              {/* Selected avatar thumbnail */}
              <div className="w-12 h-12 rounded-xl border-2 border-teal-500/30 overflow-hidden flex-shrink-0 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                {(activeScene.avatarSource === 'photo' && activeScene.talkingPhotoUrl) ? (
                  <Image src={activeScene.talkingPhotoUrl} alt="Avatar" width={48} height={48} className="object-cover w-full h-full" />
                ) : (activeScene.avatarSource === 'heygen' && activeScene.heygenAvatarPreview) ? (
                  <Image src={activeScene.heygenAvatarPreview} alt="Avatar" width={48} height={48} className="object-cover w-full h-full" />
                ) : (
                  <User className="w-5 h-5 text-zinc-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm flex items-center gap-1.5">
                  <User className="w-4 h-4 text-teal-500" /> Chọn Avatar
                </p>
                <p className="text-xs text-zinc-400 truncate">
                  {(activeScene.avatarSource === 'photo' && activeScene.talkingPhotoUrl)
                    ? 'Ảnh chân dung đã tải lên'
                    : (activeScene.avatarSource === 'heygen' && activeScene.heygenAvatarId)
                      ? (heygenAvatars.find(a => a.avatar_id === activeScene.heygenAvatarId)?.avatar_name || 'HeyGen Avatar')
                      : 'Chưa chọn avatar'}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-zinc-400" />
            </div>
          </div>

          {/* Avatar Panel Overlay */}
          {isAvatarPanelOpen && (
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-16">
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsAvatarPanelOpen(false)} />
              {/* Panel */}
              <div className="relative w-full max-w-md max-h-[80vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200 mx-4">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setIsAvatarPanelOpen(false)} className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                      <ChevronRight className="w-5 h-5 text-zinc-500 rotate-180" />
                    </button>
                    <h3 className="font-bold text-lg">Avatar</h3>
                  </div>
                  <button onClick={() => setIsAvatarPanelOpen(false)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                    <X className="w-5 h-5 text-zinc-500" />
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-zinc-100 dark:border-zinc-800">
                  <button
                    onClick={() => setAvatarPanelTab('my')}
                    className={cn("flex-1 py-3 text-sm font-semibold transition-all relative",
                      avatarPanelTab === 'my' ? 'text-teal-600 dark:text-teal-400' : 'text-zinc-400 hover:text-zinc-600'
                    )}
                  >
                    Khuôn mặt của tôi
                    {avatarPanelTab === 'my' && <span className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-teal-500 rounded-full" />}
                  </button>
                  <button
                    onClick={() => setAvatarPanelTab('public')}
                    className={cn("flex-1 py-3 text-sm font-semibold transition-all relative",
                      avatarPanelTab === 'public' ? 'text-teal-600 dark:text-teal-400' : 'text-zinc-400 hover:text-zinc-600'
                    )}
                  >
                    Khuôn mặt công khai
                    {avatarPanelTab === 'public' && <span className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-teal-500 rounded-full" />}
                  </button>
                </div>

                {/* Search */}
                <div className="px-4 pt-4 pb-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      value={avatarSearch}
                      onChange={e => setAvatarSearch(e.target.value)}
                      placeholder="Tìm kiếm..."
                      className="w-full h-10 pl-9 pr-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                    />
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-4 pb-4">
                  {avatarPanelTab === 'my' ? (
                    /* ── MY AVATARS TAB ── */
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      {/* Create Avatar card */}
                      <div
                        className="aspect-[3/4] rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 dark:hover:bg-teal-500/5 transition-all group"
                        onClick={() => fileInputRef.current?.click()}
                        role="button"
                      >
                        {isUploadingImage ? (
                          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
                        ) : (
                          <>
                            <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center group-hover:bg-teal-100 dark:group-hover:bg-teal-900/30 transition-colors">
                              <Plus className="w-6 h-6 text-zinc-400 group-hover:text-teal-500 transition-colors" />
                            </div>
                            <p className="text-xs font-semibold text-zinc-500 group-hover:text-teal-600 transition-colors">Tạo Avatar</p>
                          </>
                        )}
                      </div>
                      <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => { handleFileChange(e); }} disabled={isBusy} />

                      {/* User's uploaded photo (if exists) */}
                      {activeScene.talkingPhotoUrl && (
                        <div
                          className={cn("relative aspect-[3/4] rounded-xl overflow-hidden border-2 cursor-pointer transition-all hover:scale-[1.02]",
                            activeScene.avatarSource === 'photo' ? "border-teal-500 ring-2 ring-teal-500/30 shadow-lg" : "border-zinc-200 dark:border-zinc-800 hover:border-teal-300"
                          )}
                          onClick={() => {
                            updateScene(activeSceneIndex, { avatarSource: 'photo' });
                            setIsAvatarPanelOpen(false);
                          }}
                          role="button"
                        >
                          <Image src={activeScene.talkingPhotoUrl} alt="My Avatar" fill className="object-cover" />
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                            <p className="text-[11px] text-white font-semibold">Ảnh của tôi</p>
                          </div>
                          {activeScene.avatarSource === 'photo' && (
                            <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center">
                              <span className="text-white text-[10px]">✓</span>
                            </div>
                          )}
                          {/* Delete button */}
                          <button
                            className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity text-[10px]"
                            onClick={(e) => { e.stopPropagation(); updateScene(activeSceneIndex, { talkingPhotoUrl: null, avatarSource: 'heygen' }); }}
                          >
                            ✕
                          </button>
                        </div>
                      )}

                      {/* No avatars message */}
                      {!activeScene.talkingPhotoUrl && (
                        <div className="aspect-[3/4] rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
                          <p className="text-[10px] text-zinc-400 text-center px-2">Tải ảnh chân dung để tạo avatar của bạn</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* ── PUBLIC AVATARS TAB ── */
                    <div>
                      {isLoadingAvatars ? (
                        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-500" /></div>
                      ) : filteredAvatars.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-sm text-zinc-400 mb-3">Không tìm thấy avatar nào.</p>
                          <Button variant="outline" size="sm" onClick={loadHeygenAvatars} className="rounded-xl">
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Tải lại
                          </Button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          {filteredAvatars.map((avatar, idx) => (
                            <div
                              key={`${avatar.avatar_id}-${idx}`}
                              className={cn("relative aspect-[3/4] rounded-xl overflow-hidden border-2 cursor-pointer transition-all hover:scale-[1.02]",
                                activeScene.heygenAvatarId === avatar.avatar_id ? "border-teal-500 ring-2 ring-teal-500/30 shadow-lg" : "border-zinc-200 dark:border-zinc-800 hover:border-teal-300"
                              )}
                              onClick={() => {
                                updateScene(activeSceneIndex, { heygenAvatarId: avatar.avatar_id, heygenAvatarPreview: avatar.preview_image_url, avatarSource: 'heygen' });
                                setIsAvatarPanelOpen(false);
                              }}
                              role="button"
                            >
                              {avatar.preview_image_url ? (
                                <Image src={avatar.preview_image_url} alt={avatar.avatar_name} fill className="object-cover" />
                              ) : (
                                <div className="flex items-center justify-center h-full bg-zinc-100 dark:bg-zinc-800"><ScanFace className="w-8 h-8 text-zinc-400" /></div>
                              )}
                              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                                <p className="text-[11px] text-white font-semibold truncate">{avatar.avatar_name}</p>
                              </div>
                              {activeScene.heygenAvatarId === avatar.avatar_id && (
                                <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center">
                                  <span className="text-white text-[10px]">✓</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VOICE SELECTION */}
          <div className="bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl border border-white/60 dark:border-zinc-800/60 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Mic className="w-5 h-5 text-teal-500" /> Chọn Giọng nói</h3>

            <div className="flex gap-2 mb-4">
              <button onClick={() => { setVoiceTab('elevenlabs'); updateScene(activeSceneIndex, { voiceSource: 'elevenlabs' }); }}
                className={cn("px-4 py-2 rounded-xl text-sm font-semibold transition-all",
                  voiceTab === 'elevenlabs' ? "bg-teal-500 text-white shadow-md" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                )}>ElevenLabs</button>
              <button onClick={() => { setVoiceTab('heygen'); updateScene(activeSceneIndex, { voiceSource: 'heygen' }); }}
                className={cn("px-4 py-2 rounded-xl text-sm font-semibold transition-all",
                  voiceTab === 'heygen' ? "bg-teal-500 text-white shadow-md" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                )}>HeyGen Voices</button>
            </div>

            {voiceTab === 'elevenlabs' ? (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <Select value={activeScene.elevenLabsVoiceId || ''} onValueChange={v => updateScene(activeSceneIndex, { elevenLabsVoiceId: v })} disabled={isBusy}>
                    <SelectTrigger className="h-11 rounded-xl flex-1"><SelectValue placeholder={isLoadingElVoices ? 'Đang tải...' : 'Chọn giọng ElevenLabs'} /></SelectTrigger>
                    <SelectContent>{elVoices.map(v => (<SelectItem key={v.voice_id} value={v.voice_id}>{v.name} ({v.category})</SelectItem>))}</SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={loadElVoices} disabled={isLoadingElVoices} className="h-11 w-11 rounded-xl">
                    <RefreshCw className={cn("w-4 h-4", isLoadingElVoices && "animate-spin")} />
                  </Button>
                </div>
                {activeScene.elevenLabsVoiceId && elVoices.find(v => v.voice_id === activeScene.elevenLabsVoiceId)?.preview_url && (
                  <Button variant="outline" size="sm" className="w-fit rounded-xl" onClick={() => {
                    const voice = elVoices.find(v => v.voice_id === activeScene.elevenLabsVoiceId);
                    if (voice?.preview_url) new Audio(voice.preview_url).play();
                  }}><Volume2 className="mr-2 h-4 w-4" /> Nghe thử</Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input type="text" value={voiceSearch} onChange={e => setVoiceSearch(e.target.value)}
                      placeholder="Tìm giọng..." className="w-full h-10 pl-9 pr-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30" />
                  </div>
                  <Select value={voiceLangFilter} onValueChange={setVoiceLangFilter}>
                    <SelectTrigger className="h-10 w-[120px] rounded-xl text-xs"><SelectValue placeholder="Ngôn ngữ" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      {voiceLanguages.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={loadHeygenVoices} disabled={isLoadingHeygenVoices} className="h-10 w-10 rounded-xl">
                    <RefreshCw className={cn("w-4 h-4", isLoadingHeygenVoices && "animate-spin")} />
                  </Button>
                </div>
                {isLoadingHeygenVoices ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-teal-500" /></div>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto pr-1">
                    {filteredHeygenVoices.map((voice, idx) => (
                      <div key={`${voice.voice_id}-${idx}`}
                        onClick={() => updateScene(activeSceneIndex, { heygenVoiceId: voice.voice_id, voiceSource: 'heygen' })}
                        role="button"
                        className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-sm cursor-pointer",
                          activeScene.heygenVoiceId === voice.voice_id ? "bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border border-transparent"
                        )}>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-cyan-400 flex items-center justify-center text-white text-xs font-bold">
                          {voice.gender === 'male' ? '♂' : '♀'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{voice.name}</p>
                          <p className="text-xs text-zinc-400">{voice.language} · {voice.gender}</p>
                        </div>
                        {voice.preview_audio && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={(e) => { e.stopPropagation(); new Audio(voice.preview_audio!).play(); }}>
                            <Play className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {activeScene.heygenVoiceId === voice.voice_id && <span className="text-teal-500 font-bold text-xs">✓</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SCRIPT EDITOR */}
          <div className="bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl border border-white/60 dark:border-zinc-800/60 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-teal-500" /> Kịch bản nói</h3>
            <Textarea
              placeholder="Nhập văn bản mà avatar sẽ nói... Ví dụ: Xin chào! Tôi là đại diện thương hiệu của bạn."
              value={activeScene.script}
              onChange={(e) => updateScene(activeSceneIndex, { script: e.target.value })}
              disabled={isBusy}
              className="resize-none min-h-[120px] rounded-xl border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30 focus-visible:ring-teal-500/30"
            />
            <p className="text-xs text-zinc-400 mt-2">{activeScene.script.length} ký tự · Scene {activeSceneIndex + 1}/{scenes.length}</p>
          </div>

          {/* MULTI-SCENE TIMELINE */}
          <div className="bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl border border-white/60 dark:border-zinc-800/60 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-sm text-zinc-700 dark:text-zinc-200">Scenes ({scenes.length})</h4>
              <Button variant="outline" size="sm" onClick={addScene} disabled={isBusy} className="h-8 rounded-xl text-xs">
                <Plus className="w-3.5 h-3.5 mr-1" /> Thêm Scene
              </Button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {scenes.map((scene, i) => (
                <div key={scene.id}
                  onClick={() => setActiveSceneIndex(i)}
                  role="button"
                  className={cn("relative flex-shrink-0 w-[120px] rounded-xl border-2 overflow-hidden transition-all group cursor-pointer",
                    i === activeSceneIndex ? "border-teal-500 ring-2 ring-teal-500/20 shadow-md" : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300"
                  )}>
                  <div className="aspect-[16/9] bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center relative">
                    {(scene.avatarSource === 'photo' && scene.talkingPhotoUrl) ? (
                      <Image src={scene.talkingPhotoUrl} alt="" fill className="object-cover" />
                    ) : (scene.avatarSource === 'heygen' && scene.heygenAvatarPreview) ? (
                      <Image src={scene.heygenAvatarPreview} alt="" fill className="object-cover" />
                    ) : (
                      <ScanFace className="w-6 h-6 text-zinc-400" />
                    )}
                  </div>
                  <div className="p-1.5 bg-white dark:bg-zinc-900">
                    <p className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 truncate">Scene {i + 1}</p>
                    <p className="text-[9px] text-zinc-400 truncate">{scene.script.slice(0, 30) || '(Chưa có script)'}</p>
                  </div>
                  {scenes.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); removeScene(i); }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* SETTINGS + GENERATE */}
          <div className="flex items-center gap-3">
            <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as any)} disabled={isBusy}>
              <SelectTrigger className="h-12 w-[160px] rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="16:9">Ngang (16:9)</SelectItem>
                <SelectItem value="9:16">Dọc (9:16)</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleGenerate} disabled={isBusy} size="lg" className="flex-1 h-12 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-bold text-base shadow-md shadow-teal-500/25">
              {isBusy ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Đang xử lý...</> : <><Sparkles className="mr-2 h-5 w-5" /> Tạo Video Avatar</>}
            </Button>
          </div>
        </div>

        {/* RIGHT: Preview + History (2 cols) */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* VIDEO OUTPUT */}
          <div className="bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl border border-white/60 dark:border-zinc-800/60 rounded-2xl p-6 shadow-sm">
            {isBusy ? (
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <div className="w-full max-w-xs space-y-2">
                  {pipelineSteps.map((step, idx) => {
                    const cur = getPipelineStepIndex();
                    const isActive = idx === cur;
                    const isDone = idx < cur;
                    return (
                      <div key={step.key} className={cn("flex items-center gap-2.5 p-2.5 rounded-xl transition-all text-sm",
                        isActive && "bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 font-semibold text-teal-700 dark:text-teal-300",
                        isDone && "opacity-50 line-through",
                        !isActive && !isDone && "opacity-30"
                      )}>
                        <span className="text-base">{isDone ? '✅' : isActive ? step.icon : '⬜'}</span>
                        <span className="flex-1">{step.label}</span>
                        {isActive && <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-500" />}
                      </div>
                    );
                  })}
                </div>
                <p className="text-sm text-zinc-500 mt-2">{pipelineMessage}</p>
                <span className="font-mono text-lg text-zinc-400">{elapsedTime}s</span>
              </div>
            ) : pipelineStep === 'failed' ? (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
                <p className="font-bold mb-1">❌ Lỗi</p>
                <p className="text-sm">{pipelineMessage}</p>
                <Button variant="outline" size="sm" className="mt-3 rounded-xl" onClick={handleGenerate}>🔄 Thử lại</Button>
              </div>
            ) : generatedVideoUrl ? (
              <div className="space-y-4">
                <div className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 aspect-video bg-black">
                  <video src={generatedVideoUrl} controls className="w-full h-full object-contain" />
                </div>
                <div className="flex gap-2">
                  <a href={generatedVideoUrl} download={`igen-avatar-${Date.now()}.mp4`} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="rounded-xl"><Download className="mr-2 h-4 w-4" /> Tải xuống</Button>
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                <ScanFace className="h-14 w-14 mb-4 opacity-40" />
                <p className="font-medium">Video Avatar sẽ xuất hiện ở đây</p>
                <p className="text-xs mt-1.5 text-center">Chọn Avatar → Chọn Giọng → Nhập kịch bản → Tạo Video</p>
              </div>
            )}
          </div>

          {/* HISTORY */}
          <div className="bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl border border-white/60 dark:border-zinc-800/60 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-zinc-400" />
              <h3 className="font-bold">Lịch sử</h3>
              <span className="text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-500">{history.length}</span>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-6">Chưa có video nào.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-1">
                {history.map(item => (
                  <div key={item.id} className="group rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="aspect-video bg-black/5 relative">
                      <video src={item.videoUrl} className="w-full h-full object-cover" preload="metadata" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 rounded-t-xl">
                        <Button variant="secondary" size="icon" className="h-10 w-10 rounded-full"><Play className="h-4 w-4 ml-0.5" /></Button>
                      </div>
                    </div>
                    <div className="p-3 flex items-center justify-between">
                      <p className="text-sm truncate flex-1 mr-2">{item.text}</p>
                      <div className="flex gap-1 shrink-0">
                        <a href={item.videoUrl} download target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button>
                        </a>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => handleDeleteHistory(item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Generate Video Settings Modal */}
      {isGenerateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm shadow-2xl">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-zinc-100 dark:border-zinc-800">
              <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">Generate Video</h2>
              <Button variant="ghost" size="icon" onClick={() => setIsGenerateModalOpen(false)} className="rounded-full h-8 w-8 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Title Input */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Title</Label>
                <input 
                  type="text" 
                  value={videoTitle} 
                  onChange={e => setVideoTitle(e.target.value)} 
                  className="w-full h-11 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-all text-sm" 
                  placeholder="Untitled Video" 
                />
              </div>

              {/* Grid 2 cols */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Add to folder</Label>
                  <Select defaultValue="my-videos">
                    <SelectTrigger className="h-11 rounded-xl bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-sm"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="my-videos">My Videos</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Resolution</Label>
                  <Select value={videoResolution} onValueChange={setVideoResolution}>
                    <SelectTrigger className="h-11 rounded-xl bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="720p">720p</SelectItem>
                      <SelectItem value="1080p">1080p <span className="ml-1 text-[10px] text-amber-500">💎</span></SelectItem>
                      <SelectItem value="4k">4k <span className="ml-1 text-[10px] text-amber-500">💎</span></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Fps <span className="text-[10px] text-zinc-400 font-normal ml-1">Please subscribe to enable higher FPS</span></Label>
                  <Select value={videoFps} onValueChange={setVideoFps}>
                    <SelectTrigger className="h-11 rounded-xl bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="30">30 <span className="ml-1 text-[10px] text-amber-500">💎</span></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Format</Label>
                  <Select value={videoFormat} onValueChange={setVideoFormat}>
                    <SelectTrigger className="h-11 rounded-xl bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-sm"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="MP4">MP4</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>

              {/* Info banner */}
              <div className="bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-100 dark:border-cyan-900 rounded-xl p-3 flex items-start gap-3">
                <Clock className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
                <p className="text-sm text-cyan-700 dark:text-cyan-400">
                  This will use one free Avatar video quota. Available: 1 video(s).
                </p>
              </div>

              {/* Watermark Toggle */}
              <div className="flex items-center gap-3 pt-2">
                <div 
                  onClick={() => setWatermarkOn(!watermarkOn)} 
                  className={cn("w-10 h-6 rounded-full transition-colors cursor-pointer relative", watermarkOn ? "bg-[#0bb5ff]" : "bg-zinc-200 dark:bg-zinc-700")}
                >
                  <div className={cn("absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform shadow-sm", watermarkOn && "translate-x-4")} />
                </div>
                <Label className="font-medium cursor-pointer flex items-center gap-1 text-zinc-700 dark:text-zinc-200" onClick={() => setWatermarkOn(!watermarkOn)}>
                  HeyGen Watermark <span className="text-amber-500 text-sm">💎</span>
                </Label>
              </div>
            </div>
            
            {/* Footer Buttons */}
            <div className="p-6 bg-zinc-50 dark:bg-zinc-900/50 flex justify-end gap-3 rounded-b-3xl">
              <Button variant="outline" className="rounded-full px-6 font-semibold" onClick={() => setIsGenerateModalOpen(false)}>Cancel</Button>
              <Button 
                onClick={() => {
                  setIsGenerateModalOpen(false);
                  submitGenerate();
                }} 
                className="rounded-full px-8 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 font-semibold"
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
