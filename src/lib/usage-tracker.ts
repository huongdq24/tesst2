'use client';

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '@/lib/firebase/config';

// ─── Pricing Table (VNĐ) ────────────────────────────────────────────────────
// Based on actual Google Cloud Billing data provided by the user.
// These are cost-per-unit rates in VNĐ.

export const PRICING_TABLE: Record<string, {
  costPerUnit: number;
  unit: string;
  label: string;
  category: 'video' | 'audio' | 'image' | 'text';
}> = {
  // ── VIDEO ──
  'veo-3.1-generate-preview': {
    costPerUnit: 9141, // ₫/giây
    unit: 'seconds',
    label: 'Veo 3.1 HQ Video',
    category: 'video',
  },
  'veo-3.1-fast-generate-preview': {
    costPerUnit: 5223, // ₫/giây (tương đương upsampler rate)
    unit: 'seconds',
    label: 'Veo 3.1 Fast Video',
    category: 'video',
  },
  'veo-2.0-generate-001': {
    costPerUnit: 9141, // ₫/giây
    unit: 'seconds',
    label: 'Veo 2.0 Video',
    category: 'video',
  },

  // ── AUDIO (TTS) ──
  'gemini-2.5-flash-preview-tts': {
    costPerUnit: 3917, // ₫/giây (Fast Audio rate)
    unit: 'seconds',
    label: 'Gemini 2.5 Flash TTS',
    category: 'audio',
  },
  'gemini-2.5-pro-preview-tts': {
    costPerUnit: 10447, // ₫/giây (Standard Audio rate)
    unit: 'seconds',
    label: 'Gemini 2.5 Pro TTS',
    category: 'audio',
  },

  // ── IMAGE ──
  'gemini-3.1-flash-image-preview': {
    costPerUnit: 1.57, // ₫/output token
    unit: 'count',
    label: 'Gemini 3.1 Flash Image',
    category: 'image',
  },
  'gemini-3-pro-image-preview': {
    costPerUnit: 3.0, // ₫/output token (estimated)
    unit: 'count',
    label: 'Gemini 3 Pro Image',
    category: 'image',
  },
  'gemini-2.5-flash-image': {
    costPerUnit: 0.78, // ₫/output token
    unit: 'count',
    label: 'Gemini 2.5 Flash Image',
    category: 'image',
  },
  'imagen-4.0-fast-generate-001': {
    costPerUnit: 500, // ₫/ảnh (estimated per image)
    unit: 'count',
    label: 'Imagen 4 Fast',
    category: 'image',
  },
  'imagen-4.0-generate-001': {
    costPerUnit: 1000, // ₫/ảnh
    unit: 'count',
    label: 'Imagen 4 Standard',
    category: 'image',
  },
  'imagen-4.0-ultra-generate-001': {
    costPerUnit: 2000, // ₫/ảnh
    unit: 'count',
    label: 'Imagen 4 Ultra',
    category: 'image',
  },

  // ── TEXT (Prompt optimization, script generation) ──
  'gemini-3.1-pro-preview': {
    costPerUnit: 0.31, // ₫/token output
    unit: 'tokens',
    label: 'Gemini 3.1 Pro Text',
    category: 'text',
  },
  'gemini-3.1-flash-lite-preview': {
    costPerUnit: 0.08, // ₫/token output
    unit: 'tokens',
    label: 'Gemini 3.1 Flash Lite Text',
    category: 'text',
  },
  'gemini-3-flash-preview': {
    costPerUnit: 0.08, // ₫/token output
    unit: 'tokens',
    label: 'Gemini 3 Flash Text',
    category: 'text',
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
  estimatedCostVND: number;
  prompt: string;
  createdAt: any; // Firestore Timestamp
}

// ─── Helper: Estimate cost ──────────────────────────────────────────────────

export function estimateCost(model: string, amount: number): {
  costVND: number;
  unit: string;
  category: 'video' | 'audio' | 'image' | 'text';
  label: string;
} {
  const pricing = PRICING_TABLE[model];
  if (!pricing) {
    console.warn(`[UsageTracker] No pricing found for model: ${model}. Using fallback.`);
    return {
      costVND: 0,
      unit: 'unknown',
      category: 'text',
      label: model,
    };
  }

  return {
    costVND: Math.round(pricing.costPerUnit * amount),
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
}): Promise<void> {
  try {
    const { costVND, unit, label } = estimateCost(params.model, params.amount);

    const record: Omit<UsageRecord, 'createdAt'> = {
      userId: params.userId,
      userEmail: params.userEmail || 'unknown',
      type: params.type,
      model: params.model,
      modelLabel: label,
      amount: params.amount,
      unit,
      estimatedCostVND: costVND,
      prompt: (params.prompt || '').substring(0, 200), // Truncate for storage
    };

    await addDoc(collection(firestore, 'usageLogs'), {
      ...record,
      createdAt: serverTimestamp(),
    });

    console.log(
      `[UsageTracker] ✅ Recorded: ${params.type} | ${label} | ${params.amount} ${unit} | ~${costVND.toLocaleString()} ₫`
    );
  } catch (error) {
    // Non-blocking: don't let tracking failure break generation
    console.error('[UsageTracker] ❌ Failed to record usage:', error);
  }
}
