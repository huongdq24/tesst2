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
 * Generates videos based on a text prompt and optional image references by sending parallel requests.
 * The function polls the video generation operations until completion and returns
 * the generated videos as base64 encoded data URIs.
 * @param input - The input containing the text prompt, optional image data URIs, and number of videos.
 * @returns A promise that resolves to an object containing an array of video data URIs.
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
                  promptParts.push({ media: { contentType: match[1], url: uri } });
              }
          }
      });
    }

    // 1. Start all generation operations in parallel
    const generationPromises = Array.from({ length: input.numberOfVideos || 1 }).map(() =>
      ai.generate({
        model: googleAI.model('veo-3.1-generate-preview'),
        prompt: promptParts,
        config: {
          aspectRatio: input.aspectRatio,
        },
      })
    );
    const initialResults = await Promise.all(generationPromises);
    let operations = initialResults.map(res => res.operation).filter((op): op is NonNullable<typeof op> => !!op);
    if (operations.length === 0) {
      throw new Error('Failed to start any video generation operations.');
    }

    // 2. Poll all operations until they are all done
    let allDone = false;
    while (!allDone) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // wait 5s
      const checkPromises = operations.map(op => ai.checkOperation(op));
      operations = await Promise.all(checkPromises);
      allDone = operations.every(op => op.done);
    }
    
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not configured. It is required to download generated videos.');
    }

    // 3. Process results and download videos
    const failedOperationErrors: string[] = [];
    const downloadPromises = operations.map(op => {
      if (op.error) {
        failedOperationErrors.push(op.error.message);
        console.error('A video generation operation failed:', op.error.message);
        return Promise.resolve(null);
      }
      
      const videoMediaPart = op.output?.message?.content.find(p => !!p.media);
      if (!videoMediaPart?.media?.url) {
        console.warn('An operation completed but did not contain a video media part.');
        return Promise.resolve(null);
      }
        
      const videoDownloadUrl = `${videoMediaPart.media.url}&key=${geminiApiKey}`;
      return fetch(videoDownloadUrl)
        .then(response => {
          if (!response.ok || !response.body) {
            console.error(`Failed to fetch generated video from URL: ${videoDownloadUrl}. Status: ${response.status}`);
            return null;
          }
          return response.arrayBuffer();
        })
        .then(arrayBuffer => {
          if (!arrayBuffer) return null;
          const base64Video = Buffer.from(arrayBuffer).toString('base64');
          const contentType = videoMediaPart.media!.contentType || 'video/mp4';
          return `data:${contentType};base64,${base64Video}`;
        })
        .catch(err => {
          console.error(`An error occurred during video download and processing: ${err}`);
          return null;
        });
    });

    const videoDataUris = (await Promise.all(downloadPromises)).filter((uri): uri is string => !!uri);

    if (videoDataUris.length === 0) {
      let errorMessage = 'All video generation requests failed or returned no media.';
      if (failedOperationErrors.length > 0) {
        errorMessage += ` The following errors occurred: ${failedOperationErrors.join(', ')}`;
      }
      throw new Error(errorMessage);
    }

    return { videoDataUris };
  }
);
