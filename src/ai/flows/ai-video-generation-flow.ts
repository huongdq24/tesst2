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
import { Buffer } from 'buffer';
import fetch from 'node-fetch';
import { googleAI } from '@genkit-ai/google-genai';

// Define input schema for video generation
const AiVideoGenerationInputSchema = z.object({
  textPrompt: z.string().describe('The text prompt describing the video to generate.'),
  referenceImageUris: z.array(z.string()).optional().describe(
      "Optional array of reference images as data URIs or public URLs. Format: 'data:<mimetype>;base64,<encoded_data>' or 'https://...'"
    ),
  aspectRatio: z.enum(['16:9', '9:16']).optional().default('16:9'),
  numberOfVideos: z.number().min(1).max(4).optional().default(1),
});
export type AiVideoGenerationInput = z.infer<typeof AiVideoGenerationInputSchema>;

// Define output schema for video generation
const AiVideoGenerationOutputSchema = z.object({
  videoDataUris: z.array(z.string()).describe('An array of generated videos as data URIs (data:video/mp4;base64,<encoded_data>).'),
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
    
    if (input.referenceImageUris) {
      const dataUriPromises = input.referenceImageUris.map(async (uri) => {
        if (uri.startsWith('https://')) {
          try {
            const response = await fetch(uri);
            if (!response.ok) {
              console.warn(`Failed to fetch image from Storage: ${uri}. Status: ${response.statusText}`);
              return null;
            }
            const buffer = await response.arrayBuffer();
            const base64Data = Buffer.from(buffer).toString('base64');
            const mimeType = response.headers.get('content-type') || 'image/jpeg';
            return `data:${mimeType};base64,${base64Data}`;
          } catch (error) {
            console.error(`Error processing image URI ${uri}:`, error);
            return null;
          }
        }
        return uri;
      });

      const resolvedUris = await Promise.all(dataUriPromises);

      resolvedUris.forEach(uri => {
          if (uri) {
              const match = uri.match(/^data:(.*?);base64,/);
              if (match && match[1]) {
                  promptParts.push({
                      media: {
                          contentType: match[1],
                          url: uri,
                      },
                  });
              }
          }
      });
    }

    // Use Veo 3.1 model. Note that this model may have limitations on aspect ratio and number of videos.
    let { operation } = await ai.generate({
      model: googleAI.model('veo-3.1-generate-preview'),
      prompt: promptParts,
      config: {
        aspectRatio: input.aspectRatio,
        numberOfVideos: input.numberOfVideos,
      },
    });

    if (!operation) {
      throw new Error('Expected the video generation model to return an operation.');
    }

    // Poll the operation status until video generation is complete.
    while (!operation.done) {
      operation = await ai.checkOperation(operation);
      // Wait for a few seconds before polling again to reduce API calls.
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    if (operation.error) {
      throw new Error(`Failed to generate video: ${operation.error.message}`);
    }

    // Extract all generated video media parts from the operation output.
    const videoMediaParts = operation.output?.message?.content.filter((p) => !!p.media) || [];
    if (videoMediaParts.length === 0) {
      throw new Error('Failed to find any generated video in the operation output.');
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not configured. It is required to download generated videos.');
    }

    // Process all video parts in parallel.
    const videoDataUris = await Promise.all(
      videoMediaParts.map(async (videoPart) => {
        if (!videoPart.media?.url) return '';
        
        const videoDownloadUrl = `${videoPart.media.url}&key=${geminiApiKey}`;
        const videoResponse = await fetch(videoDownloadUrl);

        if (!videoResponse.ok || !videoResponse.body) {
          console.error(`Failed to fetch generated video from URL: ${videoDownloadUrl}. Status: ${videoResponse.status}`);
          return '';
        }
        
        const arrayBuffer = await videoResponse.arrayBuffer();
        const base64Video = Buffer.from(arrayBuffer).toString('base64');
        const contentType = videoPart.media.contentType || 'video/mp4';
        return `data:${contentType};base64,${base64Video}`;
      })
    );

    const successfulUris = videoDataUris.filter(uri => uri !== '');

    if (successfulUris.length === 0) {
      throw new Error('All video downloads failed.');
    }

    return {
      videoDataUris: successfulUris,
    };
  }
);
