'use server';
/**
 * @fileOverview A Genkit flow for generating an optimized image prompt from a simple description.
 *
 * - optimalImagePromptGeneration - A function that handles the prompt generation process.
 * - OptimalImagePromptGenerationInput - The input type for the function.
 * - OptimalImagePromptGenerationOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

const OptimalImagePromptGenerationInputSchema = z.object({
  description: z.string().describe('A simple description of the desired image.'),
});
export type OptimalImagePromptGenerationInput = z.infer<typeof OptimalImagePromptGenerationInputSchema>;

const OptimalImagePromptGenerationOutputSchema = z.object({
  optimalPrompt: z.string().describe('The generated, optimized prompt for image generation.'),
});
export type OptimalImagePromptGenerationOutput = z.infer<typeof OptimalImagePromptGenerationOutputSchema>;

export async function optimalImagePromptGeneration(input: OptimalImagePromptGenerationInput): Promise<OptimalImagePromptGenerationOutput> {
  return optimalImagePromptGenerationFlow(input);
}

const optimalImagePromptGenerationPrompt = ai.definePrompt({
  name: 'optimalImagePromptGenerationPrompt',
  model: googleAI.model('gemini-3.1-pro-preview'),
  input: { schema: OptimalImagePromptGenerationInputSchema },
  output: { schema: OptimalImagePromptGenerationOutputSchema },
  prompt: `You are an expert in crafting image generation prompts for advanced AI models like Gemini or Imagen. Your task is to take a simple user description and expand it into a detailed, rich, and effective prompt. The generated prompt should be a single, coherent paragraph.

  **Guidelines for the output prompt:**
  - **Be Descriptive:** Add details about the subject, setting, lighting (e.g., "cinematic lighting", "soft rim light"), colors, mood, and composition.
  - **Style and Medium:** Specify an artistic style (e.g., "digital art", "photorealistic", "oil painting", "steampunk", "cyberpunk").
  - **Technical Details:** Include camera-related terms where appropriate (e.g., "depth of field", "wide-angle shot", "4k resolution", "macro shot").
  - **Keywords:** Use strong, evocative keywords that the model can easily interpret.
  - **DO NOT** use lists or bullet points. The output must be a single paragraph.

  **User's Simple Description:**
  "{{{description}}}"

  **Generated Optimized Prompt (as a single paragraph):**
  `,
});

const optimalImagePromptGenerationFlow = ai.defineFlow(
  {
    name: 'optimalImagePromptGenerationFlow',
    inputSchema: OptimalImagePromptGenerationInputSchema,
    outputSchema: OptimalImagePromptGenerationOutputSchema,
  },
  async (input) => {
    const { output } = await optimalImagePromptGenerationPrompt(input);
    if (!output) {
      throw new Error('Failed to generate an optimized prompt.');
    }
    return { optimalPrompt: output.optimalPrompt };
  }
);
