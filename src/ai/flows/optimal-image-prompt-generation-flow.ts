'use server';
/**
 * @fileOverview This file defines a Genkit flow for generating an optimized image prompt.
 * It takes a user's simple description and optional reference images, then returns a
 * structured JSON object with the prompt broken down into professional segments:
 * [Subject] + [Clothing/Material] + [Action/Pose] + [Setting/Lighting] + [Camera Parameters]
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

// Input Schema
const OptimalImagePromptGenerationInputSchema = z.object({
  description: z.string().describe("The user's simple text description or idea."),
  imageUris: z.array(z.string()).optional().describe(
      "Optional array of reference images as data URIs or public URLs."
    ),
  model: z.string().optional().describe("The model to use for prompt generation."),
  apiKey: z.string().optional().describe("The user's Gemini API Key."),
});
export type OptimalImagePromptGenerationInput = z.infer<typeof OptimalImagePromptGenerationInputSchema>;

// Output Schema: Structured prompt broken into segments
const OptimalImagePromptGenerationOutputSchema = z.object({
  subject: z.string().describe("The main subject description in English (person, product, object, scene)."),
  clothing_material: z.string().describe("Clothing, textures, materials, colors, fabrics description in English. Leave empty if not applicable."),
  action_pose: z.string().describe("Action, pose, gesture, body language, facial expression in English."),
  setting_lighting: z.string().describe("Background environment, setting, lighting conditions, atmosphere, mood in English."),
  camera_parameters: z.string().describe("Camera lens, angle, shot type, depth of field, photography style in English."),
  optimized_english_prompt: z.string().describe("The COMPLETE final optimized English prompt combining all segments above into one flowing paragraph."),
  negative_prompt: z.string().describe("Negative prompt focusing on removing body deformations, text, logos, blurry and low quality elements."),
});
export type OptimalImagePromptGenerationOutput = z.infer<typeof OptimalImagePromptGenerationOutputSchema>;


export async function optimalImagePromptGeneration(
  input: OptimalImagePromptGenerationInput
): Promise<OptimalImagePromptGenerationOutput> {
  return optimalImagePromptGenerationFlow(input);
}

const systemPrompt = `<role>
Bạn là một chuyên gia Prompt Engineering chuyên nghiệp (Professional Prompt Engineer) cho các mô hình AI tạo ảnh (Gemini, Imagen, Midjourney, Flux, DALL-E).
Nhiệm vụ của bạn là phân tích yêu cầu của người dùng hoặc hình ảnh họ cung cấp, sau đó tạo ra một bộ Prompt hoàn chỉnh, có cấu trúc rõ ràng cho AI tạo ảnh.
</role>

<core_rules>
1. LUÔN dùng tiếng Anh chuyên ngành (vải vóc, ánh sáng, góc máy, nhiếp ảnh, nghệ thuật).
2. Viết prompt rõ ràng, chi tiết, không lan man, tập trung vào thẩm mỹ và mô tả trực quan.
3. Nếu đầu vào của người dùng là ngôn ngữ khác (ví dụ: tiếng Việt), bạn phải tự động suy luận và dịch sang tiếng Anh chuẩn xác nhất.
4. Mỗi trường phải có nội dung hữu ích, KHÔNG để trống (trừ clothing_material khi không liên quan).
</core_rules>

<prompt_structure>
Bạn PHẢI trả về JSON với các trường sau, mỗi trường là một phần của prompt:

1. "subject": Mô tả chủ thể chính (người, sản phẩm, vật thể, cảnh vật). Ví dụ: "A confident young Vietnamese woman in her mid-20s with long flowing black hair"
2. "clothing_material": Trang phục, chất liệu, màu sắc, hoa văn. Ví dụ: "wearing an elegant crimson ao dai with intricate gold embroidery, silk fabric with a subtle sheen". Nếu không liên quan (ví dụ: phong cảnh), viết "N/A".
3. "action_pose": Hành động, dáng đứng, cử chỉ, biểu cảm. Ví dụ: "standing gracefully with one hand gently touching a blooming lotus, looking directly at camera with a warm radiant smile"
4. "setting_lighting": Bối cảnh, không gian, ánh sáng, không khí. Ví dụ: "in a lush traditional Vietnamese garden at golden hour, warm sunlight filtering through bamboo leaves, bokeh background with soft pastel tones"
5. "camera_parameters": Thông số máy ảnh, góc chụp, phong cách. Ví dụ: "shot with 85mm f/1.4 portrait lens, shallow depth of field, eye-level angle, professional fashion editorial style, 8K ultra-detailed"
6. "optimized_english_prompt": Ghép TẤT CẢ 5 phần trên thành MỘT đoạn prompt hoàn chỉnh, chảy tự nhiên. Đây là prompt cuối cùng gửi cho AI.
7. "negative_prompt": Prompt loại trừ các yếu tố xấu.
</prompt_structure>

<negative_prompt_rules>
Trường negative_prompt phải tập trung loại bỏ lỗi biến dạng cơ thể (deformed hands, extra fingers), các yếu tố rác (text, logo, blurry), và tăng cường chất lượng (messy hair, low quality, bad anatomy).
</negative_prompt_rules>

<sanitization_protocol>
Bạn đóng vai trò "Safety Proxy". Nếu yêu cầu có chứa từ ngữ vi phạm chính sách (18+, bạo lực, bản quyền):
- 18+/NSFW: Chuyển đổi thành "high fashion portrait, artistic editorial, elegant and glamorous, high-end fashion photography".
- Bạo lực: Chuyển đổi thành "dramatic action silhouette, cinematic contrast, intense dynamic scene".
- Bản quyền: Chuyển đổi thành nhân vật chung chung (ví dụ: Mickey Mouse -> "retro cartoon mouse wearing red shorts").
</sanitization_protocol>`;


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

    const allAvailableModels = [
      'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite-preview',
      'gemini-3-flash-preview',
    ];
    const primaryModel = input.model || allAvailableModels[1];
    const localAi = getOrCreateGenkit(input.apiKey);
    
    const modelsToTry = [primaryModel, ...allAvailableModels].filter(
      (m, i, arr) => arr.indexOf(m) === i
    );

    let lastError: any = null;
    for (const modelName of modelsToTry) {
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
