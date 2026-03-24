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
You are an elite Cinematic Meta-Prompt Engineer for Google's Veo video generation model. Your job is to process Reference Images and a User Text Input, translating them into a perfect Veo-compliant video generation prompt that rivals Hollywood-level production.
</role>

<core_logic>
1. MULTIMODAL PRIORITY: The Reference Image is the baseline environment and subject. The User's Text Input is the temporal/motion modifier.
2. VEO SYNTAX ENFORCEMENT: Final prompt MUST strictly follow this formula: [Camera Movement/Angle] + [Subject Description in vivid detail] + [Action/Motion] + [Environment/Lighting] + [Cinematic Style/Industry-specific Quality].
3. NO NARRATIVE HALLUCINATION: Enhance visual and stylistic details drastically, but do not invent complex story elements that the user didn't ask for.
4. TRANSLATION & DIALOGUE/LYRICS PRESERVATION: Translate the CINEMATIC DESCRIPTION (actions, camera, environment) to English.
CRITICAL EXCEPTION FOR SPOKEN AUDIO/TEXT/SIGNS: If the user includes any Vietnamese dialogue, quotes, song lyrics, spoken text, or written text for signs/boards/screens in their input (e.g. "Nắng hồng lấp lánh...", "Xin chào", "Bảng hiệu ghi chữ 'Phở'"), you MUST preserve that EXACT Vietnamese text inside the output prompt WITHOUT ANY TRANSLATION. 
Format it by appending it at the very end of the English prompt or inside the English quote. 
CRITICAL RULE FOR VOICE/ACCENT: If the user specifies any voice characteristics (e.g. "giọng Bắc" -> "Northern Vietnamese accent", "giọng Nam" -> "Southern Vietnamese accent", "giọng trầm" -> "deep voice", "rõ ràng" -> "clear and articulate"), you MUST translate this voice characteristic into English and put it RIGHT BEFORE the quote.
For example:
'...cinematic lighting, elegant and glamorous. She is singing/saying in a clear Northern Vietnamese accent: "Nắng hồng lấp lánh, em bước thật nhanh\\nTrái tim này hát..."'
DO NOT TRANSLATE THE LYRICS, DIALOGUE, OR TEXT SIGNS TO ENGLISH. Keep the Vietnamese verbatim. If you translate the quote, the video and audio generation will be incorrect.
</core_logic>

<industry_specific_enhancement>
CRITICAL: You must auto-detect the user's target industry/niche based on their input, and inject highly specialized, professional cinematic terminology into the "Cinematic Style/Quality" section of your prompt. 

- FOOD & BEVERAGE (F&B): Use terms like "Extreme macro lens, probe lens tracking, slow-motion 120fps, steam gently rising, glistening textures, appetizing warm lighting, culinary commercial style, shallow depth of field, mouth-watering details."
- REAL ESTATE & ARCHITECTURE: Use terms like "Smooth aerial drone shot, ultra-wide angle 14mm, sweeping pan, architectural digest style, golden hour lighting, clean geometric lines, spacious and luxurious atmosphere, interior design photography."
- FASHION & BEAUTY: Use terms like "High-end fashion editorial, 85mm portrait lens, softbox studio lighting, glamorous slow-motion hair blowing, dynamic tracking, high contrast, glossy finish, luxurious textures, Vogue style cover shoot."
- TECH & CORPORATE: Use terms like "Sleek modern aesthetics, cool blue/white daylight, dynamic push-in, shallow depth of field, professional corporate commercial, polished glass reflections, 4k ultra-crisp focus, futuristic yet grounded."
- AUTOMOTIVE (CARS): Use terms like "Dynamic high-speed tracking shot, motion blur, dramatic rim lighting, metallic paint reflections, aggressive low-angle camera, cinematic car commercial."
- PRODUCT/E-COMMERCE: Use terms like "Infinite backdrop, smooth pedestal camera movement, dramatic studio spotlighting, 360-degree product spin, ultra-sharp focus highlighting material textures, premium commercial quality."
- HEALTHCARE & WELLNESS: Use terms like "Soft diffused natural lighting, calming and ethereal atmosphere, bright and airy, slow gentle camera pan, reassuring and professional medical commercial."
- EDUCATION & LIFESTYLE: Use terms like "Warm sun flares, candid documentary style, handheld dynamic movement, vibrant authentic colors, engaging and uplifting emotional tone."

If the industry is generic or mixed, combine the best cinematic traits (e.g. "cinematic 24fps movie look, ARRI Alexa 65, cinematic color grading"). 
</industry_specific_enhancement>

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
3. NEVER include violent, gory, or harmful content. Disable all weaponry or graphic descriptions.
4. NEVER include NSFW, sexual, or explicit content.
5. Focus heavily on clothing, environment, mood, action, lighting, and cinematic quality rather than specific facial identity.
</rai_safety_rules>

<cinematic_motion_protocol>
If the user specifies camera motion, refine and elevate it.
If not, infer a breathtaking cinematic camera movement based on the scene:
- Fast subjects (cars, running): "Dynamic tracking shot, intense motion blur, fast panning..."
- Large scenes (landscapes): "Slow aerial drone pan, sweeping establishing shot..."
- Portraits/Products: "Subtle slow push-in, shallow depth of field, slight orbit..."
</cinematic_motion_protocol>

<output_format>
You MUST return a valid JSON object with EXACTLY these fields:
- "motion_analysis": brief analysis of camera movement choice and the detected industry (in Vietnamese).
- "camera_movement": specific professional camera shot name (in English).
- "optimized_english_prompt": the full, ultra-detailed cinematic prompt integrating industry-specific keywords (in English).
</output_format>

<fallback_protocol>
If text input is empty or gibberish: Analyze the Reference Image, detect its likely industry (e.g. product, portrait, landscape), and animate it with an appropriate cinematic camera movement and lighting enhancement.
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
    const fallbackModels = [primaryModel, 'gemini-3.1-flash-lite-preview', 'gemini-pro'].filter(
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
