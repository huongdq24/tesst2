'use server';
/**
 * @fileOverview This file implements a Genkit flow for generating videos using AI.
 * It allows users to combine text prompts with an optional image reference to create
 * short professional-looking videos. The generated video is uploaded to Firebase Storage
 * and the download URL is returned.
 *
 * - aiVideoGeneration - A function that handles the video generation process.
 * - AiVideoGenerationInput - The input type for the aiVideoGeneration function.
 * - AiVideoGenerationOutput - The return type for the aiVideoGeneration function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { Buffer } from 'buffer';
import { googleAI } from '@genkit-ai/google-genai';
import { initializeApp, getApps, App as AdminApp } from 'firebase-admin/app';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore';

// --- START: ROBUST FIREBASE ADMIN INITIALIZATION ---
let adminApp: AdminApp | null = null;
const ADMIN_APP_NAME = 'igen-video-generation-admin-app';

function getFirebaseAdmin() {
  if (!adminApp) {
    const existingApp = getApps().find(app => app.name === ADMIN_APP_NAME);
    if (existingApp) {
      adminApp = existingApp;
    } else {
      // In Firebase App Hosting / Cloud Run, credentials are auto-detected.
      // For local dev, set GOOGLE_APPLICATION_CREDENTIALS env var.
      adminApp = initializeApp({
        storageBucket: 'studio-5835932949-38ba9.firebasestorage.app',
      }, ADMIN_APP_NAME);
    }
  }
  return {
    storage: getAdminStorage(adminApp),
    firestore: getAdminFirestore(adminApp),
  };
}
// --- END: ROBUST FIREBASE ADMIN INITIALIZATION ---


// Define input schema for video generation
const AiVideoGenerationInputSchema = z.object({
  textPrompt: z.string().describe('The text prompt describing the video to generate.'),
  referenceImageUris: z.array(z.string()).optional().describe(
      "Optional array of reference images as data URIs or public URLs. Format: 'data:<mimetype>;base64,<encoded_data>' or 'https://...'"
    ),
  aspectRatio: z.enum(['16:9', '9:16']).optional().default('16:9'),
  userId: z.string().describe('The UID of the authenticated user, for saving the video.'),
});
export type AiVideoGenerationInput = z.infer<typeof AiVideoGenerationInputSchema>;

// Define output schema for video generation
const AiVideoGenerationOutputSchema = z.object({
  videoUrls: z.array(z.string()).describe('An array of Firebase Storage download URLs for the generated videos.'),
});
export type AiVideoGenerationOutput = z.infer<typeof AiVideoGenerationOutputSchema>;

/**
 * Generates a single video based on a text prompt and optional image references.
 * The video is uploaded to Firebase Storage and the download URL is returned.
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
            const response = await fetch(uri); // Dùng global fetch (Node.js built-in)
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
      model: googleAI.model('veo-2.0-generate-001'),
      prompt: promptParts,
      config: {
        durationSeconds: 5,
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
    
    // 4. Download video as binary buffer (KHÔNG chuyển thành base64 string)
    let videoBuffer: Buffer;
    let contentType: string;
    try {
        const response = await fetch(videoDownloadUrl);
        if (!response.ok || !response.body) {
            throw new Error(`Failed to download video file. Status: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        videoBuffer = Buffer.from(arrayBuffer);
        contentType = videoMediaPart.media!.contentType || 'video/mp4';
    } catch (err: any) {
        console.error(`An error occurred during video download and processing: ${err.message}`);
        throw new Error(`Failed to download or process generated video: ${err.message}`);
    }

    // 5. Upload video lên Firebase Storage qua Admin SDK
    const { storage, firestore } = getFirebaseAdmin();
    const bucket = storage.bucket();
    const fileName = `generated-video-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`;
    const filePath = `users/${input.userId}/generated-videos/${fileName}`;
    const file = bucket.file(filePath);

    await file.save(videoBuffer, {
      metadata: {
        contentType: contentType,
        metadata: {
          prompt: input.textPrompt.substring(0, 500), // Lưu 500 ký tự đầu
        },
      },
    });

    // Make the file public and construct the public URL.
    await file.makePublic();

    // The public URL is in the format: https://storage.googleapis.com/your-bucket-name/your-file-path
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(filePath)}`;

    // 6. Lưu metadata vào Firestore
    await firestore.collection('generatedVideos').add({
      ownerId: input.userId,
      prompt: input.textPrompt,
      videoUrl: publicUrl,
      storagePath: filePath,
      aspectRatio: input.aspectRatio,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { videoUrls: [publicUrl] };
  }
);
