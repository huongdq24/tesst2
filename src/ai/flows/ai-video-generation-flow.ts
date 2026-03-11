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
  videoDataUris: z.array(z.string()).describe('An array containing the single generated video as a data URI (data:video/mp4;base64,<encoded_data>).'),
});
export type AiVideoGenerationOutput = z.infer<typeof AiVideoGenerationOutputSchema>;

/**
 * Generates a single video based on a text prompt and optional image references.
 * The function polls the video generation operation until completion and returns
 * the generated video as a base64 encoded data URI.
 * @param input - The input containing the text prompt and optional image data URIs.
 * @returns A promise that resolves to an object containing an array with one video data URI.
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

    // 1. Start the single generation operation.
    let { operation } = await ai.generate({
      model: googleAI.model('veo-3.1-generate-preview'),
      prompt: promptParts,
      config: {
        aspectRatio: input.aspectRatio,
      },
    });

    if (!operation) {
      throw new Error('Failed to start the video generation operation.');
    }

    // 2. Poll the operation until it is done.
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // wait 5s
      operation = await ai.checkOperation(operation);
    }
    
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not configured. It is required to download generated videos.');
    }

    // 3. Process the result and download the video.
    if (operation.error) {
      console.error('The video generation operation failed:', operation.error.message);
      throw new Error(`Video generation failed: ${operation.error.message}`);
    }
    
    const content = operation.output?.message?.content;
    if (!content || content.length === 0) {
      const outputJson = JSON.stringify(operation.output, null, 2);
      throw new Error(`The video operation completed but returned an empty response. This may be due to content policy violations or other restrictions. Full output from operation: ${outputJson}`);
    }

    const videoMediaPart = content.find(p => !!p.media);
    if (!videoMediaPart?.media?.url) {
      const textPart = content.find(p => !!p.text);
      let reason = 'This may be due to safety filters or other content restrictions.';
      if (textPart?.text) {
          reason += ` Model response: "${textPart.text}"`;
      }
      throw new Error(`The operation completed but did not return a video. ${reason}`);
    }
      
    const videoDownloadUrl = `${videoMediaPart.media.url}&key=${geminiApiKey}`;
    
    let videoDataUri: string | null = null;
    try {
        const response = await fetch(videoDownloadUrl);
        if (!response.ok || !response.body) {
            throw new Error(`Failed to download video file. Status: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const base64Video = Buffer.from(arrayBuffer).toString('base64');
        const contentType = videoMediaPart.media!.contentType || 'video/mp4';
        videoDataUri = `data:${contentType};base64,${base64Video}`;
    } catch (err: any) {
        console.error(`An error occurred during video download and processing: ${err.message}`);
        throw new Error(`Failed to download or process generated video: ${err.message}`);
    }

    if (!videoDataUri) {
        throw new Error('Video generation failed to produce a downloadable video.');
    }

    return { videoDataUris: [videoDataUri] };
  }
);
