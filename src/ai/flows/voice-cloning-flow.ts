'use server';
/**
 * @fileOverview A Genkit flow for generating audio from text using a pre-built voice.
 * This flow takes a voice sample (intended for cloning) and text. Due to current model limitations
 * in the `googleAI` plugin's TTS, it generates speech using a standard pre-built voice rather than cloning
 * from the provided sample. The `voiceSampleDataUri` is included in the input schema to reflect the user story's
 * intent for voice cloning, but it is not currently utilized by the `gemini-2.5-flash-preview-tts` model for this purpose.
 *
 * - voiceCloning - A function that handles the audio generation process.
 * - VoiceCloningInput - The input type for the voiceCloning function.
 * - VoiceCloningOutput - The return type for the voiceCloning function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import wav from 'wav';

const VoiceCloningInputSchema = z.object({
  voiceSampleDataUri: z
    .string()
    .describe(
      "An audio sample of the user's voice, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'. NOTE: This sample is currently not used for cloning by the `gemini-2.5-flash-preview-tts` model, which generates speech using a pre-built voice."
    ),
  textToSpeak: z.string().describe('The text to be converted into speech.'),
});
export type VoiceCloningInput = z.infer<typeof VoiceCloningInputSchema>;

const VoiceCloningOutputSchema = z.object({
  audioDataUri: z
    .string()
    .describe('The generated audio content as a WAV data URI.'),
});
export type VoiceCloningOutput = z.infer<typeof VoiceCloningOutputSchema>;

export async function voiceCloning(
  input: VoiceCloningInput
): Promise<VoiceCloningOutput> {
  return voiceCloningFlow(input);
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
    writer.on('data', function (d) {
      bufs.push(d);
    });
    writer.on('end', function () {
      resolve(Buffer.concat(bufs).toString('base64'));
    });

    writer.write(pcmData);
    writer.end();
  });
}

const voiceCloningFlow = ai.defineFlow(
  {
    name: 'voiceCloningFlow',
    inputSchema: VoiceCloningInputSchema,
    outputSchema: VoiceCloningOutputSchema,
  },
  async (input) => {
    // The `gemini-2.5-flash-preview-tts` model currently used does not support
    // voice cloning from an arbitrary audio input sample (like input.voiceSampleDataUri).
    // It synthesizes speech using a pre-configured voice.
    const { media } = await ai.generate({
      model: googleAI.model('gemini-2.5-flash-preview-tts'),
      prompt: input.textToSpeak,
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Algenib' }, // Using a default pre-built voice
          },
        },
      },
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

    return {
      audioDataUri: 'data:audio/wav;base64,' + wavBase64,
    };
  }
);
