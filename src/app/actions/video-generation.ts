'use server';

export const maxDuration = 300; // Set timeout to 5 minutes

import { 
  aiVideoGeneration as aiVideoGenerationFlow,
  type AiVideoGenerationInput,
  type AiVideoGenerationOutput
} from '@/ai/flows/ai-video-generation-flow';

/**
 * This is the server action that the client will call.
 * It wraps the actual Genkit flow and is configured with a longer timeout.
 */
export async function aiVideoGeneration(
  input: AiVideoGenerationInput
): Promise<AiVideoGenerationOutput> {
  return aiVideoGenerationFlow(input);
}
