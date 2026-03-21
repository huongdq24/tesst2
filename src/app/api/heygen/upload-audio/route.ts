import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/heygen/upload-audio
 * Uploads an audio file to HeyGen for use in video generation.
 * 
 * Body: FormData with 'file' (audio blob)
 * Returns: { url: string } - the HeyGen-hosted audio URL
 */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-heygen-api-key');

  if (!apiKey) {
    return NextResponse.json({ error: 'HeyGen API key is required.' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as Blob | null;

    if (!file) {
      return NextResponse.json({ error: 'Audio file is required.' }, { status: 400 });
    }

    // Create a new FormData to forward to HeyGen
    const heyGenForm = new FormData();
    heyGenForm.append('file', file, 'audio.mp3');

    const response = await fetch('https://api.heygen.com/v1/asset', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
      },
      body: heyGenForm,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[HeyGen Upload] API Error:', response.status, errorBody);
      return NextResponse.json(
        { error: `HeyGen Upload Error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[HeyGen Upload] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
