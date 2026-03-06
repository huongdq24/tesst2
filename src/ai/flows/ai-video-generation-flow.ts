'use server';
/**
 * @fileOverview This file implements a Genkit flow for generating videos using AI.
 * It allows users to combine text prompts with an optional image reference to create
 * short professional-looking videos. The generated video is returned as a data URI.
 *
 * - aiVideoGeneration - A function that handles the video generation process.
 * - AiVideoGenerationInput - The input type for the aiVideoGeneration function.
 * - AiVideoGenerationOutput - The return type for the aiVideoGeneration function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { Buffer } from 'buffer'; // Node.js Buffer for base64 encoding
import fetch from 'node-fetch'; // For fetching the generated video from its URL

// Define input schema for video generation
const AiVideoGenerationInputSchema = z.object({
  textPrompt: z.string().describe('The text prompt describing the video to generate.'),
  imageDataUri: z
    .string()
    .optional()
    .describe(
      "Optional: A photo to use as reference, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type AiVideoGenerationInput = z.infer<typeof AiVideoGenerationInputSchema>;

// Define output schema for video generation
const AiVideoGenerationOutputSchema = z.object({
  videoDataUri: z.string().describe('The generated video as a data URI (data:video/mp4;base64,<encoded_data>).'),
});
export type AiVideoGenerationOutput = z.infer<typeof AiVideoGenerationOutputSchema>;

/**
 * Generates a video based on a text prompt and an optional image reference.
 * The function polls the video generation operation until completion and returns
 * the generated video as a base64 encoded data URI.
 * @param input - The input containing the text prompt and optional image data URI.
 * @returns A promise that resolves to an object containing the video data URI.
 */
export async function aiVideoGeneration(
  input: AiVideoGenerationInput
): Promise<AiVideoGenerationOutput> {
  return aiVideoGenerationFlow(input);
}

// Genkit Flow definition for video generation
const aiVideoGenerationFlow = ai.defineFlow(
  {
    name: 'aiVideoGenerationFlow',
    inputSchema: AiVideoGenerationInputSchema,
    outputSchema: AiVideoGenerationOutputSchema,
  },
  async (input) => {
    // Construct the prompt parts for the Veo model.
    // It can accept both text and media parts.
    const promptParts: Array<{ text: string } | { media: { contentType: string; url: string } }> = [
      { text: input.textPrompt },
    ];

    if (input.imageDataUri) {
      // Extract content type from the data URI (e.g., 'image/jpeg', 'image/png')
      const match = input.imageDataUri.match(/^data:(.*?);base64,/);
      if (!match || !match[1]) {
        throw new Error('Invalid imageDataUri format: Missing MIME type.');
      }
      const contentType = match[1];

      promptParts.push({
        media: {
          contentType: contentType,
          url: input.imageDataUri,
        },
      });
    }

    // Initiate video generation using the latest Veo 3.0 model.
    // Note: Veo 3.0 has a default duration of 8 seconds and aspect ratio of 16:9,
    // which are not directly configurable via the 'config' object for this model version.
    let { operation } = await ai.generate({
      model: 'googleai/veo-3.0-generate-preview',
      prompt: promptParts,
    });

    if (!operation) {
      throw new Error('Expected the video generation model to return an operation.');
    }

    // Poll the operation status until video generation is complete.
    // Video generation can take significant time (up to a minute or more).
    while (!operation.done) {
      operation = await ai.checkOperation(operation);
      // Wait for a few seconds before polling again to reduce API calls.
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    if (operation.error) {
      throw new Error(`Failed to generate video: ${operation.error.message}`);
    }

    // Extract the generated video media part from the operation output.
    const videoMediaPart = operation.output?.message?.content.find((p) => !!p.media);
    if (!videoMediaPart || !videoMediaPart.media?.url) {
      throw new Error('Failed to find the generated video in the operation output.');
    }

    // The media.url provided by Veo models often requires an API key for direct download.
    // Ensure the GEMINI_API_KEY environment variable is set.
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not configured. It is required to download generated videos.');
    }
    const videoDownloadUrl = `${videoMediaPart.media.url}&key=${geminiApiKey}`;

    // Fetch the video content from the URL.
    const videoResponse = await fetch(videoDownloadUrl);

    if (!videoResponse.ok || !videoResponse.body) {
      throw new Error(`Failed to fetch generated video from URL: ${videoDownloadUrl}. Status: ${videoResponse.status} - ${videoResponse.statusText}`);
    }

    // Convert the video stream to a Buffer and then to a base64 string.
    const arrayBuffer = await videoResponse.arrayBuffer();
    const base64Video = Buffer.from(arrayBuffer).toString('base64');
    
    // Default content type to video/mp4 if not explicitly provided by the media part.
    const contentType = videoMediaPart.media.contentType || 'video/mp4';

    return {
      videoDataUri: `data:${contentType};base64,${base64Video}`,
    };
  }
);