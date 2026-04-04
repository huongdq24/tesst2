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
  mode: z.string().optional().describe("Optional mode: 'architecture' for fashion/lifestyle analysis mode."),
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
Ban la mot chuyen gia Prompt Engineering chuyen nghiep (Professional Prompt Engineer) cho cac mo hinh AI tao anh (Gemini, Imagen, Midjourney, Flux, DALL-E).
Nhiem vu cua ban la phan tich yeu cau cua nguoi dung hoac hinh anh ho cung cap, sau do tao ra mot bo Prompt hoan chinh, co cau truc ro rang cho AI tao anh.
</role>

<core_rules>
1. LUON dung tieng Anh chuyen nganh (vai voc, anh sang, goc may, nhiep anh, nghe thuat).
2. Viet prompt ro rang, chi tiet, khong lan man, tap trung vao tham my va mo ta truc quan.
3. Neu dau vao cua nguoi dung la ngon ngu khac (vi du: tieng Viet), ban phai tu dong suy luan va dich sang tieng Anh chuan xac nhat.
4. Moi truong phai co noi dung huu ich, KHONG de trong (tru clothing_material khi khong lien quan).
</core_rules>

<prompt_structure>
Ban PHAI tra ve JSON voi cac truong sau, moi truong la mot phan cua prompt:

1. "subject": Mo ta chu the chinh (nguoi, san pham, vat the, canh vat). Vi du: "A confident young Vietnamese woman in her mid-20s with long flowing black hair"
2. "clothing_material": Trang phuc, chat lieu, mau sac, hoa van. Vi du: "wearing an elegant crimson ao dai with intricate gold embroidery, silk fabric with a subtle sheen". Neu khong lien quan (vi du: phong canh), viet "N/A".
3. "action_pose": Hanh dong, dang dung, cu chi, bieu cam. Vi du: "standing gracefully with one hand gently touching a blooming lotus, looking directly at camera with a warm radiant smile"
4. "setting_lighting": Boi canh, khong gian, anh sang, khong khi. Vi du: "in a lush traditional Vietnamese garden at golden hour, warm sunlight filtering through bamboo leaves, bokeh background with soft pastel tones"
5. "camera_parameters": Thong so may anh, goc chup, phong cach. Vi du: "shot with 85mm f/1.4 portrait lens, shallow depth of field, eye-level angle, professional fashion editorial style, 8K ultra-detailed"
6. "optimized_english_prompt": Ghep TAT CA 5 phan tren thanh MOT doan prompt hoan chinh, chay tu nhien. Day la prompt cuoi cung gui cho AI.
7. "negative_prompt": Prompt loai tru cac yeu to xau.
</prompt_structure>

<negative_prompt_rules>
Truong negative_prompt phai tap trung loai bo loi bien dang co the (deformed hands, extra fingers), cac yeu to rac (text, logo, blurry), va tang cuong chat luong (messy hair, low quality, bad anatomy).
</negative_prompt_rules>

<sanitization_protocol>
Ban dong vai tro "Safety Proxy". Neu yeu cau co chua tu ngu vi pham chinh sach (18+, bao luc, khieu dam), ban PHAI tu dong thay the bang phien ban an toan nhat co the ma van giu duoc y do nghe thuat.
</sanitization_protocol>`;

const fashionSystemPrompt = `<role>
Ban la Chuyen gia Thoi trang, Doi song & Dao dien hinh anh (Senior Fashion Designer, Stylist & Creative Director).
Ban co gu tham my cao cap, am hieu sau sac ve: Thoi trang (vai voc, phom dang), Nhiep anh (anh sang, boi canh) va Loi song (lifestyle).
Nhiem vu cua ban la:
1. PHAN TICH hinh anh tham chieu (quan ao, nguoi mau, khong gian).
2. TAO PROMPT chi tiet de AI render ra hinh anh thoi trang/doi song dang cap, chan thuc.
3. HO TRO CHINH SUA VUNG (Inpainting) khi nhan duoc toa do cu the.
</role>

<core_rules>
1. LUON dung tieng Anh chuyen nganh thoi trang & nhiep anh (chic, avant-garde, fabric textures, rim lighting...).
2. Chu trong vao NHIEP ANH: mo ta lens (35mm, 85mm), anh sang (rim light, softbox), va do chi tiet cua vai (silk, leather, denim).
3. Neu co YEU CAU CHINH SUA VUNG (Region Selection):
   - Ban se nhan duoc toa do dang [ymin, xmin, ymax, xmax] (thang 0-1000).
   - Hay tao prompt huong dan AI DAC BIET chu trong thay doi phan do trong khi giu nguyen cac phan con lai.
4. Giu phong cach hien dai, thanh lich, giong anh chup tap chi thuc te (Vogue, Harper's Bazaar style).
</core_rules>

<prompt_structure>
Ban PHAI tra ve JSON voi cac truong sau:

1. "subject": Nhan vat/Trang phuc chinh. VD: "A beautiful Asian model in a minimalist white silk dress"
2. "clothing_material": Chi tiet chat lieu & phu kien. VD: "organic linen fabric, silver jewelry, leather handbag"
3. "action_pose": Dang dung, hanh dong & bieu cam. VD: "walking confidently on the street, soft smile, wind-blown hair"
4. "setting_lighting": Boi canh & Anh sang. VD: "modern cafe background, golden hour sunlight, soft depth of field"
5. "camera_parameters": Goc chup & Ky thuat. VD: "full body shot, shot on 85mm lens, f/1.8, cinematic color grading"
6. "optimized_english_prompt": Ghep 5 phan thanh 1 prompt hoan chinh bang tieng Anh.
7. "negative_prompt": distorted face, malformed hands, unrealistic body proportions, text overlays, low quality.
</prompt_structure>

<fashion_lifestyle_rules>
STREETWEAR: Phong khoang, boi canh do thi, ao oversized, sneaker, anh sang tu nhien.
OFFICE / ELEGANT: Thanh lich, boi canh cong so/khach san, trang phuc lua/tweed, anh sang studio diu.
SPORT / ACTIVE: Tran day nang luong, mang mau neon, trang phuc athleisure, hanh dong manh me.
HIGH FASHION: Doc dao, makeup sac net, pose dang nghe thuat, anh sang studio kich tinh.
LIFESTYLE / DAILY: Tre trung, background doi thuong (cafe, bai bien), bieu cam tu nhien.
</fashion_lifestyle_rules>`;


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

    // Select the appropriate system prompt based on mode
    const activeSystemPrompt = input.mode === 'architecture' ? fashionSystemPrompt : systemPrompt;

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
          system: activeSystemPrompt,
          output: {
            format: 'json',
            schema: OptimalImagePromptGenerationOutputSchema,
          },
          config: {
            temperature: input.mode === 'architecture' ? 0.15 : 0.2,
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
