'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PRICING_TABLE } from "@/lib/usage-tracker";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ImageIcon, VideoIcon, Mic2Icon, TypeIcon } from "lucide-react";

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PricingModal({ isOpen, onClose }: PricingModalProps) {
  const categories = [
    { id: 'image', label: 'Hình ảnh', icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'video', label: 'Video', icon: <VideoIcon className="w-4 h-4" /> },
    { id: 'audio', label: 'Âm thanh', icon: <Mic2Icon className="w-4 h-4" /> },
    { id: 'text', label: 'Văn bản / Prompt', icon: <TypeIcon className="w-4 h-4" /> },
  ];

  const getUnitLabel = (unit: string) => {
    switch (unit) {
      case 'seconds': return 'giây';
      case 'count': return 'ảnh';
      case 'tokens': return 'token';
      default: return unit;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            🚀 Bảng giá dịch vụ iGen
          </DialogTitle>
          <p className="text-muted-foreground text-sm">
            Chi phí được tính dựa trên số lượng Credit tiêu thụ cho mỗi đơn vị sử dụng.
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 pb-6">
          <div className="space-y-8">
            {categories.map((cat) => {
              const items = Object.entries(PRICING_TABLE).filter(([_, data]) => data.category === cat.id);
              if (items.length === 0) return null;

              return (
                <div key={cat.id} className="space-y-3">
                  <div className="flex items-center gap-2 border-b pb-2">
                    <span className="p-1.5 bg-cyan-50 text-cyan-600 rounded-lg dark:bg-cyan-900/30 dark:text-cyan-400">
                      {cat.icon}
                    </span>
                    <h3 className="font-bold text-lg">{cat.label}</h3>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-none">
                        <TableHead className="w-[280px]">Mô hình / Dịch vụ</TableHead>
                        <TableHead className="text-right">Giá (Credit)</TableHead>
                        <TableHead className="text-right">Đơn vị</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map(([id, data]) => (
                        <TableRow key={id} className="group transition-colors hover:bg-muted/30">
                          <TableCell>
                            <div className="font-semibold text-sm">{data.label}</div>
                            {data.note && (
                              <p className="text-[11px] text-muted-foreground line-clamp-1">{data.note}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                              {data.costPerUnitUSD < 0.001 
                                ? data.costPerUnitUSD.toFixed(6) 
                                : data.costPerUnitUSD.toFixed(3)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground text-xs">
                            / {getUnitLabel(data.unit)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="p-4 bg-muted/30 border-t text-center">
          <p className="text-[11px] text-muted-foreground italic">
            * Bảng giá có thể thay đổi tùy theo chính sách của nhà cung cấp dịch vụ AI.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
