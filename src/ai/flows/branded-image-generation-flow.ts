'use server';
import { z } from 'zod';
import { GoogleGenerativeAI, Part } from '@google/genai';
import { Buffer } from 'buffer';

const BrandedImageGenerationInputSchema = z.object({
  existingImageUris: z.array(z.string()).optional(),
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
  const { existingImageUris, generationPrompt, aspectRatio, numberOfImages, apiKey } = input;
  if (!apiKey) {
    throw new Error('Gemini API key is required. Please add your API key in settings.');
  }

  const fullPrompt = aspectRatio
    ? `${generationPrompt}, aspect ratio ${aspectRatio}`
    : generationPrompt;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });
  
  const contents: Part[] = [];

  if (existingImageUris && existingImageUris.length > 0) {
    const imagePartsPromises = existingImageUris.map(async (uri) => {
      try {
        if (uri.startsWith('https://')) {
          const response = await fetch(uri);
          if (!response.ok) {
            console.warn(`Failed to fetch image from Storage: ${uri}. Status: ${response.statusText}`);
            return null;
          }
          const buffer = await response.arrayBuffer();
          const base64Data = Buffer.from(buffer).toString('base64');
          const mimeType = response.headers.get('content-type') || 'image/jpeg';
          return { inlineData: { data: base64Data, mimeType } };
        } else {
          const matches = uri.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches) {
            return { inlineData: { data: matches[2], mimeType: matches[1] } };
          }
        }
      } catch (error) {
        console.error(`Error processing image URI ${uri}:`, error);
        return null;
      }
      return null;
    });

    const resolvedImageParts = await Promise.all(imagePartsPromises);
    
    resolvedImageParts.forEach(part => {
      if (part) {
        contents.push(part);
      }
    });
  }

  contents.push({ text: fullPrompt });

  const contentRequest = {
    contents: [{ role: 'user', parts: contents }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      // The `gemini-3.1-flash-image-preview` model does not support multiple candidates,
      // so we always set candidateCount to 1.
      candidateCount: 1,
    } as any,
  };

  // To generate multiple images, we must make parallel requests.
  const generationPromises = Array.from({ length: numberOfImages }).map(() =>
    model.generateContent(contentRequest)
  );

  const results = await Promise.all(generationPromises);
  
  const generatedImageUris: string[] = [];
  let firstErrorText: string | null = null;
  let hasBlockedRequest = false;

  for (const result of results) {
    const response = result.response;
    
    if (!response.candidates || response.candidates.length === 0) {
        hasBlockedRequest = true;
        if (response.promptFeedback?.blockReason && !firstErrorText) {
            firstErrorText = `Reason: ${response.promptFeedback.blockReason}.`;
        }
        const textResponse = response.text();
        if (textResponse && !firstErrorText) {
            firstErrorText = `Model response: "${textResponse}"`;
        }
      continue; // Skip this result if it has no candidates
    }

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
  }
  
  // If we end up with no images at all, throw a detailed error.
  if (generatedImageUris.length === 0) {
    let errorMessage = 'Image generation failed for all requests.';
    if(hasBlockedRequest){
        errorMessage += ' The request was likely blocked by safety filters.';
        if(firstErrorText){
            errorMessage += ` ${firstErrorText}`;
        }
    } else {
        errorMessage += ' No images were returned by the model.';
    }
    throw new Error(errorMessage);
  }
  
  return { generatedImageUris };
}
