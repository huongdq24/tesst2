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
            Bảng giá dịch vụ
          </DialogTitle>
          <p className="text-muted-foreground text-sm">
            Chi phí được tính dựa trên số lượng Credit tiêu thụ cho mỗi đơn vị sử dụng.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2">
           <PricingTable showTitle={false} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
