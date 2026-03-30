import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/heygen/voices
 * Retrieves a list of all available HeyGen AI voices.
 * Returns: { voices: [{ voice_id, name, language, gender, preview_audio, support_pause, emotion_support }] }
 */
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-heygen-api-key');

  if (!apiKey) {
    return NextResponse.json({ error: 'HeyGen API key is required.' }, { status: 401 });
  }

  try {
    const response = await fetch('https://api.heygen.com/v2/voices', {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[HeyGen Voices] API Error:', response.status, errorBody);
      return NextResponse.json(
        { error: `HeyGen Voices Error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Map and normalize the voice data
    const rawVoices = (data.data?.voices || []).map((voice: any) => ({
      voice_id: voice.voice_id,
      name: voice.name || voice.display_name || 'Unnamed',
      language: voice.language || 'unknown',
      gender: voice.gender || 'unknown',
      preview_audio: voice.preview_audio || null,
      support_pause: voice.support_pause || false,
      emotion_support: voice.emotion_support || false,
    }));

    // Deduplicate by voice_id
    const seenIds = new Set();
    const voices = rawVoices.filter((v: any) => {
      if (seenIds.has(v.voice_id)) return false;
      seenIds.add(v.voice_id);
      return true;
    });

    return NextResponse.json({ voices });
  } catch (error: any) {
    console.error('[HeyGen Voices] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
