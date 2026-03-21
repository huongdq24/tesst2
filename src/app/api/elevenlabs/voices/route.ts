import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/elevenlabs/voices
 * Fetches the list of available voices from ElevenLabs.
 */
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-elevenlabs-api-key');

  if (!apiKey) {
    return NextResponse.json({ error: 'ElevenLabs API key is required.' }, { status: 401 });
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[ElevenLabs Voices] API Error:', response.status, errorBody);
      return NextResponse.json(
        { error: `ElevenLabs API Error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Return simplified voice list
    const voices = (data.voices || []).map((voice: any) => ({
      voice_id: voice.voice_id,
      name: voice.name,
      category: voice.category,
      labels: voice.labels,
      preview_url: voice.preview_url,
      description: voice.description,
    }));

    return NextResponse.json({ voices });
  } catch (error: any) {
    console.error('[ElevenLabs Voices] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
