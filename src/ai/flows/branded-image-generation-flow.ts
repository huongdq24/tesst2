'use server';
/**
 * @fileOverview A Genkit flow for generating images, with optional support for a reference image (image-to-image).
 *
 * - brandedImageGeneration - A function that handles the image generation process.
 * - BrandedImageGenerationInput - The input type for the brandedImageGeneration function.
 * - BrandedImageGenerationOutput - The return type for the brandedImageGeneration function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

// Define the input schema
const BrandedImageGenerationInputSchema = z.object({
  existingImageUri: z
    .string()
    .optional()
    .describe(
      "An optional reference image as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'. This image will be used as a visual reference."
    ),
  generationPrompt: z
    .string()
    .describe(
      'A specific text prompt describing the content of the image to be generated (e.g., "a professional headshot", "a minimalist logo for a tech startup").'
    ),
});
export type BrandedImageGenerationInput = z.infer<
  typeof BrandedImageGenerationInputSchema
>;

// Define the output schema
const BrandedImageGenerationOutputSchema = z.object({
  generatedImageUri: z
    .string()
    .describe(
      "The generated image as a data URI, including a MIME type and Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type BrandedImageGenerationOutput = z.infer<
  typeof BrandedImageGenerationOutputSchema
>;

// Wrapper function for the flow
export async function brandedImageGeneration(
  input: BrandedImageGenerationInput
): Promise<BrandedImageGenerationOutput> {
  return brandedImageGenerationFlow(input);
}

// Define the Genkit prompt for multimodal input (used with Gemini)
const brandedImageGenerationPrompt = ai.definePrompt({
  name: 'brandedImageGenerationPrompt',
  input: {schema: BrandedImageGenerationInputSchema},
  output: {schema: BrandedImageGenerationOutputSchema},
  prompt: `You are an AI image generation assistant. Your task is to generate an image based on the user's prompt and an optional reference image.

{{#if existingImageUri}}
Use the following image as a reference or starting point for the generation.
{{media url=existingImageUri}}
{{/if}}

The user's request is:
{{{generationPrompt}}}

Generate the image according to the user's request.
`,
});

// Define the Genkit flow with logic to switch models
const brandedImageGenerationFlow = ai.defineFlow(
  {
    name: 'brandedImageGenerationFlow',
    inputSchema: BrandedImageGenerationInputSchema,
    outputSchema: BrandedImageGenerationOutputSchema,
  },
  async (input) => {
    // The new model `gemini-3.1-flash-image-preview` is multi-modal and can handle both
    // text-to-image and image-to-image generation through a single interface.
    const { media } = await ai.generate({
      model: 'googleai/gemini-3.1-flash-image-preview', // Use the requested Gemini 3.1 Flash Image model
      prompt: brandedImageGenerationPrompt(input), // The prompt is designed to handle optional image URI
      config: {
        responseModalities: ['TEXT', 'IMAGE'], // Required for Gemini image generation
      },
    });

    if (!media || !media.url) {
      throw new Error('Failed to generate image or media URL is missing.');
    }

    return {
      generatedImageUri: media.url,
    };
  }
);
