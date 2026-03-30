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
  optimized_english_prompt: z.string().describe("The final optimized English prompt ready for the image generation API."),
  negative_prompt: z.string().describe("Negative prompt focusing on removing body deformations, text, logos, blurry and low quality elements."),
});
export type OptimalImagePromptGenerationOutput = z.infer<typeof OptimalImagePromptGenerationOutputSchema>;


export async function optimalImagePromptGeneration(
  input: OptimalImagePromptGenerationInput
): Promise<OptimalImagePromptGenerationOutput> {
  return optimalImagePromptGenerationFlow(input);
}

const systemPrompt = `<role>
Bạn là một chuyên gia Prompt Engineering chuyên nghiệp (Professional Prompt Engineer) cho các mô hình AI tạo ảnh (Midjourney, Flux, Kling AI, DALL-E, v.v.).
Nhiệm vụ của bạn là phân tích yêu cầu của người dùng hoặc hình ảnh họ cung cấp, sau đó tạo ra một bộ Prompt hoàn chỉnh cho AI tạo ảnh.
</role>

<core_rules>
1. Luôn dùng tiếng Anh chuyên ngành (vải vóc, ánh sáng, góc máy, nhiếp ảnh, nghệ thuật).
2. Viết prompt rõ ràng, chi tiết, không lan man, tập trung vào thẩm mỹ và mô tả trực quan.
3. Nếu đầu vào của người dùng là ngôn ngữ khác (ví dụ: tiếng Việt), bạn phải tự động suy luận và dịch sang tiếng Anh chuẩn xác nhất.
</core_rules>

<prompt_structure>
Cấu trúc cho optimized_english_prompt phải tuân theo thứ tự sau (hoặc tương tự để đạt hiệu quả cao nhất):
[Chủ thể/Subject] + [Trang phục/Chất liệu/Clothing] + [Hành động/Dáng đứng/Action] + [Bối cảnh/Ánh sáng/Setting/Lighting] + [Thông số máy ảnh/Camera Parameters]
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

    const allAvailableModels = [
      'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite-preview',
      'gemini-3-flash-preview',
    ];
    const primaryModel = input.model || allAvailableModels[1]; // default to flash-lite
    const localAi = getOrCreateGenkit(input.apiKey);
    
    // Create a unique, ordered list of models to try, with the primary model first.
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
