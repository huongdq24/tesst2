'use client';

import { useState, useRef, useEffect } from 'react';
import { recordUsage, estimateAudioDuration } from '@/lib/usage-tracker';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from "@/components/ui/progress";
import { CostEstimationPanel } from "./cost-estimation-panel";
import { estimateTokens } from "@/lib/usage-tracker";
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Loader2, Mic, Play, Download, Volume2, Pause, Wand2, Trash2, Clock, MicOff, Headphones, Library, Settings2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { aiVoiceGeneration } from '@/ai/flows/ai-voice-generation-flow';
import { aiScriptOptimizationFlow } from '@/ai/flows/ai-script-optimization-flow';
import { getVoiceHistory, saveGeneratedVoice, deleteVoiceRecord, VoiceRecord } from '@/actions/voice-actions';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/i18n-context';
import { Separator } from '@/components/ui/separator';

const VOICE_STYLE_TEMPLATES = [
  { id: 'none', label: 'Tùy chỉnh (Tự nhập)', prompt: '' },
  { id: 'news', label: '🎙️ BTV thời sự', prompt: 'Đọc dõng dạc, nghiêm túc, rõ ràng và mạch lạc như một biên tập viên truyền hình.' },
  { id: 'story', label: '🌙 Kể chuyện', prompt: 'Đọc chậm rãi, ấm áp, truyền cảm như đang kể chuyện cho trẻ em nghe.' },
  { id: 'excited', label: '🎉 Hào hứng', prompt: 'Đọc thật hào hứng, bùng nổ, vui tươi và tràn đầy nhiệt huyết.' },
  { id: 'prof', label: '📊 Chuyên gia', prompt: 'Đọc điềm đạm, tốc độ vừa phải, chuyên nghiệp và đầy tính thuyết phục.' },
  { id: 'sad', label: '🥀 Sâu lắng', prompt: 'Đọc với giọng trầm buồn, nghẹn ngào, tốc độ chậm rãi thể hiện sự đồng cảm.' },
  { id: 'urgent', label: '🚨 Khẩn cấp', prompt: 'Đọc dứt khoát, nhanh, âm lượng lớn và tập trung vào sự quan trọng của thông tin.' },
];

const ALL_VOICES = [
  { id: 'Aoede', gender: 'female', age: 'young', label: 'Cô gái (~25t)', description: 'Nhẹ nhàng, truyền cảm (Middle)' },
  { id: 'Kore', gender: 'female', age: 'child', label: 'Bé gái (~12t)', description: 'Trong trẻo, dễ thương' },
  { id: 'Puck', gender: 'male', age: 'child', label: 'Bé trai (~12t)', description: 'Năng động, hoạt bát' },
  { id: 'Charon', gender: 'male', age: 'adult', label: 'Đàn ông (~45t)', description: 'Trầm ấm, mạnh mẽ' },
  { id: 'Fenrir', gender: 'male', age: 'young', label: 'Chàng trai (~25t)', description: 'Sắc sảo, rõ ràng' },
  { id: 'Leda', gender: 'female', age: 'young', label: 'Thanh niên', description: 'Trong trẻo, tự nhiên' },
  { id: 'Orus', gender: 'male', age: 'adult', label: 'Trung niên', description: 'Trầm ấm, vang' },
  { id: 'Callirrhoe', gender: 'female', age: 'adult', label: 'Trung niên', description: 'Mềm mại, ấm áp' },
  { id: 'Autonoe', gender: 'female', age: 'young', label: 'Thanh niên', description: 'Thanh thoát, rõ lời' },
  { id: 'Enceladus', gender: 'male', age: 'young', label: 'Thanh niên', description: 'Mạnh mẽ, dứt khoát' },
  { id: 'Iapetus', gender: 'male', age: 'adult', label: 'Trung niên', description: 'Sâu trầm, chững chạc' },
  { id: 'Umbriel', gender: 'male', age: 'young', label: 'Thanh niên', description: 'Nhẹ nhàng, từ tốn' },
  { id: 'Algieba', gender: 'female', age: 'adult', label: 'Trung niên', description: 'Dày, sang trọng' },
  { id: 'Despina', gender: 'female', age: 'young', label: 'Thanh niên', description: 'Cao, nhí nhảnh' },
  { id: 'Erinome', gender: 'female', age: 'young', label: 'Thanh niên', description: 'Clear, Middle pitch' },
  { id: 'Algenib', gender: 'male', age: 'adult', label: 'Trung niên', description: 'Gravelly, Lower pitch' },
  { id: 'Rasalgethi', gender: 'male', age: 'young', label: 'Thanh niên', description: 'Informative, Middle pitch' },
  { id: 'Laomedeia', gender: 'female', age: 'young', label: 'Thanh niên', description: 'Upbeat, Higher pitch' },
  { id: 'Achernar', gender: 'male', age: 'young', label: 'Thanh niên', description: 'Sáng, lôi cuốn' },
  { id: 'Zephyr', gender: 'male', age: 'young', label: 'Thanh niên', description: 'Smooth, Middle pitch' },
  { id: 'Alnilam', gender: 'male', age: 'adult', label: 'Trung niên', description: 'Dày, mạnh mẽ' },
  { id: 'Schedar', gender: 'female', age: 'adult', label: 'Trung niên', description: 'Đầm ấm, chững chạc' },
  { id: 'Gacrux', gender: 'male', age: 'adult', label: 'Trung niên', description: 'Sâu lắng, ấm áp' },
  { id: 'Pulcherrima', gender: 'female', age: 'young', label: 'Thanh niên', description: 'Tự nhiên, rành mạch' },
  { id: 'Achird', gender: 'male', age: 'young', label: 'Thanh niên', description: 'Nhịp vang, linh hoạt' },
  { id: 'Zubenelgenubi', gender: 'male', age: 'adult', label: 'Trung niên', description: 'Chậm rãi, thuyết phục' },
  { id: 'Vindemiatrix', gender: 'female', age: 'adult', label: 'Trung niên', description: 'Thanh tao, điềm tĩnh' },
  { id: 'Sadachbia', gender: 'female', age: 'young', label: 'Thanh niên', description: 'Tươi tắn, truyền cảm' },
  { id: 'Sadaltager', gender: 'male', age: 'adult', label: 'Trung niên', description: 'Trầm ấm, độc đáo' },
  { id: 'Sulafat', gender: 'male', age: 'young', label: 'Thanh niên', description: 'Hoạt bát, tươi sáng' }
];

export function VoiceGenerationWorkspace() {
  const { t } = useI18n();
  const { user, userData } = useAuth();
  const { toast } = useToast();

  const [text, setText] = useState('');
  const [model, setModel] = useState('gemini-2.5-pro-preview-tts');
  
  // Custom states
  const [styleInstructions, setStyleInstructions] = useState('');
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [temperature, setTemperature] = useState(1.05);

  // Voice selection state
  const [voiceId, setVoiceId] = useState('Sadaltager');
  const [speakerA, setSpeakerA] = useState('Aoede');
  const [speakerB, setSpeakerB] = useState('Puck');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  
  // Dictation state (Speech-to-Text)
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // History State
  const [history, setHistory] = useState<VoiceRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Preview State
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewCache, setPreviewCache] = useState<Record<string, string>>({});
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Custom audio player state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (user?.uid) {
      loadHistory();
    }
    // Cleanup speech recognition on unmount
    return () => {
       if (recognitionRef.current && isListening) {
          recognitionRef.current.stop();
       }
       if (previewAudioRef.current) previewAudioRef.current.pause();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // Keyboard shortcut for generation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isGenerating && !isOptimizing && text.trim()) {
           handleGenerate();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [text, isGenerating, isOptimizing, mode, temperature, styleInstructions, voiceId, speakerA, speakerB, model]);


  const loadHistory = async () => {
    if (!user?.uid) return;
    setIsLoadingHistory(true);
    try {
      const records = await getVoiceHistory(user.uid, 20);
      setHistory(records);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const getSelectedVoice = () => {
     return ALL_VOICES.find(v => v.id === voiceId) || ALL_VOICES[0];
  };

  const handlePreviewVoice = async () => {
    if (!userData?.geminiApiKey) {
       toast({ variant: 'destructive', title: 'Thiếu API Key', description: 'Vui lòng thêm iGen Key trong Cài đặt để nghe thử.' });
       return;
    }

    const currentVoice = getSelectedVoice();
    
    // Check cache
    if (previewCache[currentVoice.id]) {
       playPreviewAudio(previewCache[currentVoice.id]);
       return;
    }

    setIsPreviewing(true);
    try {
       const previewText = currentVoice.gender === 'female' 
         ? `Xin chào, đây là giọng của tôi. Rất vui được gặp bạn.`
         : `Xin chào, đây là giọng của tôi. Chúc bạn một ngày tốt lành.`;
         
       const result = await aiVoiceGeneration({
         textToSpeak: previewText,
         mode: 'single',
         temperature: 1.0,
         speakerA: 'Aoede',
         speakerB: 'Puck',
         modelName: 'gemini-2.5-flash-preview-tts', // Always use flash for fast preview
         voiceName: currentVoice.id,
         apiKey: userData.geminiApiKey,
       });

       if (result.audioDataUri) {
         setPreviewCache(prev => ({ ...prev, [currentVoice.id]: result.audioDataUri }));
         playPreviewAudio(result.audioDataUri);
       }
    } catch (e: any) {
       toast({ variant: 'destructive', title: 'Lỗi phát thử', description: e.message });
    } finally {
       setIsPreviewing(false);
    }
  };

  const playPreviewAudio = (uri: string) => {
     if (previewAudioRef.current) {
        previewAudioRef.current.pause();
     }
     const audio = new Audio(uri);
     previewAudioRef.current = audio;
     audio.play().catch(e => console.error("Preview play failed", e));
  };

  const toggleDictation = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      toast({ variant:'destructive', title: 'Không hỗ trợ', description: "Trình duyệt của bạn không hỗ trợ thu âm Microphone." });
      return;
    }
    
    if (isListening && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
        toast({ title: 'Đã dừng thu âm' });
        return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'vi-VN';
    recognition.continuous = true;
    recognition.interimResults = true;
    
    let startText = text;
    if (startText.length > 0 && !startText.endsWith(' ')) startText += ' ';
    
    recognition.onstart = () => {
      setIsListening(true);
      toast({ title: 'Đang lắng nghe...', description: 'Hãy nói vào Microphone của bạn.' });
    };

    recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
           currentTranscript += event.results[i][0].transcript;
        }
        setText(startText + currentTranscript);
    };

    recognition.onerror = (e: any) => {
      console.error(e);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);
    
    try { recognition.start(); } catch (e) { setIsListening(false); }
  };

  const handleOptimizeScript = async () => {
    if (!text.trim()) {
      toast({ variant: 'destructive', title: 'Thiếu nội dung', description: 'Vui lòng nhập kịch bản cần tối ưu.' });
      return;
    }
    setIsOptimizing(true);
    try {
      toast({ title: 'Đang tối ưu...', description: 'AI đang viết lại văn bản...' });
      const result = await aiScriptOptimizationFlow({
        text,
        readingStyle: styleInstructions || 'hấp dẫn, lôi cuốn',
        apiKey: userData?.geminiApiKey,
      });
      if (result.optimizedText) {
        setText(result.optimizedText);
        toast({ title: 'Tối ưu thành công!', description: 'Kịch bản đã được tự nhiên hóa.' });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Lỗi', description: error.message });
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleGenerate = async () => {
    if (!text.trim()) {
      toast({ variant: 'destructive', title: 'Thiếu nội dung', description: 'Vui lòng nhập văn bản cần đọc.' });
      return;
    }
    if (!userData?.geminiApiKey) {
      toast({ variant: 'destructive', title: 'Thiếu API Key', description: 'Vui lòng thêm iGen Key trong Cài đặt.' });
      return;
    }

    const voiceConfig = getSelectedVoice();
    const descriptiveVoiceLabel = mode === 'single'
      ? `${voiceConfig.id} - ${voiceConfig.gender === 'male' ? 'Nam' : 'Nữ'} (${voiceConfig.label})`
      : `Multi-speaker (${speakerA} & ${speakerB})`;

    setIsGenerating(true);
    setAudioUri(null);
    setIsPlaying(false);
    
    try {
      toast({ title: 'Đang tạo âm thanh...', description: `Đang xử lý TTS...` });
      
      const result = await aiVoiceGeneration({
        textToSpeak: text,
        styleInstructions,
        mode,
        temperature,
        modelName: model,
        voiceName: voiceId,
        speakerA,
        speakerB,
        apiKey: userData.geminiApiKey,
      });

      if (result.audioDataUri) {
        setAudioUri(result.audioDataUri);
        
        if (user?.uid) {
           try {
              const newRecord = await saveGeneratedVoice(user.uid, result.audioDataUri, {
                 text,
                 voiceName: descriptiveVoiceLabel,
                 modelName: model
              });
              setHistory(prev => [newRecord, ...prev]);
           } catch (saveErr) {
              console.error(saveErr);
           }

           // Track usage cost
           recordUsage({
             userId: user.uid,
             userEmail: user.email || '',
             type: 'audio',
             model: model,
             amount: estimateAudioDuration(text),
             prompt: text.substring(0, 200),
           });
        }
      }
    } catch (error: any) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Lỗi', description: error.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteHistory = async (record: VoiceRecord) => {
    if (!user?.uid) return;
    try {
       setHistory(prev => prev.filter(r => r.id !== record.id));
       await deleteVoiceRecord(user.uid, record.id, record.storagePath);
       toast({ title: 'Đã xóa', description: 'Bản thu đã bị xóa.' });
    } catch (e: any) {
       toast({ variant: 'destructive', title: 'Lỗi khi xóa', description: e.message });
       loadHistory(); 
    }
  };

  const handlePlayHistory = (url: string) => {
    setAudioUri(url);
    setIsPlaying(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => { if (audioRef.current) audioRef.current.play(); }, 100);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleDownload = (uri?: string, customName?: string) => {
    const targetUri = uri || audioUri;
    if (!targetUri) return;
    const link = document.createElement('a');
    link.href = targetUri;
    link.download = customName || `igen-voice-${Date.now()}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1400px] flex-1 flex flex-col mx-auto w-full pb-12">


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
        
        {/* LEFT COLUMN: Controls & Settings */}
        <div className="lg:col-span-1 flex flex-col">
          <Card className="flex-1 border shadow-sm flex flex-col min-h-[500px]">
            <CardContent className="p-5 flex-1 flex flex-col space-y-5">
               
               {/* 1. Style instructions & Templates */}
               <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-semibold text-foreground">Style instructions</Label>
                    <Input 
                      placeholder="VD: Đọc chậm rãi, ấm áp thiết tha..." 
                      value={styleInstructions}
                      onChange={(e) => setStyleInstructions(e.target.value)}
                      disabled={isGenerating}
                      className="focus-visible:ring-1 border-muted-foreground/20 text-sm"
                    />
                  </div>
                  
                  <div className="space-y-2.5 bg-muted/20 border border-muted-foreground/10 p-2.5 rounded-lg hidden sm:block">
                    {/* Style Category */}
                    <div className="flex flex-col gap-1.5">
                       <span className="text-[10px] uppercase font-bold text-muted-foreground/70 tracking-wider">🎭 Phong cách</span>
                       <div className="flex flex-wrap gap-1.5">
                         {VOICE_STYLE_TEMPLATES.filter(t => t.id !== 'none').map(t => (
                            <button
                              key={t.id}
                              className="px-2 py-0.5 bg-white hover:bg-muted/80 text-[10px] font-medium rounded text-muted-foreground hover:text-foreground transition-colors border border-muted-foreground/20 shadow-sm"
                              onClick={() => setStyleInstructions(prev => prev ? `${prev}, ${t.prompt}` : t.prompt)}
                              disabled={isGenerating}
                              title={t.prompt}
                            >
                              {t.label}
                            </button>
                         ))}
                       </div>
                    </div>
                    
                    {/* Region Category */}
                    <div className="flex flex-col gap-1.5 pt-1">
                       <span className="text-[10px] uppercase font-bold text-muted-foreground/70 tracking-wider">🗺️ Vùng miền</span>
                       <div className="flex flex-wrap gap-1.5">
                         <button className="px-2 py-0.5 bg-cyan-50 flex-1 sm:flex-none hover:bg-cyan-100 text-cyan-700 text-[10px] font-medium rounded transition-colors border border-cyan-200 shadow-sm"
                            onClick={() => setStyleInstructions(prev => prev ? `${prev}, mang âm sắc giọng miền Bắc chuẩn` : 'Đọc bằng giọng miền Bắc phổ thông chuẩn')}
                            disabled={isGenerating}
                         >Miền Bắc</button>
                         <button className="px-2 py-0.5 bg-cyan-50 flex-1 sm:flex-none hover:bg-cyan-100 text-cyan-700 text-[10px] font-medium rounded transition-colors border border-cyan-200 shadow-sm"
                            onClick={() => setStyleInstructions(prev => prev ? `${prev}, mang âm sắc giọng miền Trung` : 'Đọc bằng giọng miền Trung')}
                            disabled={isGenerating}
                         >Miền Trung</button>
                         <button className="px-2 py-0.5 bg-cyan-50 flex-1 sm:flex-none hover:bg-cyan-100 text-cyan-700 text-[10px] font-medium rounded transition-colors border border-cyan-200 shadow-sm"
                            onClick={() => setStyleInstructions(prev => prev ? `${prev}, mang âm sắc giọng miền Nam` : 'Đọc bằng giọng miền Nam nhẹ nhàng')}
                            disabled={isGenerating}
                         >Miền Nam</button>
                       </div>
                    </div>

                  </div>
               </div>
               <Separator />

               {/* 2. Model & Mode Select (moved up) */}
               <div className="space-y-3">
                 <Label className="text-[13px] font-semibold text-foreground">Model & Mode</Label>
                 <Select value={model} onValueChange={setModel} disabled={isGenerating}>
                    <SelectTrigger className="h-9 bg-background focus:ring-1 focus:ring-primary/30 border-muted-foreground/20 text-sm">
                      <SelectValue placeholder="Chọn model..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini-2.5-flash-preview-tts" className="font-medium">2.5 Flash Preview TTS (iGen)</SelectItem>
                      <SelectItem value="gemini-2.5-pro-preview-tts" className="font-medium">2.5 Pro Preview TTS (iGen)</SelectItem>
                    </SelectContent>
                 </Select>
                 <Tabs value={mode} onValueChange={(v: any) => setMode(v)} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 p-1 bg-muted/60 h-auto">
                      <TabsTrigger value="single" className="text-xs py-1.5">Single-speaker</TabsTrigger>
                      <TabsTrigger value="multi" className="text-xs py-1.5">Multi-speaker</TabsTrigger>
                    </TabsList>
                 </Tabs>
               </div>

               <Separator />

               {/* 2. Text Input Area */}
               <div className="space-y-2 flex flex-col">
                  <div className="flex justify-between items-center">
                    <Label className="text-[13px] font-semibold text-foreground">Text</Label>
                    <div className="flex gap-1.5">
                      <Button 
                        variant={isListening ? "destructive" : "outline"} 
                        size="sm" 
                        className={cn("h-7 px-2 text-[10px] sm:text-[11px] rounded", !isListening && "text-muted-foreground border-muted/50 hover:bg-muted/30")}
                        onClick={toggleDictation}
                        disabled={isGenerating || isOptimizing}
                      >
                        {isListening ? <MicOff className="h-3 w-3 sm:mr-1" /> : <Mic className="h-3 w-3 sm:mr-1" />}
                        <span className="hidden sm:inline">{isListening ? 'Đang nghe' : 'Thu âm'}</span>
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-7 px-2 text-[10px] sm:text-[11px] text-muted-foreground border-muted/50 hover:bg-muted/30 rounded" 
                        onClick={handleOptimizeScript}
                        disabled={isOptimizing || isGenerating || !text.trim() || isListening}
                      >
                        {isOptimizing ? <Loader2 className="h-3 w-3 sm:mr-1 animate-spin" /> : <Wand2 className="h-3 w-3 sm:mr-1" />}
                        Tối ưu 
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    placeholder="Dự kiến Quốc hội dành 3 ngày để kiện toàn nhân sự..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={isGenerating || isOptimizing}
                    className={cn("min-h-[160px] resize-y font-medium border-muted-foreground/20 text-[14px] leading-relaxed", isListening && "ring-1 ring-primary")}
                  />
               </div>



               {/* 4. Voice Selection */}
               <div className="space-y-3 pt-2">
                  <Label className="text-[13px] font-semibold text-foreground">Voice</Label>
                  {mode === 'single' ? (
                    <div className="relative group flex items-center">
                       <div className="absolute left-3 z-10 text-muted-foreground"><Mic className="h-4 w-4" /></div>
                       <Select value={voiceId} onValueChange={setVoiceId} disabled={isGenerating}>
                          <SelectTrigger className="pl-9 bg-background focus:ring-1 focus:ring-primary/30 h-10 border-muted-foreground/20 text-sm">
                             <SelectValue placeholder="Voice..." />
                          </SelectTrigger>
                          <SelectContent>
                             {ALL_VOICES.map((v) => (
                               <SelectItem key={v.id} value={v.id}>
                                  <span className="font-medium">{v.id}</span>
                                  <span className="text-muted-foreground ml-1 text-[11px]">
                                    ({v.gender === 'male' ? 'Nam' : 'Nữ'} - {v.age === 'child' ? 'Trẻ em' : v.age === 'young' ? 'Thanh niên' : 'Trung niên'})
                                  </span>
                               </SelectItem>
                             ))}
                          </SelectContent>
                       </Select>
                       <Button 
                         variant="ghost" 
                         className="absolute right-8 h-6 w-6 p-0 hover:bg-muted rounded-full"
                         onClick={(e) => { e.preventDefault(); handlePreviewVoice(); }}
                         title="Preview voice"
                       >
                         {isPreviewing ? <Loader2 className="h-3 w-3 animate-spin"/> : <Headphones className="h-3 w-3 text-muted-foreground" />}
                       </Button>
                    </div>
                  ) : (
                    <div className="space-y-3 bg-muted/5 p-3 rounded-xl border border-dashed">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground/80 uppercase tracking-wider">Speaker A</Label>
                        <Select value={speakerA} onValueChange={setSpeakerA} disabled={isGenerating}>
                          <SelectTrigger className="h-9 text-[12px] bg-background border-muted-foreground/20">
                            <SelectValue placeholder="Voice A" />
                          </SelectTrigger>
                          <SelectContent>
                            {ALL_VOICES.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.id} - ({v.gender === 'male' ? 'Nam' : 'Nữ'} / {v.age === 'child' ? 'Trẻ em' : v.age === 'young' ? 'Thanh niên' : 'Trung niên'})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground/80 uppercase tracking-wider">Speaker B</Label>
                        <Select value={speakerB} onValueChange={setSpeakerB} disabled={isGenerating}>
                          <SelectTrigger className="h-9 text-[12px] bg-background border-muted-foreground/20">
                            <SelectValue placeholder="Voice B" />
                          </SelectTrigger>
                          <SelectContent>
                            {ALL_VOICES.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.id} - ({v.gender === 'male' ? 'Nam' : 'Nữ'} / {v.age === 'child' ? 'Trẻ em' : v.age === 'young' ? 'Thanh niên' : 'Trung niên'})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
               </div>

               {/* 5. Temperature Setting */}
               <div className="space-y-3 pt-2 pb-2">
                  <div className="flex justify-between items-center text-foreground">
                    <Label className="text-[12px] font-medium text-muted-foreground">Temperature (Sáng tạo)</Label>
                    <span className="text-[11px] tabular-nums bg-muted px-1.5 py-0.5 rounded font-medium">{temperature.toFixed(2)}</span>
                  </div>
                  <Slider 
                    value={[temperature]} 
                    max={2} 
                    step={0.05} 
                    onValueChange={(vals) => setTemperature(vals[0])}
                    disabled={isGenerating}
                  />
               </div>

               {/* Generate Button always anchored at bottom of inputs */}
               <div className="pt-2 mt-auto">
                 <Button onClick={handleGenerate} disabled={isGenerating || isOptimizing || !text.trim()} className="w-full text-[14px] font-semibold h-11 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white">
                   {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                   {isGenerating ? 'Đang tạo âm thanh...' : 'Tạo giọng nói (Ctrl ↵)'}
                 </Button>
               </div>

            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: Big Audio Player / Output Area */}
        <div className="lg:col-span-2 bg-muted/30 border rounded-xl flex flex-col items-center justify-center min-h-[500px] lg:min-h-0 relative overflow-hidden">
             
             {isGenerating ? (
                  <div className="flex flex-col items-center justify-center h-full w-full bg-background/50 z-10 absolute inset-0 backdrop-blur-sm">
                     <div className="bg-background p-6 rounded-2xl shadow-xl flex flex-col items-center border">
                        <div className="relative mb-6">
                           <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full"></div>
                           <Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" />
                        </div>
                        <p className="font-semibold text-lg animate-pulse mb-2 text-foreground">Đang tổng hợp giọng nói</p>
                        <p className="text-sm text-muted-foreground max-w-[250px] text-center">Mô hình iGen đang xử lý văn bản và sinh âm thanh chất lượng cao...</p>
                     </div>
                  </div>
               ) : audioUri ? (
                  <div className="w-full flex-1 flex flex-col p-6 sm:p-12 items-center justify-center relative">
                     {/* Decorative background circle */}
                     <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10"></div>
                     
                     <div className="bg-background border shadow-lg rounded-3xl p-6 sm:p-8 w-full max-w-lg mb-8 relative">
                       <div className="flex gap-4 items-start mb-8">
                          <div className="p-3 bg-primary/10 rounded-2xl">
                             <Headphones className="w-6 h-6 text-primary" /> 
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-foreground text-lg mb-1 truncate">
                              Bản thu đã hoàn tất
                            </h3>
                            <p className="text-[13px] text-muted-foreground truncate">
                              Giọng: {mode === 'single' ? voiceId : `${speakerA} & ${speakerB}`}
                            </p>
                          </div>
                          <Button onClick={() => handleDownload()} variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl" title="Tải xuống">
                            <Download className="h-4 w-4" />
                          </Button>
                       </div>

                       {/* Main Player Component */}
                       <div className="bg-muted/50 rounded-2xl p-6 flex flex-col items-center w-full gap-5 border border-muted/80">
                          <audio 
                            ref={audioRef} 
                            src={audioUri} 
                            onTimeUpdate={handleTimeUpdate}
                            onLoadedMetadata={handleLoadedMetadata}
                            onEnded={() => setIsPlaying(false)}
                            className="hidden"
                          />
                          
                          <div className="flex w-full items-center justify-center gap-6">
                             <Button 
                               onClick={() => { if (audioRef.current) audioRef.current.currentTime -= 5; }} 
                               variant="ghost" size="icon" className="h-12 w-12 shrink-0 text-muted-foreground hover:bg-background shadow-sm bg-background border rounded-full"
                             >
                                <span className="text-xs font-bold">-5s</span>
                             </Button>

                             <Button 
                               onClick={togglePlay} 
                               className="h-20 w-20 shrink-0 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xl transition-transform hover:scale-105 active:scale-95"
                             >
                               {isPlaying ? <Pause className="h-10 w-10 fill-current" /> : <Play className="h-10 w-10 ml-2 fill-current" />}
                             </Button>

                             <Button 
                               onClick={() => { if (audioRef.current) audioRef.current.currentTime += 5; }} 
                               variant="ghost" size="icon" className="h-12 w-12 shrink-0 text-muted-foreground hover:bg-background shadow-sm bg-background border rounded-full"
                             >
                                <span className="text-xs font-bold">+5s</span>
                             </Button>
                          </div>

                          <div className="w-full flex items-center gap-4 mt-2 px-1">
                             <span className="text-[13px] font-medium tabular-nums text-muted-foreground w-12 text-right">{formatTime(currentTime)}</span>
                             <div 
                                className="h-3 flex-1 bg-muted-foreground/15 rounded-full overflow-hidden cursor-pointer relative"
                                onClick={(e) => {
                                  if (!audioRef.current || !duration) return;
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const percent = (e.clientX - rect.left) / rect.width;
                                  audioRef.current.currentTime = percent * duration;
                                }}
                              >
                                <div 
                                  className="absolute top-0 bottom-0 left-0 bg-primary transition-all duration-100ease-linear rounded-full"
                                  style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
                                ></div>
                              </div>
                             <span className="text-[13px] font-medium tabular-nums text-muted-foreground w-12">{formatTime(duration)}</span>
                          </div>
                          
                          {/* Mini visualizer purely decorative */}
                          <div className="w-full flex justify-center items-end h-6 gap-[3px] opacity-40 mt-1">
                             {isPlaying && Array.from({length: 12}).map((_, i) => (
                               <div key={i} className="w-1 bg-primary rounded-full animate-pulse" style={{ height: `${Math.max(20, Math.random() * 100)}%`, animationDelay: `${i * 0.1}s` }} />
                             ))}
                             {!isPlaying && Array.from({length: 12}).map((_, i) => (
                               <div key={i} className="w-1 h-1 bg-primary/50 rounded-full" />
                             ))}
                          </div>
                          
                       </div>
                     </div>
                  </div>
               ) : (
                  <div className="flex flex-col items-center justify-center text-muted-foreground/60 w-full h-full p-12 text-center fade-in duration-700">
                    <div className="w-24 h-24 bg-background border shadow-sm rounded-full flex items-center justify-center mb-6">
                      <Volume2 className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <p className="text-xl font-semibold text-foreground/80">Chưa có kết quả</p>
                    <p className="text-[15px] max-w-sm mt-3 leading-relaxed">Hãy nhập văn bản và thiết lập Tùy chọn bên tay trái, sau đó nhấn "Tạo giọng nói" để xem kết quả tại không gian này.</p>
                  </div>
               )}

        </div>
      </div>

      {/* HISTORY GALLERY */}
      <div id="voice-history" className="space-y-5 pt-8 border-t scroll-mt-6">
        <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center">
              <Clock className="w-5 h-5 mr-2 text-primary" />
              Lịch sử giọng nói
            </h3>
        </div>

        {isLoadingHistory ? (
           <div className="flex items-center justify-center p-12 text-muted-foreground">
             <Loader2 className="w-6 h-6 animate-spin mr-2" /> Đang tải lịch sử...
           </div>
        ) : history.length === 0 ? (
           <div className="text-center p-12 bg-muted/20 rounded-2xl border border-dashed text-muted-foreground text-sm">
             Chưa có giọng nói nào được lưu.
           </div>
        ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
             {history.map((record) => (
                <Card key={record.id} className="overflow-hidden hover:shadow-md transition-shadow group relative bg-background border-muted/60">
                   <CardContent className="p-4 space-y-4">
                      {/* Text Preview */}
                      <div className="text-xs text-muted-foreground leading-relaxed line-clamp-3 italic min-h-[50px] bg-muted/20 p-2 rounded-md">
                        "{record.text}"
                      </div>
                      
                      {/* Voice Badge */}
                      <div className="flex justify-between items-center px-1">
                         <div className="text-[11px] font-semibold px-2 py-1 bg-primary/5 text-primary border border-primary/10 rounded-md inline-flex items-center">
                           <Mic className="w-3 h-3 mr-1" />
                           {record.voiceName}
                         </div>
                         <span className="text-[10px] text-muted-foreground/60">
                           {new Date(record.createdAt).toLocaleDateString('vi-VN')}
                         </span>
                      </div>

                      {/* Controls Layer */}
                      <div className="flex items-center justify-between pt-3 border-t">
                         <Button 
                           variant="ghost" 
                           size="sm" 
                           className="h-8 hover:bg-primary/5 hover:text-primary transition-colors hover:text-primary px-2"
                           onClick={() => {
                              const pastVoice = ALL_VOICES.find(v => record.voiceName.includes(v.label) || record.voiceName.includes(v.id));
                              if (pastVoice) {
                                setMode('single');
                                setVoiceId(pastVoice.id);
                              }
                              setText(record.text);
                              handlePlayHistory(record.storageUrl);
                           }}
                         >
                           <Play className="w-4 h-4 mr-1.5" /> Mở & Nghe
                         </Button>

                         <div className="flex gap-0.5">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-muted/50"
                              title="Tải xuống"
                              onClick={() => handleDownload(record.storageUrl, `igen-voice-record-${record.createdAt}.wav`)}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              title="Xóa"
                              onClick={() => handleDeleteHistory(record)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                         </div>
                      </div>
                   </CardContent>
                </Card>
             ))}
           </div>
        )}
      </div>

    </div>
  );
}
