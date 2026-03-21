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
// 512 is not strictly in the enum, but we'll try to pass it anyway or default to omitting if it fails.
const RESOLUTION_MAP: Record<string, string> = {
  '512': '512', // Not officially in ImageSize enum but might be supported by the API via passthrough
  '1K': '1K',
  '2K': '2K',
  '4K': '4K',
};

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
    if (existingImageUris && existingImageUris.length > 0) {
      existingImageUris.forEach(uri => {
        promptParts.push({ media: { url: uri } });
      });
    }

    // Build response modalities
    const responseModalities = ['IMAGE', ...(outputFormat === 'IMAGE_AND_TEXT' ? ['TEXT'] : [])] as ('TEXT' | 'IMAGE' | 'AUDIO')[];

    let lastError: any = null;

    for (const model of uniqueModelsToTry) {
      try {
        console.log(`[ImageGen] Attempting generation with model: ${model}`);

        // Build image config
        // Resolution supported on gemini-3.1-flash-image-preview and gemini-3-pro-image-preview
        // NOT on gemini-2.5-flash-image (it uses a different internal config)
        const imageConfig: any = {
          aspectRatio: aspectRatio,
        };
        const supportsResolution = model.includes('3.1-flash-image') || model.includes('3-pro-image');
        if (resolution && supportsResolution) {
          // Genkit schema uses `imageSize` instead of `resolution`
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
          // Extract any text caption if IMAGE_AND_TEXT was requested
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
          error.message.toLowerCase().includes('rate limit')
        );

        if (isServiceUnavailable) {
          console.warn(`[ImageGen] Model ${model} is unavailable. Trying next model...`);
          continue;
        } else {
          break;
        }
      }
    }

    console.error("[ImageGen] All image generation attempts failed.", lastError);
    throw new Error(`Image generation failed on all available models. Last error: ${lastError?.message || 'An unknown error occurred.'}`);
  }
);
