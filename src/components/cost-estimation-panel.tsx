'use client';

import React from 'react';
import { PRICING_TABLE, estimateCost } from '@/lib/usage-tracker';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Calculator, Info } from 'lucide-react';

interface CostEstimationItem {
  model: string;
  amount: number;
  inputAmount?: number;
  options?: {
    resolution?: string;
  };
}

interface CostEstimationPanelProps {
  model?: string; // Legacy support
  amount?: number; // Legacy support
  inputAmount?: number;
  options?: { // Legacy support
    resolution?: string;
  };
  items?: CostEstimationItem[];
  title?: string;
  className?: string;
}

export function CostEstimationPanel({
  model,
  amount,
  inputAmount,
  options,
  items = [],
  title = "Chi phí ước tính",
  className
}: CostEstimationPanelProps) {
  // Combine legacy props with items array
  const allItems: CostEstimationItem[] = [...items];
  if (model && amount !== undefined) {
    allItems.unshift({ model, amount, inputAmount, options });
  }

  if (allItems.length === 0) return null;

  const getUnitLabel = (unit: string, category?: string) => {
    switch (unit) {
      case 'seconds': return 'giây';
      case 'count': return category === 'image' ? 'ảnh' : 'lần';
      case 'tokens': return 'token';
      case '1k tokens': return '1000 tokens';
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

      <div className="space-y-4">
        {allItems.map((item, idx) => {
          const pricing = PRICING_TABLE[item.model];
          if (!pricing) return null;
          return (
            <div key={`${item.model}-${idx}`} className="space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {getCategoryLabel(pricing.category)}
              </p>
              <div className="flex justify-between items-baseline">
                <span className="text-[12px] text-slate-600 dark:text-slate-300">Model:</span>
                <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{pricing.label}</span>
              </div>
              
              {pricing.category === 'text' && pricing.inputCostPerUnitUSD ? (
                <div className="flex justify-between items-baseline">
                  <span className="text-[12px] text-slate-600 dark:text-slate-300">Giá Input / Output:</span>
                  <span className="text-[12px] font-mono font-bold text-slate-700 dark:text-slate-200">
                    {parseFloat(pricing.inputCostPerUnitUSD.toFixed(8))} / {parseFloat(pricing.costPerUnitUSD.toFixed(8))}
                  </span>
                </div>
              ) : null}
              {(!pricing.inputCostPerUnitUSD || pricing.category !== 'text') && (
                <div className="flex justify-between items-baseline">
                  <span className="text-[12px] text-slate-600 dark:text-slate-300">Giá / {getUnitLabel(pricing.unit, pricing.category)}:</span>
                  <span className="text-[12px] font-mono font-bold text-slate-700 dark:text-slate-200">
                    {parseFloat(pricing.costPerUnitUSD.toFixed(6))}
                  </span>
                </div>
              )}

              {item.inputAmount ? (
                <>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[12px] text-slate-600 dark:text-slate-300">Input Tokens:</span>
                    <span className="text-[12px] font-mono font-bold text-slate-700 dark:text-slate-200">
                      {item.inputAmount}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[12px] text-slate-600 dark:text-slate-300">Output Tokens:</span>
                    <span className="text-[12px] font-mono font-bold text-slate-700 dark:text-slate-200">
                      {item.amount}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between items-baseline">
                  <span className="text-[12px] text-slate-600 dark:text-slate-300">Số lượng:</span>
                  <span className="text-[12px] font-mono font-bold text-slate-700 dark:text-slate-200">
                    x{item.amount}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        <div className="border-t border-cyan-200/50 pt-2 flex items-center justify-between">
          <span className="text-[12px] font-bold text-slate-700 dark:text-slate-200">Tổng chi phí:</span>
          <span className="text-[14px] font-mono font-bold text-cyan-700 dark:text-cyan-400">
            {parseFloat(allItems.reduce((sum, item) => sum + estimateCost(item.model, item.amount, { resolution: item.options?.resolution, inputAmount: item.inputAmount }).costUSD, 0).toFixed(6))} Credit
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
