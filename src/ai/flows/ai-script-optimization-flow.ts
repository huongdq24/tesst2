'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

const AiScriptOptimizationInputSchema = z.object({
  text: z.string().describe('The raw text to be optimized for Text-to-Speech.'),
  readingStyle: z.string().optional().default('normal').describe('The selected reading style.'),
  apiKey: z.string().optional().describe('Optional Gemini API Key.'),
});

const AiScriptOptimizationOutputSchema = z.object({
  optimizedText: z.string().describe('The optimized script that sounds natural when spoken.'),
});

export const aiScriptOptimizationFlow = ai.defineFlow(
  {
    name: 'aiScriptOptimizationFlow',
    inputSchema: AiScriptOptimizationInputSchema,
    outputSchema: AiScriptOptimizationOutputSchema,
  },
  async (input) => {
    const { text, readingStyle, apiKey } = input;
    
    // Default system instructions for Script Optimization
    let styleInstruction = "Giữ nguyên văn 100%. Rải nhịp phẩy hợp lý để câu văn dễ đọc.";
    if (readingStyle === 'reportage') {
        styleInstruction = "Phong cách THỜI SỰ/PHÓNG SỰ: Tuyệt đối giữ nguyên từng từ. Chỉ thêm dấu phẩy (,) và chấm (.) ở những chỗ cần ngắt nhịp dứt khoát, chuyên nghiệp.";
    } else if (readingStyle === 'storytelling') {
        styleInstruction = "Phong cách KỂ CHUYỆN: Tuyệt đối giữ nguyên từng từ. Nhấn nhá bằng cách chèn dấu phẩy (,) hoặc dấu ba chấm (...) vào những đoạn cần ngừng nghỉ cảm xúc.";
    } else if (readingStyle === 'commercial') {
        styleInstruction = "Phong cách QUẢNG CÁO: Tuyệt đối giữ nguyên từng từ. Có thể viết HOA một vài từ ngữ mang tính kêu gọi hành động hoặc nổi bật (nếu có) và dùng dấu (!) ở cuối câu mang tính chốt sale.";
    }

    const systemPrompt = `Bạn là một chuyên gia đánh dấu kịch bản (Script Annotator) cho hệ thống Text-to-Speech.
Nhiệm vụ của bạn là GIỮ NGUYÊN VĂN 100% từ ngữ mà người dùng cung cấp (tuyệt đối không thêm, không bớt, không đảo vị trí từ ngữ). Bạn chỉ được phép điều hướng cách máy đọc bằng việc thêm dấu câu và in hoa từ.

CÁC QUY TẮC SỐNG CÒN:
1. BẢO TOÀN VĂN BẢN GỐC: Bạn không được phép "viết lại", "biên tập" hay "sửa từ" của người dùng. Từ ngữ phải y nguyên.
2. PHONG CÁCH ĐỌC: ${styleInstruction}
3. KỸ THUẬT NHẤN MẠNH (EMPHASIS CAUTION): Người dùng có thể bọc các từ quan trọng trong dấu 'nháy đơn' (ví dụ:'hôm nay').
   -> BẮT BUỘC: Bạn phải xoá 2 dấu nháy đơn đó đi, chuyển TỪ NẰM TRONG NHÁY ĐƠN thành chữ IN HOA TOÀN BỘ và đính kèm dấu chấm than (!) ngay sau từ đó.
   -> Ví dụ đầu vào: Vụ tai nạn thật 'kinh hoàng' và 'đáng sợ'.
   -> Ví dụ xuất ra: Vụ tai nạn thật KINH HOÀNG! và ĐÁNG SỢ!.
4. DẤU CÂU TỰ NHIÊN: Việc thêm dấu phẩy, chấm, ba chấm phải đúng ngữ pháp tiếng Việt. Tuyệt đối KHÔNG spam dấu chấm than (!) ở mọi nơi.
5. CHỈ TRẢ VỀ kịch bản đã đánh dấu, KHÔNG giải thích, KHÔNG xin chào, KHÔNG markdown in đậm.
`;

    // Only configure custom ai if API key provided
    let localAi = ai;
    if (apiKey) {
       localAi = require('genkit').genkit({ plugins: [googleAI({ apiKey })] });
    }

    let retries = 2; // Retry mechanism for 503/429
    while (retries > 0) {
      try {
        const { text: optimizedText } = await localAi.generate({
          model: googleAI.model('gemini-2.5-flash'), // Fast and efficient for text tasks
          system: systemPrompt,
          prompt: text,
        });

        return {
          optimizedText: optimizedText.trim(),
        };
      } catch (error: any) {
        if (error?.status === 'UNAVAILABLE' || error?.code === 503 || error?.code === 429) {
           retries--;
           if (retries === 0) {
              console.error('[ScriptOptimization] API Overloaded:', error.message);
              throw new Error("Hệ thống máy chủ Google hiện đang quá tải (Lỗi 503). Vui lòng chờ vài giây rồi thử bấm Đũa phép lại nhé!");
           }
           // Wait 1.5 seconds before retrying
           await new Promise(res => setTimeout(res, 1500));
        } else {
           console.error('[ScriptOptimization] Error:', error);
           throw new Error(`Lỗi tối ưu kịch bản: ${error.message}`);
        }
      }
    }
    
    throw new Error("Không thể kết nối đến máy chủ AI lúc này.");
  }
);
