'use server';
/**
 * @fileOverview Interactive Prompt Wizard
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { genkit, z } from 'genkit';
import { Buffer } from 'buffer';

const genkitCache = new Map<string, ReturnType<typeof genkit>>();
function getOrCreateGenkit(apiKey?: string) {
  if (!apiKey) return ai;
  if (!genkitCache.has(apiKey)) {
    genkitCache.set(apiKey, genkit({ plugins: [googleAI({ apiKey })] }));
  }
  return genkitCache.get(apiKey)!;
}

// --- GENERATE NEXT QUESTION ---

const GenerateQuestionInputSchema = z.object({
  templateId: z.string(),
  templateLabel: z.string(),
  previousAnswers: z.array(z.object({ question: z.string(), answer: z.string() })),
  imageUris: z.array(z.string()).optional(),
  videoDuration: z.string().optional(),
  aspectRatio: z.string().optional(),
  isExtending: z.boolean().optional(),
  apiKey: z.string().optional(),
});
export type GenerateQuestionInput = z.infer<typeof GenerateQuestionInputSchema>;

const GenerateQuestionOutputSchema = z.object({
  question: z.string(),
  options: z.array(z.string()),
  isDone: z.boolean(),
  allowImageUpload: z.boolean().optional(),
  imageUploadHint: z.string().optional(),
});
export type GenerateQuestionOutput = z.infer<typeof GenerateQuestionOutputSchema>;

const questionSystemPrompt = [
  '<role>',
  'Ban la AI tu van sang tao video chuyen nghiep cho nen tang iGen+.',
  'Nhiem vu: hoi nguoi dung TUNG CAU MOT de hieu ro y tuong video.',
  '</role>',
  '',
  '<rules>',
  '1. MOI LAN CHI HOI 1 CAU DUY NHAT bang tieng Viet.',
  '2. Tao 4-6 lua chon goi y (ngan gon, 2-5 tu moi cai).',
  '3. Cac lua chon phai CU THE va LIEN QUAN toi nganh/chu de.',
  '4. Neu co anh tham chieu, do la SAN PHAM/CHU THE THUC SU ma nguoi dung muon quay video. Hoi ve CACH QUAY, BOI CANH, HANH DONG - KHONG hoi lai san pham la gi.',
  '5. QUAN TRONG - THOI LUONG VIDEO:',
  '   - Video {videoDuration} giay ({aspectRatio}).',
  '   - 4 giay: Chi du 1 canh ngan, 1 hanh dong don gian. Hoi it cau (2-3 cau), tap trung hanh dong chinh va mood.',
  '   - 6 giay: Du cho 1-2 canh. Hoi 3-4 cau, gom hanh dong + boi canh.',
  '   - 8 giay: Du cho 2-3 canh. Hoi day du 4-5 cau, gom hanh dong, boi canh, chuyen canh, hieu ung.',
  '   - Dieu chinh so luong cau hoi va do phuc tap dua tren thoi luong.',
  '6. Trinh tu hoi:',
  '   - Cau 1: Nganh nghe / Loai noi dung (neu chua ro tu template)',
  '   - Cau 2: Hanh dong chinh / Cach quay',
  '   - Cau 3: Phong cach hinh anh / Mood',
  '   - Cau 4 (neu >=6s): Boi canh / Canh quay mong muon',
  '   - Cau 5 (neu 8s): Chi tiet bo sung (chuyen canh, hieu ung dac biet)',
  '7. Sau khi du cau hoi (dua tren thoi luong), set isDone = true.',
  '8. Khi isDone = true, question = "Da du thong tin! An Hoan tat de tao prompt.", options rong.',
  '9. LUON tra ve JSON hop le theo schema.',
  '10. HO TRO TAI ANH: Khi cau hoi lien quan den thu ma nguoi dung CO THE tai anh len (trang phuc, san pham, boi canh...), set allowImageUpload=true va cung cap imageUploadHint.',
  '11. CHE DO NOI TIEP: {extendContext}',
  '</rules>',
  '',
  '<context>',
  'Template: "{templateLabel}" (ID: {templateId})',
  'Thoi luong: {videoDuration} giay | Khung hinh: {aspectRatio}',
  'Cac cau tra loi truoc do se duoc cung cap de KHONG hoi lai nhung gi da biet.',
  '</context>',
].join('\n');

export async function generateWizardQuestion(input: GenerateQuestionInput): Promise<GenerateQuestionOutput> {
  const aiInstance = getOrCreateGenkit(input.apiKey);
  const promptParts: any[] = [];

  if (input.imageUris && input.imageUris.length > 0) {
    for (const uri of input.imageUris) {
      let imageUri = uri;
      if (uri.startsWith('https://')) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          const response = await fetch(uri, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            const base64Data = Buffer.from(buffer).toString('base64');
            const mimeType = response.headers.get('content-type') || 'image/jpeg';
            imageUri = `data:${mimeType};base64,${base64Data}`;
          }
        } catch { continue; }
      }
      const match = imageUri.match(/^data:(.*?);base64,/);
      if (match) {
        promptParts.push({ media: { url: imageUri, contentType: match[1] } });
      }
    }
  }

  let textPrompt = `Template: "${input.templateLabel}" (ID: ${input.templateId})\n\n`;
  if (input.previousAnswers.length > 0) {
    textPrompt += `Cac cau tra loi truoc:\n`;
    input.previousAnswers.forEach((qa, i) => {
      textPrompt += `  Cau ${i + 1}: ${qa.question}\n  -> Tra loi: ${qa.answer}\n\n`;
    });
    textPrompt += `\nDua vao ngu canh o tren, hay tao CAU HOI TIEP THEO phu hop.\n`;
    textPrompt += `So cau da hoi: ${input.previousAnswers.length}. Neu da du thong tin theo thoi luong video, set isDone=true.\n`;
  } else {
    textPrompt += `Day la CAU HOI DAU TIEN. Hay hoi ve nganh nghe hoac loai noi dung ma nguoi dung muon tao video.`;
    if (input.imageUris && input.imageUris.length > 0) {
      textPrompt += `\nNguoi dung da tai len ${input.imageUris.length} anh tham chieu. Hay hieu do la san pham/chu the thuc su cho video.`;
    }
  }

  promptParts.push({ text: textPrompt });

  const extendContext = input.isExtending
    ? 'Day la clip NOI TIEP. Nguoi dung da co clip truoc do. Hay hoi ve CANH TIEP THEO: dien bien gi xay ra, chuyen canh, hanh dong moi. KHONG hoi lai nganh nghe hay san pham.'
    : 'Day la clip MOI, bat dau tu dau.';

  const durationStr = input.videoDuration || '8';
  const aspectStr = input.aspectRatio || '16:9';

  const systemPrompt = questionSystemPrompt
    .replace('{templateLabel}', input.templateLabel)
    .replace('{templateId}', input.templateId)
    .replaceAll('{videoDuration}', durationStr)
    .replaceAll('{aspectRatio}', aspectStr)
    .replace('{extendContext}', extendContext);

  const allModels = [
    'gemini-3.1-flash-lite-preview',
    'gemini-3.1-pro-preview',
    'gemini-3-flash-preview',
  ];

  let lastError: any = null;
  for (const modelName of allModels) {
    try {
      console.log(`[Wizard] Trying model: ${modelName}`);
      const generatePromise = aiInstance.generate({
        model: googleAI.model(modelName as any),
        prompt: promptParts,
        system: systemPrompt,
        output: { format: 'json', schema: GenerateQuestionOutputSchema },
        config: { temperature: 0.7 },
      });
      const timeoutPromise = new Promise<{ output: any }>((_, reject) => {
        setTimeout(() => reject(new Error('Wizard timeout after 20s')), 20000);
      });
      const { output } = await Promise.race([generatePromise, timeoutPromise]);
      if (!output) throw new Error('AI returned empty output');
      console.log(`[Wizard] Success with model: ${modelName}`);
      return output;
    } catch (err: any) {
      lastError = err;
      console.warn(`[Wizard] Model ${modelName} failed: ${err.message}. Trying next...`);
    }
  }

  console.error('[Wizard] All models failed. Last error:', lastError?.message);
  if (input.previousAnswers.length === 0) {
    return {
      question: 'Ban muon tao video cho nganh nghe hoac linh vuc nao?',
      options: ['Thoi trang', 'Am thuc (F&B)', 'Bat dong san', 'San pham / E-commerce', 'Doanh nghiep', 'Su kien'],
      isDone: false,
    };
  }
  return { question: 'Da du thong tin! An Hoan tat de tao prompt.', options: [], isDone: true };
}

// --- COMPILE FINAL PROMPT ---

const CompilePromptInputSchema = z.object({
  templateId: z.string(),
  templateLabel: z.string(),
  answers: z.array(z.object({ question: z.string(), answer: z.string() })),
  imageUris: z.array(z.string()).optional(),
  videoDuration: z.string().optional(),
  aspectRatio: z.string().optional(),
  isExtending: z.boolean().optional(),
  apiKey: z.string().optional(),
});
export type CompilePromptInput = z.infer<typeof CompilePromptInputSchema>;

const CompilePromptOutputSchema = z.object({
  compiledPrompt: z.string().describe('The final detailed Vietnamese prompt for video generation'),
});
export type CompilePromptOutput = z.infer<typeof CompilePromptOutputSchema>;

const compileSystemPrompt = [
  '<role>',
  'Ban la dao dien video AI chuyen nghiep cho nen tang iGen+. Viet MOT PROMPT VIDEO duy nhat.',
  '</role>',
  '',
  '<rules>',
  '1. Output la MOT doan prompt video bang tieng Viet, 3-6 cau.',
  '2. QUAN TRONG - THOI LUONG: Video dai {videoDuration} giay ({aspectRatio}).',
  '   - 4 giay: Chi mo ta 1 canh ngan, 1 hanh dong don. Prompt gon le, tap trung.',
  '   - 6 giay: Mo ta 1-2 canh, co the them chuyen dong camera nhe.',
  '   - 8 giay: Co the mo ta 2-3 canh lien tiep, chuyen canh, hieu ung phuc tap hon.',
  '3. KHONG MO TA LAI ANH THAM CHIEU: Anh se duoc gui truc tiep toi engine. Dung "chu the trong anh", "san pham trong anh" de chi dinh.',
  '4. Tap trung viet ve: HANH DONG, GOC QUAY, BOI CANH, PHONG CACH CINEMATIC.',
  '5. {extendContext}',
  '6. Giong van chuyen nghiep, cinematic, giau hanh dong.',
  '7. KHONG tra loi dang Q&A. CHI tra ve prompt mo ta thuan.',
  '8. Tra ve JSON voi field "compiledPrompt".',
  '</rules>',
].join('\n');

export async function compileWizardPrompt(input: CompilePromptInput): Promise<CompilePromptOutput> {
  const aiInstance = getOrCreateGenkit(input.apiKey);
  const promptParts: any[] = [];

  if (input.imageUris && input.imageUris.length > 0) {
    for (const uri of input.imageUris) {
      let imageUri = uri;
      if (uri.startsWith('https://')) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          const response = await fetch(uri, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            const base64Data = Buffer.from(buffer).toString('base64');
            const mimeType = response.headers.get('content-type') || 'image/jpeg';
            imageUri = `data:${mimeType};base64,${base64Data}`;
          }
        } catch { continue; }
      }
      const match = imageUri.match(/^data:(.*?);base64,/);
      if (match) {
        promptParts.push({ media: { url: imageUri, contentType: match[1] } });
      }
    }
  }

  let textPrompt = `Template: "${input.templateLabel}"\n\n`;
  textPrompt += `Thong tin tu nguoi dung:\n`;
  input.answers.forEach((qa, i) => {
    textPrompt += `${i + 1}. ${qa.question}\n   -> ${qa.answer}\n`;
  });
  textPrompt += `\nHay viet MOT prompt video chi tiet bang tieng Viet dua tren tat ca thong tin tren.`;

  promptParts.push({ text: textPrompt });

  const extendContext = input.isExtending
    ? 'Day la clip NOI TIEP tu clip truoc. Prompt phai mo ta CANH TIEP THEO, khong lap lai noi dung da quay.'
    : '';

  const durationStr = input.videoDuration || '8';
  const aspectStr = input.aspectRatio || '16:9';

  const systemPromptFinal = compileSystemPrompt
    .replaceAll('{videoDuration}', durationStr)
    .replaceAll('{aspectRatio}', aspectStr)
    .replace('{extendContext}', extendContext);

  const allModels = [
    'gemini-3.1-flash-lite-preview',
    'gemini-3.1-pro-preview',
    'gemini-3-flash-preview',
  ];

  let lastError: any = null;
  for (const modelName of allModels) {
    try {
      console.log(`[Wizard Compile] Trying model: ${modelName}`);
      const generatePromise = aiInstance.generate({
        model: googleAI.model(modelName as any),
        prompt: promptParts,
        system: systemPromptFinal,
        output: { format: 'json', schema: CompilePromptOutputSchema },
        config: { temperature: 0.5 },
      });
      const timeoutPromise = new Promise<{ output: any }>((_, reject) => {
        setTimeout(() => reject(new Error('Compile timeout after 20s')), 20000);
      });
      const { output } = await Promise.race([generatePromise, timeoutPromise]);
      if (!output) throw new Error('AI returned empty output');
      console.log(`[Wizard Compile] Success with model: ${modelName}`);
      return output;
    } catch (err: any) {
      lastError = err;
      console.warn(`[Wizard Compile] Model ${modelName} failed: ${err.message}. Trying next...`);
    }
  }

  throw new Error(`[Wizard Compile] All models failed. Last: ${lastError?.message}`);
}
