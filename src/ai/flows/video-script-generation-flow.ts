'use server';
/**
 * @fileOverview This file defines a Genkit flow for generating a video script from a text description.
 *
 * - videoScriptGeneration - A function that handles the script generation process.
 * - VideoScriptGenerationInput - The input type for the videoScriptGeneration function.
 * - VideoScriptGenerationOutput - The return type for the videoScriptGeneration function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

const VideoScriptGenerationInputSchema = z.object({
  description: z.string().describe('A description of the desired video content to generate a script for.'),
});
export type VideoScriptGenerationInput = z.infer<typeof VideoScriptGenerationInputSchema>;

const VideoScriptGenerationOutputSchema = z.object({
  script: z.string().describe('The generated video script.'),
});
export type VideoScriptGenerationOutput = z.infer<typeof VideoScriptGenerationOutputSchema>;

export async function videoScriptGeneration(input: VideoScriptGenerationInput): Promise<VideoScriptGenerationOutput> {
  return videoScriptGenerationFlow(input);
}

const videoScriptGenerationPrompt = ai.definePrompt({
  name: 'videoScriptGenerationPrompt',
  model: googleAI.model('gemini-3.1-pro-preview'),
  input: { schema: VideoScriptGenerationInputSchema },
  output: { schema: VideoScriptGenerationOutputSchema },
  prompt: `You are a professional screenwriter. Based on the following description, write a short, compelling video script. The script should be descriptive and suitable for a text-to-video AI model.

Description: {{{description}}}

Generated Script:`,
});

const videoScriptGenerationFlow = ai.defineFlow(
  {
    name: 'videoScriptGenerationFlow',
    inputSchema: VideoScriptGenerationInputSchema,
    outputSchema: VideoScriptGenerationOutputSchema,
  },
  async (input) => {
    const { output } = await videoScriptGenerationPrompt(input);
    if (!output) {
      throw new Error('Failed to generate script.');
    }
    return output;
  }
);
