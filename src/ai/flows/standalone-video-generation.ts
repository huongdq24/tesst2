'use server';

import { z } from 'zod';
import { Buffer } from 'buffer';
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { storage, firestore } from '@/lib/firebase/config';
// ĐIỂM SỬA 1: Import đúng class GoogleGenAI từ SDK mới nhất
import { GoogleGenAI } from "@google/genai";

const AiVideoGenerationInputSchema = z.object({
  textPrompt: z.string(),
  referenceImageUris: z.array(z.string()).optional(),
  aspectRatio: z.enum(['16:9', '9:16']).optional().default('16:9'),
  apiKey: z.string(),
  userId: z.string(),
});

export type AiVideoGenerationInput = z.infer<typeof AiVideoGenerationInputSchema>;

export async function standaloneVideoGeneration(
  input: AiVideoGenerationInput
): Promise<{ videoUrl: string }> {

  if (!input.apiKey) {
    throw new Error('Gemini API key is required to generate the video.');
  }

  // ĐIỂM SỬA 2: Khởi tạo đúng cú pháp SDK mới
  const ai = new GoogleGenAI({ apiKey: input.apiKey });

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
    referenceImageParts.push(...(await Promise.all(imagePartPromises)));
  }

  // ĐIỂM SỬA 3: Payload chuẩn cho Veo 3.1
  const requestPayload: any = {
      model: 'veo-3.1-generate-preview',
      prompt: input.textPrompt,
      config: {
          aspectRatio: input.aspectRatio,
      },
  };
  
  if (hasReferenceImages) {
      // Đối với Image-to-Video cơ bản, ta gán trực tiếp image: { imageBytes, mimeType } vào cấp gốc (root) của payload
      requestPayload.image = {
          imageBytes: referenceImageParts[0].image.imageBytes,
          mimeType: referenceImageParts[0].image.mimeType
      };
      requestPayload.config.personGeneration = 'allow_adult';
  } else {
      requestPayload.config.personGeneration = 'allow_all';
  }

  // 3. Start the video generation operation
  let operation = await ai.models.generateVideos(requestPayload);

  // 4. Poll the operation until it's done
  const MAX_POLLING_ATTEMPTS = 120; // 120 attempts * 10s = 20 minutes
  let pollingAttempts = 0;
  
  while (!operation.done) {
    pollingAttempts++;
    if (pollingAttempts > MAX_POLLING_ATTEMPTS) {
      throw new Error('Video generation timed out.');
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // ĐIỂM SỬA 4: Sử dụng hàm getVideosOperation của thuộc tính operations
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }
  
  if (operation.error) {
    throw new Error(`Video generation failed: ${operation.error.message}`);
  }

  const generatedVideos = operation.response?.generatedVideos;
  if (!generatedVideos || generatedVideos.length === 0) {
      throw new Error(`The video operation completed but returned an empty response.`);
  }
  
  // 5. Process the result and download the video.
  const videoFile: any = generatedVideos[0].video;
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
    throw new Error("Video was generated but failed to save to your library.");
  }
  
  // 8. Return the public Firebase Storage URL
  return { videoUrl: publicUrl };
}
