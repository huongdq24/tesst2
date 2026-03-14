'use server';

/**
 * @fileOverview This file implements a flow for generating videos using the Google GenAI SDK (Veo).
 * It uploads the generated video to Firebase storage on the server and returns the public URL.
 */
import { z } from 'zod';
import { Buffer } from 'buffer';
import { GoogleGenAI } from "@google/genai";
import { adminStorage, adminFirestore } from '@/lib/firebase/admin';


// Define input schema for video generation
const AiVideoGenerationInputSchema = z.object({
  textPrompt: z.string().describe('The text prompt describing the video to generate.'),
  referenceImageUris: z.array(z.string()).optional().describe(
      "Optional array of reference images as data URIs or public URLs. Format: 'data:<mimetype>;base64,<encoded_data>' or 'https://...'"
    ),
  aspectRatio: z.enum(['16:9', '9:16']).optional().default('16:9'),
  apiKey: z.string().describe('The user Gemini API key to use for generation and downloading.'),
  modelName: z.string().optional().describe('The name of the Veo model to use for generation.'),
  durationSeconds: z.number().optional().describe('Length of the video in seconds (Veo 2 only).'),
  userId: z.string().describe('The authenticated user ID for saving to their storage folder.')
});
export type AiVideoGenerationInput = z.infer<typeof AiVideoGenerationInputSchema>;

// Define output schema: returns the video public URL and other metadata.
const AiVideoGenerationOutputSchema = z.object({
    videoUrl: z.string().describe('The public Firebase Storage URL of the generated video.'),
    storagePath: z.string().describe('The storage path for the video.'),
    prompt: z.string().describe('The prompt used for generation.'),
    aspectRatio: z.string().describe('The aspect ratio of the generated video.'),
});
export type AiVideoGenerationOutput = z.infer<typeof AiVideoGenerationOutputSchema>;


/**
 * Generates a single video, uploads it to storage, and returns the public URL.
 */
export async function aiVideoGeneration(
  input: AiVideoGenerationInput
): Promise<AiVideoGenerationOutput> {
    
  if (!input.apiKey) {
    throw new Error('Gemini API key is required to generate the video.');
  }

  const ai = new GoogleGenAI({ apiKey: input.apiKey });

  // 1. Define the standard VideoAsset type, which is just the image data object.
  type VideoAsset = { imageBytes: string; mimeType: string };
  const videoAssets: VideoAsset[] = [];
  const hasReferenceImages = input.referenceImageUris && input.referenceImageUris.length > 0;

  if (hasReferenceImages) {
    const videoAssetPromises = input.referenceImageUris!.map(async (uri): Promise<VideoAsset> => {
        let base64Data: string;
        let mimeType: string;

        if (uri.startsWith('https://')) {
            const response = await fetch(uri);
            if (!response.ok) throw new Error(`Failed to fetch image from ${uri}`);
            const buffer = await response.arrayBuffer();
            base64Data = Buffer.from(buffer).toString('base64');
            mimeType = response.headers.get('content-type') || 'image/jpeg';
        } else {
            const match = uri.match(/^data:(.*?);base64,(.+)$/);
            if (!match) throw new Error('Invalid data URI format');
            mimeType = match[1];
            base64Data = match[2];
        }
        return { imageBytes: base64Data, mimeType };
    });
    videoAssets.push(...await Promise.all(videoAssetPromises));
  }

  const modelName = input.modelName || 'veo-3.1-generate-preview';
  const isVeo2 = modelName === 'veo-2.0-generate-001';

  // 2. Define the request payload with model-specific configurations
  let requestPayload: any = {
    model: modelName,
    prompt: input.textPrompt,
    config: {
      aspectRatio: isVeo2 ? input.aspectRatio : '16:9',
    }
  };
  
  if (isVeo2 && input.durationSeconds) {
    requestPayload.config.durationSeconds = input.durationSeconds;
  }
  
  if (hasReferenceImages) {
      requestPayload.image = videoAssets[0];
      // Veo 3+ requires allow_all, Veo 2 uses allow_adult for this case
      requestPayload.config!.personGeneration = isVeo2 ? 'allow_adult' : 'allow_all';
      
      if (!isVeo2 && videoAssets.length > 1) {
        requestPayload.referenceImages = videoAssets.slice(1);
      }
  } else {
      // For text-to-video, allow_all is generally supported.
      requestPayload.config!.personGeneration = 'allow_all';
  }

  // 3. Start the video generation operation
  let operation = await ai.models.generateVideos(requestPayload);

  // 4. Poll the operation until it's done
  const MAX_POLLING_ATTEMPTS = 85; 
  let pollingAttempts = 0;
  
  while (!operation.done) {
    pollingAttempts++;
    if (pollingAttempts > MAX_POLLING_ATTEMPTS) {
      throw new Error(
        'Video generation timed out: Veo is still processing but the server limit was reached. ' +
        'Please wait a few minutes and check your video library, then try again.'
      );
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ 
      operation: operation 
    });
  }
  
  if (operation.error) {
    console.error('The video generation operation failed:', operation.error.message);
    throw new Error(`Video generation failed: ${operation.error.message}`);
  }

  const generatedVideos = operation.response?.generatedVideos;
  if (!generatedVideos || generatedVideos.length === 0) {
      const outputJson = JSON.stringify(operation.response, null, 2);
      throw new Error(`The video operation completed but returned an empty response. This may be due to content policy violations or other restrictions. Full output from operation: ${outputJson}`);
  }
  
  // 5. Process the result and download the video.
  const video = generatedVideos[0];
  const videoFile: any = video.video;
  const videoDownloadUrl = videoFile.uri;
  
  // 6. Download video as binary buffer.
  let videoBuffer: Buffer;
  try {
      const downloadUrlWithKey = `${videoDownloadUrl}&key=${input.apiKey}`;
      const response = await fetch(downloadUrlWithKey);
      if (!response.ok || !response.body) {
          throw new Error(`Failed to download video file. Status: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      videoBuffer = Buffer.from(arrayBuffer);
  } catch (err: any) {
      console.error(`An error occurred during video download and processing: ${err.message}`);
      throw new Error(`Failed to download or process generated video: ${err.message}`);
  }
  
  // 7. Upload video to Firebase Storage using Admin SDK
 const fileName = `generated-video-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`;
 const storagePath = `users/${input.userId}/generated-videos/${fileName}`;
 const bucket = adminStorage.bucket();
 const file = bucket.file(storagePath);
 
 await file.save(videoBuffer, {
   metadata: {
     contentType: videoFile.mimeType || 'video/mp4',
   },
 });
 
 // Create a public URL
 await file.makePublic();
 const videoUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
 
 // 8. Save metadata to Firestore
 const { FieldValue } = require('firebase-admin/firestore');
 await adminFirestore.collection('generatedVideos').add({
   ownerId: input.userId,
   prompt: input.textPrompt,
   videoUrl: videoUrl,
   storagePath: storagePath,
   aspectRatio: requestPayload.config.aspectRatio,
   createdAt: FieldValue.serverTimestamp(),
 });
 
 // 9. Return only the URL and metadata (a few bytes)
 return { 
   videoUrl: videoUrl,
   storagePath: storagePath,
   prompt: input.textPrompt,
   aspectRatio: requestPayload.config.aspectRatio,
 };
}
