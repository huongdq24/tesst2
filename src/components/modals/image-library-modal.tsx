'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { firestore } from '@/lib/firebase/config';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, AlertTriangle, Download } from 'lucide-react';
import Image from 'next/image';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/contexts/i18n-context';
import { Button } from '@/components/ui/button';

interface ImageRecord {
  id: string;
  imageUrl: string;
  prompt?: string; // Prompt is optional for input images
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
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      const fetchImages = async () => {
        setIsLoading(true);
        setError(null);
        try {
          // 1. Query for generated images
          const generatedImagesQuery = query(
            collection(firestore, 'generatedImages'),
            where('ownerId', '==', user.uid)
          );
          
          // 2. Query for input images
          const inputImagesQuery = query(
            collection(firestore, 'inputImages'),
            where('ownerId', '==', user.uid)
          );

          // 3. Execute both queries in parallel
          const [generatedSnapshot, inputSnapshot] = await Promise.all([
              getDocs(generatedImagesQuery),
              getDocs(inputImagesQuery)
          ]);

          // 4. Map results
          const generatedList = generatedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ImageRecord));
          const inputList = inputSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ImageRecord));
          
          // 5. Combine and sort
          const combinedList = [...generatedList, ...inputList];
          combinedList.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
            return dateB.getTime() - dateA.getTime(); // Descending order (newest first)
          });

          setImages(combinedList);
        } catch (e: any) {
          console.error("Failed to fetch image library:", e);
           if (e.message.includes("requires an index")) {
               setError("Lỗi cơ sở dữ liệu: Cần tạo chỉ mục Firestore. Vui lòng liên hệ quản trị viên.");
          } else {
             setError(t('library.loadError'));
          }
        } finally {
          setIsLoading(false);
        }
      };

      fetchImages();
    }
  }, [open, user, t]);

  const handleSelect = (imageUrl: string) => {
    onImageSelect(imageUrl);
    onOpenChange(false);
  };

  const handleDownload = (e: React.MouseEvent, imageUrl: string, imageId: string) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `igen-image-${imageId.substring(0, 8)}.png`;
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
            {!isLoading && !error && images.length === 0 && (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>{t('library.empty')}</p>
              </div>
            )}
            {!isLoading && !error && images.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {images.map(image => (
                  <div
                    key={image.id}
                    className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
                    onClick={() => handleSelect(image.imageUrl)}
                  >
                    <Image
                      src={image.imageUrl}
                      alt={image.prompt || 'Input Image'}
                      fill
                      sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Button
                      variant="secondary"
                      size="icon"
                      title="Tải ảnh xuống"
                      className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      onClick={(e) => handleDownload(e, image.imageUrl, image.id)}
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
