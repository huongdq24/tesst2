import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/elevenlabs/tts
 * Generates speech audio from text using ElevenLabs Text-to-Speech API.
 * 
 * Body: { voice_id, text, model_id?, language_code?, stability?, similarity_boost?, style?, use_speaker_boost? }
 * Returns: audio/mpeg binary stream
 */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-elevenlabs-api-key');

  if (!apiKey) {
    return NextResponse.json({ error: 'ElevenLabs API key is required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { 
      voice_id, 
      text, 
      model_id, 
      language_code, 
      stability,
      similarity_boost,
      style,
      use_speaker_boost
    } = body;

    if (!voice_id || !text) {
      return NextResponse.json(
        { error: 'voice_id and text are required.' },
        { status: 400 }
      );
    }

    let resolvedModelId = model_id || 'eleven_multilingual_v2';

    // Build voice_settings object conditionally
    const voice_settings: Record<string, any> = {
      stability: stability ?? 0.5,
    };

    if (similarity_boost !== undefined) {
        voice_settings.similarity_boost = similarity_boost;
    }
    if (style !== undefined) {
        voice_settings.style = style;
    }
    // Speaker Boost is not available for the Eleven v3 model (eleven_multilingual_v2)
    if (resolvedModelId !== 'eleven_multilingual_v2' && use_speaker_boost !== undefined) {
        voice_settings.use_speaker_boost = use_speaker_boost;
    }

    // Build the main request body for ElevenLabs
    const ttsBody: Record<string, any> = {
      text,
      model_id: resolvedModelId,
      voice_settings,
    };

    // Add language_code if provided and not 'auto'
    if (language_code && language_code !== 'auto') {
      ttsBody.language_code = language_code;
    }

    console.log('[ElevenLabs TTS] Request:', {
      voice_id,
      model_id: ttsBody.model_id,
      language_code: language_code || 'auto-detect',
      text_length: text.length,
      voice_settings: ttsBody.voice_settings
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
