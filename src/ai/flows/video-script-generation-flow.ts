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
4. TRANSLATION: Always translate user input to English.
</core_logic>

<cinematic_motion_protocol>
If the user specifies camera motion, use it.
If not, infer a cinematic camera movement:
- Fast subjects (cars, running): "Dynamic tracking shot, motion blur..."
- Large scenes (landscapes): "Slow aerial drone pan, sweeping shot..."
- Portraits/Products: "Subtle slow push-in, shallow depth of field..."
</cinematic_motion_protocol>

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
            const response = await fetch(uri);
            if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
            const buffer = await response.arrayBuffer();
            const base64Data = Buffer.from(buffer).toString('base64');
            const mimeType = response.headers.get('content-type') || 'image/jpeg';
            return `data:${mimeType};base64,${base64Data}`;
          } catch (error) {
            console.error(`[ScriptGen] Error converting image URL:`, error);
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

    const modelToUse = input.model || 'gemini-3.1-pro-preview';

    const { output } = await aiInstance.generate({
      model: googleAI.model(modelToUse as any),
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
      throw new Error('[ScriptGen] Failed to generate video script.');
    }
    return output;
  }
);
