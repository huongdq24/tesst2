'use server';
import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Buffer } from 'buffer';

const BrandedImageGenerationInputSchema = z.object({
  existingImageUri: z.string().optional(),
  generationPrompt: z.string(),
  aspectRatio: z.string().optional(),
  numberOfImages: z.number().min(1).max(4).optional().default(1),
  apiKey: z.string().describe('The user Gemini API key to use for generation.'),
});

export type BrandedImageGenerationInput = z.infer<typeof BrandedImageGenerationInputSchema>;

const BrandedImageGenerationOutputSchema = z.object({
  generatedImageUris: z.array(z.string()),
});

export type BrandedImageGenerationOutput = z.infer<typeof BrandedImageGenerationOutputSchema>;

export async function brandedImageGeneration(
  input: BrandedImageGenerationInput
): Promise<BrandedImageGenerationOutput> {
  const { existingImageUri, generationPrompt, aspectRatio, numberOfImages, apiKey } = input;
  if (!apiKey) {
    throw new Error('Gemini API key is required. Please add your API key in settings.');
  }

  const fullPrompt = aspectRatio
    ? `${generationPrompt}, aspect ratio ${aspectRatio}`
    : generationPrompt;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });
  
  const contents: any[] = [];

  if (existingImageUri) {
    if (existingImageUri.startsWith('https://')) {
      // Fetch the image from the Storage URL on the server
      const response = await fetch(existingImageUri);
      if (!response.ok) {
        throw new Error(`Failed to fetch image from Storage: ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      const base64Data = Buffer.from(buffer).toString('base64');
      const mimeType = response.headers.get('content-type') || 'image/jpeg';
      contents.push({
        inlineData: { data: base64Data, mimeType },
      });
    } else {
      // Fallback for data URI
      const matches = existingImageUri.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches) {
        contents.push({
          inlineData: { data: matches[2], mimeType: matches[1] },
        });
      }
    }
  }

  contents.push({ text: fullPrompt });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: contents }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      candidateCount: numberOfImages,
    } as any,
  });

  const response = result.response;

  // Check for safety blocks or other reasons for no candidates
  if (!response.candidates || response.candidates.length === 0) {
    let blockMessage = 'Image generation failed. The request was likely blocked by safety filters or another issue.';
    if (response.promptFeedback?.blockReason) {
      blockMessage += ` Reason: ${response.promptFeedback.blockReason}.`;
    }
    // The `text()` helper will get any text response, which might contain more info
    const textResponse = response.text();
    if(textResponse) {
        blockMessage += ` Model response: "${textResponse}"`;
    }
    throw new Error(blockMessage);
  }

  const generatedImageUris: string[] = [];
  for (const candidate of response.candidates) {
    const parts = candidate.content.parts;
    for (const part of parts) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType || 'image/png';
        const generatedImageUri = `data:${mimeType};base64,${part.inlineData.data}`;
        generatedImageUris.push(generatedImageUri);
      }
    }
  }
  
  // If we get here, candidates were returned, but none contained an image.
  if (generatedImageUris.length === 0) {
    const textResponse = response.text();
    let errorMessage = 'Image generation failed: No image was returned by the model.';
    if (textResponse) {
      errorMessage += ` The model responded with: "${textResponse}"`;
    }
    throw new Error(errorMessage);
  }
  
  return { generatedImageUris };
}
