'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { firestore } from '@/lib/firebase/config';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, AlertTriangle, Download, Video } from 'lucide-react';
import Image from 'next/image';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/contexts/i18n-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MediaRecord {
  id: string;
  url: string;
  type: 'image' | 'video';
  prompt?: string;
  createdAt: any;
}

interface ImageLibraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImageSelect: (imageUrl: string) => void;
}

export function ImageLibraryModal({ open, onOpenChange, onImageSelect }: ImageLibraryModalProps) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [media, setMedia] = useState<MediaRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      const fetchMedia = async () => {
        setIsLoading(true);
        setError(null);
        try {
          // 1. Queries for all media types
          const generatedImagesQuery = query(
            collection(firestore, 'generatedImages'),
            where('ownerId', '==', user.uid)
          );
          const inputImagesQuery = query(
            collection(firestore, 'inputImages'),
            where('ownerId', '==', user.uid)
          );
          const generatedVideosQuery = query(
            collection(firestore, 'generatedVideos'),
            where('ownerId', '==', user.uid)
          );

          // 2. Execute all queries in parallel
          const [generatedImagesSnapshot, inputImagesSnapshot, generatedVideosSnapshot] = await Promise.all([
              getDocs(generatedImagesQuery),
              getDocs(inputImagesQuery),
              getDocs(generatedVideosQuery)
          ]);

          // 3. Map results to a common format
          const generatedImagesList: MediaRecord[] = generatedImagesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, url: doc.data().imageUrl, type: 'image' } as MediaRecord));
          const inputImagesList: MediaRecord[] = inputImagesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, url: doc.data().imageUrl, type: 'image' } as MediaRecord));
          const generatedVideosList: MediaRecord[] = generatedVideosSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, url: doc.data().videoUrl, type: 'video' } as MediaRecord));

          // 4. Combine and sort
          const combinedList = [...generatedImagesList, ...inputImagesList, ...generatedVideosList];
          combinedList.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
            return dateB.getTime() - dateA.getTime(); // Descending order (newest first)
          });

          setMedia(combinedList);
        } catch (e: any) {
          console.error("Failed to fetch media library:", e);
           if (e.message.includes("requires an index")) {
               setError("Lỗi cơ sở dữ liệu: Cần tạo chỉ mục Firestore. Vui lòng liên hệ quản trị viên.");
          } else {
             setError(t('library.loadError'));
          }
        } finally {
          setIsLoading(false);
        }
      };

      fetchMedia();
    }
  }, [open, user, t]);

  const handleSelect = (url: string, type: 'image' | 'video') => {
    // Only allow selecting images as reference, as video references are not supported
    if (type === 'image') {
      onImageSelect(url);
      onOpenChange(false);
    }
  };

  const handleDownload = (e: React.MouseEvent, url: string, id: string, type: 'image' | 'video') => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = url;
    link.download = `igen-media-${id.substring(0, 8)}.${type === 'image' ? 'png' : 'mp4'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('library.title')}</DialogTitle>
          <DialogDescription>{t('library.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full pr-4">
            {isLoading && (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
            {error && (
                <div className="flex flex-col items-center justify-center h-full text-destructive">
                    <AlertTriangle className="h-8 w-8 mb-2" />
                    <p>{error}</p>
              </div>
            )}
            {!isLoading && !error && media.length === 0 && (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>{t('library.empty')}</p>
              </div>
            )}
            {!isLoading && !error && media.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {media.map(item => (
                  <div
                    key={item.id}
                    className={cn(
                        "relative aspect-square rounded-lg overflow-hidden group",
                        item.type === 'image' && "cursor-pointer"
                    )}
                    onClick={() => handleSelect(item.url, item.type)}
                  >
                    {item.type === 'image' ? (
                        <Image
                        src={item.url}
                        alt={item.prompt || 'Input Image'}
                        fill
                        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                    ) : (
                        <>
                            <video
                                src={item.url}
                                className="object-cover w-full h-full bg-black"
                                muted
                                loop
                                playsInline
                                onMouseEnter={e => e.currentTarget.play().catch(() => {})}
                                onMouseLeave={e => e.currentTarget.pause()}
                            />
                            <div className="absolute top-2 left-2 bg-black/50 text-white rounded-full p-1.5 backdrop-blur-sm">
                                <Video className="h-3 w-3"/>
                            </div>
                        </>
                    )}

                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Button
                      variant="secondary"
                      size="icon"
                      title="Tải xuống"
                      className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      onClick={(e) => handleDownload(e, item.url, item.id, item.type)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
