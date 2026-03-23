'use server';
/**
 * @fileOverview Genkit flow để tạo kịch bản video từ mô tả văn bản và ảnh tham chiếu.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { genkit, z } from 'genkit';
import { Buffer } from 'buffer';

// BUG #6 FIX: Cache Genkit instances to prevent memory leaks.
const genkitCache = new Map<string, ReturnType<typeof genkit>>();
function getOrCreateGenkit(apiKey?: string) {
    if (!apiKey) return ai; // Fallback to global instance if no key
    if (!genkitCache.has(apiKey)) {
        genkitCache.set(apiKey, genkit({
            plugins: [googleAI({ apiKey })],
        }));
    }
    return genkitCache.get(apiKey)!;
}

const VideoScriptGenerationInputSchema = z.object({
  description: z.string().describe('Mô tả nội dung video muốn tạo.'),
  imageUris: z
    .array(z.string())
    .optional()
    .describe("Ảnh tham chiếu dạng data URI hoặc public URL. Format: 'data:<mime>;base64,...' hoặc 'https://...'"),
  model: z.string().optional().describe('The model to use for script generation.'),
  apiKey: z.string().optional().describe("The user's Gemini API Key."),
});
export type VideoScriptGenerationInput = z.infer<typeof VideoScriptGenerationInputSchema>;

const VideoScriptGenerationOutputSchema = z.object({
  motion_analysis: z.string().describe('Phân tích ngắn về chuyển động camera phù hợp.'),
  camera_movement: z.string().describe('Camera shot cụ thể (ví dụ: Slow push-in, Drone tracking).'),
  optimized_english_prompt: z
    .string()
    .describe(
      'Prompt tiếng Anh tối ưu cho Veo: [Camera Movement] + [Subject] + [Action] + [Environment/Lighting] + [Cinematic Style/Quality].'
    ),
});
export type VideoScriptGenerationOutput = z.infer<typeof VideoScriptGenerationOutputSchema>;

export async function videoScriptGeneration(
  input: VideoScriptGenerationInput
): Promise<VideoScriptGenerationOutput> {
  return videoScriptGenerationFlow(input);
}

const systemPrompt = `<role>
You are an elite Cinematic Meta-Prompt Engineer for Google's Veo video generation model. Your job is to process Reference Images and a User Text Input, translating them into a perfect Veo-compliant video generation prompt.
</role>

<core_logic>
1. MULTIMODAL PRIORITY: The Reference Image is the baseline environment and subject. The User's Text Input is the temporal/motion modifier.
2. LOW NARRATIVE EXPANSION: Keep subject and action strictly aligned with the user's short input. Do not invent complex story elements.
3. VEO SYNTAX ENFORCEMENT: Final prompt MUST follow: [Camera Movement] + [Subject Description] + [Action/Motion] + [Environment/Lighting] + [Cinematic Style/Quality].
4. TRANSLATION & DIALOGUE/LYRICS PRESERVATION: Translate the CINEMATIC DESCRIPTION (actions, camera, environment) to English.
CRITICAL EXCEPTION: If the user includes any Vietnamese dialogue, quotes, song lyrics, or spoken text in their input (e.g. "Nắng hồng lấp lánh..."), you MUST preserve that EXACT Vietnamese text inside the output prompt without translating it.
Format it by appending it at the very end of the English prompt. For example:
'...cinematic lighting, elegant and glamorous. She is singing/saying: "Nắng hồng lấp lánh, em bước thật nhanh\\nTrái tim này hát..."'
Do not translate the lyrics or dialogue. Keep the Vietnamese verbatim.
</core_logic>

<ultra_detailed_person_description>
CRITICAL: Because the reference image may be blocked by the safety filter, the optimized_english_prompt MUST be detailed enough to recreate the person WITHOUT needing the image. When you see a person in the reference image, describe ALL of these in the prompt:
- GENDER & APPROXIMATE AGE: e.g. "a young woman in her early 20s"
- ETHNICITY/SKIN TONE (generic): e.g. "East Asian with fair skin"
- HAIR: color, length, style (e.g. "long straight black hair with subtle highlights")
- OUTFIT: exact clothing description including colors, textures, patterns (e.g. "wearing a pink plaid crop top layered over a salmon pink tank top")
- ACCESSORIES: jewelry, glasses, hats, etc.
- BODY LANGUAGE & POSE: what they're doing physically (e.g. "standing confidently with one hand on hip")
- FACIAL EXPRESSION: exact expression (e.g. "bright smile with a playful wink")
- BACKGROUND/SETTING: describe the environment in detail
This ensures the video generation model can create a visually matching character even in text-only mode.
</ultra_detailed_person_description>

<rai_safety_rules>
CRITICAL: The output prompt MUST pass Google's Responsible AI (RAI) safety filters:
1. NEVER reference real people, celebrities, politicians, or public figures by name or likeness. Replace with generic descriptions.
2. NEVER describe children in photorealistic contexts. Use "young animated characters" instead.
3. NEVER include violent, gory, or harmful content.
4. NEVER include NSFW, sexual, or explicit content.
5. When describing people from reference images, use GENERIC descriptions. NEVER try to identify who is in the image.
6. Focus on clothing, environment, mood, action, and cinematic quality rather than facial identity.
</rai_safety_rules>

<cinematic_motion_protocol>
If the user specifies camera motion, use it.
If not, infer a cinematic camera movement:
- Fast subjects (cars, running): "Dynamic tracking shot, motion blur..."
- Large scenes (landscapes): "Slow aerial drone pan, sweeping shot..."
- Portraits/Products: "Subtle slow push-in, shallow depth of field..."
</cinematic_motion_protocol>

<output_format>
You MUST return a valid JSON object with EXACTLY these fields:
- "motion_analysis": brief analysis of camera movement choice
- "camera_movement": specific camera shot name
- "optimized_english_prompt": the full detailed cinematic prompt
</output_format>

<fallback_protocol>
If text input is empty or gibberish: Analyze the Reference Image and animate it with an appropriate cinematic camera movement.
</fallback_protocol>`;

const videoScriptGenerationFlow = ai.defineFlow(
  {
    name: 'videoScriptGenerationFlow',
    inputSchema: VideoScriptGenerationInputSchema,
    outputSchema: VideoScriptGenerationOutputSchema,
  },
  async (input) => {
    // BUG #6 FIX: Use cached Genkit instance
    const aiInstance = getOrCreateGenkit(input.apiKey);

    const promptParts: any[] = [];

    // Xử lý ảnh tham chiếu
    if (input.imageUris && input.imageUris.length > 0) {
      const dataUriPromises = input.imageUris.map(async (uri) => {
        if (uri.startsWith('https://')) {
          try {
            // FIX: Add 15-second timeout to prevent hanging on slow Firebase URLs
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            const response = await fetch(uri, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
            const buffer = await response.arrayBuffer();
            const base64Data = Buffer.from(buffer).toString('base64');
            const mimeType = response.headers.get('content-type') || 'image/jpeg';
            return `data:${mimeType};base64,${base64Data}`;
          } catch (error: any) {
            if (error.name === 'AbortError') {
              console.error(`[ScriptGen] Timeout fetching image: ${uri}`);
            } else {
              console.error(`[ScriptGen] Error converting image URL:`, error.message);
            }
            return null;
          }
        }
        return uri;
      });

      const resolvedUris = await Promise.all(dataUriPromises);
      resolvedUris.forEach((uri) => {
        if (uri) {
          const match = uri.match(/^data:(.*?);base64,/);
          const contentType = match ? match[1] : 'image/jpeg';
          promptParts.push({ media: { url: uri, contentType } });
        }
      });
    }

    promptParts.push({ text: input.description });

    const primaryModel = input.model || 'gemini-3.1-flash-lite-preview';
    const fallbackModels = [primaryModel, 'gemini-3.1-flash-lite-preview', 'gemini-2.0-flash'].filter(
      (m, i, arr) => arr.indexOf(m) === i // deduplicate
    );

    let lastError: any = null;
    for (const modelName of fallbackModels) {
      try {
        console.log(`[ScriptGen] Trying model: ${modelName}`);
        const { output } = await aiInstance.generate({
          model: googleAI.model(modelName as any),
          prompt: promptParts,
          system: systemPrompt,
          output: {
            format: 'json',
            schema: VideoScriptGenerationOutputSchema,
          },
          config: {
            temperature: 0.3,
          },
        });

        if (!output) {
          throw new Error(`[ScriptGen] Model ${modelName} returned empty output.`);
        }
        console.log(`[ScriptGen] Success with model: ${modelName}`);
        return output;
      } catch (err: any) {
        lastError = err;
        console.warn(`[ScriptGen] Model ${modelName} failed: ${err.message}. Trying next fallback...`);
      }
    }

    throw new Error(`[ScriptGen] All models failed. Last error: ${lastError?.message || 'Unknown error'}`);
  }
);
