'use client';

import { useState, useRef, useEffect, ChangeEvent, DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  UploadCloud,
  Mic,
  X,
  Trash2,
  Check,
  ChevronRight,
  ChevronLeft,
  FileAudio,
  Volume2,
  Headphones,
  MonitorSpeaker,
  AlertCircle,
  Sparkles,
  Square,
  Wand2,
  Gem,
  Shuffle,
  Lock,
  Circle,
  VolumeX,
  Minus,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface AddVoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVoiceAdded?: (voiceId: string) => void;
}

type VoiceCreationMode = 'design' | 'instant' | 'professional' | 'remix';
type WizardStep = 'selection' | 'upload' | 'info' | 'finish';

interface UploadedFile {
  file: File;
  name: string;
  size: number;
  duration?: number;
  previewUrl: string;
}

interface VoiceLabel {
  id: number;
  key: string;
  value: string;
}

const SelectionCard = ({ icon, title, description, time, onClick, disabled, badge, disabledText }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  time: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: React.ReactNode;
  disabledText?: React.ReactNode;
}) => (
  <div
    className={cn(
      "p-4 rounded-lg border-2 transition-all",
      disabled
        ? "bg-muted/30 border-muted/40 text-muted-foreground opacity-70 cursor-not-allowed"
        : "border-muted/40 hover:border-primary hover:bg-primary/5 cursor-pointer",
    )}
    onClick={!disabled ? onClick : undefined}
  >
    <div className="flex items-start gap-4">
      <div className={cn("text-primary mt-1", disabled && "text-muted-foreground")}>{icon}</div>
      <div>
        <h4 className="font-semibold">{title}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
    <div className="flex items-center justify-between mt-3">
        <Badge variant="secondary">{time}</Badge>
        {badge && <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{badge}</div>}
    </div>
    {disabledText && <div className="mt-3 text-xs flex items-center gap-2 p-2 bg-muted rounded-md text-muted-foreground">{disabledText}</div>}
  </div>
);


export function AddVoiceModal({ open, onOpenChange, onVoiceAdded }: AddVoiceModalProps) {
  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('selection');
  const [creationMode, setCreationMode] = useState<VoiceCreationMode | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [voiceName, setVoiceName] = useState('');
  const [voiceDescription, setVoiceDescription] = useState('');
  const [language, setLanguage] = useState('vi');
  const [labels, setLabels] = useState<VoiceLabel[]>([
    { id: 1, key: 'accent', value: 'northern' },
    { id: 2, key: 'gender', value: 'male' },
    { id: 3, key: 'age', value: 'middle_aged' },
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreated, setIsCreated] = useState(false);
  const [playingFileIndex, setPlayingFileIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();
  const { user, userData } = useAuth();

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setCurrentStep('selection');
        setCreationMode(null);
        setUploadedFiles([]);
        setVoiceName('');
        setVoiceDescription('');
        setLanguage('vi');
        setLabels([
            { id: 1, key: 'accent', value: 'northern' },
            { id: 2, key: 'gender', value: 'male' },
            { id: 3, key: 'age', value: 'middle_aged' },
        ]);
        setIsCreating(false);
        setIsCreated(false);
        setIsRecording(false);
        setRecordingDuration(0);
        setPlayingFileIndex(null);
      }, 300);
    }
  }, [open]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      uploadedFiles.forEach(f => URL.revokeObjectURL(f.previewUrl));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalDuration = uploadedFiles.reduce((sum, f) => sum + (f.duration || 0), 0);
  const durationRequirement = creationMode === 'professional' ? 30 * 60 : 10;
  const hasEnoughAudio = totalDuration >= durationRequirement;

  // File handling
  const processFile = async (file: File): Promise<UploadedFile | null> => {
    if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
      toast({ variant: 'destructive', title: 'Định dạng không hỗ trợ', description: 'Vui lòng tải lên file audio hoặc video.' });
      return null;
    }
    if (file.size > 100 * 1024 * 1024) { // Increased to 100MB for Pro
      toast({ variant: 'destructive', title: 'File quá lớn', description: 'Mỗi file tối đa 100MB.' });
      return null;
    }

    const previewUrl = URL.createObjectURL(file);

    const duration = await new Promise<number>((resolve) => {
      const audio = new Audio(previewUrl);
      audio.addEventListener('loadedmetadata', () => resolve(audio.duration));
      audio.addEventListener('error', () => resolve(0));
      setTimeout(() => resolve(0), 3000);
    });

    return { file, name: file.name, size: file.size, duration, previewUrl, };
  };

  const handleFileUpload = async (files: FileList | File[]) => {
    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(files)) {
      const processed = await processFile(file);
      if (processed) newFiles.push(processed);
    }
    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const handleDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) handleFileUpload(e.dataTransfer.files);
  };
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) handleFileUpload(e.target.files);
    if (e.target) e.target.value = '';
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].previewUrl);
      updated.splice(index, 1);
      return updated;
    });
  };

  // Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `recording-${Date.now()}.webm`, { type: 'audio/webm' });
        const processed = await processFile(file);
        if (processed) setUploadedFiles(prev => [...prev, processed]);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Không thể truy cập microphone', description: error.message || 'Vui lòng cho phép truy cập microphone.' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  // Audio preview
  const togglePlayFile = (index: number) => {
    if (playingFileIndex === index) {
      audioElementRef.current?.pause();
      setPlayingFileIndex(null);
      return;
    }
    if (audioElementRef.current) audioElementRef.current.pause();
    const audio = new Audio(uploadedFiles[index].previewUrl);
    audioElementRef.current = audio;
    audio.play();
    audio.onended = () => setPlayingFileIndex(null);
    setPlayingFileIndex(index);
  };

  const handleAddLabel = () => {
    setLabels([...labels, { id: Date.now(), key: '', value: '' }]);
  };
  
  const handleRemoveLabel = (id: number) => {
    setLabels(labels.filter(label => label.id !== id));
  };
  
  const handleLabelChange = (id: number, field: 'key' | 'value', newValue: string) => {
    setLabels(labels.map(label => label.id === id ? { ...label, [field]: newValue } : label));
  };

  // Create voice
  const handleCreateVoice = async () => {
    if (!userData?.elevenLabsApiKey) {
      toast({ variant: 'destructive', title: 'Thiếu API Key', description: 'Cần ElevenLabs API Key.' });
      return;
    }
    if (!voiceName.trim()) {
      toast({ variant: 'destructive', title: 'Thiếu tên', description: 'Vui lòng đặt tên cho giọng nói.' });
      return;
    }

    setIsCreating(true);
    try {
      const formData = new FormData();
      formData.append('name', voiceName.trim());
      formData.append('description', voiceDescription.trim());
      if (user?.uid) {
        formData.append('userId', user.uid);
      }
      
      // Convert labels array to JSON object string for the API
      const labelsObject = labels.reduce((acc, label) => {
        if (label.key && label.value) {
          acc[label.key] = label.value;
        }
        return acc;
      }, {} as Record<string, string>);
      formData.append('labels', JSON.stringify(labelsObject));

      for (const uploaded of uploadedFiles) {
        formData.append('files', uploaded.file);
      }

      const response = await fetch('/api/elevenlabs/add-voice', {
        method: 'POST',
        headers: { 'x-elevenlabs-api-key': userData.elevenLabsApiKey },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Không thể tạo giọng nói.');
      }

      const data = await response.json();
      setIsCreated(true);
      toast({ title: '🎉 Tạo giọng nói thành công!', description: `Giọng "${voiceName}" đã sẵn sàng sử dụng.` });

      if (onVoiceAdded) {
        onVoiceAdded(data.voice_id);
      }
    } catch (error: any) {
      console.error('[AddVoice] Error:', error);
      toast({ variant: 'destructive', title: 'Lỗi tạo giọng nói', description: error.message });
    } finally {
      setIsCreating(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    let timeString = '';
    if (hrs > 0) timeString += `${hrs}h `;
    if (mins > 0) timeString += `${mins}m `;
    if (secs > 0 || timeString === '') timeString += `${secs}s`;
    return timeString.trim();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const wizardStepsInstant: { key: WizardStep; label: string }[] = [
    { key: 'upload', label: 'Tải lên Audio' },
    { key: 'info', label: 'Thông tin giọng nói' },
    { key: 'finish', label: 'Hoàn tất' },
  ];
  
  const wizardStepsProfessional: { key: WizardStep; label: string }[] = [
    { key: 'upload', label: 'Tải lên & Cài đặt' },
    { key: 'finish', label: 'Xác nhận & Tạo' },
  ];

  const canGoNext = () => {
    if (currentStep === 'upload') {
        if (creationMode === 'professional') {
            return hasEnoughAudio && voiceName.trim().length > 0;
        }
        return uploadedFiles.length > 0 && hasEnoughAudio;
    }
    if (currentStep === 'info') {
      return voiceName.trim().length > 0;
    }
    return false;
  };

  const goNext = () => {
    if (currentStep === 'upload') {
      creationMode === 'professional' ? setCurrentStep('finish') : setCurrentStep('info');
    } else if (currentStep === 'info') {
      setCurrentStep('finish');
    }
  };

  const goBack = () => {
    if (currentStep === 'upload') {
        setCurrentStep('selection');
        setCreationMode(null);
    }
    else if (currentStep === 'info') setCurrentStep('upload');
    else if (currentStep === 'finish') {
        creationMode === 'professional' ? setCurrentStep('upload') : setCurrentStep('info');
    }
  };

  const renderSelectionStep = () => (
    <div className="space-y-3">
        <SelectionCard 
            icon={<Wand2 className="h-5 w-5" />}
            title="Voice Design"
            description="Thiết kế một giọng nói hoàn toàn mới từ văn bản."
            time="Dưới 1 phút"
            disabled
        />
        <SelectionCard 
            icon={<Sparkles className="h-5 w-5" />}
            title="Nhân bản Giọng nói Tức thì (Instant)"
            description="Nhân bản giọng nói của bạn chỉ với 10 giây âm thanh."
            time="~2 phút"
            onClick={() => {
                setCreationMode('instant');
                setCurrentStep('upload');
            }}
        />
        <SelectionCard 
            icon={<Gem className="h-5 w-5" />}
            title="Nhân bản Giọng nói Chuyên nghiệp"
            description="Tạo bản sao kỹ thuật số chân thực nhất của giọng nói của bạn. Yêu cầu ít nhất 30 phút âm thanh sạch."
            time="~4 giờ"
            onClick={() => {
              setCreationMode('professional');
              setCurrentStep('upload');
            }}
        />
        <SelectionCard 
            icon={<Shuffle className="h-5 w-5" />}
            title="Phối lại Giọng nói"
            description="Biến đổi các giọng nói hiện có bằng văn bản để tạo ra giọng nói mới."
            time="Dưới 1 phút"
            disabled
        />
    </div>
  );

  const renderInstantUploadStep = () => (
    <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center text-center gap-2 p-3 rounded-xl bg-muted/40">
                <VolumeX className="h-5 w-5 text-muted-foreground" />
                <div>
                <p className="text-xs font-semibold">Tránh tiếng ồn</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Âm thanh nền ảnh hưởng chất lượng</p>
                </div>
            </div>
            <div className="flex flex-col items-center text-center gap-2 p-3 rounded-xl bg-muted/40">
                <Headphones className="h-5 w-5 text-muted-foreground" />
                <div>
                <p className="text-xs font-semibold">Chất lượng micro</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Dùng mic ngoài để thu tốt hơn</p>
                </div>
            </div>
            <div className="flex flex-col items-center text-center gap-2 p-3 rounded-xl bg-muted/40">
                <MonitorSpeaker className="h-5 w-5 text-muted-foreground" />
                <div>
                <p className="text-xs font-semibold">Thiết bị nhất quán</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Không đổi micro giữa các mẫu</p>
                </div>
            </div>
        </div>

        <div
        className={cn(
            "relative flex flex-col items-center justify-center w-full min-h-[180px] border-2 border-dashed rounded-xl transition-all cursor-pointer",
            isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-muted-foreground/20 hover:bg-muted/30 hover:border-muted-foreground/40"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isRecording && fileInputRef.current?.click()}
        >
        <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm font-medium">Nhấn để tải lên hoặc kéo thả</p>
        <p className="text-xs text-muted-foreground mt-1">File audio hoặc video, tối đa 10MB mỗi file</p>

        <div className="flex items-center gap-3 mt-4">
            <span className="text-xs text-muted-foreground">hoặc</span>
        </div>

        <Button
            variant={isRecording ? "destructive" : "outline"}
            size="sm"
            className="mt-2"
            onClick={(e) => {
            e.stopPropagation();
            if (isRecording) stopRecording();
            else startRecording();
            }}
        >
            {isRecording ? (
            <>
                <Square className="mr-2 h-3.5 w-3.5" />
                Dừng ghi ({formatDuration(recordingDuration)})
            </>
            ) : (
            <>
                <Mic className="mr-2 h-3.5 w-3.5" />
                Ghi âm trực tiếp
            </>
            )}
        </Button>

        {isRecording && (
            <div className="absolute top-3 right-3 flex items-center gap-2">
            <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="text-xs font-medium text-red-600">REC</span>
            </div>
        )}

        <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="audio/*,video/*"
            multiple
            onChange={handleFileChange}
        />
        </div>

        {uploadedFiles.length > 0 && (
        <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">File đã tải lên ({uploadedFiles.length})</Label>
            {uploadedFiles.map((f, i) => (
            <div
                key={i}
                className={cn(
                "flex items-center gap-3 p-2.5 rounded-lg border transition-colors",
                playingFileIndex === i ? "bg-primary/5 border-primary/30" : "hover:bg-muted/40"
                )}
            >
                <Button
                variant={playingFileIndex === i ? "default" : "outline"}
                size="icon"
                className="h-8 w-8 rounded-full flex-shrink-0"
                onClick={() => togglePlayFile(i)}
                >
                {playingFileIndex === i ? (
                    <Volume2 className="h-3.5 w-3.5" />
                ) : (
                    <FileAudio className="h-3.5 w-3.5" />
                )}
                </Button>
                <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{f.name}</p>
                <p className="text-[11px] text-muted-foreground">
                    {formatFileSize(f.size)}
                    {f.duration ? ` • ${formatDuration(f.duration)}` : ''}
                </p>
                </div>
                <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeFile(i)}
                title="Xóa bản thu âm/file này"
                >
                <Trash2 className="h-4 w-4" />
                </Button>
            </div>
            ))}
        </div>
        )}

        <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
            className={cn(
                "h-full rounded-full transition-all duration-500",
                hasEnoughAudio ? "bg-green-500" : "bg-primary"
            )}
            style={{ width: `${Math.min(100, (totalDuration / durationRequirement) * 100)}%` }}
            />
        </div>
        <span className={cn(
            "text-xs font-medium whitespace-nowrap",
            hasEnoughAudio ? "text-green-600" : "text-muted-foreground"
        )}>
            {hasEnoughAudio ? (
            <span className="flex items-center gap-1">
                <Check className="h-3.5 w-3.5" /> Đủ audio
            </span>
            ) : (
            `${formatDuration(totalDuration)} / ${formatDuration(durationRequirement)} tối thiểu`
            )}
        </span>
        </div>

        {!hasEnoughAudio && uploadedFiles.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
                Cần ít nhất 10 giây audio. Bạn nên cung cấp ít nhất 1 phút để có chất lượng tốt nhất.
            </p>
        </div>
        )}
    </div>
  );

  const renderProfessionalUploadStep = () => {
    const totalSize = uploadedFiles.reduce((sum, f) => sum + f.size, 0);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column */}
            <div className="space-y-4">
                <div>
                    <Label htmlFor="voice-name-pro">Voice name</Label>
                    <Input id="voice-name-pro" value={voiceName} onChange={e => setVoiceName(e.target.value)} placeholder="e.g. My Professional Voice" />
                    <p className="text-xs text-muted-foreground mt-1">This is how your voice will appear in the Voice Library.</p>
                </div>

                <div>
                    <Label htmlFor="voice-language-pro">Language used in audio samples</Label>
                    <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger id="voice-language-pro"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="vi">Vietnamese</SelectItem>
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="zh">Chinese</SelectItem>
                        </SelectContent>
                    </Select>
                     <p className="text-xs text-muted-foreground mt-1">This will allow us to process the audio correctly.</p>
                </div>

                <div>
                    <Label htmlFor="voice-desc-pro">Description</Label>
                    <Textarea id="voice-desc-pro" value={voiceDescription} onChange={e => setVoiceDescription(e.target.value)} placeholder="e.g. A deep and resonant voice for storytelling" className="min-h-[80px]" />
                     <p className="text-xs text-muted-foreground mt-1">This description will show up in the Voice Library.</p>
                </div>
                
                <div className="space-y-2">
                    <Label>Labels</Label>
                    {labels.map((label) => (
                         <div key={label.id} className="flex items-center gap-2">
                             <Input value={label.key} onChange={e => handleLabelChange(label.id, 'key', e.target.value)} placeholder="Label (e.g. accent)"/>
                             <Input value={label.value} onChange={e => handleLabelChange(label.id, 'value', e.target.value)} placeholder="Value (e.g. northern)"/>
                             <Button variant="ghost" size="icon" onClick={() => handleRemoveLabel(label.id)}><Minus className="h-4 w-4"/></Button>
                         </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={handleAddLabel}><Plus className="mr-2 h-4 w-4" /> Add label</Button>
                </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
                <div className="flex flex-col items-center">
                    <p className="text-sm text-muted-foreground mb-2">Total Audio Uploaded</p>
                    <Progress value={(totalDuration / (30 * 60)) * 100} className="w-full h-3" />
                    <div className="flex justify-between w-full text-xs text-muted-foreground mt-1">
                        <span>0 min</span>
                        <span>{formatDuration(totalDuration)} / 30 min recommended</span>
                        <span>2 hrs+</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}><UploadCloud className="mr-2 h-4 w-4" /> Upload samples</Button>
                    <Button variant="outline" onClick={startRecording} disabled={isRecording}><Mic className="mr-2 h-4 w-4" /> Record yourself</Button>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs">Your samples ({uploadedFiles.length}) - {formatFileSize(totalSize)}</Label>
                    <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                        {uploadedFiles.map((f, i) => (
                           <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-muted/40">
                               <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => togglePlayFile(i)}>
                                   {playingFileIndex === i ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-1" />}
                               </Button>
                               <div className="flex-1 min-w-0">
                                   <p className="text-sm font-medium truncate">{f.name}</p>
                                   <p className="text-[11px] text-muted-foreground">
                                       {f.duration ? `${formatDuration(f.duration)} • ` : ''}{formatFileSize(f.size)} • File upload
                                   </p>
                               </div>
                               <div className="flex items-center">
                                   <Button variant="ghost" size="icon" className="h-7 w-7"><Download className="h-4 w-4"/></Button>
                                   <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFile(i)}><Trash2 className="h-4 w-4"/></Button>
                               </div>
                           </div>
                        ))}
                    </div>
                </div>
            </div>
            <input ref={fileInputRef} type="file" className="hidden" accept="audio/*,video/*" multiple onChange={handleFileChange} />
        </div>
    )
  }

  const renderInfoStep = () => (
    <div className="space-y-5">
        <div className="space-y-2">
            <Label htmlFor="voice-name" className="text-sm font-semibold">
                Tên giọng nói <span className="text-destructive">*</span>
            </Label>
            <Input
            id="voice-name"
            placeholder="Ví dụ: Giọng thương hiệu của tôi"
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
            className="h-11"
            autoFocus
            />
            <p className="text-[11px] text-muted-foreground">Tên giúp bạn nhận diện giọng nói này.</p>
        </div>

        <div className="space-y-2">
            <Label htmlFor="voice-desc" className="text-sm font-semibold">
                Mô tả <span className="text-muted-foreground">(tùy chọn)</span>
            </Label>
            <Textarea
            id="voice-desc"
            placeholder="Mô tả cho giọng nói, ví dụ: Giọng nam, ấm áp, chuyên nghiệp..."
            value={voiceDescription}
            onChange={(e) => setVoiceDescription(e.target.value)}
            className="min-h-[80px] resize-none"
            />
        </div>

        <div className="space-y-2">
            <Label className="text-sm font-semibold">Mẫu audio đã tải</Label>
            <div className="p-3 rounded-lg bg-muted/40 space-y-1.5">
                {uploadedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                    <FileAudio className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{f.name}</span>
                    <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-muted-foreground">
                        {f.duration ? formatDuration(f.duration) : '—'}
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeFile(i)}
                        title="Xóa bản thu âm này"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    </div>
                </div>
                ))}
                <div className="border-t pt-1.5 mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>{uploadedFiles.length} file(s)</span>
                <span>Tổng: {formatDuration(totalDuration)}</span>
                </div>
            </div>
        </div>
    </div>
  );

  const renderFinishStep = () => (
    <div className="space-y-5">
        {isCreated ? (
        <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="bg-green-100 p-6 rounded-full">
                <Check className="h-12 w-12 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold">Giọng nói đã tạo thành công!</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
            Giọng &quot;{voiceName}&quot; đã sẵn sàng sử dụng. Bạn có thể chọn giọng này trong danh sách để tạo audio.
            </p>
            <Button onClick={() => onOpenChange(false)} className="mt-2">
            Đóng và sử dụng
            </Button>
        </div>
        ) : (
        <>
            <div className="rounded-xl border-2 border-dashed border-primary/20 p-5 space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Xác nhận tạo giọng nói
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-0.5">
                <p className="text-muted-foreground text-xs">Tên giọng nói</p>
                <p className="font-medium">{voiceName}</p>
                </div>
                <div className="space-y-0.5">
                <p className="text-muted-foreground text-xs">Mô tả</p>
                <p className="font-medium">{voiceDescription || '—'}</p>
                </div>
                <div className="space-y-0.5">
                <p className="text-muted-foreground text-xs">Số file audio</p>
                <p className="font-medium">{uploadedFiles.length} file(s)</p>
                </div>
                <div className="space-y-0.5">
                <p className="text-muted-foreground text-xs">Tổng thời lượng</p>
                <p className="font-medium">{formatDuration(totalDuration)}</p>
                </div>
            </div>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800">
                Nhấn &quot;Tạo giọng nói&quot; để upload mẫu audio lên ElevenLabs và tạo giọng nói AI mới.
                Quá trình này mất khoảng 10-30 giây.
            </p>
            </div>

            <Button
            onClick={handleCreateVoice}
            disabled={isCreating}
            className="w-full"
            size="lg"
            >
            {isCreating ? (
                <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Đang tạo giọng nói...
                </>
            ) : (
                <>
                <Sparkles className="mr-2 h-5 w-5" />
                Tạo giọng nói
                </>
            )}
            </Button>
        </>
        )}
    </div>
  );

  const getWizardTitle = () => {
    if (currentStep === 'selection') return 'Tạo giọng nói';
    if (creationMode === 'instant') return 'Nhân bản Giọng nói Tức thì';
    if (creationMode === 'professional') return 'Nhân bản Giọng nói Chuyên nghiệp';
    return 'Tạo giọng nói';
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
          "max-h-[90vh] overflow-y-auto bg-white/95 backdrop-blur-xl border-white/20 p-0",
          creationMode === 'professional' && currentStep === 'upload' ? "sm:max-w-4xl" : "sm:max-w-2xl"
      )}>
        <div className="p-6 pb-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl">
              <div className="bg-gradient-to-br from-primary/20 to-primary/5 p-3 rounded-xl flex items-center justify-center">
                 <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <span>{getWizardTitle()}</span>
            </DialogTitle>
          </DialogHeader>

          {currentStep !== 'selection' && (
             <div className="flex items-center mt-6 mb-2">
                {(creationMode === 'professional' ? wizardStepsProfessional : wizardStepsInstant).map((step, index) => {
                const wizardSteps = creationMode === 'professional' ? wizardStepsProfessional : wizardStepsInstant;
                const stepIndex = wizardSteps.findIndex(s => s.key === currentStep);
                const isActive = step.key === currentStep;
                const isDone = index < stepIndex || isCreated;
                const isPending = index > stepIndex;

                return (
                    <div key={step.key} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center">
                        <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300",
                        isDone && "bg-primary text-white",
                        isActive && "bg-primary/15 text-primary ring-2 ring-primary/30",
                        isPending && "bg-muted text-muted-foreground"
                        )}>
                        {isDone ? <Check className="h-4 w-4" /> : index + 1}
                        </div>
                        <span className={cn(
                        "text-[11px] mt-1.5 whitespace-nowrap font-medium text-center",
                        isActive && "text-primary",
                        isPending && "text-muted-foreground"
                        )}>
                        {step.label}
                        </span>
                    </div>
                    {index < wizardSteps.length - 1 && (
                        <div className={cn(
                        "flex-1 h-[2px] mx-2 mt-[-16px] transition-colors",
                        index < stepIndex ? "bg-primary" : "bg-muted"
                        )} />
                    )}
                    </div>
                );
                })}
            </div>
          )}
        </div>

        <div className="p-6 pt-4">
          {currentStep === 'selection' && renderSelectionStep()}
          {currentStep === 'upload' && creationMode === 'instant' && renderInstantUploadStep()}
          {currentStep === 'upload' && creationMode === 'professional' && renderProfessionalUploadStep()}
          {currentStep === 'info' && renderInfoStep()}
          {currentStep === 'finish' && renderFinishStep()}
        </div>

        {currentStep !== 'selection' && (!isCreated || currentStep !== 'finish') ? (
            <div className="flex items-center justify-between p-6 pt-0 mt-4 border-t sticky bottom-0 bg-background/80 backdrop-blur-sm">
            <Button variant="ghost" onClick={goBack} disabled={isCreating}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Quay lại
            </Button>

            {currentStep !== 'finish' && (
                <Button onClick={goNext} disabled={!canGoNext()}>
                    Tiếp theo <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
            )}
            </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
