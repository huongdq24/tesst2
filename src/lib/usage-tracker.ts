'use client';

import { collection, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore';
import { firestore } from '@/lib/firebase/config';

// ─── Exchange Rate ───────────────────────────────────────────────────────────
export const USD_TO_VND = 100; // 100 VNĐ = 1 Credit
const REAL_USD_TO_CREDIT = 255; // 1 USD = 25.500 VNĐ = 255 Credits

// ─── Pricing Table ───────────────────────────────────────────────────────────
// costPerUnitUSD actually represents costPerUnitCREDIT now to avoid widespread refactoring.
export const PRICING_TABLE: Record<string, {
  costPerUnitUSD: number;
  inputCostPerUnitUSD?: number;
  unit: string;
  label: string;
  category: 'video' | 'audio' | 'image' | 'text';
  note?: string;
}> = {
  // ══════════════════════════════════════════════════════════════════════════
  // ── VIDEO (per second of generated video) ──
  // ══════════════════════════════════════════════════════════════════════════
  'veo-3.1-fast-generate-preview': {
    costPerUnitUSD: 40.5, // 324 Credits / 8s
    unit: 'seconds',
    label: 'iGen Veo 3.1 Fast',
    category: 'video',
    note: '720p: 4s=162.0, 6s=243.0, 8s=324.0 | 1080p: 4s=194.4, 6s=291.6, 8s=388.8',
  },
  'veo-3.1-lite-generate-preview': {
    costPerUnitUSD: 20.25, // 162 Credits / 8s
    unit: 'seconds',
    label: 'iGen Veo 3.1 Lite',
    category: 'video',
    note: '720p: 4s=81.0, 6s=121.5, 8s=162.0 | 1080p: 4s=129.6, 6s=194.4, 8s=259.2',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── AUDIO / TTS (token-based pricing) ──
  // ══════════════════════════════════════════════════════════════════════════
  'gemini-2.5-flash-preview-tts': {
    costPerUnitUSD: 0.0005 * REAL_USD_TO_CREDIT,
    unit: 'seconds',
    label: 'iGen 2.5 Flash TTS',
    category: 'audio',
    note: 'Quy đổi từ $0.0005/giây gốc',
  },
  'gemini-2.5-pro-preview-tts': {
    costPerUnitUSD: 0.001 * REAL_USD_TO_CREDIT,
    unit: 'seconds',
    label: 'iGen 2.5 Pro TTS',
    category: 'audio',
    note: 'Quy đổi từ $0.001/giây gốc',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── IMAGE (iGen native image generation, in Credits from Spreadsheet) ──
  // ══════════════════════════════════════════════════════════════════════════
  'gemini-3.1-flash-image-preview': {
    costPerUnitUSD: 27.5,
    unit: 'count',
    label: 'iGen-3.1-flash-image-preview',
    category: 'image',
    note: '1K: 27.5| 2K: 42 (Tính theo Credit)',
  },
  'gemini-3-pro-image-preview': {
    costPerUnitUSD: 57,
    unit: 'count',
    label: 'iGen-3-pro-image-preview',
    category: 'image',
    note: '1K: 57 | 2K: 57 (Tính theo Credit)',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── TEXT (Prompt optimization, Custom Spreadsheet mapping) ──
  // ══════════════════════════════════════════════════════════════════════════
  'gemini-3.1-pro-preview': {
    costPerUnitUSD: 10,
    unit: 'count',
    label: 'Gemini 3.1 pro',
    category: 'text',
    note: 'Cố định mỗi lần tạo',
  },
  'gemini-3.1-flash-lite-preview': {
    costPerUnitUSD: 1.5,
    unit: 'count',
    label: 'Gemini 3.1 flash lite',
    category: 'text',
    note: 'Cố định mỗi lần tạo',
  },
  'gemini-3-flash-preview': {
    costPerUnitUSD: 2.5,
    unit: 'count',
    label: 'Gemini 3 flash',
    category: 'text',
    note: 'Cố định mỗi lần tạo',
  }
};

// ─── Usage Record Interface ─────────────────────────────────────────────────

export interface UsageRecord {
  userId: string;
  userEmail: string;
  type: 'image' | 'video' | 'audio' | 'text';
  model: string;
  modelLabel: string;
  amount: number;
  unit: string;
  estimatedCostUSD: number;
  estimatedCostVND: number;
  prompt: string;
  createdAt: any; // Firestore Timestamp
}

// ─── Helper: Estimate cost ──────────────────────────────────────────────────

export function estimateCost(model: string, amount: number, options?: { resolution?: string; inputAmount?: number }): {
  costUSD: number;
  costVND: number;
  unit: string;
  category: 'video' | 'audio' | 'image' | 'text';
  label: string;
} {
  const pricing = PRICING_TABLE[model];
  if (!pricing) {
    console.warn(`[UsageTracker] No pricing found for model: ${model}. Using fallback.`);
    return {
      costUSD: 0,
      costVND: 0,
      unit: 'unknown',
      category: 'text',
      label: model,
    };
  }

  const multiplier = pricing.unit === '1k tokens' ? 1000 : 1;
  const scaledAmount = amount / multiplier;
  
  let costUSD = pricing.costPerUnitUSD * scaledAmount;
  
  if (options?.inputAmount && pricing.inputCostPerUnitUSD) {
    const scaledInputAmount = options.inputAmount / multiplier;
    costUSD += pricing.inputCostPerUnitUSD * scaledInputAmount;
  }

  // 1. Resolution-based pricing for image models (mapped from spreadsheet)
  if (options?.resolution && pricing.category === 'image') {
    if (model === 'gemini-3.1-flash-image-preview') {
      if (options.resolution === '2K') costUSD = 42 * amount;
      // 1K default is 27.5
    }
    // Pro is always 57 for both 1K and 2K based on spreadsheet, so no change needed
  }

  // 2. Resolution-based pricing for video models (mapped from requested credit values)
  if (options?.resolution && pricing.category === 'video') {
    const is1080p = options.resolution === '1080p';
    
    if (model === 'veo-3.1-fast-generate-preview' && is1080p) {
       // 388.8 / 324 = 1.2
       costUSD = costUSD * 1.2;
    }
    if (model === 'veo-3.1-lite-generate-preview' && is1080p) {
       // 259.2 / 162 = 1.6
       costUSD = costUSD * 1.6;
    }
  }

  const costVND = Math.round(costUSD * USD_TO_VND);

  return {
    costUSD: Math.round(costUSD * 1_000_000) / 1_000_000, // 6 decimal places
    costVND,
    unit: pricing.unit,
    category: pricing.category,
    label: pricing.label,
  };
}

// ─── Estimate audio duration from text ──────────────────────────────────────
// Rough estimate: ~150 words per minute in English, ~120 in Vietnamese
// Average word length: ~5 chars. So ~3 chars/second for Vietnamese TTS.

export function estimateAudioDuration(text: string): number {
  const charCount = text.length;
  // ~12-15 chars per second for natural speech
  const estimatedSeconds = Math.ceil(charCount / 13);
  return Math.max(1, estimatedSeconds); // At least 1 second
}

// ─── Estimate text tokens from prompt ───────────────────────────────────────
// Rough estimate: 1 token ≈ 4 characters for English, ~2-3 for Vietnamese

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

// ─── Main: Record Usage ─────────────────────────────────────────────────────

export async function recordUsage(params: {
  userId: string;
  userEmail: string;
  type: 'image' | 'video' | 'audio' | 'text';
  model: string;
  amount: number; // Output amount or generic amount
  inputAmount?: number; // Added for separate input cost tracking
  prompt?: string;
  resolution?: string;
}): Promise<void> {
  try {
    const { costUSD, costVND, unit, label } = estimateCost(params.model, params.amount, { 
      resolution: params.resolution, 
      inputAmount: params.inputAmount 
    });

    const record: Omit<UsageRecord, 'createdAt'> = {
      userId: params.userId,
      userEmail: params.userEmail || 'unknown',
      type: params.type,
      model: params.model,
      modelLabel: label,
      amount: params.amount + (params.inputAmount ? params.inputAmount : 0), // Combined size for logs
      unit,
      estimatedCostUSD: costUSD,
      estimatedCostVND: costVND,
      prompt: (params.prompt || '').substring(0, 200), // Truncate for storage
    };

    await addDoc(collection(firestore, 'usageLogs'), {
      ...record,
      createdAt: serverTimestamp(),
    });

    // Deduct credits from user in USD (atomic decrement)
    if (costUSD > 0) {
      try {
        await updateDoc(doc(firestore, 'users', params.userId), {
          credits: increment(-costUSD),
        });
        console.log(`[UsageTracker] 💳 Deducted $${costUSD.toFixed(4)} credit from user ${params.userId}`);
      } catch (creditError) {
        console.error('[UsageTracker] ❌ Failed to deduct credits:', creditError);
      }
    }

    console.log(
      `[UsageTracker] ✅ Recorded: ${params.type} | ${label} | ${params.amount} ${unit} | $${costUSD.toFixed(4)} (~${costVND.toLocaleString()} ₫)`
    );
  } catch (error) {
    // Non-blocking: don't let tracking failure break generation
    console.error('[UsageTracker] ❌ Failed to record usage:', error);
  }
}
