'use client';
import { useState, useRef, DragEvent, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, ImageIcon, X, Wand2, UploadCloud, Download, Images, ZoomIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { brandedImageGeneration } from '@/ai/flows/branded-image-generation-flow';
import { optimalImagePromptGeneration } from '@/ai/flows/optimal-image-prompt-generation-flow';
import Image from 'next/image';
import { useI18n } from '@/contexts/i18n-context';
import { Separator } from './ui/separator';
import { ref as storageRef, uploadBytes, getDownloadURL, uploadString } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { storage, firestore } from '@/lib/firebase/config';
import { cn } from '@/lib/utils';
import { ImageLibraryModal } from '@/components/modals/image-library-modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from '@/components/ui/slider';

export function ImageGenerationWorkspace() {
  const IMAGE_TEMPLATES = [
    { id: 'none', label: 'Tùy chỉnh (Tự nhập)', prompt: '' },
    { id: 'fashion', label: '👗 Thời trang / Lookbook', prompt: 'Chụp ảnh lookbook thời trang chuyên nghiệp cho [SẢN PHẨM/NGƯỜI MẪU], phong cách ấn tượng, ánh sáng studio, chất lượng tạp chí Vogue' },
    { id: 'fnb', label: '🍔 Ẩm thực / F&B', prompt: 'Chụp ảnh món ăn nghệ thuật (food photography) cho [TÊN MÓN], decor tinh tế, background boke mờ ảo, ánh sáng tự nhiên đầy hấp dẫn, chất lượng 4k' },
    { id: 'realestate', label: '🏢 Kiến trúc / BĐS', prompt: 'Hình ảnh kiến trúc ngoại thất/nội thất cao cấp của [LOẠI NHÀ/DỰ ÁN], ánh sáng hoàng hôn ấm áp (golden hour), góc chụp rộng, sang trọng và hiện đại' },
    { id: 'cosmetic', label: '✨ Mỹ phẩm / Beauty', prompt: 'Chụp ảnh sản phẩm mỹ phẩm [TÊN SẢN PHẨM], đặt trên nền lụa hoặc mặt nước gợn sóng mềm mại, ánh sáng trong trẻo, phong cách thanh lịch cao cấp' },
    { id: 'product', label: '📦 Sản phẩm thương mại', prompt: 'Chụp ảnh quảng cáo sản phẩm 3D [SẢN PHẨM], đặt trên bục trưng bày tối giản, ánh sáng spotlight chiếu rọi tôn vinh chi tiết, không gian studio chuyên nghiệp' },
    { id: 'logo', label: '🎯 Thiết kế Logo / Branding', prompt: 'Thiết kế logo hiện đại và chuyên nghiệp cho công ty [NGÀNH NGHỀ], phong cách tối giản (minimalist), màu sắc thương hiệu nổi bật, nền trắng' },
    { id: 'event', label: '🎉 Sự kiện / Không gian', prompt: 'Không gian sự kiện [TÊN SỰ KIỆN] hoành tráng, trang trí hoa tươi sang trọng, ánh sáng lộng lẫy, không khí chuyên nghiệp đẳng cấp' },
  ];

  const [selectedTemplate, setSelectedTemplate] = useState('none');
  const [simplePrompt, setSimplePrompt] = useState('');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [promptModel, setPromptModel] = useState('gemini-3.1-pro-preview');
  const [imageModel, setImageModel] = useState('gemini-3.1-flash-image-preview');
  const [artStyle, setArtStyle] = useState<string | null>(null);
  const [intentAnalysis, setIntentAnalysis] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [numberOfImages, setNumberOfImages] = useState(1);
  const [inputImageUrls, setInputImageUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [generatedImageUrls, setGeneratedImageUrls] = useState<string[]>([]);
  // Extended config options (matching AI Studio)
  const [resolution, setResolution] = useState<string>('1K');
  const [temperature, setTemperature] = useState<number>(1);
  const [outputFormat, setOutputFormat] = useState<'IMAGE_ONLY' | 'IMAGE_AND_TEXT'>('IMAGE_ONLY');;
  
  // State for the new state-driven generation logic
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationQueue, setGenerationQueue] = useState<number[]>([]);
  const [allGeneratedUrisForSave, setAllGeneratedUrisForSave] = useState<string[]>([]);

  const [isDragging, setIsDragging] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { user, userData } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const MAX_INPUT_IMAGES = 4;

  // This effect hook manages the sequential generation of images from a queue.
  useEffect(() => {
    // Stop condition: if not generating or the queue is empty.
    if (!isGenerating || generationQueue.length === 0) {
      if (isGenerating) { // This block runs once after the last image is processed
        setIsGenerating(false);
        if (timerRef.current) clearInterval(timerRef.current);

        if (allGeneratedUrisForSave.length > 0) {
          toast({
            title: 'Tạo ảnh hoàn tất!',
            description: `Đã tạo thành công ${allGeneratedUrisForSave.length} ảnh.`,
          });
          // Save all successfully generated images to Firebase Storage and Firestore
          const saveImages = async () => {
            try {
              await Promise.all(allGeneratedUrisForSave.map(async (uri) => {
                const fileName = `generated-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
                const imageRef = storageRef(storage, `users/${user!.uid}/generated/${fileName}`);
                await uploadString(imageRef, uri, 'data_url');
                const downloadURL = await getDownloadURL(imageRef);
                await addDoc(collection(firestore, 'generatedImages'), {
                  ownerId: user!.uid,
                  prompt: prompt,
                  imageUrl: downloadURL,
                  createdAt: serverTimestamp(),
                });
              }));
              toast({ title: `Đã lưu ${allGeneratedUrisForSave.length} ảnh`, description: 'Các ảnh đã được lưu vào thư viện của bạn.' });
            } catch (saveError) {
              console.error('Failed to save image(s):', saveError);
              toast({ variant: 'destructive', title: 'Lỗi lưu trữ', description: `Tạo ảnh thành công nhưng không thể lưu vào thư viện.` });
            }
          };
          if (user) saveImages();
        }
        setAllGeneratedUrisForSave([]);
      }
      return;
    }

    let isCancelled = false;

    // Function to process a single item from the queue with retry logic.
    const processQueue = async () => {
      const currentQueueItemCount = numberOfImages - generationQueue.length + 1;
      const MAX_RETRIES = 2; // Try each image up to 3 times (1 initial + 2 retries)
      const RETRY_DELAY = 5000; // 5 seconds

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          toast({
            title: `Đang tạo ảnh ${currentQueueItemCount} trên ${numberOfImages}${attempt > 0 ? ` (thử lại lần ${attempt})` : ''}...`,
            description: 'Vui lòng chờ trong giây lát.',
          });

          const result = await brandedImageGeneration({
            existingImageUris: inputImageUrls,
            generationPrompt: prompt,
            aspectRatio: aspectRatio,
            modelName: imageModel,
            apiKey: userData?.geminiApiKey,
            resolution: resolution,
            temperature: temperature,
            outputFormat: outputFormat,
          });

          if (isCancelled) return;

          if (result.generatedImageUri) {
            setGeneratedImageUrls(prev => [...prev, result.generatedImageUri]);
            setAllGeneratedUrisForSave(prev => [...prev, result.generatedImageUri]);
          }
          break; // Success, break the retry loop
        } catch (error: any) {
          if (isCancelled) return;
          
          if (attempt < MAX_RETRIES) {
            // Not the last retry, wait and try again
            toast({
              variant: 'default',
              title: `Ảnh ${currentQueueItemCount} gặp lỗi, đang thử lại (${attempt + 1}/${MAX_RETRIES})...`,
              description: `Đợi ${RETRY_DELAY / 1000}s trước khi thử lại.`,
            });
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          } else {
            // Last retry failed, show final error for this image
            toast({
              variant: 'destructive',
              title: `Lỗi khi tạo ảnh ${currentQueueItemCount}`,
              description: error.message || 'Đã xảy ra lỗi không mong muốn.',
            });
          }
        }
      }

      // After the loop (all retries are done or it was successful), remove the item from the main queue.
      if (!isCancelled) {
          setGenerationQueue(prev => prev.slice(1));
      }
    };

    processQueue();

    return () => {
      isCancelled = true;
    };
  }, [isGenerating, generationQueue, aspectRatio, imageModel, inputImageUrls, numberOfImages, prompt, user, allGeneratedUrisForSave]);


  const handleFilesUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    if (!user) {
      toast({ variant: 'destructive', title: 'Yêu cầu đăng nhập', description: 'Bạn cần đăng nhập để tải ảnh lên.' });
      return;
    }
    
    if (inputImageUrls.length + files.length > MAX_INPUT_IMAGES) {
        toast({ variant: 'destructive', title: 'Quá nhiều ảnh đầu vào', description: `Bạn chỉ có thể thêm tối đa ${MAX_INPUT_IMAGES} ảnh.` });
        return;
    }

    const filesToUpload = Array.from(files).filter(file => {
      if (!file.type.startsWith('image/')) {
        toast({ variant: 'destructive', title: 'Tệp không hợp lệ', description: `'${file.name}' không phải là một tệp ảnh.` });
        return false;
      }
      if (file.size > 4 * 1024 * 1024) {
        toast({ variant: 'destructive', title: 'File quá lớn', description: `'${file.name}' lớn hơn 4MB.` });
        return false;
      }
      return true;
    });

    if (filesToUpload.length === 0) return;

    setIsUploading(true);
    
    try {
      const uploadPromises = filesToUpload.map(async (file) => {
        const fileName = `input-${Date.now()}-${file.name}`;
        const imageRef = storageRef(storage, `users/${user.uid}/inputs/${fileName}`);
        await uploadBytes(imageRef, file);
        const downloadURL = await getDownloadURL(imageRef);
        await addDoc(collection(firestore, 'inputImages'), {
          ownerId: user.uid,
          imageUrl: downloadURL,
          createdAt: serverTimestamp(),
        });
        return downloadURL;
      });

      const newUrls = await Promise.all(uploadPromises);
      setInputImageUrls(prevUrls => [...prevUrls, ...newUrls]);
      
      toast({ title: `Tải lên ${newUrls.length} ảnh thành công`, description: 'Ảnh của bạn đã sẵn sàng để sử dụng.' });
    } catch (error) {
      console.error('Upload failed:', error);
      let errorMessage = 'Không thể tải ảnh lên.';
      if (error instanceof Error && error.message.includes('storage/unauthorized')) {
        errorMessage = 'Lỗi phân quyền. Vui lòng kiểm tra lại cấu hình CORS của Firebase Storage.';
      }
      toast({ variant: 'destructive', title: 'Lỗi tải ảnh', description: errorMessage });
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFilesUpload(event.target.files);
    if(event.target) {
      event.target.value = '';
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFilesUpload(event.dataTransfer.files);
  };

  const handleGenerateOptimalPrompt = async () => {
    if (!simplePrompt.trim()) return;
    
    setIsGeneratingPrompt(true);
    setArtStyle(null);
    setIntentAnalysis(null);
    setPrompt('');

    try {
      const result = await optimalImagePromptGeneration({
        description: simplePrompt,
        imageUris: inputImageUrls,
        model: promptModel,
        apiKey: userData?.geminiApiKey,
      });
      setPrompt(result.optimized_english_prompt);
      setArtStyle(result.art_style_inferred);
      setIntentAnalysis(result.original_intent_analysis);
    } catch (error: any) {
      console.error(error);
      let errorMsg = error.message;
      if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        errorMsg = 'API Gemini của bạn đã hết lượt (Lỗi 429 Quota). Vui lòng chọn mô hình khác (VD: flash-lite) ở menu Mô hình tạo Prompt hoặc thử lại sau.';
      }
      toast({ variant: 'destructive', title: 'Lỗi tạo prompt', description: errorMsg });
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleGenerate = () => { // No longer async, just sets up the state-driven process
    if (!prompt.trim()) {
      toast({ variant: 'destructive', title: 'Thiếu prompt', description: 'Vui lòng nhập mô tả cho ảnh.' });
      return;
    }
    if (!userData?.geminiApiKey) {
      toast({
        variant: 'destructive',
        title: 'Thiếu API Key',
        description: 'Vui lòng thêm Gemini API Key của bạn trong phần cài đặt tài khoản trước khi tạo ảnh.',
      });
      return;
    }
    if (!user) {
      toast({ variant: 'destructive', title: 'Yêu cầu đăng nhập', description: 'Bạn cần đăng nhập để tạo ảnh.' });
      return;
    }

    setIsGenerating(true);
    setGeneratedImageUrls([]);
    setAllGeneratedUrisForSave([]);
    setElapsedTime(0);

    // Create a queue of indices to process
    const queue = Array.from({ length: numberOfImages }, (_, i) => i);
    setGenerationQueue(queue);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime(prevTime => prevTime + 1);
    }, 1000);
  };

  const handleRemoveImage = (urlToRemove: string) => {
    setInputImageUrls((prevUrls) => prevUrls.filter((url) => url !== urlToRemove));
  };

  const handleDownload = (imageUrl: string, index: number) => {
    if (!imageUrl) return;
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `igen-image-${Date.now()}-${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleImageSelectFromLibrary = (imageUrl: string) => {
    if (inputImageUrls.length >= MAX_INPUT_IMAGES) {
        toast({ variant: 'destructive', title: 'Đã đạt giới hạn ảnh', description: `Bạn chỉ có thể thêm tối đa ${MAX_INPUT_IMAGES} ảnh.` });
        return;
    }
    if (!inputImageUrls.includes(imageUrl)) {
        setInputImageUrls((prevUrls) => [...prevUrls, imageUrl]);
    }
  };
  
  const isBusy = isGenerating || isGeneratingPrompt || isUploading;
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
       <ImageLibraryModal
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        onImageSelect={handleImageSelectFromLibrary}
      />
      <Dialog open={!!previewImageUrl} onOpenChange={(isOpen) => !isOpen && setPreviewImageUrl(null)}>
        <DialogContent className="max-w-4xl h-[80vh] bg-transparent border-none shadow-none">
          <DialogHeader className="sr-only">
            <DialogTitle>Image Preview</DialogTitle>
            <DialogDescription>A larger view of the generated image.</DialogDescription>
          </DialogHeader>
          {previewImageUrl && (
            <div className="relative w-full h-full">
              <Image 
                src={previewImageUrl} 
                alt="Preview"
                fill
                style={{ objectFit: 'contain' }} 
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
      <div className="lg:col-span-1 flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardContent className="p-6 flex flex-col flex-1 gap-4">
            {/* API Key Warning */}
            {!userData?.geminiApiKey && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                ⚠️ Bạn chưa thêm Gemini API Key. Vui lòng thêm API key trong menu tài khoản để sử dụng tính năng tạo ảnh.
              </div>
            )}
            {/* Reference Image Upload */}
            <div className="space-y-2">
               <div className="flex justify-between items-center">
                <Label htmlFor="image-upload-input">{t('workspace.image.inputLabel')}</Label>
                <Button variant="outline" size="sm" onClick={() => setIsLibraryOpen(true)} disabled={isBusy}>
                  <Images className="mr-2 h-4 w-4" />
                  Library
                </Button>
              </div>
              <div
                className={cn(
                  'relative flex flex-col items-center justify-center w-full min-h-32 p-2 border-2 border-dashed rounded-lg transition-colors',
                  isDragging ? 'border-primary bg-primary/10' : 'hover:bg-muted'
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {isUploading ? (
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <p className="text-sm mt-2">{t('workspace.image.uploading')}</p>
                  </div>
                ) : inputImageUrls.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 w-full">
                    {inputImageUrls.map((url) => (
                      <div key={url} className="relative aspect-square">
                        <Image src={url} alt="Input preview" fill style={{ objectFit: 'contain' }} className="rounded-md p-1 bg-white" />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full z-10"
                          onClick={(e) => { e.stopPropagation(); handleRemoveImage(url); }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {inputImageUrls.length < MAX_INPUT_IMAGES && (
                     <div 
                      className="flex aspect-square flex-col items-center justify-center rounded-lg border border-dashed text-muted-foreground hover:bg-muted/50 hover:text-primary transition-colors cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                     >
                       <UploadCloud className="w-6 h-6" />
                       <span className="text-xs text-center mt-1">Thêm</span>
                     </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full w-full text-muted-foreground text-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <UploadCloud className="w-8 h-8 mb-2" />
                    <p className="text-sm">{isDragging ? t('workspace.image.dropLabel') : t('workspace.image.uploadTooltip')}</p>
                  </div>
                )}
                <input ref={fileInputRef} id="image-upload-input" type="file" className="hidden" multiple onChange={handleFileChange} accept="image/*" disabled={isBusy} />
              </div>
            </div>
            <Separator />
            {/* Simple prompt section */}
            <div className="space-y-2">
              <div className="flex justify-between items-center mb-1">
                <Label htmlFor="simple-prompt">{t('workspace.image.simplePromptLabel')}</Label>
                <Select
                  value={selectedTemplate}
                  onValueChange={(val) => {
                    setSelectedTemplate(val);
                    const tmpl = IMAGE_TEMPLATES.find(t => t.id === val);
                    if (tmpl && tmpl.id !== 'none') {
                      setSimplePrompt(tmpl.prompt);
                    } else if (tmpl && tmpl.id === 'none') {
                      setSimplePrompt('');
                    }
                  }}
                  disabled={isBusy}
                >
                  <SelectTrigger className="w-[200px] h-8 text-xs">
                    <SelectValue placeholder="Chọn form mẫu..." />
                  </SelectTrigger>
                  <SelectContent>
                    {IMAGE_TEMPLATES.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                id="simple-prompt"
                placeholder={t('workspace.image.simplePromptPlaceholder')}
                value={simplePrompt}
                onChange={(e) => {
                  setSimplePrompt(e.target.value);
                  setSelectedTemplate('none');
                }}
                rows={3}
                disabled={isBusy}
                className="resize-none"
              />
              <div className="space-y-2">
                <Label htmlFor="prompt-model">Mô hình tạo Prompt</Label>
                <Select value={promptModel} onValueChange={setPromptModel} disabled={isBusy}>
                  <SelectTrigger id="prompt-model" className="w-full">
                    <SelectValue placeholder="Chọn mô hình" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-3.1-pro-preview">iGen-3.1-pro-preview</SelectItem>
                    <SelectItem value="gemini-3.1-flash-lite-preview">iGen-3.1-flash-lite-preview</SelectItem>
                    <SelectItem value="gemini-3-flash-preview">iGen-3-flash-preview</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleGenerateOptimalPrompt} disabled={isGeneratingPrompt || !simplePrompt.trim()} size="sm" className="w-full">
                {isGeneratingPrompt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                {t('workspace.image.generatePromptButton')}
              </Button>
            </div>
            {intentAnalysis && artStyle && (
              <div className="text-xs p-3 bg-muted/50 rounded-lg space-y-1.5 border">
                <p><strong className="font-semibold">Phân tích:</strong> {intentAnalysis}</p>
                <p><strong className="font-semibold">Phong cách:</strong> <span className="text-primary font-medium">{artStyle}</span></p>
              </div>
            )}
            <Separator />
            {/* Main prompt section */}
            <div className="space-y-2 flex-1 flex flex-col">
              <Label htmlFor="prompt">{t('workspace.image.promptLabel')}</Label>
              <Textarea
                id="prompt"
                placeholder={t('workspace.image.promptPlaceholder')}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isBusy}
                className="resize-none flex-1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="image-model">Mô hình tạo ảnh</Label>
              <Select value={imageModel} onValueChange={setImageModel} disabled={isBusy}>
                <SelectTrigger id="image-model" className="w-full">
                  <SelectValue placeholder="Chọn mô hình" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini-3.1-flash-image-preview">iGen-3.1-flash-image-preview</SelectItem>
                  <SelectItem value="gemini-3-pro-image-preview">iGen-3-pro-image-preview</SelectItem>
                  <SelectItem value="gemini-2.5-flash-image">iGen-2.5-flash-image</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="aspect-ratio">Tỷ lệ khung hình</Label>
                <Select value={aspectRatio} onValueChange={setAspectRatio} disabled={isBusy}>
                  <SelectTrigger id="aspect-ratio" className="w-full">
                    <SelectValue placeholder="Chọn tỷ lệ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1:1">1:1 (Vuông)</SelectItem>
                    <SelectItem value="16:9">16:9 (Ngang rộng)</SelectItem>
                    <SelectItem value="9:16">9:16 (Dọc)</SelectItem>
                    <SelectItem value="4:3">4:3 (Tiêu chuẩn)</SelectItem>
                    <SelectItem value="3:4">3:4 (Chân dung)</SelectItem>
                    <SelectItem value="3:2">3:2 (Ngang)</SelectItem>
                    <SelectItem value="2:3">2:3 (Chân dung cao)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="number-of-images">Số lượng ảnh</Label>
                <Select value={String(numberOfImages)} onValueChange={(val) => setNumberOfImages(Number(val))} disabled={isBusy}>
                    <SelectTrigger id="number-of-images" className="w-full">
                        <SelectValue placeholder="Chọn số lượng" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1">1 ảnh</SelectItem>
                        <SelectItem value="2">2 ảnh</SelectItem>
                        <SelectItem value="3">3 ảnh</SelectItem>
                        <SelectItem value="4">4 ảnh</SelectItem>
                    </SelectContent>
                </Select>
              </div>
            </div>
            {/* ===== Extended Config - Per Model, matching Google AI Studio ===== */}
            <Separator />

            {/* Output Format: ONLY for gemini-3.1-flash-image-preview */}
            {imageModel === 'gemini-3.1-flash-image-preview' && (
              <div className="space-y-2">
                <Label>Định dạng đầu ra</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => setOutputFormat('IMAGE_ONLY')}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1 rounded-lg border p-3 text-xs font-medium transition-colors',
                      outputFormat === 'IMAGE_ONLY' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                    )}
                  >
                    <ImageIcon className="h-5 w-5" />
                    Chỉ ảnh
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => setOutputFormat('IMAGE_AND_TEXT')}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1 rounded-lg border p-3 text-xs font-medium transition-colors',
                      outputFormat === 'IMAGE_AND_TEXT' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                    )}
                  >
                    <span className="text-base">📝</span>
                    Ảnh + chú thích
                  </button>
                </div>
              </div>
            )}

            {/* Temperature: ALL models */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label htmlFor="temperature">Nhiệt độ (Sáng tạo)</Label>
                <span className="text-sm font-mono text-muted-foreground w-8 text-right">{temperature.toFixed(1)}</span>
              </div>
              <Slider
                id="temperature"
                min={0}
                max={2}
                step={0.1}
                value={[temperature]}
                onValueChange={([val]) => setTemperature(val)}
                disabled={isBusy}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Chính xác</span>
                <span>Sáng tạo</span>
              </div>
            </div>

            {/* Resolution:
                - gemini-3.1-flash-image-preview: 512 / 1K / 2K / 4K
                - gemini-3-pro-image-preview:      1K / 2K / 4K  (no 512)
                - gemini-2.5-flash-image:          hidden
            */}
            {imageModel !== 'gemini-2.5-flash-image' && (() => {
              const resOptions = imageModel === 'gemini-3.1-flash-image-preview'
                ? (['512', '1K', '2K', '4K'] as const)
                : (['1K', '2K', '4K'] as const);
              const cols = resOptions.length === 4 ? 'grid-cols-4' : 'grid-cols-3';
              return (
                <div className="space-y-2">
                  <Label>Độ phân giải</Label>
                  <div className={cn('grid gap-1.5', cols)}>
                    {resOptions.map((res) => (
                      <button
                        key={res}
                        type="button"
                        disabled={isBusy}
                        onClick={() => setResolution(res)}
                        className={cn(
                          'rounded-md border py-1.5 text-sm font-medium transition-colors',
                          resolution === res
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:bg-muted'
                        )}
                      >
                        {res}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            <Button onClick={handleGenerate} disabled={isBusy || !prompt.trim()} className="w-full mt-2">
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-2 h-4 w-4" />}
              {t('workspace.image.generateButton')}
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="lg:col-span-2 bg-muted/50 rounded-lg flex flex-col items-center justify-center min-h-[400px] lg:min-h-0 p-4">
        {isGenerating ? (
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
            <p>{t('workspace.image.loadingMessage')}</p>
            <div className="flex items-center gap-2 font-mono text-lg">
                <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                </span>
                <span>{elapsedTime}s</span>
            </div>
          </div>
        ) : generatedImageUrls.length > 0 ? (
          <div className={cn(
              "grid w-full h-full gap-4",
              generatedImageUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
          )}>
              {generatedImageUrls.map((url, index) => (
                  <div key={index} className="relative group rounded-lg overflow-hidden border bg-black/10">
                      <Image src={url} alt={`Generated image ${index + 1}`} fill style={{ objectFit: 'contain' }} className="p-1" />
                      <div className="absolute bottom-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="secondary" size="icon" onClick={() => setPreviewImageUrl(url)} title="Phóng to">
                              <ZoomIn className="h-5 w-5" />
                          </Button>
                          <Button variant="secondary" size="icon" onClick={() => handleDownload(url, index)} title="Tải ảnh xuống">
                              <Download className="h-5 w-5" />
                          </Button>
                      </div>
                  </div>
              ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground">
            <ImageIcon className="h-16 w-16 mx-auto mb-4" />
            <p>{t('workspace.image.outputPlaceholder')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
