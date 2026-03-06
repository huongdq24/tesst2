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
});
export type AiImageGenerationInput = z.infer<typeof AiImageGenerationInputSchema>;

const AiImageGenerationOutputSchema = z.object({
  imageUrl: z.string().describe('The generated image as a data URI.'),
});
export type AiImageGenerationOutput = z.infer<typeof AiImageGenerationOutputSchema>;

export async function aiImageGeneration(input: AiImageGenerationInput): Promise<AiImageGenerationOutput> {
  return aiImageGenerationFlow(input);
}

const aiImageGenerationPrompt = ai.definePrompt({
  name: 'aiImageGenerationPrompt',
  input: { schema: AiImageGenerationInputSchema },
  output: { schema: AiImageGenerationOutputSchema },
  prompt: `Generate an image based on the following description:

{{{promptText}}}`, // The prompt text will be directly passed to the model for image generation.
});

const aiImageGenerationFlow = ai.defineFlow(
  {
    name: 'aiImageGenerationFlow',
    inputSchema: AiImageGenerationInputSchema,
    outputSchema: AiImageGenerationOutputSchema,
  },
  async (input) => {
    // The prompt is used to format the input for the LLM, but the actual image generation
    // happens via a direct call to the Imagen model.
    const { output } = await aiImageGenerationPrompt(input);

    const { media } = await ai.generate({
      model: googleAI.model('imagen-4.0-fast-generate-001'),
      prompt: output.promptText, // Use the structured prompt text as input for the image generation model.
    });

    if (!media) {
      throw new Error('Image generation failed: No media output received.');
    }

    return { imageUrl: media.url };
  }
);
