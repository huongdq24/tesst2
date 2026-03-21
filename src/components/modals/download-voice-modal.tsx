import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileAudio, Video, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface DownloadVoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audioUrl: string;
  defaultFilename: string;
}

export function DownloadVoiceModal({ open, onOpenChange, audioUrl, defaultFilename }: DownloadVoiceModalProps) {
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  const handleDownload = async (format: 'mp3' | 'mp4') => {
    setIsDownloading(format);
    try {
      const fullFilename = `${defaultFilename}.${format}`;
      const proxyUrl = `/api/proxy-download?filename=${encodeURIComponent(fullFilename)}&url=${encodeURIComponent(audioUrl)}`;
      
      // Navigate to the proxy URL which forces the download header safely.
      window.location.href = proxyUrl;

      // Close modal smoothly
      setTimeout(() => onOpenChange(false), 500);
    } catch (error) {
      console.error('Download failed', error);
      window.open(audioUrl, '_blank');
    } finally {
      setIsDownloading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tùy chọn định dạng tải xuống</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4 text-sm text-muted-foreground pb-2">
          <p>Bạn muốn tải file giả lập giọng nói này dưới định dạng nào?</p>
          
          <div className="grid grid-cols-2 gap-4 mt-2">
            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2 items-center justify-center border-primary/20 hover:border-primary/50 hover:bg-primary/5"
              onClick={() => handleDownload('mp3')}
              disabled={!!isDownloading}
            >
              {isDownloading === 'mp3' ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <FileAudio className="h-6 w-6 text-primary" />}
              <span className="font-medium">Tải chuẩn MP3</span>
              <span className="text-[10px] text-muted-foreground font-normal">(Âm thanh nhẹ nhất)</span>
            </Button>

            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2 items-center justify-center border-emerald-500/20 hover:border-emerald-500/50 hover:bg-emerald-500/5"
              onClick={() => handleDownload('mp4')}
              disabled={!!isDownloading}
            >
              {isDownloading === 'mp4' ? <Loader2 className="h-6 w-6 animate-spin text-emerald-600" /> : <Video className="h-6 w-6 text-emerald-600" />}
              <span className="font-medium text-emerald-700 dark:text-emerald-500">Đổi đuôi MP4</span>
              <span className="text-[10px] text-emerald-600/70 font-normal">(Phù hợp up lên Tiktok)</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
