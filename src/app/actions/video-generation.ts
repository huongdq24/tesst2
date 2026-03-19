'use server';

import {
  startVideoGeneration as startVideoGenerationFlow,
  type StartVideoGenerationInput,
  type StartVideoGenerationOutput,
} from '@/ai/flows/ai-video-generation-flow';

/**
 * Server action to START the video generation process.
 * Returns the operation name or video URL to the client.
 */
export async function startVideoGeneration(
  input: StartVideoGenerationInput
): Promise<StartVideoGenerationOutput> {
  return startVideoGenerationFlow(input);
}
