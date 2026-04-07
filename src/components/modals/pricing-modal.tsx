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
import { PricingTable } from "../pricing-table";

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PricingModal({ isOpen, onClose }: PricingModalProps) {
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
           <PricingTable showTitle={false} />
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
