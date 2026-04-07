'use client';

import { collection, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore';
import { firestore } from '@/lib/firebase/config';

// ─── Exchange Rate ───────────────────────────────────────────────────────────
export const USD_TO_VND = 25_500;

// ─── Pricing Table ───────────────────────────────────────────────────────────
// Source: https://ai.google.dev/pricing (Updated 2026-04-07)
// All prices are in USD. VNĐ is calculated at runtime using USD_TO_VND.
//
// For token-based models: costPerUnitUSD = output cost per token (USD)
// For per-second models:  costPerUnitUSD = cost per second (USD)
// For per-image models:   costPerUnitUSD = cost per image (USD)

export const PRICING_TABLE: Record<string, {
  costPerUnitUSD: number;
  unit: string;
  label: string;
  category: 'video' | 'audio' | 'image' | 'text';
  note?: string;
}> = {
  // ══════════════════════════════════════════════════════════════════════════
  // ── VIDEO (per second of generated video) ──
  // ══════════════════════════════════════════════════════════════════════════
  'veo-3.1-generate-preview': {
    costPerUnitUSD: 0.40, // $0.40/second
    unit: 'seconds',
    label: 'Veo 3.1 HQ Video',
    category: 'video',
    note: 'Standard quality, highest fidelity',
  },
  'veo-3.1-fast-generate-preview': {
    costPerUnitUSD: 0.15, // $0.15/second
    unit: 'seconds',
    label: 'Veo 3.1 Fast Video',
    category: 'video',
    note: 'Fast generation, good quality',
  },
  'veo-3.1-lite-generate-preview': {
    costPerUnitUSD: 0.05, // $0.05/second (720p)
    unit: 'seconds',
    label: 'Veo 3.1 Lite Video',
    category: 'video',
    note: '720p, budget-friendly',
  },
  'veo-3.0-generate-001': {
    costPerUnitUSD: 0.40, // same tier as 3.1 standard
    unit: 'seconds',
    label: 'Veo 3.0 Video',
    category: 'video',
  },
  'veo-3.0-fast-generate-001': {
    costPerUnitUSD: 0.15, // same tier as 3.1 fast
    unit: 'seconds',
    label: 'Veo 3.0 Fast Video',
    category: 'video',
  },
  'veo-2.0-generate-001': {
    costPerUnitUSD: 0.35, // $0.35/second
    unit: 'seconds',
    label: 'Veo 2.0 Video',
    category: 'video',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── AUDIO / TTS (token-based pricing) ──
  // Output audio tokens are the primary cost driver.
  // We estimate: ~50 output tokens per second of generated audio.
  // So we convert to a per-second cost for simplicity.
  //
  // gemini-2.5-flash-preview-tts:
  //   Input: $0.50/1M tokens, Output: $10.00/1M tokens
  //   → Output per token: $0.000010
  //   → ~50 tokens/sec → $0.0005/sec
  //
  // gemini-2.5-pro-preview-tts:
  //   Input: $1.00/1M tokens, Output: $20.00/1M tokens
  //   → Output per token: $0.000020
  //   → ~50 tokens/sec → $0.001/sec
  // ══════════════════════════════════════════════════════════════════════════
  'gemini-2.5-flash-preview-tts': {
    costPerUnitUSD: 0.0005, // ~$0.0005/second of audio
    unit: 'seconds',
    label: 'Gemini 2.5 Flash TTS',
    category: 'audio',
    note: 'Output: $10/1M tokens, ~50 tokens/sec',
  },
  'gemini-2.5-pro-preview-tts': {
    costPerUnitUSD: 0.001, // ~$0.001/second of audio
    unit: 'seconds',
    label: 'Gemini 2.5 Pro TTS',
    category: 'audio',
    note: 'Output: $20/1M tokens, ~50 tokens/sec',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── IMAGE (Gemini native image generation) ──
  // Pricing is per output image based on resolution/token count.
  //
  // gemini-3.1-flash-image-preview: $60/1M output tokens
  //   0.5K→747 tokens=$0.045, 1K→1120=$0.067, 2K→1680=$0.101, 4K→2520=$0.151
  //   Default (1K): $0.067/image
  //
  // gemini-3-pro-image-preview: $120/1M output tokens
  //   1K→1120 tokens=$0.134, 2K→1120=$0.134, 4K→2000=$0.24
  //   Default (1K): $0.134/image
  //
  // gemini-2.5-flash-image: $30/1M output tokens
  //   1K→1290 tokens=$0.039
  //   Default: $0.039/image
  // ══════════════════════════════════════════════════════════════════════════
  'gemini-3.1-flash-image-preview': {
    costPerUnitUSD: 0.067, // $0.067/image at 1K resolution (default)
    unit: 'count',
    label: 'Gemini 3.1 Flash Image',
    category: 'image',
    note: '$60/1M output tokens. 1K=1120tk=$0.067',
  },
  'gemini-3-pro-image-preview': {
    costPerUnitUSD: 0.134, // $0.134/image at 1K resolution
    unit: 'count',
    label: 'Gemini 3 Pro Image',
    category: 'image',
    note: '$120/1M output tokens. 1K=1120tk=$0.134',
  },


  // ── IMAGE (Imagen 4 — flat per-image pricing) ──
  'imagen-4.0-fast-generate-001': {
    costPerUnitUSD: 0.02, // $0.02/image
    unit: 'count',
    label: 'Imagen 4 Fast',
    category: 'image',
  },
  'imagen-4.0-generate-001': {
    costPerUnitUSD: 0.04, // $0.04/image
    unit: 'count',
    label: 'Imagen 4 Standard',
    category: 'image',
  },
  'imagen-4.0-ultra-generate-001': {
    costPerUnitUSD: 0.06, // $0.06/image
    unit: 'count',
    label: 'Imagen 4 Ultra',
    category: 'image',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── TEXT (Prompt optimization, script generation) ──
  // Cost is per OUTPUT token (the main cost driver).
  // Input tokens are much cheaper and are omitted for simplicity.
  //
  // gemini-3.1-pro-preview:       Output $12.00/1M → $0.000012/token
  // gemini-3.1-flash-lite-preview: Output $1.50/1M  → $0.0000015/token
  // gemini-3-flash-preview:       Output $3.00/1M  → $0.000003/token
  // ══════════════════════════════════════════════════════════════════════════
  'gemini-3.1-pro-preview': {
    costPerUnitUSD: 0.000012, // $12.00/1M output tokens
    unit: 'tokens',
    label: 'Gemini 3.1 Pro Text',
    category: 'text',
    note: 'Input: $2/1M, Output: $12/1M',
  },
  'gemini-3.1-flash-lite-preview': {
    costPerUnitUSD: 0.0000015, // $1.50/1M output tokens
    unit: 'tokens',
    label: 'Gemini 3.1 Flash Lite Text',
    category: 'text',
    note: 'Input: $0.25/1M, Output: $1.50/1M',
  },
  'gemini-3-flash-preview': {
    costPerUnitUSD: 0.000003, // $3.00/1M output tokens
    unit: 'tokens',
    label: 'Gemini 3 Flash Text',
    category: 'text',
    note: 'Input: $0.50/1M, Output: $3.00/1M',
  },
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

export function estimateCost(model: string, amount: number, options?: { resolution?: string }): {
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

  let costUSD = pricing.costPerUnitUSD * amount;

  // Apply resolution-based pricing multipliers for Gemini image models
  if (options?.resolution && pricing.category === 'image') {
    if (model === 'gemini-3.1-flash-image-preview') {
      if (options.resolution === '2K') costUSD = 0.101 * amount;
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
  amount: number;
  prompt?: string;
  resolution?: string;
}): Promise<void> {
  try {
    const { costUSD, costVND, unit, label } = estimateCost(params.model, params.amount, { resolution: params.resolution });

    const record: Omit<UsageRecord, 'createdAt'> = {
      userId: params.userId,
      userEmail: params.userEmail || 'unknown',
      type: params.type,
      model: params.model,
      modelLabel: label,
      amount: params.amount,
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
