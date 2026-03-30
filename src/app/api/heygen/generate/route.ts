import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/heygen/generate
 * Creates a talking avatar video using HeyGen's v2 API.
 * Supports multi-scene: each scene can use a different avatar and voice.
 * 
 * Body: { scenes: [{ character_type, talking_photo_url?, avatar_id?, voice_type, voice_id?, audio_url?, script? }], aspect_ratio?, background? }
 * Legacy Body: { avatar_image_url, audio_url, avatar_id?, aspect_ratio? }
 * Returns: { video_id: string }
 */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-heygen-api-key');

  if (!apiKey) {
    return NextResponse.json({ error: 'HeyGen API key is required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    
    let videoInputs: any[] = [];
    let dimension = { width: 1280, height: 720 };

    // NEW: Multi-scene format
    if (body.scenes && Array.isArray(body.scenes)) {
      const aspectRatio = body.aspect_ratio || '16:9';
      dimension = {
        width: aspectRatio === '9:16' ? 720 : 1280,
        height: aspectRatio === '9:16' ? 1280 : 720,
      };

      for (const scene of body.scenes) {
        const input: any = {};

        // Character configuration
        if (scene.character_type === 'talking_photo' && scene.talking_photo_id) {
          input.character = {
            type: 'talking_photo',
            talking_photo_id: scene.talking_photo_id,
          };
        } else if (scene.character_type === 'avatar' && scene.avatar_id) {
          input.character = {
            type: 'avatar',
            avatar_id: scene.avatar_id,
            avatar_style: scene.avatar_style || 'normal',
          };
        } else {
          return NextResponse.json(
            { error: 'Each scene requires either talking_photo_id or avatar_id.' },
            { status: 400 }
          );
        }

        // Voice configuration
        if (scene.voice_type === 'audio' && scene.audio_url) {
          input.voice = {
            type: 'audio',
            audio_url: scene.audio_url,
          };
        } else if (scene.voice_type === 'text' && scene.voice_id && scene.script) {
          input.voice = {
            type: 'text',
            voice_id: scene.voice_id,
            input_text: scene.script,
            speed: scene.speed || 1.0,
          };
        } else {
          return NextResponse.json(
            { error: 'Each scene requires voice configuration (audio_url or voice_id + script).' },
            { status: 400 }
          );
        }

        // Optional background
        if (scene.background_color) {
          input.background = { type: 'color', value: scene.background_color };
        } else if (scene.background_url) {
          input.background = { type: 'image', url: scene.background_url };
        }

        videoInputs.push(input);
      }
    }
    // LEGACY: Single scene format (backward compatible)
    else {
      const { avatar_image_url, audio_url, avatar_id, aspect_ratio = '16:9' } = body;
      dimension = {
        width: aspect_ratio === '9:16' ? 720 : 1280,
        height: aspect_ratio === '9:16' ? 1280 : 720,
      };

      if (!audio_url) {
        return NextResponse.json({ error: 'audio_url is required.' }, { status: 400 });
      }

      if (avatar_image_url) {
        // For legacy format, the avatar_image_url should already be a talking_photo_id
        videoInputs = [{
          character: { type: 'talking_photo', talking_photo_id: avatar_image_url },
          voice: { type: 'audio', audio_url },
        }];
      } else if (avatar_id) {
        videoInputs = [{
          character: { type: 'avatar', avatar_id, avatar_style: 'normal' },
          voice: { type: 'audio', audio_url },
        }];
      } else {
        return NextResponse.json(
          { error: 'Either avatar_image_url or avatar_id is required.' },
          { status: 400 }
        );
      }
    }

    const payload = {
      video_inputs: videoInputs,
      dimension,
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
