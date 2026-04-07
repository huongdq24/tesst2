'use client';

import React from 'react';
import { PRICING_TABLE, estimateCost } from '@/lib/usage-tracker';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Calculator, Info } from 'lucide-react';

interface CostEstimationPanelProps {
  model: string;
  amount: number;
  options?: {
    resolution?: string;
  };
  title?: string;
  className?: string;
}

export function CostEstimationPanel({
  model,
  amount,
  options,
  title = "Chi phí ước tính",
  className
}: CostEstimationPanelProps) {
  const pricing = PRICING_TABLE[model];
  if (!pricing) return null;

  const { costUSD } = estimateCost(model, amount, options);

  const getUnitLabel = (unit: string) => {
    switch (unit) {
      case 'seconds': return 'giây';
      case 'count': return 'ảnh';
      case 'tokens': return 'token';
      default: return unit;
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'image': return 'IMAGE GENERATION';
      case 'video': return 'VIDEO GENERATION';
      case 'audio': return 'AUDIO / TTS';
      case 'text': return 'TOKEN USAGE (PROMPT AI)';
      default: return cat.toUpperCase();
    }
  };

  return (
    <Card className={cn(
      "bg-cyan-50/30 dark:bg-cyan-900/10 border-cyan-100 dark:border-cyan-800/40 p-4 space-y-3",
      className
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-cyan-700 dark:text-cyan-400">
          <Calculator className="h-4 w-4" />
          <h4 className="text-sm font-bold uppercase tracking-wide">{title}</h4>
        </div>
        <Badge variant="outline" className="bg-white/50 dark:bg-transparent text-[10px] py-0 border-cyan-200 text-cyan-600">
          iGen AI Pricing
        </Badge>
      </div>

      <div className="space-y-2.5">
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {getCategoryLabel(pricing.category)}
          </p>
          <div className="flex justify-between items-baseline">
            <span className="text-[12px] text-slate-600 dark:text-slate-300">Model:</span>
            <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{pricing.label}</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-[12px] text-slate-600 dark:text-slate-300">Giá / {getUnitLabel(pricing.unit)}:</span>
            <span className="text-[12px] font-mono font-bold text-slate-700 dark:text-slate-200">
              {pricing.costPerUnitUSD < 0.001 ? pricing.costPerUnitUSD.toFixed(6) : pricing.costPerUnitUSD.toFixed(3)} Credit
            </span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-[12px] text-slate-600 dark:text-slate-300">Số lượng:</span>
            <span className="text-[12px] font-mono font-bold text-slate-700 dark:text-slate-200">
              x{amount}
            </span>
          </div>
        </div>

        <div className="border-t border-cyan-200/50 pt-2 flex items-center justify-between">
          <span className="text-[12px] font-bold text-slate-700 dark:text-slate-200">Tổng chi phí:</span>
          <span className="text-[14px] font-mono font-bold text-cyan-700 dark:text-cyan-400">
            {costUSD.toFixed(3)} Credit
          </span>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 leading-snug flex items-start gap-1">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        <span>* Chi phí ước tính dựa trên iGen AI pricing. Miễn phí khi không dùng API key.</span>
      </p>
    </Card>
  );
}
