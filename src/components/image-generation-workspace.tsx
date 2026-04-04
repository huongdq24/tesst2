'use client';
import { useState, useRef, DragEvent, useEffect, useCallback } from 'react';
import { recordUsage } from '@/lib/usage-tracker';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, ImageIcon, X, Wand2, UploadCloud, Download, Images, ZoomIn, Building2, Check, PenLine } from 'lucide-react';
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

// ===== DESIGN EXPERT OPTIONS CONFIG (ĐA NGÀNH NGHỀ) =====
type OptionItem = { id: string; label: string; icon: string };
type OptionGroup = {
  key: string;
  title: string;
  multi?: boolean; // true = chọn nhiều, false = chọn 1 hoặc 0
  color: string; // tailwind color prefix
  items: OptionItem[];
  placeholder?: string; // placeholder cho ô ghi ý kiến
};

const DESIGN_FIELDS: OptionItem[] = [
  { id: 'streetwear', label: 'Streetwear / Đời sống', icon: '👟' },
  { id: 'office', label: 'Công sở / Elegant', icon: '💼' },
  { id: 'sportswear', label: 'Thể thao / Sportswear', icon: '🚴' },
  { id: 'highfashion', label: 'High Fashion / Editorial', icon: '💎' },
  { id: 'accessories', label: 'Phụ kiện / Trang sức', icon: '💍' },
  { id: 'landscape', label: 'Ngoại cảnh / Cảnh quan', icon: '🌳' },
  { id: 'interior', label: 'Trong nhà / Studio', icon: '🛋️' },
  { id: 'other', label: 'Khác', icon: '📋' },
];

const DESIGN_OPTION_GROUPS: OptionGroup[] = [
  {
    key: 'renderStyle',
    title: 'Phong cách Chụp ảnh',
    color: 'blue',
    placeholder: 'VD: "chụp kiểu vintage", "ánh sáng tạp chí"...',
    items: [
      { id: 'studio', label: 'Studio Professional', icon: '💡' },
      { id: 'street', label: 'Street Snapshot', icon: '📸' },
      { id: 'cinematic', label: 'Cinematic Film', icon: '🎞️' },
      { id: 'editorial', label: 'Editorial / Magazine', icon: '📰' },
      { id: 'polaroid', label: 'Vintage Polaroid', icon: '🖼️' },
      { id: '3dfashion', label: '3D Fashion Render', icon: '👕' },
    ],
  },
  {
    key: 'viewAngle',
    title: 'Góc chụp & Pose',
    color: 'sky',
    placeholder: 'VD: "đang đi bộ", "ngồi thư giãn"...',
    items: [
      { id: 'fullbody', label: 'Toàn cảnh (Full Body)', icon: '🧍' },
      { id: 'closeup', label: 'Cận cảnh (Detail)', icon: '🔍' },
      { id: 'medium', label: 'Bán thân (Waist up)', icon: '🧥' },
      { id: 'dynamic', label: 'Hành động (Action)', icon: '🏃' },
      { id: 'birdseye', label: 'Góc cao (Top down)', icon: '🦅' },
      { id: 'lowangle', label: 'Góc thấp (Heroic)', icon: '📐' },
    ],
  },
  {
    key: 'style',
    title: 'Phong cách Thời trang',
    color: 'violet',
    placeholder: 'VD: "phong cách Y2K", "gothic"...',
    items: [
      { id: 'modern', label: 'Hiện đại', icon: '✨' },
      { id: 'minimalist', label: 'Tối giản', icon: '⬜' },
      { id: 'vintage', label: 'Vitage / Retro', icon: '🏛️' },
      { id: 'bohemian', label: 'Bohemian / Boho', icon: '🌿' },
      { id: 'cyberpunk', label: 'Cyberpunk', icon: '🎋' },
      { id: 'luxury', label: 'Luxury', icon: '👑' },
    ],
  },
  {
    key: 'materials',
    title: 'Chất liệu & Họa tiết',
    multi: true,
    color: 'amber',
    placeholder: 'VD: "vải lụa bóng", "da cá sấu", "họa tiết hoa"...',
    items: [
      { id: 'silk', label: 'Lụa / Satin', icon: '🧵' },
      { id: 'denim', label: 'Denim / Jean', icon: '👖' },
      { id: 'leather', label: 'Da / Suede', icon: '👢' },
      { id: 'linen', label: 'Linen / Cotton', icon: '🪡' },
      { id: 'wool', label: 'Len / Knitwear', icon: '🧶' },
      { id: 'lace', label: 'Lace / Mesh', icon: '🕸️' },
    ],
  },
  {
    key: 'lighting',
    title: 'Ánh sáng',
    color: 'orange',
    placeholder: 'VD: "ánh sáng neon ban đêm", "backlight"...',
    items: [
      { id: 'natural', label: 'Tự nhiên (Sunlight)', icon: '☀️' },
      { id: 'goldenhour', label: 'Hoàng hôn', icon: '🌅' },
      { id: 'softbox', label: 'Softbox (Dịu)', icon: '💡' },
      { id: 'neon', label: 'Neon / Cyber', icon: '🌈' },
    ],
  },
  {
    key: 'focus',
    title: 'Tập trung vào',
    multi: true,
    color: 'emerald',
    placeholder: 'VD: "makeup khuôn mặt", "đường chỉ may"...',
    items: [
      { id: 'outfit', label: 'Trang phục', icon: '👗' },
      { id: 'face', label: 'Khuôn mặt / Makeup', icon: '👁️' },
      { id: 'accessories', label: 'Phụ kiện', icon: '👜' },
      { id: 'detail', label: 'Chi tiết vải', icon: '🔍' },
      { id: 'environment', label: 'Bối cảnh', icon: '🌆' },
    ],
  },
];

// Color utils for option groups — white + teal (xanh ngọc)
const colorMap: Record<string, { selected: string; unselected: string }> = {
  blue:    { selected: 'border-cyan-500 bg-cyan-500 text-white shadow-sm', unselected: 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:bg-cyan-50' },
  sky:     { selected: 'border-cyan-500 bg-cyan-500 text-white shadow-sm', unselected: 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:bg-cyan-50' },
  violet:  { selected: 'border-cyan-600 bg-cyan-600 text-white shadow-sm', unselected: 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:bg-cyan-50' },
  amber:   { selected: 'border-cyan-500 bg-cyan-500 text-white shadow-sm', unselected: 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:bg-cyan-50' },
  orange:  { selected: 'border-cyan-500 bg-cyan-500 text-white shadow-sm', unselected: 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:bg-cyan-50' },
  emerald: { selected: 'border-cyan-600 bg-cyan-600 text-white shadow-sm', unselected: 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:bg-cyan-50' },
};

export function ImageGenerationWorkspace() {
  const IMAGE_TEMPLATES = [
    { id: 'none', label: 'Tùy chỉnh (Tự nhập)', prompt: '' },
    { id: 'realestate', label: '👗 Chuyên gia Thời trang & Đời sống', prompt: '' },
  ];

  const [selectedTemplate, setSelectedTemplate] = useState('none');
  const [simplePrompt, setSimplePrompt] = useState('');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [promptModel, setPromptModel] = useState('gemini-3.1-flash-lite-preview');
  const [imageModel, setImageModel] = useState('gemini-3.1-flash-image-preview');
  const [negativePrompt, setNegativePrompt] = useState<string>('');
  const [rawJsonOutput, setRawJsonOutput] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [numberOfImages, setNumberOfImages] = useState(1);
  const [inputImageUrls, setInputImageUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [generatedImageUrls, setGeneratedImageUrls] = useState<string[]>([]);
  // Extended config options (matching AI Studio)
  const [resolution, setResolution] = useState<string>('1K');
  const [temperature, setTemperature] = useState<number>(1);
  const [outputFormat, setOutputFormat] = useState<'IMAGE_ONLY' | 'IMAGE_AND_TEXT'>('IMAGE_ONLY');
  
  // ===== DESIGN EXPERT STATE (ĐA NGÀNH NGHỀ) =====
  const [designField, setDesignField] = useState<string | null>(null);
  const [designFieldCustom, setDesignFieldCustom] = useState('');
  // Stores selections & custom text per option group key
  const [designSelections, setDesignSelections] = useState<Record<string, string[]>>({});
  const [designCustomTexts, setDesignCustomTexts] = useState<Record<string, string>>({});
  const [archNote, setArchNote] = useState('');

  // State for the new state-driven generation logic
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationQueue, setGenerationQueue] = useState<number[]>([]);

  const [isDragging, setIsDragging] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // ===== REGION SELECTION / INPAINTING STATE =====
  const [editingImageUrl, setEditingImageUrl] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number, y: number } | null>(null);
  const [selectionPrompt, setSelectionPrompt] = useState('');
  const [isInpainting, setIsInpainting] = useState(false);
  // Ref for the image tag rendering the full image to calculate relative bounds
  const regionImageRef = useRef<HTMLImageElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectionStartRef = useRef<{ x: number, y: number } | null>(null);
  const lastMousePosRef = useRef({ clientX: 0, clientY: 0 });
  const autoScrollTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const { user, userData } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ===== GLOBAL MOUSE HANDLERS FOR SELECTION WITH AUTO-SCROLL =====
  useEffect(() => {
    if (!isSelecting) {
      if (autoScrollTimerRef.current) {
        clearInterval(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
      return;
    }

    const updateSelectionAndScroll = (clientX: number, clientY: number) => {
      if (!regionImageRef.current || !scrollContainerRef.current || !selectionStartRef.current) return;

      const container = scrollContainerRef.current;
      const containerRect = container.getBoundingClientRect();

      // Auto-scroll when mouse is near top/bottom edges
      const EDGE_ZONE = 60; // pixels from edge to trigger scroll
      const MAX_SCROLL_SPEED = 15;

      if (clientY < containerRect.top + EDGE_ZONE) {
        const intensity = Math.max(0.2, 1 - Math.max(0, clientY - containerRect.top) / EDGE_ZONE);
        container.scrollBy(0, -MAX_SCROLL_SPEED * intensity);
      } else if (clientY > containerRect.bottom - EDGE_ZONE) {
        const intensity = Math.max(0.2, 1 - Math.max(0, containerRect.bottom - clientY) / EDGE_ZONE);
        container.scrollBy(0, MAX_SCROLL_SPEED * intensity);
      }

      // Update selection coordinates (getBoundingClientRect reflects current scroll position)
      const imgRect = regionImageRef.current.getBoundingClientRect();
      const currentX = Math.max(0, Math.min(clientX - imgRect.left, imgRect.width));
      const currentY = Math.max(0, Math.min(clientY - imgRect.top, imgRect.height));
      const start = selectionStartRef.current;

      setSelection({
        x: Math.min(start.x, currentX),
        y: Math.min(start.y, currentY),
        w: Math.abs(currentX - start.x),
        h: Math.abs(currentY - start.y)
      });
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      lastMousePosRef.current = { clientX: e.clientX, clientY: e.clientY };
      updateSelectionAndScroll(e.clientX, e.clientY);
    };

    const handleGlobalMouseUp = () => {
      setIsSelecting(false);
    };

    // Continuous auto-scroll interval: keeps scrolling even when mouse stops moving near edge
    autoScrollTimerRef.current = setInterval(() => {
      const { clientX, clientY } = lastMousePosRef.current;
      updateSelectionAndScroll(clientX, clientY);
    }, 30);

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      if (autoScrollTimerRef.current) {
        clearInterval(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
    };
  }, [isSelecting]);

  // Toggle single-select (click again to deselect)
  const toggleDesignSingle = (groupKey: string, id: string) => {
    setDesignSelections(prev => {
      const current = prev[groupKey] || [];
      if (current.includes(id)) return { ...prev, [groupKey]: [] }; // deselect
      return { ...prev, [groupKey]: [id] };
    });
  };
  // Toggle multi-select
  const toggleDesignMulti = (groupKey: string, id: string) => {
    setDesignSelections(prev => {
      const current = prev[groupKey] || [];
      if (current.includes(id)) return { ...prev, [groupKey]: current.filter(x => x !== id) };
      return { ...prev, [groupKey]: [...current, id] };
    });
  };
  // Set custom text for a group
  const setGroupCustomText = (groupKey: string, text: string) => {
    setDesignCustomTexts(prev => ({ ...prev, [groupKey]: text }));
  };

  // Build design expert prompt from all selections
  const buildArchitecturePrompt = useCallback(() => {
    const parts: string[] = [];

    // Field
    const fieldLabel = DESIGN_FIELDS.find(f => f.id === designField)?.label;
    const fieldText = fieldLabel || designFieldCustom.trim() || '';
    parts.push(`[CHUYÊN GIA THỜI TRANG & LIFESTYLE${fieldText ? ` - Lĩnh vực: ${fieldText}` : ''}]`);
    parts.push('Phân tích ảnh/yêu cầu thời trang. Tạo hình ảnh có tính thẩm mỹ cao, phù hợp với phong cách và đời sống thực tế.');

    // Each option group
    for (const group of DESIGN_OPTION_GROUPS) {
      const selected = designSelections[group.key] || [];
      const custom = designCustomTexts[group.key]?.trim() || '';
      const selectedLabels = selected
        .map(id => group.items.find(item => item.id === id)?.label)
        .filter(Boolean);
      
      const combined = [...selectedLabels];
      if (custom) combined.push(custom);
      
      if (combined.length > 0) {
        parts.push(`${group.title}: ${combined.join(', ')}.`);
      }
    }

    parts.push('Giữ nguyên tỷ lệ và kích thước từ bản vẽ gốc. Thêm chi tiết phù hợp vào đúng vị trí. Chất lượng render 8K, photorealistic.');

    if (archNote.trim()) {
      parts.push(`Yêu cầu thêm: ${archNote.trim()}`);
    }

    return parts.join(' ');
  }, [designField, designFieldCustom, designSelections, designCustomTexts, archNote]);
  
  // ===== FIX #1: Use refs to avoid infinite loop in useEffect =====
  // Track successfully generated URIs for saving via ref (not state that triggers re-renders)
  const generatedUrisForSaveRef = useRef<string[]>([]);
  // Refs for values used inside the effect to avoid stale closures
  const promptRef = useRef(prompt);
  const userRef = useRef(user);
  const numberOfImagesRef = useRef(numberOfImages);
  
  // Keep refs in sync with state
  useEffect(() => { promptRef.current = prompt; }, [prompt]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { numberOfImagesRef.current = numberOfImages; }, [numberOfImages]);

  // FIX #5: Refs for generation configs to prevent mid-generation re-renders
  const aspectRatioRef = useRef(aspectRatio);
  const imageModelRef = useRef(imageModel);
  const inputImageUrlsRef = useRef(inputImageUrls);
  const resolutionRef = useRef(resolution);
  const temperatureRef = useRef(temperature);
  const outputFormatRef = useRef(outputFormat);

  useEffect(() => { aspectRatioRef.current = aspectRatio; }, [aspectRatio]);
  useEffect(() => { imageModelRef.current = imageModel; }, [imageModel]);
  useEffect(() => { inputImageUrlsRef.current = inputImageUrls; }, [inputImageUrls]);
  useEffect(() => { resolutionRef.current = resolution; }, [resolution]);
  useEffect(() => { temperatureRef.current = temperature; }, [temperature]);
  useEffect(() => { outputFormatRef.current = outputFormat; }, [outputFormat]);

  const MAX_INPUT_IMAGES = 4;

  // This effect hook manages the sequential generation of images from a queue.
  useEffect(() => {
    // Stop condition: if not generating or the queue is empty.
    if (!isGenerating || generationQueue.length === 0) {
      if (isGenerating) { // This block runs once after the last image is processed
        setIsGenerating(false);
        if (timerRef.current) clearInterval(timerRef.current);

        const savedUris = generatedUrisForSaveRef.current;
        if (savedUris.length > 0) {
          toast({
            title: 'Tạo ảnh hoàn tất!',
            description: `Đã tạo thành công ${savedUris.length} ảnh.`,
          });
          // Save all successfully generated images to Firebase Storage and Firestore
          const currentUser = userRef.current;
          const currentPrompt = promptRef.current;
          if (currentUser) {
            const saveImages = async () => {
              try {
                await Promise.all(savedUris.map(async (uri) => {
                  const fileName = `generated-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
                  const imageRef = storageRef(storage, `users/${currentUser.uid}/generated/${fileName}`);
                  await uploadString(imageRef, uri, 'data_url');
                  const downloadURL = await getDownloadURL(imageRef);
                  await addDoc(collection(firestore, 'generatedImages'), {
                    ownerId: currentUser.uid,
                    prompt: currentPrompt,
                    imageUrl: downloadURL,
                    createdAt: serverTimestamp(),
                  });
                }));
                toast({ title: `Đã lưu ${savedUris.length} ảnh`, description: 'Các ảnh đã được lưu vào thư viện của bạn.' });
                // Track usage for cost analytics
                recordUsage({
                  userId: currentUser.uid,
                  userEmail: currentUser.email || '',
                  type: 'image',
                  model: imageModel,
                  amount: savedUris.length,
                  prompt: currentPrompt,
                });
              } catch (saveError) {
                console.error('Failed to save image(s):', saveError);
                toast({ variant: 'destructive', title: 'Lỗi lưu trữ', description: `Tạo ảnh thành công nhưng không thể lưu vào thư viện.` });
              }
            };
            saveImages();
          }
        }
        // Reset the ref
        generatedUrisForSaveRef.current = [];
      }
      return;
    }

    let isCancelled = false;

    // Function to process a single item from the queue with retry logic.
    const processQueue = async () => {
      const totalImages = numberOfImagesRef.current;
      const currentQueueItemCount = totalImages - generationQueue.length + 1;
      const MAX_RETRIES = 2; // Try each image up to 3 times (1 initial + 2 retries)
      const RETRY_DELAY = 5000; // 5 seconds

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          toast({
            title: `Đang tạo ảnh ${currentQueueItemCount} trên ${totalImages}${attempt > 0 ? ` (thử lại lần ${attempt})` : ''}...`,
            description: 'Vui lòng chờ trong giây lát.',
          });

          const result = await brandedImageGeneration({
            existingImageUris: inputImageUrlsRef.current,
            generationPrompt: promptRef.current,
            aspectRatio: aspectRatioRef.current,
            modelName: imageModelRef.current,
            apiKey: userData?.geminiApiKey,
            resolution: resolutionRef.current,
            temperature: temperatureRef.current,
            outputFormat: outputFormatRef.current,
          });

          if (isCancelled) return;

          if (result.generatedImageUri) {
            setGeneratedImageUrls(prev => [...prev, result.generatedImageUri]);
            // Use ref instead of state to avoid triggering re-renders/infinite loops
            generatedUrisForSaveRef.current = [...generatedUrisForSaveRef.current, result.generatedImageUri];
          }
          break; // Success, break the retry loop
        } catch (error: any) {
          if (isCancelled) return;
          
          const errorMsg = error.message || '';
          const isOverloaded = errorMsg.includes('503') || errorMsg.includes('quá tải') || errorMsg.toLowerCase().includes('unavailable');
          const isRateLimited = errorMsg.includes('429') || errorMsg.includes('hết lượt');
          
          let causeStr = 'Có lỗi xảy ra.';
          if (isOverloaded) causeStr = 'Máy chủ AI hiện đang quá tải.';
          else if (isRateLimited) causeStr = 'Đã đạt giới hạn API (Quota).';

          if (attempt < MAX_RETRIES) {
            // Not the last retry, wait and try again
            toast({
              variant: 'default', // standard notification
              title: `⏳ Đang thử lại ảnh ${currentQueueItemCount} (${attempt + 1}/${MAX_RETRIES})`,
              description: `${causeStr} Tự động thử lại sau ${RETRY_DELAY / 1000}s...`,
            });
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          } else {
            // Last retry failed, show final error for this image
            toast({
              variant: 'destructive',
              title: `❌ Lỗi khi tạo ảnh ${currentQueueItemCount}`,
              description: isOverloaded 
                ? 'Các cụm máy chủ AI đều đang bận. Vui lòng thử lại sau vài phút.' 
                : errorMsg || 'Đã xảy ra lỗi không mong muốn.',
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
    // FIX #1 & #5: Removed all static config from deps (now using refs).
    // Keep only the deps that should actually trigger the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, generationQueue, userData?.geminiApiKey]);


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
    setNegativePrompt('');
    setPrompt('');
    setRawJsonOutput(null);

    try {
      const result = await optimalImagePromptGeneration({
        description: simplePrompt,
        imageUris: inputImageUrls,
        model: promptModel,
        apiKey: userData?.geminiApiKey,
      });
      setPrompt(result.optimized_english_prompt);
      setNegativePrompt(result.negative_prompt);
      setRawJsonOutput(JSON.stringify(result, null, 2));
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

  const handleGenerate = async () => {
    // For architecture mode, build prompt from options
    const isArchMode = selectedTemplate === 'realestate';
    if (isArchMode) {
      const archPrompt = buildArchitecturePrompt();
      setSimplePrompt(archPrompt);
      // Small delay to let state update
      await new Promise(r => setTimeout(r, 50));
    }
    
    // Validate: need either an existing optimized prompt OR a simplePrompt to auto-optimize
    const currentSimplePrompt = isArchMode ? buildArchitecturePrompt() : simplePrompt;
    if (!prompt.trim() && !currentSimplePrompt.trim()) {
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

    // ===== AUTO STEP 1: If no optimized prompt yet, generate it from simplePrompt =====
    let finalPrompt = prompt.trim();
    const activeSimplePrompt = isArchMode ? buildArchitecturePrompt() : simplePrompt;
    if (!finalPrompt && activeSimplePrompt.trim()) {
      try {
        setIsGeneratingPrompt(true);
        toast({ 
          title: isArchMode ? '🏗️ Bước 1/2: AI đang phân tích bản vẽ...' : '🔄 Bước 1/2: Đang tạo prompt tối ưu...', 
          description: isArchMode ? 'Chuyên gia kiến trúc đang đọc bản vẽ kỹ thuật của bạn.' : 'AI đang phân tích yêu cầu của bạn.' 
        });

        const result = await optimalImagePromptGeneration({
          description: activeSimplePrompt,
          imageUris: inputImageUrls,
          model: promptModel,
          apiKey: userData?.geminiApiKey,
          mode: isArchMode ? 'architecture' : undefined,
        });

        finalPrompt = result.optimized_english_prompt;
        setPrompt(finalPrompt);
        setNegativePrompt(result.negative_prompt);
        setRawJsonOutput(JSON.stringify(result, null, 2));
        
        toast({ title: '✅ Prompt tối ưu đã sẵn sàng!', description: 'Đang chuyển sang bước tạo ảnh...' });
      } catch (error: any) {
        console.error(error);
        let errorMsg = error.message;
        if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
          errorMsg = 'API Gemini đã hết lượt (429). Vui lòng chọn mô hình khác hoặc thử lại sau.';
        }
        toast({ variant: 'destructive', title: 'Lỗi tạo prompt tối ưu', description: errorMsg });
        setIsGeneratingPrompt(false);
        return; // Stop here, don't proceed to image generation
      } finally {
        setIsGeneratingPrompt(false);
      }
    }

    if (!finalPrompt) {
      toast({ variant: 'destructive', title: 'Thiếu prompt', description: 'Không thể tạo ảnh khi chưa có prompt.' });
      return;
    }

    // ===== STEP 2: Start image generation with optimized English prompt =====
    // Update the prompt ref to use the optimized prompt
    promptRef.current = finalPrompt;

    setIsGenerating(true);
    setGeneratedImageUrls([]);
    generatedUrisForSaveRef.current = [];
    setElapsedTime(0);

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

  // ===== INPAINTING HANDLER (2-STEP: Prompt Optimization → Image Generation) =====
  const handleInpaintingGenerate = async () => {
    if (!selection || !regionImageRef.current || !editingImageUrl || !selectionPrompt.trim()) return;
    if (!userData?.geminiApiKey) {
      toast({ variant: 'destructive', title: 'Thiếu API Key', description: 'Vui lòng thêm Gemini API Key trong cài đặt tài khoản.' });
      return;
    }
    if (!user) {
      toast({ variant: 'destructive', title: 'Yêu cầu đăng nhập', description: 'Bạn cần đăng nhập.' });
      return;
    }

    const imgRect = regionImageRef.current.getBoundingClientRect();
    const ymin = Math.floor((selection.y / imgRect.height) * 1000);
    const xmin = Math.floor((selection.x / imgRect.width) * 1000);
    const ymax = Math.floor(((selection.y + selection.h) / imgRect.height) * 1000);
    const xmax = Math.floor(((selection.x + selection.w) / imgRect.width) * 1000);

    // User's raw inpainting description with region coordinates
    const rawInpaintDescription = `[INPAINTING REQUEST] Region: [ymin:${ymin}, xmin:${xmin}, ymax:${ymax}, xmax:${xmax}]. User request: "${selectionPrompt.trim()}"`;

    setIsInpainting(true);

    try {
      // ===== STEP 1: Optimize prompt via AI with inpainting mode =====
      toast({ title: '🔍 Bước 1/2: Đang phân tích vùng chỉnh sửa...', description: 'AI đang tạo prompt tối ưu cho inpainting.' });

      let finalPrompt: string;
      try {
        const promptResult = await optimalImagePromptGeneration({
          description: rawInpaintDescription,
          imageUris: [editingImageUrl],
          model: promptModel,
          apiKey: userData.geminiApiKey,
          mode: 'inpainting',
        });

        finalPrompt = promptResult.optimized_english_prompt;
        console.log('[Inpainting] Optimized prompt:', finalPrompt);
        toast({ title: '✅ Prompt tối ưu đã sẵn sàng!', description: 'Đang chuyển sang bước tạo ảnh...' });
      } catch (promptError: any) {
        console.warn('[Inpainting] Prompt optimization failed, using fallback:', promptError.message);
        // Fallback: use a basic inpainting prompt if optimization fails
        finalPrompt = `Edit this image. In the region bounded by [ymin:${ymin}, xmin:${xmin}, ymax:${ymax}, xmax:${xmax}] (normalized 0-1000 coordinates), apply the following change: "${selectionPrompt.trim()}". Keep EVERYTHING outside this region EXACTLY the same. Preserve the original image quality, lighting, and style.`;
        toast({ title: '⚠️ Dùng prompt mặc định', description: 'Không thể tối ưu prompt, đang tiếp tục với prompt cơ bản.' });
      }

      // ===== STEP 2: Generate edited image (with retry) =====
      const MAX_INPAINT_RETRIES = 2;
      let inpaintResult: any = null;

      for (let attempt = 0; attempt < MAX_INPAINT_RETRIES; attempt++) {
        try {
          toast({ 
            title: `🎨 Bước 2/2: Đang chỉnh sửa ảnh${attempt > 0 ? ` (thử lại lần ${attempt})` : ''}...`, 
            description: 'AI đang xử lý vùng bạn đã chọn.' 
          });

          inpaintResult = await brandedImageGeneration({
            existingImageUris: [editingImageUrl],
            generationPrompt: finalPrompt,
            aspectRatio: aspectRatio,
            modelName: imageModel,
            apiKey: userData.geminiApiKey,
            resolution: resolution,
            temperature: 0.7,
            outputFormat: 'IMAGE_ONLY',
          });

          if (inpaintResult?.generatedImageUri) break; // Success
        } catch (genError: any) {
          console.error(`[Inpainting] Generation attempt ${attempt + 1} failed:`, genError.message);
          
          if (attempt < MAX_INPAINT_RETRIES - 1) {
            const isTransient = genError.message?.includes('503') || genError.message?.includes('quá tải') || genError.message?.includes('429');
            if (isTransient) {
              toast({ title: '⏳ Các model đang quá tải...', description: 'Đợi 10 giây rồi thử lại...' });
              await new Promise(r => setTimeout(r, 10000));
              continue;
            }
          }
          throw genError; // Non-transient or last attempt
        }
      }

      if (inpaintResult?.generatedImageUri) {
        setGeneratedImageUrls(prev => [...prev, inpaintResult.generatedImageUri]);

        // Save to Firebase
        try {
          const fileName = `inpaint-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
          const imgRef = storageRef(storage, `users/${user.uid}/generated/${fileName}`);
          await uploadString(imgRef, inpaintResult.generatedImageUri, 'data_url');
          const downloadURL = await getDownloadURL(imgRef);
          await addDoc(collection(firestore, 'generatedImages'), {
            ownerId: user.uid,
            prompt: finalPrompt,
            imageUrl: downloadURL,
            createdAt: serverTimestamp(),
          });
          recordUsage({
            userId: user.uid,
            userEmail: user.email || '',
            type: 'image',
            model: imageModel,
            amount: 1,
            prompt: finalPrompt,
          });
        } catch (saveError) {
          console.error('Failed to save inpainted image:', saveError);
        }

        toast({ title: '✅ Chỉnh sửa hoàn tất!', description: 'Ảnh đã sửa được thêm vào kết quả.' });
      }

      setEditingImageUrl(null);
      setSelection(null);
      setSelectionPrompt('');
    } catch (error: any) {
      console.error('Inpainting failed:', error);
      toast({ variant: 'destructive', title: 'Lỗi chỉnh sửa vùng', description: error.message || 'Không thể xử lý yêu cầu.' });
    } finally {
      setIsInpainting(false);
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
                    if (tmpl && tmpl.id !== 'none' && tmpl.id !== 'realestate') {
                      setSimplePrompt(tmpl.prompt);
                    } else if (tmpl && (tmpl.id === 'none' || tmpl.id === 'realestate')) {
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

              {/* ===== FASHION & LIFESTYLE EXPERT OPTIONS PANEL ===== */}
              {selectedTemplate === 'realestate' ? (
                <div className="space-y-3 rounded-lg border border-cyan-200 bg-white p-3">
                  {/* Header */}
                  <div className="flex items-center gap-2 text-sm font-semibold text-cyan-700">
                    <span className="text-base">👗</span>
                    <span>Chuyên gia Thời trang & Đời sống</span>
                  </div>
                  <p className="text-xs text-cyan-600/80">
                    Tải ảnh mẫu/bản vẽ phác thảo. Chọn phong cách, góc chụp và trang phục. AI sẽ render ra ảnh có tính thẩm mỹ cao cho bạn.
                  </p>

                  {/* Field / Industry */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">Lĩnh vực <span className="text-slate-400 font-normal">(tuỳ chọn)</span></Label>
                    <div className="flex flex-wrap gap-1.5">
                      {DESIGN_FIELDS.map(field => (
                        <button
                          key={field.id}
                          type="button"
                          disabled={isBusy}
                          onClick={() => setDesignField(prev => prev === field.id ? null : field.id)}
                          className={cn(
                            'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all border',
                            designField === field.id
                              ? 'border-cyan-500 bg-cyan-500 text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:bg-cyan-50'
                          )}
                        >
                          <span>{field.icon}</span>
                          <span>{field.label}</span>
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      placeholder='Hoặc ghi lĩnh vực khác: VD "Nha khoa", "Đóng tàu"...'
                      value={designFieldCustom}
                      onChange={(e) => { setDesignFieldCustom(e.target.value); if (e.target.value) setDesignField(null); }}
                      disabled={isBusy}
                      className="w-full rounded-md border border-dashed border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-200"
                    />
                  </div>

                  {/* Dynamic Option Groups */}
                  {DESIGN_OPTION_GROUPS.map(group => {
                    const selections = designSelections[group.key] || [];
                    const customText = designCustomTexts[group.key] || '';
                    const colors = colorMap[group.color] || colorMap['blue'];
                    const isMulti = group.multi;
                    return (
                      <div key={group.key} className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-700">
                          {group.title}
                          {isMulti && <span className="text-slate-400 font-normal"> (chọn nhiều)</span>}
                          <span className="text-slate-400 font-normal"> — tuỳ chọn</span>
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                          {group.items.map(item => {
                            const isSelected = selections.includes(item.id);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                disabled={isBusy}
                                onClick={() => isMulti
                                  ? toggleDesignMulti(group.key, item.id)
                                  : toggleDesignSingle(group.key, item.id)
                                }
                                className={cn(
                                  'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all border',
                                  isSelected ? colors.selected : colors.unselected
                                )}
                              >
                                <span>{item.icon}</span>
                                <span>{item.label}</span>
                                {isSelected && <Check className="h-3 w-3" />}
                              </button>
                            );
                          })}
                        </div>
                        {/* Custom text input per group */}
                        <input
                          type="text"
                          placeholder={group.placeholder || 'Hoặc ghi ý kiến khác...'}
                          value={customText}
                          onChange={(e) => setGroupCustomText(group.key, e.target.value)}
                          disabled={isBusy}
                          className="w-full rounded-md border border-dashed border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-200"
                        />
                      </div>
                    );
                  })}

                  {/* General Note */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700 flex items-center gap-1">
                      <PenLine className="h-3 w-3" />
                      Ghi chú tổng thêm <span className="text-slate-400 font-normal">(tuỳ chọn)</span>
                    </Label>
                    <Textarea
                      placeholder='VD: "Thêm cây xanh ban công", "Sàn gỗ sáng màu", "Trần cao 3m", "Output giống ảnh mẫu 3D"...'
                      value={archNote}
                      onChange={(e) => setArchNote(e.target.value)}
                      rows={2}
                      disabled={isBusy}
                      className="resize-none text-xs bg-white"
                    />
                  </div>
                </div>
              ) : (
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
              )}
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
              {selectedTemplate !== 'realestate' && (
                <Button onClick={handleGenerateOptimalPrompt} disabled={isGeneratingPrompt || !simplePrompt.trim()} size="sm" className="w-full">
                  {isGeneratingPrompt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  {t('workspace.image.generatePromptButton')}
                </Button>
              )}
            </div>
            <Separator className="hidden" />
            {/* Main prompt section */}
            <div className="space-y-2 flex-1 flex flex-col hidden">
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
            {negativePrompt && (
              <div className="space-y-2 flex-1 flex flex-col hidden">
                <Label htmlFor="negative-prompt">Negative Prompt (Dành cho AI khác)</Label>
                <Textarea
                  id="negative-prompt"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  disabled={isBusy}
                  className="resize-none h-20 text-muted-foreground"
                />
              </div>
            )}
            {rawJsonOutput && (
              <div className="space-y-2">
                <Label>Raw JSON (Structured Output)</Label>
                <pre className="bg-muted p-4 rounded-md overflow-x-auto text-xs font-mono text-muted-foreground border">
                  {rawJsonOutput}
                </pre>
              </div>
            )}
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
                  <SelectItem value="imagen-4.0-fast-generate-001">Imagen 4 Fast ⚡</SelectItem>
                  <SelectItem value="imagen-4.0-generate-001">Imagen 4 Standard</SelectItem>
                  <SelectItem value="imagen-4.0-ultra-generate-001">Imagen 4 Ultra 🔥</SelectItem>
                </SelectContent>
              </Select>
              {imageModel.startsWith('imagen-') && (
                <p className={`text-xs rounded px-2 py-1.5 ${inputImageUrls.length > 0 ? 'text-cyan-700 bg-cyan-50 border border-cyan-200' : 'text-blue-600 bg-blue-50 border border-blue-200'}`}>
                  {inputImageUrls.length > 0
                    ? '🍌 Nano Banana sẽ phân tích ảnh tham chiếu → tạo prompt chi tiết → Imagen 4 tạo ảnh chất lượng cao.'
                    : '🖼️ Imagen 4 tạo ảnh từ text. Thêm ảnh tham chiếu để kích hoạt pipeline Nano Banana + Imagen 4.'}
                </p>
              )}
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
            <Separator className="hidden" />

            {/* Output Format: ONLY for gemini-3.1-flash-image-preview */}
            {imageModel === 'gemini-3.1-flash-image-preview' && !imageModel.startsWith('imagen-') && (
              <div className="space-y-2 hidden">
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
            <div className="space-y-3 hidden">
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
            {!imageModel.startsWith('imagen-') && imageModel !== 'gemini-2.5-flash-image' && (() => {
              const resOptions = ['1K', '2K', '4K'] as const;
              const cols = 'grid-cols-3';
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
            <Button onClick={handleGenerate} disabled={isBusy || (!prompt.trim() && !simplePrompt.trim() && selectedTemplate !== 'realestate')} className="w-full mt-2">
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : selectedTemplate === 'realestate' ? <span className="mr-2 text-base">✨</span> : <ImageIcon className="mr-2 h-4 w-4" />}
              {selectedTemplate === 'realestate' ? 'Bắt đầu Sáng tạo' : t('workspace.image.generateButton')}
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
                          <Button variant="secondary" size="icon" onClick={() => setEditingImageUrl(url)} title="Sửa vùng">
                              <PenLine className="h-5 w-5" />
                          </Button>
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

      {/* ===== REGION EDITOR MODAL ===== */}
      <Dialog open={!!editingImageUrl} onOpenChange={(v) => { if (!v && !isInpainting) { setEditingImageUrl(null); setSelection(null); setSelectionPrompt(''); } }}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-4 content-start">
          <DialogHeader>
            <DialogTitle>✏️ Tùy chỉnh chi tiết (Inpainting)</DialogTitle>
            <DialogDescription>
              Kéo chuột trên ảnh để chọn vùng cần sửa. Cuộn chuột để xem toàn bộ ảnh.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 flex flex-col gap-4 min-h-0 relative">
            {/* Image Canvas - Scrollable */}
            <div 
              ref={scrollContainerRef}
              className="flex-1 bg-black/5 rounded-lg overflow-auto cursor-crosshair select-none min-h-0 flex flex-col items-center"
              onMouseDown={(e) => {
                if (!regionImageRef.current || isInpainting) return;
                const imgRect = regionImageRef.current.getBoundingClientRect();
                // Only start selection if click is within the image bounds
                if (e.clientX < imgRect.left || e.clientX > imgRect.right || e.clientY < imgRect.top || e.clientY > imgRect.bottom) return;
                e.preventDefault();
                const x = e.clientX - imgRect.left;
                const y = e.clientY - imgRect.top;
                // Sync ref immediately (state updates are batched)
                selectionStartRef.current = { x, y };
                lastMousePosRef.current = { clientX: e.clientX, clientY: e.clientY };
                setIsSelecting(true);
                setSelectionStart({ x, y });
                setSelection({ x, y, w: 0, h: 0 });
              }}
            >
              {editingImageUrl && (
                <div className="relative inline-block shrink-0">
                  <img
                    ref={regionImageRef}
                    src={editingImageUrl}
                    alt="Edit preview"
                    className="max-w-full block pointer-events-none"
                    style={{ display: 'block' }}
                  />
                  {/* Inpainting loading overlay */}
                  {isInpainting && (
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-10 rounded-lg">
                      <Loader2 className="h-10 w-10 text-white animate-spin" />
                      <p className="text-white text-sm mt-3 font-medium">Đang xử lý chỉnh sửa...</p>
                    </div>
                  )}
                  {selection && !isInpainting && (
                    <div 
                      className="absolute border-2 border-cyan-400 bg-cyan-400/20 pointer-events-none"
                      style={{
                        left: `${selection.x}px`,
                        top: `${selection.y}px`,
                        width: `${selection.w}px`,
                        height: `${selection.h}px`,
                      }}
                    >
                      <span className="absolute -top-6 left-0 bg-cyan-500 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap shadow">
                        {Math.floor(selection.w)}×{Math.floor(selection.h)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Prompt input */}
            <div className="flex gap-2 shrink-0">
              <Textarea 
                placeholder='VD: "Thêm kính râm", "Đổi màu áo thành xanh", "Xóa vật thể này"...'
                value={selectionPrompt}
                onChange={e => setSelectionPrompt(e.target.value)}
                className="h-[60px] resize-none"
                disabled={isInpainting}
              />
              <Button 
                className="h-[60px] min-w-[100px]" 
                disabled={!selection || selection.w < 10 || !selectionPrompt.trim() || isInpainting}
                onClick={handleInpaintingGenerate}
              >
                {isInpainting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Xác nhận'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}