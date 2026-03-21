import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/elevenlabs/add-voice
 * Creates a new cloned voice on ElevenLabs using uploaded audio samples.
 * 
 * Body: FormData with 'files' (audio files), 'name', 'description'
 * Returns: { voice_id: string }
 */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-elevenlabs-api-key');

  if (!apiKey) {
    return NextResponse.json({ error: 'ElevenLabs API key is required.' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const description = formData.get('description') as string || '';
    const userId = formData.get('userId') as string;
    const files = formData.getAll('files') as File[];

    if (!name) {
      return NextResponse.json({ error: 'Voice name is required.' }, { status: 400 });
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'At least one audio file is required.' }, { status: 400 });
    }

    // Forward to ElevenLabs API
    const elevenLabsForm = new FormData();
    elevenLabsForm.append('name', name);
    elevenLabsForm.append('description', description);
    
    if (userId) {
      elevenLabsForm.append('labels', JSON.stringify({ userId }));
    }

    for (const file of files) {
      elevenLabsForm.append('files', file);
    }

    const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
      body: elevenLabsForm,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[ElevenLabs AddVoice] API Error:', response.status, errorBody);
      
      let errorMessage = `ElevenLabs API Error: ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorBody);
        if (errorJson.detail?.message) {
          errorMessage = errorJson.detail.message;
        } else if (errorJson.detail) {
          errorMessage = typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail);
        }
      } catch {}

      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }

    const data = await response.json();
    console.log('[ElevenLabs AddVoice] Voice created:', data.voice_id);

    return NextResponse.json({
      voice_id: data.voice_id,
      success: true,
    });
  } catch (error: any) {
    console.error('[ElevenLabs AddVoice] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/elevenlabs/add-voice?voice_id=xxx
 * Deletes a cloned voice from ElevenLabs.
 */
export async function DELETE(request: NextRequest) {
  const apiKey = request.headers.get('x-elevenlabs-api-key');
  const voiceId = request.nextUrl.searchParams.get('voice_id');

  if (!apiKey) {
    return NextResponse.json({ error: 'ElevenLabs API key is required.' }, { status: 401 });
  }
  if (!voiceId) {
    return NextResponse.json({ error: 'voice_id is required.' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      method: 'DELETE',
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[ElevenLabs DELETE Error]:', errorBody);
      return NextResponse.json(
        { error: `Lỗi từ ElevenLabs (${response.status}): ${errorBody}` },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
