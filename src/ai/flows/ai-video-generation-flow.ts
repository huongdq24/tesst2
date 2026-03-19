// KHÔNG dùng 'use server' ở đây - file này được gọi từ server action wrapper

/**
 * @fileOverview This file implements a flow for INITIATING video generation.
 * It calls the Google AI REST API directly (bypassing Genkit for Veo models)
 * and returns the result to the caller for client-side processing.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { Buffer } from 'buffer';

const StartVideoGenerationInputSchema = z.object({
  textPrompt: z.string().describe('The text prompt describing the video to generate.'),
  referenceImageUris: z.array(z.string()).optional().describe(
    "Optional array of reference images as data URIs or public URLs."
  ),
  aspectRatio: z.enum(['16:9', '9:16']).optional().default('16:9').describe('The aspect ratio for the video.'),
  modelName: z.string().optional().describe('The name of the Veo model to use for generation.'),
  userId: z.string().describe('The UID of the user initiating the job.'),
  apiKey: z.string().optional().describe("The user's Gemini API Key."),
  durationSeconds: z.string().optional(),
  frameRate: z.string().optional(),
  resolution: z.string().optional(),
});

export type StartVideoGenerationInput = z.infer<typeof StartVideoGenerationInputSchema>;

// Output includes either an operationName (for LRO polling) or a direct videoUrl
const StartVideoGenerationOutputSchema = z.object({
  operationName: z.string().optional().describe('The LRO operation name for polling.'),
  videoUrl: z.string().optional().describe('Direct video URL if the API returned video synchronously.'),
  status: z.enum(['processing', 'completed', 'failed']).describe('The initial status of the generation.'),
  error: z.string().optional().describe('Error message if the generation failed.'),
});

export type StartVideoGenerationOutput = z.infer<typeof StartVideoGenerationOutputSchema>;


export async function startVideoGeneration(
  input: StartVideoGenerationInput
): Promise<StartVideoGenerationOutput> {
  return startVideoGenerationFlow(input);
}


const startVideoGenerationFlow = ai.defineFlow(
  {
    name: 'startVideoGenerationFlow',
    inputSchema: StartVideoGenerationInputSchema,
    outputSchema: StartVideoGenerationOutputSchema,
  },
  async (input) => {
    const modelName = input.modelName || 'veo-2.0-generate-001';
    const isVeo2 = modelName.includes('veo-2');

    const config: any = {
      aspectRatio: input.aspectRatio,
    };

    if (input.durationSeconds) {
      let duration = Number(input.durationSeconds);
      if (isVeo2) {
        if (![5, 6, 8].includes(duration)) duration = 8;
      } else {
        if (input.resolution === '1080p' || input.resolution === '4k') {
          duration = 8;
        } else if (![4, 6, 8].includes(duration)) {
          duration = 8;
        }
      }
      config.durationSeconds = duration;
    }

    if (!isVeo2 && input.resolution) {
      config.resolution = input.resolution;
    }

    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [10000, 30000, 60000];

    let lastError = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predictLongRunning?key=${input.apiKey}`;

        const payload: any = {
          instances: [{ prompt: input.textPrompt }],
          parameters: config,
        };

        // Add reference image if provided
        if (input.referenceImageUris && input.referenceImageUris.length > 0) {
          const uri = input.referenceImageUris[0];
          if (uri.startsWith('data:')) {
            const mimeMatch = uri.match(/^data:([^;]+);base64,(.+)$/);
            if (mimeMatch) {
              payload.instances[0].image = {
                bytesBase64Encoded: mimeMatch[2],
                mimeType: mimeMatch[1],
              };
            }
          } else if (uri.startsWith('http://') || uri.startsWith('https://')) {
            try {
              const fetchRes = await fetch(uri);
              if (fetchRes.ok) {
                const arrayBuffer = await fetchRes.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const mimeType = fetchRes.headers.get('content-type') || 'image/jpeg';
                payload.instances[0].image = {
                  bytesBase64Encoded: buffer.toString('base64'),
                  mimeType: mimeType,
                };
                console.log(`[VideoGen] Successfully fetched remote image and converted to base64 (${mimeType}).`);
              } else {
                console.warn(`[VideoGen] Failed to fetch remote image: ${fetchRes.status}`);
              }
            } catch (err: any) {
              console.error(`[VideoGen] Error fetching remote image: ${err.message}`);
            }
          }
        }

        console.log(`[VideoGen] Calling ${fetchUrl.split('?')[0]} (attempt ${attempt + 1})...`);

        const fetchResponse = await fetch(fetchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const result = await fetchResponse.json();

        if (!fetchResponse.ok) {
          const errMessage = result?.error?.message || JSON.stringify(result);
          throw new Error(`Google API returned ${fetchResponse.status}: ${errMessage}`);
        }

        // ===== CASE A: API returns an LRO operation =====
        if (result?.name) {
          console.log(`[VideoGen] Got LRO operation: ${result.name}`);
          return {
            operationName: result.name,
            status: 'processing' as const,
          };
        }

        // ===== CASE B: API returns video directly (synchronous) =====
        const videoUrl = extractVideoUrl(result);
        if (videoUrl) {
          console.log(`[VideoGen] Got direct video response.`);
          return {
            videoUrl: videoUrl,
            status: 'completed' as const,
          };
        }

        // ===== CASE C: Unknown response format =====
        if (attempt < MAX_RETRIES) {
          console.warn(`[VideoGen] Attempt ${attempt + 1} returned unexpected payload. Retrying in ${RETRY_DELAYS[attempt]}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
          continue;
        }

        lastError = `Unexpected API response format: ${JSON.stringify(result).substring(0, 500)}`;

      } catch (e: any) {
        const isRetryable =
          e.message?.includes('429') ||
          e.message?.includes('503') ||
          e.message?.includes('500') ||
          e.message?.includes('RESOURCE_EXHAUSTED') ||
          e.message?.includes('UNAVAILABLE') ||
          e.message?.includes('DEADLINE_EXCEEDED');

        if (isRetryable && attempt < MAX_RETRIES) {
          console.warn(`[VideoGen] Attempt ${attempt + 1} failed (retryable). Retrying in ${RETRY_DELAYS[attempt]}ms...`, e.message);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
          continue;
        }

        lastError = e.message || 'Unknown error during video generation.';
        console.error(`[VideoGen] Failed after ${attempt + 1} attempts for model ${modelName}:`, lastError);
        break;
      }
    }

    // All retries exhausted - return error
    return {
      status: 'failed' as const,
      error: lastError,
    };
  }
);


/**
 * Extracts a video URL from a raw API response.
 */
function extractVideoUrl(result: any): string | null {
  if (!result) return null;

  // Check for videos array in response
  try {
    const videos = result?.response?.videos || result?.videos;
    if (videos && videos.length > 0) {
      const video = videos[0];
      if (video.gcsUri) return video.gcsUri;
      if (video.bytesBase64Encoded) {
        return `data:${video.mimeType || 'video/mp4'};base64,${video.bytesBase64Encoded}`;
      }
    }
  } catch (e) { /* ignore */ }

  // Check for generateVideoResponse
  try {
    const genVideos = result?.generateVideoResponse?.generatedSamples;
    if (genVideos && genVideos.length > 0) {
      const video = genVideos[0]?.video;
      if (video?.uri) return video.uri;
    }
  } catch (e) { /* ignore */ }

  return null;
}
