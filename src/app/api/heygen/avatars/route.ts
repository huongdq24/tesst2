import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/heygen/avatars
 * Retrieves a list of all available HeyGen avatars.
 * Returns: { avatars: [{ avatar_id, avatar_name, preview_image_url, gender }] }
 */
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-heygen-api-key');

  if (!apiKey) {
    return NextResponse.json({ error: 'HeyGen API key is required.' }, { status: 401 });
  }

  try {
    const response = await fetch('https://api.heygen.com/v2/avatars', {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[HeyGen Avatars] API Error:', response.status, errorBody);
      return NextResponse.json(
        { error: `HeyGen Avatars Error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Map and normalize the avatar data
    const rawAvatars = (data.data?.avatars || []).map((avatar: any) => ({
      avatar_id: avatar.avatar_id,
      avatar_name: avatar.avatar_name || avatar.name || 'Unnamed',
      preview_image_url: avatar.preview_image_url || avatar.thumbnail_url,
      gender: avatar.gender || 'unknown',
      avatar_type: avatar.type || 'avatar',
    }));

    // Deduplicate by avatar_id
    const seenIds = new Set();
    const avatars = rawAvatars.filter((a: any) => {
      if (seenIds.has(a.avatar_id)) return false;
      seenIds.add(a.avatar_id);
      return true;
    });

    return NextResponse.json({ avatars });
  } catch (error: any) {
    console.error('[HeyGen Avatars] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
