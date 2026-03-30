import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/heygen/upload-audio
 * Uploads an audio file to HeyGen for use in video generation.
 *
 * HeyGen's upload API expects RAW BINARY body with Content-Type set to the
 * file's MIME type (e.g. audio/mpeg). It does NOT use multipart/form-data.
 *
 * Accepts JSON with 'audioBase64' field (base64-encoded audio data).
 * Returns: { data: { url: string } } - the HeyGen-hosted audio URL
 */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-heygen-api-key');

  if (!apiKey) {
    return NextResponse.json({ error: 'HeyGen API key is required.' }, { status: 401 });
  }

  try {
    let audioBuffer: Buffer;
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const json = await request.json();
      if (!json.audioBase64) {
        return NextResponse.json({ error: 'audioBase64 is required.' }, { status: 400 });
      }
      audioBuffer = Buffer.from(json.audioBase64, 'base64');
    } else {
      const formData = await request.formData();
      const file = formData.get('file') as Blob | null;
      if (!file) {
        return NextResponse.json({ error: 'Audio file is required.' }, { status: 400 });
      }
      const arrayBuffer = await file.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
    }

    if (audioBuffer.length === 0) {
      return NextResponse.json({ error: 'Audio data is empty.' }, { status: 400 });
    }

    console.log(`[HeyGen Upload] Uploading audio as raw binary: ${audioBuffer.length} bytes`);

    // ── HeyGen expects RAW BINARY body, NOT multipart/form-data ──
    // curl equivalent:
    //   curl -X POST https://upload.heygen.com/v1/asset \
    //     -H 'x-api-key: <KEY>' \
    //     -H 'Content-Type: audio/mpeg' \
    //     --data-binary @audio.mp3
    const response = await fetch('https://upload.heygen.com/v1/asset', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'audio/mpeg',
      },
      body: new Uint8Array(audioBuffer),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[HeyGen Upload] API Error:', response.status, errorBody);

      let errorMessage = `HeyGen Upload Error (${response.status})`;
      try {
        const errorJson = JSON.parse(errorBody);
        errorMessage = errorJson.message || errorJson.error?.message || errorJson.data?.message || JSON.stringify(errorJson);
      } catch {
        errorMessage = errorBody.replace(/<[^>]*>/g, ' ').replace(/\s\s+/g, ' ').trim();
      }

      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }

    const data = await response.json();
    console.log('[HeyGen Upload] Success:', JSON.stringify(data));
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[HeyGen Upload] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
