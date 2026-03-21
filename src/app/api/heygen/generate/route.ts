import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/heygen/generate
 * Creates a talking avatar video using HeyGen's v2 API.
 * 
 * Body: { avatar_image_url, audio_url, avatar_id?, aspect_ratio? }
 * Returns: { video_id: string }
 */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-heygen-api-key');

  if (!apiKey) {
    return NextResponse.json({ error: 'HeyGen API key is required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { avatar_image_url, audio_url, avatar_id, aspect_ratio = '16:9' } = body;

    if (!audio_url) {
      return NextResponse.json({ error: 'audio_url is required.' }, { status: 400 });
    }

    // Build video generation payload
    let videoInput: any;

    if (avatar_image_url) {
      // Use talking photo from uploaded image
      videoInput = {
        character: {
          type: 'talking_photo',
          talking_photo_url: avatar_image_url,
        },
        voice: {
          type: 'audio',
          audio_url: audio_url,
        },
      };
    } else if (avatar_id) {
      // Use pre-existing HeyGen avatar
      videoInput = {
        character: {
          type: 'avatar',
          avatar_id: avatar_id,
          avatar_style: 'normal',
        },
        voice: {
          type: 'audio',
          audio_url: audio_url,
        },
      };
    } else {
      return NextResponse.json(
        { error: 'Either avatar_image_url or avatar_id is required.' },
        { status: 400 }
      );
    }

    const payload = {
      video_inputs: [videoInput],
      dimension: {
        width: aspect_ratio === '9:16' ? 720 : 1280,
        height: aspect_ratio === '9:16' ? 1280 : 720,
      },
    };

    console.log('[HeyGen Generate] Sending payload:', JSON.stringify(payload, null, 2));

    const response = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[HeyGen Generate] API Error:', response.status, errorBody);
      return NextResponse.json(
        { error: `HeyGen Generate Error: ${response.statusText}. Details: ${errorBody}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[HeyGen Generate] Response:', JSON.stringify(data));
    
    return NextResponse.json({
      video_id: data.data?.video_id,
      status: 'processing',
    });
  } catch (error: any) {
    console.error('[HeyGen Generate] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
