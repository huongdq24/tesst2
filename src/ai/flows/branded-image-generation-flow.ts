'use server';
/**
 * @fileOverview This file defines a Genkit flow for generating a SINGLE branded image from text and reference images.
 * It implements a robust retry-with-fallback mechanism to handle API service availability issues.
 * Supports full config options: resolution, temperature, outputFormat (for all 3 Gemini image models).
 */

import { ai } from '@/ai/genkit';
import { genkit, z } from 'genkit';
import type { Part } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { Buffer } from 'buffer';

// Cache Genkit instances per API key to avoid re-creation
const genkitCache = new Map<string, ReturnType<typeof genkit>>();
function getOrCreateGenkit(apiKey?: string) {
  if (!apiKey) return ai;
  if (!genkitCache.has(apiKey)) {
    genkitCache.set(apiKey, genkit({ plugins: [googleAI({ apiKey })] }));
  }
  return genkitCache.get(apiKey)!;
}

// Define the input schema for the flow.
const BrandedImageGenerationInputSchema = z.object({
  existingImageUris: z.array(z.string()).optional().describe('An array of reference image URLs (data URI or public https).'),
  generationPrompt: z.string().describe('The text prompt for image generation.'),
  aspectRatio: z.string().optional().default('1:1').describe('The desired aspect ratio for the generated images.'),
  modelName: z.string().optional().describe('The user-preferred model for generation.'),
  apiKey: z.string().optional().describe("The user's Gemini API Key."),
  // NEW: Extended config options matching AI Studio
  resolution: z.string().optional().describe('Image resolution: "512", "1K", "2K", "4K". Only for Gemini 2.5 Flash model.'),
  temperature: z.number().optional().default(1).describe('Model temperature (creativity), 0-2.'),
  outputFormat: z.enum(['IMAGE_ONLY', 'IMAGE_AND_TEXT']).optional().default('IMAGE_ONLY').describe('Output modalities: image only or image+text.'),
});
export type BrandedImageGenerationInput = z.infer<typeof BrandedImageGenerationInputSchema>;

// Define the output schema for the flow.
const BrandedImageGenerationOutputSchema = z.object({
  generatedImageUri: z.string().describe('The generated image as a data URI.'),
  caption: z.string().optional().describe('Optional caption/text generated alongside the image.'),
});
export type BrandedImageGenerationOutput = z.infer<typeof BrandedImageGenerationOutputSchema>;

// This is the server action entry point that calls the Genkit flow.
export async function brandedImageGeneration(
  input: BrandedImageGenerationInput
): Promise<BrandedImageGenerationOutput> {
  return brandedImageGenerationFlow(input);
}

// Resolution mapping to Genkit's `imageSize` enum (which expects '1K', '2K', '4K').
const RESOLUTION_MAP: Record<string, string> = {
  '512': '512',
  '1K': '1K',
  '2K': '2K',
  '4K': '4K',
};

/**
 * FIX #4: Helper to convert a URL (e.g. Firebase Storage) to a base64 data URI.
 * This is necessary because Genkit/Google AI cannot directly access Firebase Storage URLs.
 * Includes a timeout to prevent hanging on slow/failing URLs.
 */
async function urlToDataUri(url: string, timeoutMs: number = 15000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[ImageGen] Failed to fetch image from URL: ${url}. Status: ${response.statusText}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const base64Data = Buffer.from(buffer).toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    return `data:${mimeType};base64,${base64Data}`;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error(`[ImageGen] Timeout fetching image URL: ${url}`);
    } else {
      console.error(`[ImageGen] Error fetching image URL ${url}:`, error.message);
    }
    return null;
  }
}

const brandedImageGenerationFlow = ai.defineFlow(
  {
    name: 'brandedImageGenerationFlow',
    inputSchema: BrandedImageGenerationInputSchema,
    outputSchema: BrandedImageGenerationOutputSchema,
  },
  async (input) => {
    const {
      existingImageUris,
      generationPrompt,
      aspectRatio,
      modelName,
      apiKey,
      resolution,
      temperature,
      outputFormat,
    } = input;

    // Use per-key Genkit instance
    const localAi = getOrCreateGenkit(apiKey);

    // Define a sequence of models to try (user's choice first, then fallbacks).
    const modelsToTry = [
      modelName || 'gemini-3.1-flash-image-preview',
      'gemini-3.1-flash-image-preview',
      'gemini-2.5-flash-image',
    ];
    const uniqueModelsToTry = [...new Set(modelsToTry)];

    // Construct the prompt parts for the AI model.
    const promptParts: Part[] = [{ text: generationPrompt }];
    
    // FIX #4: Convert all image URLs to base64 data URIs before passing to Genkit.
    // Firebase Storage URLs are not accessible by Google AI directly.
    if (existingImageUris && existingImageUris.length > 0) {
      const imageConversions = await Promise.all(
        existingImageUris.map(async (uri) => {
          if (uri.startsWith('data:')) {
            // Already a data URI, use as-is
            return uri;
          } else if (uri.startsWith('http://') || uri.startsWith('https://')) {
            // Convert remote URL to data URI
            return await urlToDataUri(uri);
          }
          return null;
        })
      );

      imageConversions.forEach((dataUri) => {
        if (dataUri) {
          promptParts.push({ media: { url: dataUri } });
        }
      });
    }

    // Build response modalities
    const responseModalities = ['IMAGE', ...(outputFormat === 'IMAGE_AND_TEXT' ? ['TEXT'] : [])] as ('TEXT' | 'IMAGE' | 'AUDIO')[];

    let lastError: any = null;

    for (const model of uniqueModelsToTry) {
      try {
        console.log(`[ImageGen] Attempting generation with model: ${model}`);

        // Build image config
        const imageConfig: any = {
          aspectRatio: aspectRatio,
        };
        const supportsResolution = model.includes('3.1-flash-image') || model.includes('3-pro-image');
        if (resolution && supportsResolution) {
          imageConfig.imageSize = RESOLUTION_MAP[resolution] || resolution;
        }
        
        const result = await localAi.generate({
          model: googleAI.model(model as any),
          prompt: promptParts,
          config: {
            responseModalities,
            imageConfig,
            temperature: temperature ?? 1,
          },
        });

        if (result.media) {
          console.log(`[ImageGen] Successfully generated image with model: ${model}`);
          const caption = outputFormat === 'IMAGE_AND_TEXT' ? result.text : undefined;
          return { generatedImageUri: result.media.url, caption };
        } else {
          const reason = result.finishMessage || 'Model returned no media.';
          lastError = new Error(reason);
          console.warn(`[ImageGen] Model ${model} returned no media. Reason: ${reason}. Trying next model...`);
        }
      } catch (error: any) {
        lastError = error;
        console.error(`[ImageGen] Generation with model ${model} failed:`, error.message);
        
        const isServiceUnavailable = error.message && (
          error.message.includes('503') || 
          error.message.toLowerCase().includes('unavailable') || 
          error.message.toLowerCase().includes('rate limit') ||
          error.message.includes('429') ||
          error.message.includes('RESOURCE_EXHAUSTED')
        );

        if (isServiceUnavailable) {
          console.warn(`[ImageGen] Model ${model} is unavailable. Trying next model...`);
          continue;
        } else {
          // Non-retryable error (e.g. 400, 403), fail fast - don't try other models
          break;
        }
      }
    }

    console.error("[ImageGen] All image generation attempts failed.", lastError);
    throw new Error(`Image generation failed on all available models. Last error: ${lastError?.message || 'An unknown error occurred.'}`);
  }
);
