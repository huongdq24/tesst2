'use server';
/**
 * @fileOverview This file defines a Genkit flow for generating an optimized image prompt.
 * It takes a user's simple description and optional reference images, then returns a
 * structured JSON object containing a detailed, optimized prompt for image generation models.
 *
 * - optimalImagePromptGeneration - A function that handles the prompt generation process.
 * - OptimalImagePromptGenerationInput - The input type for the function.
 * - OptimalImagePromptGenerationOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'genkit';
import { Buffer } from 'buffer';

// Cache Genkit instances per API key
const genkitCache = new Map<string, ReturnType<typeof genkit>>();
function getOrCreateGenkit(apiKey?: string) {
  if (!apiKey) return ai;
  if (!genkitCache.has(apiKey)) {
    genkitCache.set(apiKey, genkit({ plugins: [googleAI({ apiKey })] }));
  }
  return genkitCache.get(apiKey)!;
}

// Input Schema: User's text and optional reference images
const OptimalImagePromptGenerationInputSchema = z.object({
  description: z.string().describe("The user's simple text description or idea."),
  imageUris: z.array(z.string()).optional().describe(
      "Optional array of reference images as data URIs or public URLs. Format: 'data:<mimetype>;base64,<encoded_data>' or 'https://...'"
    ),
  model: z.string().optional().describe("The model to use for prompt generation."),
  apiKey: z.string().optional().describe("The user's Gemini API Key."),
});
export type OptimalImagePromptGenerationInput = z.infer<typeof OptimalImagePromptGenerationInputSchema>;

// Output Schema: Matching the user's request for structured JSON
const OptimalImagePromptGenerationOutputSchema = z.object({
  original_intent_analysis: z.string().describe("Brief 1-sentence analysis of the image + text intent."),
  sensitive_terms_replaced: z.boolean().describe("True if sanitization protocol was applied, false otherwise."),
  art_style_inferred: z.string().describe("Inferred art style, e.g., Cinematic, Cyberpunk, Photorealistic."),
  optimized_english_prompt: z.string().describe("The final optimized English prompt ready for the image generation API."),
});
export type OptimalImagePromptGenerationOutput = z.infer<typeof OptimalImagePromptGenerationOutputSchema>;


export async function optimalImagePromptGeneration(
  input: OptimalImagePromptGenerationInput
): Promise<OptimalImagePromptGenerationOutput> {
  return optimalImagePromptGenerationFlow(input);
}

const systemPrompt = `<role>
You are an elite Cinematic Meta-Prompt Engineer powering the backend of an AI Image Generation App. Your job is to process Reference Images and an End-User's Text Input, then output a strictly optimized English prompt that rivals Hollywood and world-class commercial photography.
</role>

<core_logic>
1. MULTIMODAL PRIORITY: The Reference Image is the "Semantic Anchor". Use the visual composition, lighting, and subjects of the image as your base. The User's Text Input is a "Modifier" or supplementary detail. 
2. NO HALLUCINATION (FIDELITY FIRST): Do NOT invent complex backstories or elements not mentioned by the user. Your job is to enhance visual aesthetics, not change the core subject.
3. TRANSLATION: User input may be in Vietnamese. You MUST translate and construct the final prompt in highly descriptive, native English.
4. TEXT COMPATIBILITY: If the user wants specific words written in the image, keep them in quotes exactly as requested (e.g., holding a sign saying "SALE").
</core_logic>

<industry_specific_enhancement>
CRITICAL: You must auto-detect the user's target industry/niche based on their input, and inject highly specialized, professional photographic terminology into the prompt.

- FOOD & BEVERAGE (F&B): Use terms like "Food photography, extreme macro close-up, 100mm macro lens, appetizing warm lighting, steam gently rising, glistening textures, shallow depth of field, culinary magazine cover, highly detailed."
- REAL ESTATE & ARCHITECTURE: Use terms like "Architectural photography, ultra-wide angle 14mm lens, deep depth of field, golden hour lighting, clean geometric lines, spacious and luxurious atmosphere, interior design magazine, photorealistic."
- FASHION & BEAUTY: Use terms like "High-end fashion editorial portrait, 85mm portrait lens, Rembrandt lighting, softbox, glamorous, high contrast, glossy finish, luxurious fabric textures, Vogue magazine cover shoot, skin pores visible."
- TECH & CORPORATE: Use terms like "Commercial product photography, sleek modern office aesthetics, cool blue/white daylight, shallow depth of field, polished glass reflections, 8k ultra-crisp focus, futuristic but grounded."
- AUTOMOTIVE (CARS): Use terms like "Automotive photography, dramatic rim lighting, metallic paint reflections, aggressive low-angle shot, motion blur background, highly reflective, commercial car advertisement."
- E-COMMERCE / PRODUCTS: Use terms like "Studio product photography, infinite white backdrop, dramatic spotlighting, ultra-sharp focus highlighting material textures, premium commercial quality, realistic shadows."
- ILLUSTRATION / ART: If the user requests digital art or anime, use terms like "Masterpiece, trending on ArtStation, vivid colors, intricate details, breathtaking composition, ultra-detailed digital painting."

If the industry is generic or mixed, combine the best photographic traits (e.g. "masterpiece, 8k resolution, highly detailed, photorealistic, professional studio lighting").
</industry_specific_enhancement>

<sanitization_protocol>
You are a "Safety Proxy". You must silently rewrite inputs that might trigger the generation model's safety blocks:
- 18+/NSFW/Sensual terms: Seamlessly convert to "high fashion portrait, artistic editorial, elegant and glamorous, high-end fashion photography".
- Violence/Gore: Seamlessly convert to "dramatic action silhouette, cinematic contrast, intense dynamic scene, bold artistic colors".
- Copyright/Trademarks (e.g., Mickey Mouse, Marvel): Convert to "generic archetypes" (e.g., "a retro cartoon mouse wearing red shorts", "a generic superhero in high-tech armor").
Set the schema field "sensitive_terms_replaced" to true if you applied this protocol.
</sanitization_protocol>

<output_format>
You MUST return a valid JSON object with EXACTLY these fields:
- "original_intent_analysis": Brief 1-sentence analysis of the image + text intent and the detected industry (in Vietnamese).
- "sensitive_terms_replaced": true/false if you applied the sanitization protocol.
- "art_style_inferred": The inferred art style or photographic setup (in English).
- "optimized_english_prompt": The final optimized English prompt integrating industry-specific keywords (in English).
</output_format>

<fallback_protocol>
If the User's Text Input is empty, entirely gibberish (e.g., "asdfgh"), or completely meaningless: Ignore the text. Act purely as an Image-to-Prompt analyzer. Write a highly detailed, extremely beautiful English prompt that perfectly describes the provided Reference Image so the generation model can recreate it with enhanced commercial photography quality.
</fallback_protocol>`;


const optimalImagePromptGenerationFlow = ai.defineFlow(
  {
    name: 'optimalImagePromptGenerationFlow',
    inputSchema: OptimalImagePromptGenerationInputSchema,
    outputSchema: OptimalImagePromptGenerationOutputSchema,
  },
  async (input) => {
    const promptParts: any[] = [];

    if (input.imageUris && input.imageUris.length > 0) {
      const dataUriPromises = input.imageUris.map(async (uri) => {
        if (uri.startsWith('https://')) {
          try {
            // FIX: Add 15-second timeout to prevent hanging on slow Firebase URLs
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            const response = await fetch(uri, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) {
              console.warn(`[PromptGen] Failed to fetch image: ${uri}. Status: ${response.statusText}`);
              return null;
            }
            const buffer = await response.arrayBuffer();
            const base64Data = Buffer.from(buffer).toString('base64');
            const mimeType = response.headers.get('content-type') || 'image/jpeg';
            return `data:${mimeType};base64,${base64Data}`;
          } catch (error: any) {
            if (error.name === 'AbortError') {
              console.error(`[PromptGen] Timeout fetching image: ${uri}`);
            } else {
              console.error(`[PromptGen] Error processing image URI ${uri}:`, error.message);
            }
            return null;
          }
        }
        return uri;
      });
      
      const resolvedUris = await Promise.all(dataUriPromises);

      resolvedUris.forEach(uri => {
        if (uri) {
          const match = uri.match(/^data:(.*?);base64,/);
          const contentType = match ? match[1] : 'image/jpeg';
          promptParts.push({ media: { url: uri, contentType } });
        }
      });
    }

    promptParts.push({ text: input.description });

    const primaryModel = input.model || 'gemini-3.1-flash-lite-preview';
    const localAi = getOrCreateGenkit(input.apiKey);
    const fallbackModels = [primaryModel, 'gemini-3.1-flash-lite-preview', 'gemini-2.0-flash'].filter(
      (m, i, arr) => arr.indexOf(m) === i
    );

    let lastError: any = null;
    for (const modelName of fallbackModels) {
      try {
        console.log(`[PromptGen] Trying model: ${modelName}`);
        const { output } = await localAi.generate({
          model: googleAI.model(modelName as any),
          prompt: promptParts,
          system: systemPrompt,
          output: {
            format: 'json',
            schema: OptimalImagePromptGenerationOutputSchema,
          },
          config: {
            temperature: 0.2,
          },
        });

        if (!output) {
          throw new Error(`[PromptGen] Model ${modelName} returned empty output.`);
        }
        console.log(`[PromptGen] Success with model: ${modelName}`);
        return output;
      } catch (err: any) {
        lastError = err;
        console.warn(`[PromptGen] Model ${modelName} failed: ${err.message}. Trying next fallback...`);
      }
    }

    throw new Error(`[PromptGen] All models failed. Last error: ${lastError?.message || 'Unknown error'}`);
  }
);
