import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

// FIX #2: The global Genkit instance is a fallback when no user-specific API key is provided.
// The app primarily uses user-specific API keys via genkitCache in the generation flows.
// We pass undefined (not empty string) when no env key exists, so the plugin doesn't try
// to authenticate with an empty key.
const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY || undefined;

export const ai = genkit({
  plugins: [googleAI(apiKey ? { apiKey } : {})],
  model: 'googleai/gemini-2.5-flash',
});
