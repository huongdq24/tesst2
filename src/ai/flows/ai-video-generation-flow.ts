'use server';

/**
 * @fileOverview This file implements a flow for generating videos using the Google GenAI SDK (Veo 3.1).
 * It directly uses the @google/genai library to handle video generation, polling for completion,
 * and then uploads the final video to Firebase Storage, returning a public URL.
 *
 * - aiVideoGeneration - A function that handles the video generation process.
 * - AiVideoGenerationInput - The input type for the aiVideoGeneration function.
 * - AiVideoGenerationOutput - The return type for the aiVideoGeneration function.
 */
import * as genai from '@google/genai';
import { z } from 'zod';
import { Buffer } from 'buffer';
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { storage, firestore } from '@/lib/firebase/config';

// Define input schema for video generation
const AiVideoGenerationInputSchema = z.object({
  textPrompt: z.string().describe('The text prompt describing the video to generate.'),
  referenceImageUris: z.array(z.string()).optional().describe(
      "Optional array of reference images as data URIs or public URLs. Format: 'data:<mimetype>;base64,<encoded_data>' or 'https://...'"
    ),
  aspectRatio: z.enum(['16:9', '9:16']).optional().default('16:9'),
  apiKey: z.string().describe('The user Gemini API key to use for generation and downloading.'),
  userId: z.string().describe('The UID of the user requesting the generation for storage purposes.'),
});
export type AiVideoGenerationInput = z.infer<typeof AiVideoGenerationInputSchema>;

// Define output schema for video generation - returning a public Firebase Storage URL
const AiVideoGenerationOutputSchema = z.object({
  videoUrl: z.string().describe('The public URL of the generated video in Firebase Storage.'),
});
export type AiVideoGenerationOutput = z.infer<typeof AiVideoGenerationOutputSchema>;


/**
 * Generates a single video based on a text prompt and optional image references.
 * The video is downloaded from Google's servers and re-uploaded to the user's
 * Firebase Storage, then a public URL is returned.
 */
export async function aiVideoGeneration(
  input: AiVideoGenerationInput
): Promise<AiVideoGenerationOutput> {
    
  if (!input.apiKey) {
    throw new Error('Gemini API key is required to generate the video.');
  }

  const genAI = new genai.GoogleGenerativeAI(input.apiKey);

  // 1. Asynchronously convert any image URIs (http or data) into base64 strings
  const referenceImageParts: { image: { imageBytes: string, mimeType: string }, referenceType: string }[] = [];
  const hasReferenceImages = input.referenceImageUris && input.referenceImageUris.length > 0;

  if (hasReferenceImages) {
    const imagePartPromises = input.referenceImageUris!.map(async (uri) => {
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
      return { image: { imageBytes: base64Data, mimeType }, referenceType: 'asset' };
    });
    referenceImageParts.push(...await Promise.all(imagePartPromises));
  }

  // 2. Define the request payload based on whether reference images are present
  const requestPayload: genai.GenerateVideosRequest = {
      model: 'veo-3.1-generate-preview',
      prompt: input.textPrompt,
      config: {
          aspectRatio: input.aspectRatio,
      },
  };
  
  if (hasReferenceImages) {
      requestPayload.referenceImages = referenceImageParts;
      requestPayload.config!.personGeneration = 'allow_adult';
      // As per docs, duration must be 8s when using reference images
      requestPayload.config!.durationSeconds = 8;
  } else {
      requestPayload.config!.personGeneration = 'allow_all';
  }

  // 3. Start the video generation operation
  let operation: genai.Operation = await genAI.models.generateVideos(requestPayload);

  // 4. Poll the operation until it's done
  const MAX_POLLING_ATTEMPTS = 120; // 120 attempts * 10s = 20 minutes
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
    operation = await genAI.operations.getVideosOperation({ name: operation.name });
  }
  
  if (operation.error) {
    console.error('The video generation operation failed:', operation.error.message);
    throw new Error(`Video generation failed: ${operation.error.message}`);
  }

  const generatedVideos = operation.response.generatedVideos;
  if (!generatedVideos || generatedVideos.length === 0) {
      const outputJson = JSON.stringify(operation.response, null, 2);
      throw new Error(`The video operation completed but returned an empty response. This may be due to content policy violations or other restrictions. Full output from operation: ${outputJson}`);
  }
  
  // 5. Process the result and download the video.
  const video = generatedVideos[0];
  const videoFile: genai.File = video.video;
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
    const snapshot = await uploadBytes(videoStorageRef, videoBuffer, { contentType: videoFile.mimeType || 'video/mp4' });
    publicUrl = await getDownloadURL(snapshot.ref);

    await addDoc(collection(firestore, 'generatedVideos'), {
      ownerId: input.userId,
      prompt: input.textPrompt,
      videoUrl: publicUrl,
      storagePath: snapshot.ref.fullPath,
      aspectRatio: input.aspectRatio,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Failed to upload to Firebase or save metadata:", error);
    throw new Error("Video was generated but failed to save to your library.");
  }
  
  // 8. Return the public Firebase Storage URL
  return { videoUrl: publicUrl };
}
