'use server';
/**
 * @fileOverview A Genkit flow for generating branded images or avatars based on user-provided visual elements and style preferences.
 *
 * - brandedImageGeneration - A function that handles the branded image generation process.
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
      "An optional existing image (e.g., logo, avatar) as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'. This image will be used as a visual reference for brand consistency."
    ),
  stylePreferences: z
    .string()
    .describe(
      'A detailed description of the desired visual style, including colors, mood, typography, and specific themes to reflect the personal brand identity.'
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
  prompt: `{{#if existingImageUri}}
You are provided with an existing image that represents a brand's visual identity. Use this image as a primary reference.
{{media url=existingImageUri}}
{{/if}}

Based on the following style preferences:
Style Preferences: {{{stylePreferences}}}

And the content request:
Content Request: {{{generationPrompt}}}

Generate a new image that consistently reflects the personal brand identity, incorporating the visual style and elements from the reference image (if provided) and adhering to the described style preferences and content request.
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
