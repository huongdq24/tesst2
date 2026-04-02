'use server';
/**
 * @fileOverview A Genkit flow for generating audio (Text-to-Speech) using Gemini TTS models.
 * Supports gemini-2.5-flash-preview-tts and gemini-2.5-pro-preview-tts with single and multi-speaker configurations.
 */

import { ai } from '@/ai/genkit';
import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import wav from 'wav';
import { Buffer } from 'buffer';

// Cache Genkit instances per API key to avoid re-creation
const genkitCache = new Map<string, ReturnType<typeof genkit>>();
function getOrCreateGenkit(apiKey?: string) {
  if (!apiKey) return ai;
  if (!genkitCache.has(apiKey)) {
    genkitCache.set(apiKey, genkit({ plugins: [googleAI({ apiKey })] }));
  }
  return genkitCache.get(apiKey)!;
}

const AiVoiceGenerationInputSchema = z.object({
  textToSpeak: z.string().describe('The text to be converted into speech.'),
  styleInstructions: z.string().optional().describe('Optional style or directorial instructions.'),
  mode: z.enum(['single', 'multi']).optional().default('single').describe('Single or Multi-speaker mode'),
  temperature: z.number().optional().default(1.0).describe('Model temperature.'),
  modelName: z.string().optional().default('gemini-2.5-flash-preview-tts').describe('The TTS model to use.'),
  voiceName: z.string().optional().default('Aoede').describe('The predefined voice name to use for single mode.'),
  speakerA: z.string().optional().default('Aoede').describe('Voice for speaker A (multi mode).'),
  speakerB: z.string().optional().default('Puck').describe('Voice for speaker B (multi mode).'),
  apiKey: z.string().optional().describe("The user's Gemini API Key."),
});
export type AiVoiceGenerationInput = z.infer<typeof AiVoiceGenerationInputSchema>;

const AiVoiceGenerationOutputSchema = z.object({
  audioDataUri: z.string().describe('The generated audio content as a WAV data URI.'),
});
export type AiVoiceGenerationOutput = z.infer<typeof AiVoiceGenerationOutputSchema>;

export async function aiVoiceGeneration(
  input: AiVoiceGenerationInput
): Promise<AiVoiceGenerationOutput> {
  return aiVoiceGenerationFlow(input);
}

// Helper function from Genkit docs for converting PCM audio to WAV format.
async function toWav(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new wav.Writer({
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    let bufs = [] as any[];
    writer.on('error', reject);
    writer.on('data', function (d: Buffer) {
      bufs.push(d);
    });
    writer.on('end', function () {
      resolve(Buffer.concat(bufs).toString('base64'));
    });

    writer.write(pcmData);
    writer.end();
  });
}

const aiVoiceGenerationFlow = ai.defineFlow(
  {
    name: 'aiVoiceGenerationFlow',
    inputSchema: AiVoiceGenerationInputSchema,
    outputSchema: AiVoiceGenerationOutputSchema,
  },
  async (input) => {
    const { 
      textToSpeak, styleInstructions, mode, temperature, 
      modelName, voiceName, speakerA, speakerB, apiKey 
    } = input;
    const localAi = getOrCreateGenkit(apiKey);

    console.log(`[VoiceGen] Generating speech using model: ${modelName}, mode: ${mode}`);

    let prompt = textToSpeak;
    if (styleInstructions && styleInstructions.trim() !== '') {
       prompt = `Read aloud following these style instructions:\n${styleInstructions.trim()}\n\nText:\n${textToSpeak}`;
    }

    let speechConfig: any;
    if (mode === 'multi') {
        speechConfig = {
           multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                 { speaker: 'SpeakerA', voiceConfig: { prebuiltVoiceConfig: { voiceName: speakerA } } },
                 { speaker: 'SpeakerB', voiceConfig: { prebuiltVoiceConfig: { voiceName: speakerB } } }
              ]
           }
        };
    } else {
        speechConfig = {
           voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName || 'Aoede' },
           }
        };
    }

    try {
      const { media } = await localAi.generate({
        model: googleAI.model(modelName as any),
        prompt: prompt,
        config: {
          temperature: temperature,
          responseModalities: ['AUDIO'],
          speechConfig: speechConfig,
        } as any,
      });

      if (!media) {
        throw new Error('No audio media returned from TTS generation.');
      }

      // Convert PCM audio from the model to WAV format
      const audioBuffer = Buffer.from(
        media.url.substring(media.url.indexOf(',') + 1),
        'base64'
      );
      const wavBase64 = await toWav(audioBuffer);

      console.log(`[VoiceGen] Speech generated successfully.`);

      return {
        audioDataUri: 'data:audio/wav;base64,' + wavBase64,
      };
    } catch (error: any) {
      console.error(`[VoiceGen] Error generating speech:`, error);
      throw new Error(`Tạo giọng nói thất bại: ${error.message}`);
    }
  }
);
