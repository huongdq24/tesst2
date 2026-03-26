'use client';

import { useState, useRef, useEffect, MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Wand2, ArrowRight, Loader2, Camera, Info, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/i18n-context';

export type EditorTool = 'extend' | 'insert' | 'remove' | 'camera';

export interface VideoEditorSubmitParams {
  tool: EditorTool;
  prompt: string;
  selection?: { x: number; y: number; w: number; h: number; relativeX: number; relativeY: number; relativeW: number; relativeH: number };
  cameraPreset?: string;
  cameraPrompt?: string;
  capturedFrameDataUrl?: string;
}

interface VideoEditorModalProps {
  clipUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (params: VideoEditorSubmitParams) => void;
  isGenerating?: boolean;
}

const CAMERA_PRESETS = [
  { id: 'dolly_forward', label: 'Di chuyển ra trước', prompt: 'Dolly forward camera movement' },
  { id: 'dolly_backward', label: 'Di chuyển lùi ra xa', prompt: 'Dolly backward camera movement' },
  { id: 'orbit_left', label: 'Xoay quanh từ phải sang trái', prompt: 'Orbit left camera movement' },
  { id: 'pan_right', label: 'Quay phải', prompt: 'Pan right camera movement' },
  { id: 'orbit_up', label: 'Xoay quanh lên', prompt: 'Orbit up camera movement' },
  { id: 'orbit_low', label: 'Xoay quanh thấp', prompt: 'Orbit low camera movement' },
  { id: 'zoom_in_out', label: 'Đưa camera vào gần và thu nhỏ', prompt: 'Zoom in and out camera movement' },
  { id: 'static', label: 'Đứng yên', prompt: 'Static locked camera' }
];

export function VideoEditorModal({ clipUrl, isOpen, onClose, onSubmit, isGenerating }: VideoEditorModalProps) {
  const { t } = useI18n();
  const [selectedTool, setSelectedTool] = useState<EditorTool>('extend');
  const [prompt, setPrompt] = useState('');
  const [cameraPreset, setCameraPreset] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selection, setSelection] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);

  // Reset state when modal opens/closes or tool changes
  useEffect(() => {
    if (isOpen) {
      setSelection(null);
      setPrompt('');
      setSelectedTool('extend');
      setCameraPreset(null);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelection(null);
    setPrompt('');
  }, [selectedTool]);

  // Handle canvas drawing for Insert/Remove tools
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (selectedTool === 'insert' || selectedTool === 'remove') {
      // Dim background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (selection) {
        // Clear the selected area
        ctx.clearRect(selection.x, selection.y, selection.w, selection.h);
        
        // Draw dashed border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
      }
    }
  }, [selection, selectedTool]);

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    if (selectedTool !== 'insert' && selectedTool !== 'remove') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setStartPos({ x, y });
    setIsDrawing(true);
    setSelection({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPos) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setSelection({
      x: Math.min(x, startPos.x),
      y: Math.min(y, startPos.y),
      w: Math.abs(x - startPos.x),
      h: Math.abs(y - startPos.y),
    });
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerating) return;

    let relativeSelection = undefined;
    if ((selectedTool === 'insert' || selectedTool === 'remove') && selection && canvasRef.current) {
      relativeSelection = {
        ...selection,
        relativeX: selection.x / canvasRef.current.width,
        relativeY: selection.y / canvasRef.current.height,
        relativeW: selection.w / canvasRef.current.width,
        relativeH: selection.h / canvasRef.current.height,
      };
    }

    const selectedPreset = CAMERA_PRESETS.find(p => p.id === cameraPreset);

    let capturedFrameDataUrl: string | undefined;
    if (selectedTool !== 'extend') {
      try {
        const video = videoRef.current;
        if (video) {
          const captureCanvas = document.createElement('canvas');
          captureCanvas.width = video.videoWidth;
          captureCanvas.height = video.videoHeight;
          const ctx = captureCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
            capturedFrameDataUrl = captureCanvas.toDataURL('image/jpeg', 0.95);
          }
        }
      } catch (err) {
        console.warn('Could not capture video frame for editing', err);
      }
    }

    onSubmit({
      tool: selectedTool,
      prompt,
      selection: relativeSelection,
      cameraPreset: cameraPreset || undefined,
      cameraPrompt: selectedPreset?.prompt,
      capturedFrameDataUrl,
    });
  };

  const [videoAspect, setVideoAspect] = useState<string>('16/9');

  // Adjust canvas size to match video size
  useEffect(() => {
    const handleMetadata = () => {
      if (videoRef.current) {
        setVideoAspect(`${videoRef.current.videoWidth}/${videoRef.current.videoHeight}`);
        if (canvasRef.current) {
          canvasRef.current.width = videoRef.current.clientWidth;
          canvasRef.current.height = videoRef.current.clientHeight;
        }
      }
    };
    
    // Wait for video to load metadata to get aspect ratio right
    const videoObj = videoRef.current;
    if (videoObj) {
      videoObj.addEventListener('loadedmetadata', handleMetadata);
      // Also resize on mount just in case
      handleMetadata();
      // And resize window
      window.addEventListener('resize', handleMetadata);
    }
    
    return () => {
      if (videoObj) videoObj.removeEventListener('loadedmetadata', handleMetadata);
      window.removeEventListener('resize', handleMetadata);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col font-sans">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent z-10 absolute top-0 left-0 right-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-white/10 text-white">
            <Wand2 className="h-5 w-5" />
          </Button>
          <span className="text-sm font-medium">Video Editor</span>
          <Info className="h-4 w-4 text-white/50" />
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-white/10 text-white">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-[#0f0f0f] p-4">
        <div 
          className="relative rounded-xl overflow-hidden shadow-2xl bg-black flex items-center justify-center shrink-0"
          style={{ 
            aspectRatio: videoAspect,
            maxHeight: '100%',
            maxWidth: '100%'
          }}
        >
          <video 
            ref={videoRef}
            src={clipUrl} 
            controls={(selectedTool !== 'insert' && selectedTool !== 'remove')} 
            className="w-full h-full object-cover"
            loop
            muted
          />
          
          {/* Canvas Overlay for Insert/Remove tools */}
          <canvas
            ref={canvasRef}
            className={cn(
              "absolute inset-0 cursor-crosshair z-10 pointer-events-none w-full h-full",
              (selectedTool === 'insert' || selectedTool === 'remove') && "pointer-events-auto"
            )}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          
          {(selectedTool === 'insert' || selectedTool === 'remove') && !selection && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur text-white text-xs px-3 py-1.5 rounded-full pointer-events-none animate-pulse">
              Kéo thả chuột trên video để chọn vùng cần {selectedTool === 'insert' ? 'chèn' : 'xoá'}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Tool Area */}
      <div className="w-full max-w-3xl mx-auto pb-8 px-4 flex flex-col gap-4">
        
        {/* Camera Presets Gallery */}
        {selectedTool === 'camera' && (
          <div className="w-full overflow-x-auto scrollbar-none pb-2">
            <div className="flex gap-2">
              {CAMERA_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setCameraPreset(preset.id)}
                  className={cn(
                    "relative shrink-0 w-32 aspect-video rounded-lg border-2 overflow-hidden bg-white/5 transition-all text-left group",
                    cameraPreset === preset.id ? "border-primary" : "border-transparent hover:border-white/20"
                  )}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-2 left-2 right-2 flex items-end">
                    <span className="text-[10px] font-medium leading-tight text-white/90 drop-shadow-md">
                      {preset.label}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Prompt Input Bar */}
        <form onSubmit={handleSubmit} className="relative flex items-center w-full">
          <Input 
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isGenerating || selectedTool === 'camera'}
            placeholder={
              selectedTool === 'extend' ? "Tiếp theo là gì?" :
              selectedTool === 'insert' ? "Mô tả nội dung bạn muốn thêm... (kéo ở trên để chỉ định vị trí)" :
              selectedTool === 'remove' ? "Mô tả nội dung bạn muốn xoá..." :
              "Chọn hiệu ứng di chuyển camera ở trên..."
            }
            className="w-full bg-[#1f1f1f] border-none text-white h-12 rounded-full pl-6 pr-14 focus-visible:ring-1 focus-visible:ring-white/30 text-sm"
          />
          <Button 
            type="submit"
            disabled={
              isGenerating || 
              (selectedTool === 'camera' && !cameraPreset) || 
              (selectedTool === 'insert' && !prompt.trim()) ||
              (selectedTool === 'remove' && !prompt.trim() && !selection) // Must have either prompt or selection
            }
            size="icon" 
            className="absolute right-1 top-1 bottom-1 h-10 w-10 text-black bg-white hover:bg-white/90 rounded-full transition-transform active:scale-95"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        </form>

        {/* Tool Buttons */}
        <div className="flex items-center justify-center gap-2 mt-2">
          <Button
            variant="ghost"
            onClick={() => setSelectedTool('extend')}
            className={cn(
              "rounded-full h-10 px-5 text-sm transition-all",
              selectedTool === 'extend' ? "bg-white/15 text-white" : "text-white/60 hover:text-white hover:bg-white/5"
            )}
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            Mở rộng
          </Button>
          <Button
            variant="ghost"
            onClick={() => setSelectedTool('insert')}
            className={cn(
              "rounded-full h-10 px-5 text-sm transition-all",
              selectedTool === 'insert' ? "bg-white/15 text-white" : "text-white/60 hover:text-white hover:bg-white/5"
            )}
          >
            <Plus className="h-4 w-4 mr-2" />
            Chèn
          </Button>
          <Button
            variant="ghost"
            onClick={() => setSelectedTool('remove')}
            className={cn(
              "rounded-full h-10 px-5 text-sm transition-all",
              selectedTool === 'remove' ? "bg-white/15 text-white" : "text-white/60 hover:text-white hover:bg-white/5"
            )}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Xoá
          </Button>
          <Button
            variant="ghost"
            onClick={() => setSelectedTool('camera')}
            className={cn(
              "rounded-full h-10 px-5 text-sm transition-all",
              selectedTool === 'camera' ? "bg-white/15 text-white" : "text-white/60 hover:text-white hover:bg-white/5"
            )}
          >
            <Camera className="h-4 w-4 mr-2" />
            Camera
          </Button>
        </div>
      </div>
    </div>
  );
}
