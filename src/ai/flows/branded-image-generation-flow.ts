'use server';
import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
const BrandedImageGenerationInputSchema = z.object({
  existingImageUri: z.string().optional(),
  generationPrompt: z.string(),
  apiKey: z.string().describe('The user Gemini API key to use for generation.'),
});
export type BrandedImageGenerationInput = z.infer<typeof BrandedImageGenerationInputSchema>;
const BrandedImageGenerationOutputSchema = z.object({
  generatedImageUri: z.string(),
});
export type BrandedImageGenerationOutput = z.infer<typeof BrandedImageGenerationOutputSchema>;
export async function brandedImageGeneration(
  input: BrandedImageGenerationInput
): Promise<BrandedImageGenerationOutput> {
  const { existingImageUri, generationPrompt, apiKey } = input;
  if (!apiKey) {
    throw new Error('Gemini API key is required. Please add your API key in settings.');
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-preview-image-generation' });
  const contents: any[] = [];
  if (existingImageUri) {
    // Parse data URI to extract base64 data and mimeType
    const matches = existingImageUri.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches) {
      const mimeType = matches[1];
      const base64Data = matches[2];
      contents.push({
        inlineData: { data: base64Data, mimeType },
      });
    }
  }
  contents.push({ text: generationPrompt });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: contents }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
    } as any,
  });
  const response = result.response;
  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData && part.inlineData.data) {
      const mimeType = part.inlineData.mimeType || 'image/png';
      const generatedImageUri = `data:${mimeType};base64,${part.inlineData.data}`;
      return { generatedImageUri };
    }
  }
  throw new Error('Image generation failed: No image was returned by the model.');
}
