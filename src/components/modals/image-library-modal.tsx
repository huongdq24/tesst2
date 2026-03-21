'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { firestore, storage } from '@/lib/firebase/config';
import { ref, deleteObject } from 'firebase/storage';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, AlertTriangle, Download, Video, Trash2, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/contexts/i18n-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
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

interface MediaRecord {
  id: string;
  url: string;
  type: 'image' | 'video';
  prompt?: string;
  createdAt: any;
  collectionName: 'generatedImages' | 'inputImages' | 'generatedVideos';
}

interface ImageLibraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImageSelect: (imageUrl: string) => void;
}

export function ImageLibraryModal({ open, onOpenChange, onImageSelect }: ImageLibraryModalProps) {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const [media, setMedia] = useState<MediaRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Selection state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('generatedImages');

  // Delete confirm state
  const [deleteDialogItem, setDeleteDialogItem] = useState<MediaRecord | null>(null);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);

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
          const generatedImagesList: MediaRecord[] = generatedImagesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, url: doc.data().imageUrl, type: 'image', collectionName: 'generatedImages' } as MediaRecord));
          const inputImagesList: MediaRecord[] = inputImagesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, url: doc.data().imageUrl, type: 'image', collectionName: 'inputImages' } as MediaRecord));
          const generatedVideosList: MediaRecord[] = generatedVideosSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, url: doc.data().videoUrl, type: 'video', collectionName: 'generatedVideos' } as MediaRecord));

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
  
  const generatedImages = media.filter(item => item.collectionName === 'generatedImages');
  const uploadedImages = media.filter(item => item.collectionName === 'inputImages');
  const videos = media.filter(item => item.collectionName === 'generatedVideos');

  const promptDelete = (e: React.MouseEvent, item: MediaRecord) => {
    e.stopPropagation();
    setDeleteDialogItem(item);
  };

  const confirmDelete = async () => {
    if (!deleteDialogItem) return;
    const item = deleteDialogItem;
    setDeleteDialogItem(null);
    
    try {
      // Delete from Firestore
      await deleteDoc(doc(firestore, item.collectionName, item.id));
      
      // Attempt to delete from Storage (best effort)
      try {
        const fileRef = ref(storage, item.url);
        await deleteObject(fileRef);
      } catch (storageError) {
        console.warn("Could not delete file from storage, or file doesn't exist:", storageError);
      }
      
      // Update local state by removing the deleted item
      setMedia(prev => prev.filter(m => m.id !== item.id));
      toast({ title: 'Đã xóa thành công', description: 'Phương tiện đã được xóa khỏi thư viện.' });
    } catch (error) {
      console.error("Lỗi khi xóa:", error);
      toast({ variant: 'destructive', title: 'Lỗi khi xóa', description: 'Không thể xóa tệp này.' });
    }
  };

  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    setSelectedIds(new Set()); // clear selection when toggling
  };

  const handleSelectAll = () => {
    // Select all items in the currently active tab
    let itemsToSelect: MediaRecord[] = [];
    if (activeTab === 'generatedImages') itemsToSelect = generatedImages;
    else if (activeTab === 'uploadedImages') itemsToSelect = uploadedImages;
    else if (activeTab === 'videos') itemsToSelect = videos;
    
    const newSelected = new Set(selectedIds);
    itemsToSelect.forEach(item => newSelected.add(item.id));
    setSelectedIds(newSelected);
  };

  const promptBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleteDialogOpen(true);
  };

  const confirmBulkDelete = async () => {
    setIsBulkDeleteDialogOpen(false);
    
    const itemsToDelete = media.filter(m => selectedIds.has(m.id));
    
    setIsLoading(true);
    try {
      await Promise.all(itemsToDelete.map(async (item) => {
        // Delete from Firestore
        await deleteDoc(doc(firestore, item.collectionName, item.id));
        
        // Attempt to delete from Storage (best effort)
        try {
          const fileRef = ref(storage, item.url);
          await deleteObject(fileRef);
        } catch (storageError) {
          console.warn("Could not delete file from storage, or file doesn't exist:", storageError);
        }
      }));
      
      // Update local state by removing the deleted items
      setMedia(prev => prev.filter(m => !selectedIds.has(m.id)));
      setSelectedIds(new Set());
      setIsSelectMode(false);
      toast({ title: 'Đã xóa thành công', description: `Đã xóa ${itemsToDelete.length} phương tiện khỏi thư viện.` });
    } catch (error) {
      console.error("Lỗi khi xóa nhiều mục:", error);
      toast({ variant: 'destructive', title: 'Lỗi khi xóa', description: 'Có lỗi xảy ra khi xóa một số tệp.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (item: MediaRecord) => {
    if (isSelectMode) {
      const newSelected = new Set(selectedIds);
      if (newSelected.has(item.id)) {
        newSelected.delete(item.id);
      } else {
        newSelected.add(item.id);
      }
      setSelectedIds(newSelected);
      return;
    }

    // Only allow selecting images as reference, as video references are not supported
    if (item.type === 'image') {
      onImageSelect(item.url);
      onOpenChange(false);
    }
  };

  const handleDownload = async (e: React.MouseEvent, url: string, id: string, type: 'image' | 'video') => {
    e.stopPropagation();
    try {
      toast({ title: 'Đang chuẩn bị tệp...', description: 'Vui lòng đợi giây lát.' });
      
      // Fetch via proxy to bypass any CORS restrictions on the direct storage URL
      const proxyUrl = `/api/proxy-video?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error("Network response was not ok");
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `igen-media-${id.substring(0, 8)}.${type === 'image' ? 'png' : 'mp4'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Revoke the blob URL to free memory
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
      toast({ title: '✅ Tải xuống thành công!' });
    } catch (error) {
      console.error('Download error:', error);
      toast({ variant: 'destructive', title: 'Lỗi tải xuống', description: 'Có lỗi xảy ra khi tải tệp về máy.' });
    }
  };
  
  const renderContent = (items: MediaRecord[], type: 'image' | 'video') => {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-destructive">
                <AlertTriangle className="h-8 w-8 mb-2" />
                <p>{error}</p>
            </div>
        );
    }
    if (items.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>{type === 'image' ? t('library.emptyImages') : t('library.emptyVideos')}</p>
            </div>
        );
    }
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {items.map(item => {
          const isSelected = selectedIds.has(item.id);
          
          return (
          <div
            key={item.id}
            className={cn(
                "relative aspect-square rounded-lg overflow-hidden group",
                (item.type === 'image' || isSelectMode) && "cursor-pointer",
                isSelected && "ring-2 ring-primary ring-offset-2"
            )}
            onClick={() => handleSelect(item)}
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
            
            {/* Selection UI */}
            {isSelectMode && (
              <div className="absolute top-2 left-2 z-20">
                <div className={cn(
                  "h-6 w-6 rounded-full border-2 border-white flex items-center justify-center transition-colors",
                  isSelected ? "bg-primary border-primary" : "bg-black/20 hover:bg-black/40"
                )}>
                  {isSelected && <CheckCircle2 className="h-4 w-4 text-white" />}
                </div>
              </div>
            )}

            {/* Delete button */}
            {!isSelectMode && (
              <Button
                variant="destructive"
                size="icon"
                title="Xóa"
                className="absolute top-2 left-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                onClick={(e) => promptDelete(e, item)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}

            {/* Download button */}
            {!isSelectMode && (
              <Button
                variant="secondary"
                size="icon"
                title="Tải xuống"
                className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                onClick={(e) => handleDownload(e, item.url, item.id, item.type)}
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
          </div>
        )})}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('library.title')}</DialogTitle>
          <DialogDescription>{t('library.description')}</DialogDescription>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full">
            <TabsList className="grid w-full sm:w-[400px] grid-cols-3 shrink-0">
              <TabsTrigger value="generatedImages">Ảnh AI ({generatedImages.length})</TabsTrigger>
              <TabsTrigger value="uploadedImages">Ảnh tải lên ({uploadedImages.length})</TabsTrigger>
              <TabsTrigger value="videos">Video ({videos.length})</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              {isSelectMode ? (
                <>
                  <Button variant="destructive" size="sm" onClick={promptBulkDelete} disabled={selectedIds.size === 0}>
                    Xóa ({selectedIds.size})
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleSelectAll}>Chọn tất cả</Button>
                  <Button variant="outline" size="sm" onClick={toggleSelectMode}>Hủy</Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={toggleSelectMode} disabled={media.length === 0}>Chọn nhiều</Button>
              )}
            </div>
          </div>

          <TabsContent value="generatedImages" className="flex-1 min-h-0 mt-4">
            <ScrollArea className="h-full pr-4">
              {renderContent(generatedImages, 'image')}
            </ScrollArea>
          </TabsContent>
          <TabsContent value="uploadedImages" className="flex-1 min-h-0 mt-4">
             <ScrollArea className="h-full pr-4">
              {renderContent(uploadedImages, 'image')}
            </ScrollArea>
          </TabsContent>
          <TabsContent value="videos" className="flex-1 min-h-0 mt-4">
             <ScrollArea className="h-full pr-4">
              {renderContent(videos, 'video')}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
      
      {/* Individual Delete Confirmation */}
      <AlertDialog open={!!deleteDialogItem} onOpenChange={(open) => !open && setDeleteDialogItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bạn có chắc chắn muốn xóa không?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này không thể hoàn tác. Tệp sẽ bị xóa vĩnh viễn khỏi thư viện của bạn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bạn có chắc chắn muốn xóa {selectedIds.size} mục đã chọn không?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này không thể hoàn tác. Các tệp sẽ bị xóa vĩnh viễn khỏi thư viện của bạn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                confirmBulkDelete();
              }} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}