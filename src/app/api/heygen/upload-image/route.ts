import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/heygen/upload-image
 * Uploads an image to HeyGen as a talking photo asset.
 * 
 * HeyGen's upload API expects RAW BINARY body with Content-Type set to the
 * file's MIME type (e.g. image/png, image/jpeg).
 * 
 * Accepts JSON with 'imageUrl' field (URL to download and re-upload to HeyGen).
 * Returns: { data: { id: string, url: string } } - the HeyGen asset info
 */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-heygen-api-key');

  if (!apiKey) {
    return NextResponse.json({ error: 'HeyGen API key is required.' }, { status: 401 });
  }

  try {
    const { imageUrl } = await request.json();
    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required.' }, { status: 400 });
    }

    console.log(`[HeyGen Image Upload] Downloading image from: ${imageUrl}`);

    // Download the image from Firebase/URL
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return NextResponse.json({ error: `Failed to download image: ${imageRes.statusText}` }, { status: 400 });
    }

    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
    const mimeType = imageRes.headers.get('content-type') || 'image/png';

    console.log(`[HeyGen Image Upload] Uploading image as raw binary: ${imageBuffer.length} bytes (${mimeType})`);

    // Upload raw binary to HeyGen
    const response = await fetch('https://upload.heygen.com/v1/asset', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': mimeType,
      },
      body: new Uint8Array(imageBuffer),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[HeyGen Image Upload] API Error:', response.status, errorBody);
      return NextResponse.json(
        { error: `HeyGen Image Upload Error: ${errorBody}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[HeyGen Image Upload] Success:', JSON.stringify(data));

    // Return the asset ID (this is the talking_photo_id)
    return NextResponse.json({
      talking_photo_id: data.data?.id,
      url: data.data?.url,
    });
  } catch (error: any) {
    console.error('[HeyGen Image Upload] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
