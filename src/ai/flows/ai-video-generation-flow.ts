'use server';

/**
 * @fileOverview This file implements a flow for generating videos using the Google GenAI SDK (Veo).
 * It directly uses the @google/genai library to handle video generation and polling for completion.
 * The flow returns the public URL of the generated video after saving it to Firebase.
 */
import { z } from 'zod';
import { Buffer } from 'buffer';
import { GoogleGenAI } from "@google/genai";
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { storage, firestore } from '@/lib/firebase/config';


// Define input schema for video generation
const AiVideoGenerationInputSchema = z.object({
  textPrompt: z.string().describe('The text prompt describing the video to generate.'),
  referenceImageUris: z.array(z.string()).optional().describe(
      "Optional array of reference images as data URIs or public URLs. Format: 'data:<mimetype>;base64,<encoded_data>' or 'https://...'"
    ),
  aspectRatio: z.enum(['16:9', '9:16']).optional().default('16:9'),
  apiKey: z.string().describe('The user Gemini API key to use for generation and downloading.'),
  modelName: z.string().optional().describe('The name of the Veo model to use for generation.'),
  userId: z.string().describe('The ID of the user initiating the request.'),
});
export type AiVideoGenerationInput = z.infer<typeof AiVideoGenerationInputSchema>;

// Define output schema: returns the public URL of the saved video.
const AiVideoGenerationOutputSchema = z.object({
    videoUrl: z.string().describe('The public URL of the generated and saved video in Firebase Storage.'),
    prompt: z.string().describe('The prompt used for generation.'),
});
export type AiVideoGenerationOutput = z.infer<typeof AiVideoGenerationOutputSchema>;


/**
 * Generates a single video based on a text prompt and optional image references,
 * downloads it, and saves it to Firebase Storage and Firestore.
 */
export async function aiVideoGeneration(
  input: AiVideoGenerationInput
): Promise<AiVideoGenerationOutput> {
    
  if (!input.apiKey) {
    throw new Error('Gemini API key is required to generate the video.');
  }

  const ai = new GoogleGenAI({ apiKey: input.apiKey });

  // 1. Asynchronously convert image URIs to ImageAsset-like objects
  // The error message says `bytesBase64Encoded`, but the SDK seems to expect `imageBytes`.
  const imageAssets: { imageBytes: string, mimeType: string }[] = [];
  const hasReferenceImages = input.referenceImageUris && input.referenceImageUris.length > 0;

  if (hasReferenceImages) {
    const imageAssetPromises = input.referenceImageUris!.map(async (uri) => {
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
        // Using `imageBytes` as this seems to be what the SDK actually expects.
        return { imageBytes: base64Data, mimeType };
    });
    imageAssets.push(...await Promise.all(imageAssetPromises));
  }

  const modelName = input.modelName || 'veo-3.1-generate-preview';
  const isVeo2 = modelName === 'veo-2.0-generate-001';

  // 2. Define the request payload with model-specific configurations
  let requestPayload: any = {
    model: modelName,
    prompt: input.textPrompt,
    config: {
        // For Veo 3 models, force 16:9 as 9:16 is not supported
        aspectRatio: isVeo2 ? input.aspectRatio : '16:9',
    }
  };
  
  if (hasReferenceImages) {
      // The `image` property takes an object with `imageBytes` and `mimeType`.
      requestPayload.image = imageAssets[0];
      
      // Apply model-specific configs for Image-to-Video
      if (isVeo2) {
        requestPayload.config!.personGeneration = 'allow_adult';
        requestPayload.config!.durationSeconds = 8;
      }
      
      // Veo 3 supports multiple reference images. They need to be wrapped in a VideoAsset structure.
      if (!isVeo2 && imageAssets.length > 1) {
        requestPayload.referenceImages = imageAssets.slice(1).map(asset => ({
            image: asset, // The ImageAsset-like object goes here
            referenceType: 'asset' 
        }));
      }
  } else {
      // Apply model-specific configs for Text-to-Video
      if (isVeo2) {
          requestPayload.config!.personGeneration = 'allow_adult';
      } else {
          requestPayload.config!.personGeneration = 'allow_all';
      }
  }

  // 3. Start the video generation operation
  let operation = await ai.models.generateVideos(requestPayload);

  // 4. Poll the operation until it's done
  const MAX_POLLING_ATTEMPTS = 55; // 55 attempts * 10s = 550s (9.1 min), safely within the 10 min server action timeout
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
  
  // 7. Upload to Firebase Storage and save metadata to Firestore
  let publicUrl: string;
  try {
    const fileName = `generated-video-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`;
    const videoStorageRef = storageRef(storage, `users/${input.userId}/generated-videos/${fileName}`);
    const videoDataUri = `data:${videoFile.mimeType || 'video/mp4'};base64,${videoBuffer.toString('base64')}`;

    const snapshot = await uploadString(videoStorageRef, videoDataUri, 'data_url', { contentType: 'video/mp4' });
    publicUrl = await getDownloadURL(snapshot.ref);

    await addDoc(collection(firestore, 'generatedVideos'), {
      ownerId: input.userId,
      prompt: input.textPrompt,
      videoUrl: publicUrl,
      storagePath: snapshot.ref.fullPath,
      aspectRatio: requestPayload.config.aspectRatio,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Failed to upload to Firebase or save metadata:", error);
    throw new Error("Video was generated but failed to save to your library.");
  }
  
  // 8. Return the public Firebase Storage URL
  return { 
    videoUrl: publicUrl,
    prompt: input.textPrompt,
  };
}
