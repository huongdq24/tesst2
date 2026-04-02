'use server';
/**
 * @fileOverview This file defines a Genkit flow for generating images from a text prompt.
 * It supports both Gemini image models and Imagen 4 models with retry/fallback mechanism.
 *
 * - aiImageGeneration - A function that handles the image generation process.
 * - AiImageGenerationInput - The input type for the aiImageGeneration function.
 * - AiImageGenerationOutput - The return type for the aiImageGeneration function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

const AiImageGenerationInputSchema = z.object({
  promptText: z.string().describe('A detailed text description of the image to generate.'),
  aspectRatio: z.string().optional().default('1:1'),
  modelName: z.string().optional().describe('The model to use for generation.'),
});
export type AiImageGenerationInput = z.infer<typeof AiImageGenerationInputSchema>;

const AiImageGenerationOutputSchema = z.object({
  imageUrl: z.string().describe('The generated image as a data URI.'),
});
export type AiImageGenerationOutput = z.infer<typeof AiImageGenerationOutputSchema>;

export async function aiImageGeneration(input: AiImageGenerationInput): Promise<AiImageGenerationOutput> {
  return aiImageGenerationFlow(input);
}

/**
 * Check if a model name belongs to the Imagen family.
 */
function isImagenModel(modelName: string): boolean {
  return modelName.startsWith('imagen-');
}

const aiImageGenerationFlow = ai.defineFlow(
  {
    name: 'aiImageGenerationFlow',
    inputSchema: AiImageGenerationInputSchema,
    outputSchema: AiImageGenerationOutputSchema,
  },
  async (input) => {
    // Build fallback model list
    const allModels = [
      input.modelName || 'imagen-4.0-generate-001',
      'imagen-4.0-generate-001',
      'imagen-4.0-fast-generate-001',
      'gemini-2.5-flash-image',
    ];
    const uniqueModels = [...new Set(allModels)];

    const TIMEOUT_MS = 90000; // 90 seconds per attempt
    let lastError: any = null;

    for (const model of uniqueModels) {
      try {
        console.log(`[AiImageGen] Attempting generation with model: ${model}`);

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Timeout after ${TIMEOUT_MS / 1000}s for model ${model}`)), TIMEOUT_MS);
        });

        let generatePromise: Promise<any>;

        if (isImagenModel(model)) {
          // Imagen models: text-only, different config
          generatePromise = ai.generate({
            model: googleAI.model(model as any),
            prompt: input.promptText,
            config: {
              aspectRatio: input.aspectRatio,
              numberOfImages: 1,
            },
          });
        } else {
          // Gemini image models: support responseModalities
          generatePromise = ai.generate({
            model: googleAI.model(model as any),
            prompt: input.promptText,
            config: {
              responseModalities: ['IMAGE'] as ('TEXT' | 'IMAGE' | 'AUDIO')[],
              imageConfig: {
                aspectRatio: input.aspectRatio,
              },
              temperature: 1,
            },
          });
        }

        const result = await Promise.race([generatePromise, timeoutPromise]);

        if (!result.media) {
          throw new Error(`Model ${model} returned no media output.`);
        }

        console.log(`[AiImageGen] Successfully generated image with model: ${model}`);
        return { imageUrl: result.media.url };
      } catch (error: any) {
        lastError = error;
        console.warn(`[AiImageGen] Model ${model} failed: ${error.message}. Trying next fallback...`);

        // Add delay for overloaded/rate-limited models
        if (error.message?.includes('503') || error.message?.toLowerCase().includes('unavailable')) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }

    throw new Error(`Image generation failed on all models. Last error: ${lastError?.message || 'Unknown error'}`);
  }
);
