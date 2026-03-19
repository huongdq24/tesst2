'use server';
/**
 * @fileOverview This file defines a Genkit flow for generating images from a text prompt.
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
  // Adding aspectRatio to the input schema for more control, defaulting to '1:1'
  aspectRatio: z.string().optional().default('1:1'),
});
export type AiImageGenerationInput = z.infer<typeof AiImageGenerationInputSchema>;

const AiImageGenerationOutputSchema = z.object({
  imageUrl: z.string().describe('The generated image as a data URI.'),
});
export type AiImageGenerationOutput = z.infer<typeof AiImageGenerationOutputSchema>;

export async function aiImageGeneration(input: AiImageGenerationInput): Promise<AiImageGenerationOutput> {
  return aiImageGenerationFlow(input);
}

const aiImageGenerationFlow = ai.defineFlow(
  {
    name: 'aiImageGenerationFlow',
    inputSchema: AiImageGenerationInputSchema,
    outputSchema: AiImageGenerationOutputSchema,
  },
  async (input) => {
    // This flow now directly calls the Imagen model using the provided prompt,
    // which is the correct and more reliable pattern.
    const { media } = await ai.generate({
      model: googleAI.model('imagen-4.0-generate-001'),
      prompt: input.promptText, // Use the original input prompt directly
      config: {
        // Pass the aspect ratio from the input to the model.
        aspectRatio: input.aspectRatio,
        // The current implementation and output schema support one image.
        numberOfImages: 1,
      },
    });

    if (!media) {
      throw new Error('Image generation failed: No media output received.');
    }

    return { imageUrl: media.url };
  }
);
