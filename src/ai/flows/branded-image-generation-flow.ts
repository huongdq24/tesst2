'use server';
/**
 * @fileOverview Branded Image Generation Flow with Nano Banana + Imagen 4 Pipeline.
 * 
 * ARCHITECTURE:
 * ─────────────────────────────────────────────────────────────────────
 * When user selects an IMAGEN 4 model AND provides reference images:
 *   Step 1 (Nano Banana): gemini-2.5-flash-image analyzes reference images
 *          → produces an ultra-detailed text description of what the user wants
 *   Step 2 (Imagen 4): The selected Imagen model generates a high-quality image
 *          from the enhanced prompt (text-only, since Imagen doesn't support images)
 * 
 * When user selects a GEMINI IMAGE model (or no reference images):
 *   Single step: Generate directly with the selected Gemini model (multimodal)
 * ─────────────────────────────────────────────────────────────────────
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
  resolution: z.string().optional().describe('Image resolution: "512", "1K", "2K", "4K". Only for Gemini image models.'),
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

// Resolution mapping
const RESOLUTION_MAP: Record<string, string> = {
  '512': '512',
  '1K': '1K',
  '2K': '2K',
  '4K': '4K',
};

function isImagenModel(modelName: string): boolean {
  return modelName.startsWith('imagen-');
}

/**
 * Helper to convert a URL to a base64 data URI.
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * STEP 1 of the Nano Banana + Imagen pipeline:
 * Use gemini-2.5-flash-image (Nano Banana) to analyze reference images
 * and produce an ultra-detailed English prompt for Imagen 4.
 * 
 * This bridges the gap: Imagen 4 can't see images, but Nano Banana can.
 * Nano Banana describes what it sees → Imagen 4 generates from that description.
 */
async function enhancePromptWithNanoBanana(
  localAi: ReturnType<typeof genkit>,
  userPrompt: string,
  imageDataUris: string[],
): Promise<string> {
  const NANO_BANANA_MODEL = 'gemini-2.5-flash-image';
  const NANO_BANANA_TIMEOUT_MS = 30000; // 30s timeout for analysis

  console.log(`[ImageGen] 🍌 Step 1: Nano Banana analyzing ${imageDataUris.length} reference image(s)...`);

  const promptParts: Part[] = [];

  // Add all reference images
  for (const dataUri of imageDataUris) {
    promptParts.push({ media: { url: dataUri } });
  }

  // Add the analysis instruction
  promptParts.push({
    text: `You are a visual analysis expert. The user wants to generate a NEW image using an AI model (Imagen 4) that can ONLY accept text prompts (no image input).

Your job: Analyze the reference image(s) above and combine your understanding with the user's request to create ONE ultra-detailed English prompt that Imagen 4 can use to generate an image that matches the user's vision.

USER'S REQUEST: "${userPrompt}"

RULES:
1. Describe in extreme detail: colors, textures, materials, lighting, composition, style, mood
2. If the reference shows a person: describe age, ethnicity, hair, outfit, pose, expression in detail (do NOT name real people)
3. If the reference shows a product/object: describe shape, material, brand elements, packaging
4. If the reference shows a scene/environment: describe layout, architecture, atmosphere
5. Incorporate the user's specific request INTO your detailed description
6. Write as ONE continuous prompt paragraph in natural English (not a list)
7. End with quality boosters: "high-resolution, professional photography, 8K ultra-detailed, studio lighting"
8. Keep the prompt under 500 words
9. Output ONLY the final prompt text. No explanations, no headings, no formatting.`
  });

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Nano Banana analysis timeout')), NANO_BANANA_TIMEOUT_MS);
    });

    const generatePromise = localAi.generate({
      model: googleAI.model(NANO_BANANA_MODEL as any),
      prompt: promptParts,
      config: {
        temperature: 0.3, // Low temp for accurate description
      },
    });

    const result = await Promise.race([generatePromise, timeoutPromise]);
    const enhancedPrompt = result.text?.trim();

    if (enhancedPrompt && enhancedPrompt.length > 50) {
      console.log(`[ImageGen] 🍌 Nano Banana enhanced prompt (${enhancedPrompt.length} chars): "${enhancedPrompt.substring(0, 150)}..."`);
      return enhancedPrompt;
    } else {
      console.warn(`[ImageGen] 🍌 Nano Banana returned weak output. Falling back to original prompt.`);
      return userPrompt;
    }
  } catch (error: any) {
    console.error(`[ImageGen] 🍌 Nano Banana analysis failed: ${error.message}. Using original prompt.`);
    return userPrompt;
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

    const localAi = getOrCreateGenkit(apiKey);
    const selectedModel = modelName || 'gemini-3.1-flash-image-preview';
    const hasReferenceImages = existingImageUris && existingImageUris.length > 0;

    // ===== CONVERT REFERENCE IMAGES TO DATA URIs =====
    const imageDataUris: string[] = [];
    if (hasReferenceImages) {
      const imageConversions = await Promise.all(
        existingImageUris!.map(async (uri) => {
          if (uri.startsWith('data:')) return uri;
          if (uri.startsWith('http://') || uri.startsWith('https://')) return await urlToDataUri(uri);
          return null;
        })
      );
      imageConversions.forEach((dataUri) => {
        if (dataUri) imageDataUris.push(dataUri);
      });
    }

    // ===== DETERMINE PROMPT BASED ON MODEL TYPE =====
    let finalTextPrompt = generationPrompt;

    if (isImagenModel(selectedModel) && imageDataUris.length > 0) {
      // ✨ NANO BANANA + IMAGEN PIPELINE ✨
      // Step 1: Nano Banana analyzes reference images → enhanced text prompt
      console.log(`[ImageGen] 🔗 Detected Imagen model + reference images → activating Nano Banana pipeline`);
      finalTextPrompt = await enhancePromptWithNanoBanana(localAi, generationPrompt, imageDataUris);
    }

    // ===== BUILD PROMPT PARTS (for Gemini models) =====
    const promptParts: Part[] = [{ text: generationPrompt }];
    imageDataUris.forEach((dataUri) => {
      promptParts.push({ media: { url: dataUri } });
    });

    // ===== FALLBACK MODEL LIST =====
    const allFallbackModels = [
      'gemini-3.1-flash-image-preview',
      'gemini-3-pro-image-preview',
      'gemini-2.5-flash-image',
      'gemini-2.0-flash-image-generation',
      'imagen-4.0-fast-generate-001',
      'imagen-4.0-generate-001',
    ];

    const modelsToTry = [selectedModel, ...allFallbackModels];
    const uniqueModelsToTry = [...new Set(modelsToTry)];

    const responseModalities = ['IMAGE', ...(outputFormat === 'IMAGE_AND_TEXT' ? ['TEXT'] : [])] as ('TEXT' | 'IMAGE' | 'AUDIO')[];
    const PER_MODEL_TIMEOUT_MS = 90000;

    // Progressive backoff delays (increases with each failure)
    const getBackoffDelay = (failCount: number, baseMs: number) => {
      return Math.min(baseMs * (1 + failCount * 0.6), 15000); // cap at 15s
    };

    let lastError: any = null;
    let failedModelCount = 0;
    let all503 = true; // Track if all failures are 503

    const tryModel = async (model: string): Promise<{ generatedImageUri: string; caption?: string } | null> => {
      console.log(`[ImageGen] Attempting generation with model: ${model} (${failedModelCount} previous failures)`);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout after ${PER_MODEL_TIMEOUT_MS / 1000}s for model ${model}`)), PER_MODEL_TIMEOUT_MS);
      });

      let generatePromise: Promise<any>;

      if (isImagenModel(model)) {
        const imagenPrompt = (model === selectedModel && finalTextPrompt !== generationPrompt)
          ? finalTextPrompt
          : generationPrompt;

        console.log(`[ImageGen] 🖼️ Imagen mode: text-only prompt (${imagenPrompt.length} chars)`);
        generatePromise = localAi.generate({
          model: googleAI.model(model as any),
          prompt: imagenPrompt,
          config: {
            aspectRatio: aspectRatio,
            numberOfImages: 1,
          },
        });
      } else {
        const imageConfig: any = { aspectRatio };
        const supportsResolution = model.includes('3.1-flash-image') || model.includes('3-pro-image');
        if (resolution && supportsResolution) {
          imageConfig.imageSize = RESOLUTION_MAP[resolution] || resolution;
        }

        generatePromise = localAi.generate({
          model: googleAI.model(model as any),
          prompt: promptParts,
          config: {
            responseModalities,
            imageConfig,
            temperature: temperature ?? 1,
          },
        });
      }

      const result = await Promise.race([generatePromise, timeoutPromise]);

      if (result.media) {
        console.log(`[ImageGen] ✅ Successfully generated image with model: ${model}`);
        const caption = outputFormat === 'IMAGE_AND_TEXT' ? result.text : undefined;
        return { generatedImageUri: result.media.url, caption };
      } else {
        const reason = result.finishMessage || 'Model returned no media.';
        throw new Error(reason);
      }
    };

    // ===== FIRST PASS: Try all models with progressive backoff =====
    for (const model of uniqueModelsToTry) {
      try {
        const result = await tryModel(model);
        if (result) return result;
      } catch (error: any) {
        lastError = error;
        failedModelCount++;
        console.error(`[ImageGen] ❌ Generation with model ${model} failed:`, error.message);
        
        const errorMsg = error.message || '';

        if (errorMsg.includes('503') || errorMsg.toLowerCase().includes('unavailable')) {
          const delay = getBackoffDelay(failedModelCount, 4000);
          console.warn(`[ImageGen] Model ${model} overloaded (503). Next model after ${Math.round(delay / 1000)}s...`);
          await sleep(delay);
          continue;
        }

        if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.toLowerCase().includes('rate limit')) {
          all503 = false;
          const delay = getBackoffDelay(failedModelCount, 5000);
          console.warn(`[ImageGen] Model ${model} rate limited (429). Next model after ${Math.round(delay / 1000)}s...`);
          await sleep(delay);
          continue;
        }

        // Non-transient errors: don't count as 503
        all503 = false;

        if (errorMsg.includes('400') || errorMsg.includes('INVALID_ARGUMENT')) {
          console.warn(`[ImageGen] Model ${model} rejected params (400). Trying next...`);
          continue;
        }

        if (errorMsg.includes('403') || errorMsg.includes('404')) {
          console.error(`[ImageGen] Model ${model}: ${errorMsg.includes('403') ? '403 Forbidden' : '404 Not Found'}. Trying next...`);
          continue;
        }

        if (errorMsg.includes('Timeout')) {
          console.warn(`[ImageGen] Model ${model} timed out. Trying next...`);
          continue;
        }
        
        console.warn(`[ImageGen] Unknown error for model ${model}, trying next...`);
        continue;
      }
    }

    // ===== SECOND PASS: If all failures were 503 (transient), wait longer and retry top models =====
    if (all503 && failedModelCount > 0) {
      console.log(`[ImageGen] 🔄 All ${failedModelCount} models returned 503. Waiting 15s before second pass...`);
      await sleep(15000);

      const retryModels = uniqueModelsToTry.slice(0, 3); // Retry top 3 models
      for (const model of retryModels) {
        try {
          console.log(`[ImageGen] 🔄 RETRY PASS: Attempting ${model}...`);
          const result = await tryModel(model);
          if (result) return result;
        } catch (error: any) {
          lastError = error;
          console.error(`[ImageGen] ❌ RETRY PASS: ${model} failed again:`, error.message);
          await sleep(5000);
          continue;
        }
      }
    }

    console.error("[ImageGen] All image generation attempts failed.", lastError);
    
    const errorDetail = lastError?.message || 'An unknown error occurred.';
    let userMessage = `Tạo ảnh thất bại trên tất cả ${uniqueModelsToTry.length} model.`;
    
    if (errorDetail.includes('503') || errorDetail.toLowerCase().includes('unavailable')) {
      userMessage += ' Tất cả các model đang quá tải. Vui lòng thử lại sau 1-2 phút.';
    } else if (errorDetail.includes('429') || errorDetail.includes('RESOURCE_EXHAUSTED')) {
      userMessage += ' API key đã hết lượt gọi (quota). Vui lòng thử lại sau hoặc sử dụng API key khác.';
    } else {
      userMessage += ` Lỗi cuối: ${errorDetail}`;
    }
    
    throw new Error(userMessage);
  }
);
