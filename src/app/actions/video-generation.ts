'use server';

export const maxDuration = 600; // Tăng timeout lên 10 phút (300 giây) đối với Vercel Pro/Firebase hoặc cao hơn tùy Server

import { 
  aiVideoGeneration as aiVideoGenerationFlow,
  type AiVideoGenerationInput,
} from '@/ai/flows/ai-video-generation-flow';

/**
 * This is the server action that the client will call.
 * It wraps the actual Genkit flow.
 */
export async function aiVideoGeneration(
  input: AiVideoGenerationInput
) {
  return aiVideoGenerationFlow(input);
}
