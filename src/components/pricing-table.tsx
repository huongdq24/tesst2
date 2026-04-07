'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PRICING_TABLE } from "@/lib/usage-tracker";
import { ImageIcon, VideoIcon, Mic2Icon, TypeIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PricingTableProps {
  className?: string;
  showTitle?: boolean;
}

const CATEGORIES = [
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

export function PricingTable({ className, showTitle = true }: PricingTableProps) {
  return (
    <div className={cn("space-y-8", className)}>
      {CATEGORIES.map((cat) => {
        const items = Object.entries(PRICING_TABLE).filter(([_, data]) => data.category === cat.id);
        if (items.length === 0) return null;

        return (
          <div key={cat.id} className="space-y-3">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
              <span className="p-1.5 bg-cyan-500/10 text-cyan-600 rounded-lg dark:text-cyan-400">
                {cat.icon}
              </span>
              <h3 className="font-bold text-lg text-zinc-200">{cat.label}</h3>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-zinc-800">
                  <TableHead className="w-[280px] text-zinc-400">Mô hình / Dịch vụ</TableHead>
                  <TableHead className="text-right text-zinc-400">Giá (Credit)</TableHead>
                  <TableHead className="text-right text-zinc-400">Đơn vị</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(([id, data]) => (
                  <TableRow key={id} className="group transition-colors hover:bg-zinc-800/20 border-zinc-800/50">
                    <TableCell>
                      <div className="font-semibold text-sm text-zinc-300">
                        {data.label.replace('Gemini', 'iGen')}
                      </div>
                      {data.note && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1">
                          {data.note.replace('Gemini', 'iGen')}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                        {data.costPerUnitUSD < 0.001 
                          ? data.costPerUnitUSD.toFixed(6) 
                          : data.costPerUnitUSD.toFixed(3)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-zinc-500 text-xs">
                      / {getUnitLabel(data.unit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );
      })}
      
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
        <p className="text-[11px] text-zinc-500 italic">
          * Bảng giá có thể thay đổi tùy theo chính sách của nhà cung cấp dịch vụ AI.
        </p>
      </div>
    </div>
  );
}
