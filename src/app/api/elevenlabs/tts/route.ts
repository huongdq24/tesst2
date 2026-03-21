import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/elevenlabs/tts
 * Generates speech audio from text using ElevenLabs Text-to-Speech API.
 * 
 * Body: { voice_id, text, model_id?, language_code? }
 * Returns: audio/mpeg binary stream
 */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-elevenlabs-api-key');

  if (!apiKey) {
    return NextResponse.json({ error: 'ElevenLabs API key is required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { voice_id, text, model_id, language_code, speed } = body;

    if (!voice_id || !text) {
      return NextResponse.json(
        { error: 'voice_id and text are required.' },
        { status: 400 }
      );
    }

    // Use eleven_turbo_v2_5 as the base model because it supports
    // auto-detection excellently AND accepts the language_code parameter if provided.
    // It's also much faster and higher quality for mixed languages.
    let resolvedModelId = model_id || 'eleven_turbo_v2_5';

    // Build request body for ElevenLabs
    const ttsBody: Record<string, any> = {
      text,
      model_id: resolvedModelId,
      voice_settings: {
        stability: 0.65,
        similarity_boost: 0.80,
        style: 0.0,
        use_speaker_boost: true,
      },
    };

    if (speed !== undefined && speed !== 1.0) {
      // Speed parameter (supported in newer models like Turbo v2.5 or v3)
      // Some versions of API accept it here
      ttsBody.voice_settings.speed = speed;
    }

    // Add language_code if provided — critical for non-English languages like Vietnamese
    if (language_code) {
      ttsBody.language_code = language_code;
    }

    console.log('[ElevenLabs TTS] Request:', {
      voice_id,
      model_id: ttsBody.model_id,
      language_code: language_code || 'auto',
      text_length: text.length,
    });

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify(ttsBody),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[ElevenLabs TTS] API Error:', response.status, errorBody);
      return NextResponse.json(
        { error: `ElevenLabs TTS API Error: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Return the audio as a stream
    const audioBuffer = await response.arrayBuffer();
    
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    });
  } catch (error: any) {
    console.error('[ElevenLabs TTS] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

