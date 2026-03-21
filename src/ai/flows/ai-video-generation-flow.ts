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
  afterImageUri: z.string().optional().describe(
    "Optional 'after' image for Before & After mode. Used to describe the end state of a transformation video."
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

/**
 * FIX #3 helper: Convert a URL to base64 data with a timeout.
 * Reused from branded-image-generation-flow pattern.
 */
async function fetchImageAsBase64(url: string, timeoutMs: number = 15000): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[VideoGen] Failed to fetch image: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    return { base64: buffer.toString('base64'), mimeType };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error(`[VideoGen] Timeout fetching image: ${url}`);
    } else {
      console.error(`[VideoGen] Error fetching image: ${err.message}`);
    }
    return null;
  }
}

/**
 * Analyzes the AFTER image using Gemini to produce an ultra-detailed description.
 * This description is then used in the Veo prompt so the generated video
 * ends with a state matching the AFTER image.
 */
async function analyzeAfterImage(imageUri: string, apiKey: string): Promise<string> {
  try {
    let base64Data: string;
    let mimeType: string;

    if (imageUri.startsWith('data:')) {
      const match = imageUri.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return '';
      mimeType = match[1];
      base64Data = match[2];
    } else if (imageUri.startsWith('http://') || imageUri.startsWith('https://')) {
      const fetchRes = await fetch(imageUri);
      if (!fetchRes.ok) {
        console.warn(`[VideoGen] Failed to fetch after image for analysis: ${fetchRes.status}`);
        return '';
      }
      const arrayBuffer = await fetchRes.arrayBuffer();
      base64Data = Buffer.from(arrayBuffer).toString('base64');
      mimeType = fetchRes.headers.get('content-type') || 'image/jpeg';
    } else {
      return '';
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const geminiPayload = {
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            }
          },
          {
            text: `You are an expert interior designer and visual analyst. Analyze this room image in EXTREME detail for video generation purposes. Your description must be precise enough for an AI to recreate this EXACT room.

Describe:
1. Every piece of furniture (type, color, material, exact position in the room - left/right/center/corner)
2. Every decorative item (paintings, frames, vases, books, etc. - describe their content, size, position)
3. Every plant (type, size, container, position)
4. Textiles (curtains, rugs, cushions - color, pattern, material, position)
5. Lighting conditions and shadows
6. The overall color palette and style

Output ONLY the detailed room description in English. No introductions or explanations. Be extremely specific about positions and colors.`
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1500,
      }
    };

    console.log(`[VideoGen] Analyzing AFTER image with Gemini...`);
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
    });

    if (!response.ok) {
      console.warn(`[VideoGen] Gemini analysis failed: ${response.status}`);
      return '';
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      console.log(`[VideoGen] After image analysis complete (${text.length} chars).`);
    }
    return text || '';
  } catch (err: any) {
    console.error(`[VideoGen] After image analysis error:`, err.message);
    return '';
  }
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
    const isVeo3 = modelName.includes('veo-3');

    const config: any = {
      aspectRatio: input.aspectRatio,
      // Allow person generation for all models to avoid unnecessary blocks
      personGeneration: 'allow_all',
    };

    // Veo 3.x models support native audio generation
    if (isVeo3) {
      config.generateAudio = true;
    }

    if (input.durationSeconds) {
      let duration = Number(input.durationSeconds);
      if (isVeo2) {
        if (![5, 6, 8].includes(duration)) duration = 8;
      } else {
        // Veo 3.x: valid durations are 4, 6, 8
        if (![4, 6, 8].includes(duration)) duration = 8;
      }
      // API expects durationSeconds as a NUMBER (integer)
      config.durationSeconds = duration;
    }

    // Resolution: Veo 3.x supports 720p, 1080p, 4k; Veo 2 does not
    if (!isVeo2 && input.resolution) {
      config.resolution = input.resolution;
    }

    // ===== BEFORE & AFTER MODE: Analyze the AFTER image with Gemini =====
    let enhancedPrompt = input.textPrompt;
    if (input.afterImageUri && input.apiKey) {
      const afterDescription = await analyzeAfterImage(input.afterImageUri, input.apiKey);
      if (afterDescription) {
        // Build the final prompt: reference image = BEFORE (first frame),
        // prompt describes transformation TO the AFTER state (last frame)
        enhancedPrompt = [
          `Starting from this reference image (the current empty state of the room),`,
          `create a smooth cinematic time-lapse transformation video.`,
          `Keep the camera completely STATIC with no movement throughout the video.`,
          `Furniture, decorations, and accessories gradually appear one by one in a satisfying reveal.`,
          `The room MUST transform to look EXACTLY like this at the end of the video:`,
          `${afterDescription}`,
          `The final frame must precisely match this described state.`,
          input.textPrompt ? `\nAdditional user instructions: ${input.textPrompt}` : '',
        ].filter(Boolean).join(' ');
        console.log(`[VideoGen] Enhanced prompt with after-image analysis.`);
      } else {
        // Fallback in case Gemini analysis fails
        enhancedPrompt = input.textPrompt || "A smooth cinematic time-lapse transformation of the room. Keep the camera completely STATIC with no movement. Furniture, decorations, and accessories gradually appear one by one until the room is fully furnished.";
      }
    }

    // FIX #3: Reduced retry delays and added per-request timeout
    const MAX_RETRIES = 2; // Reduced from 3 → 2 (total 3 attempts)
    const RETRY_DELAYS = [3000, 5000]; // Reduced from [10000, 30000, 60000]
    const REQUEST_TIMEOUT_MS = 30000; // 30s per request to prevent indefinite hanging

    // Prepare image payloads before entering the retry loop to avoid downloading them repeatedly
    const prepareImagePayload = async (uri: string) => {
      try {
        if (uri.startsWith('data:')) {
          const mimeMatch = uri.match(/^data:([^;]+);base64,(.+)$/);
          if (mimeMatch) {
            return { bytesBase64Encoded: mimeMatch[2], mimeType: mimeMatch[1] };
          }
        } else if (uri.startsWith('http://') || uri.startsWith('https://')) {
          // FIX: Use helper with timeout instead of raw fetch
          const imageData = await fetchImageAsBase64(uri);
          if (imageData) {
            return { bytesBase64Encoded: imageData.base64, mimeType: imageData.mimeType };
          }
        }
      } catch (err: any) {
        console.error(`[VideoGen] Error preparing image payload: ${err.message}`);
      }
      return null;
    };

    let firstFramePayload: any = null;
    let lastFramePayload: any = null;

    if (input.referenceImageUris && input.referenceImageUris.length > 0) {
      firstFramePayload = await prepareImagePayload(input.referenceImageUris[0]);
    }
    
    // For Before & After mode, pass the AFTER image explicitly as the 'lastFrame'
    if (input.afterImageUri) {
      lastFramePayload = await prepareImagePayload(input.afterImageUri);
      console.log(`[VideoGen] Prepared lastFrame payload from AFTER image. This ensures 100% match at the end of the video.`);
    }


    let lastError = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predictLongRunning?key=${input.apiKey}`;

        const payload: any = {
          instances: [{ prompt: enhancedPrompt }],
          parameters: config,
        };

        // Add FIRST frame (BEFORE image)
        if (firstFramePayload) {
          payload.instances[0].image = firstFramePayload;
        }

        console.log(`[VideoGen] Calling ${fetchUrl.split('?')[0]} (attempt ${attempt + 1})...`);

        // FIX #3: Add per-request timeout via AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const fetchResponse = await fetch(fetchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const result = await fetchResponse.json();

        if (!fetchResponse.ok) {
          const errMessage = result?.error?.message || JSON.stringify(result);
          const statusCode = fetchResponse.status;

          // FIX #3: Fail fast for non-retryable errors
          if (statusCode === 400 || statusCode === 403 || statusCode === 404) {
            // These are not retryable - bad request, auth issue, or model not found
            lastError = `Google API returned ${statusCode}: ${errMessage}`;
            console.error(`[VideoGen] Non-retryable error (${statusCode}):`, errMessage);
            break; // Exit retry loop immediately
          }

          throw new Error(`Google API returned ${statusCode}: ${errMessage}`);
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
        // Handle AbortController timeout
        if (e.name === 'AbortError') {
          lastError = 'Request timed out after 30 seconds. The API server may be slow.';
          if (attempt < MAX_RETRIES) {
            console.warn(`[VideoGen] Attempt ${attempt + 1} timed out. Retrying in ${RETRY_DELAYS[attempt]}ms...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
            continue;
          }
          console.error(`[VideoGen] All attempts timed out.`);
          break;
        }

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

