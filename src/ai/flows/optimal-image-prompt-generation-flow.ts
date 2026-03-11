'use server';
import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
const OptimalImagePromptGenerationInputSchema = z.object({
  description: z.string(),
  apiKey: z.string().describe('The user Gemini API key.'),
});
export type OptimalImagePromptGenerationInput = z.infer<typeof OptimalImagePromptGenerationInputSchema>;
const OptimalImagePromptGenerationOutputSchema = z.object({
  optimalPrompt: z.string(),
});
export type OptimalImagePromptGenerationOutput = z.infer<typeof OptimalImagePromptGenerationOutputSchema>;
export async function optimalImagePromptGeneration(
  input: OptimalImagePromptGenerationInput
): Promise<OptimalImagePromptGenerationOutput> {
  const { description, apiKey } = input;
  if (!apiKey) {
    throw new Error('Gemini API key is required. Please add your API key in settings.');
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const systemPrompt = `You are an expert in crafting image generation prompts for advanced AI models like Gemini or Imagen. Your task is to take a simple user description and expand it into a detailed, rich, and effective prompt. The generated prompt should be a single, coherent paragraph.
Guidelines:
- Be Descriptive: Add details about the subject, setting, lighting (e.g., "cinematic lighting", "soft rim light"), colors, mood, and composition.
- Style and Medium: Specify an artistic style (e.g., "digital art", "photorealistic", "oil painting", "cyberpunk").
- Technical Details: Include camera-related terms where appropriate (e.g., "depth of field", "wide-angle shot", "4k resolution").
- Keywords: Use strong, evocative keywords that the model can easily interpret.
- DO NOT use lists or bullet points. The output must be a single paragraph.
User's Simple Description: "${description}"
Generated Optimized Prompt (single paragraph only):`;
  const result = await model.generateContent(systemPrompt);
  const optimalPrompt = result.response.text().trim();
  if (!optimalPrompt) {
    throw new Error('Failed to generate an optimized prompt.');
  }
  return { optimalPrompt };
}
