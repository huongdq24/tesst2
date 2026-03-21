import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/heygen/status?video_id=xxx
 * Checks the status of a HeyGen video generation job.
 * 
 * Returns: { status, video_url?, error? }
 */
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-heygen-api-key');
  const videoId = request.nextUrl.searchParams.get('video_id');

  if (!apiKey) {
    return NextResponse.json({ error: 'HeyGen API key is required.' }, { status: 401 });
  }

  if (!videoId) {
    return NextResponse.json({ error: 'video_id is required.' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
      {
        method: 'GET',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[HeyGen Status] API Error:', response.status, errorBody);
      return NextResponse.json(
        { error: `HeyGen Status Error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const videoData = data.data;

    if (!videoData) {
      return NextResponse.json({ status: 'processing' });
    }

    // Map HeyGen statuses to our app statuses
    switch (videoData.status) {
      case 'completed':
        return NextResponse.json({
          status: 'completed',
          video_url: videoData.video_url,
          thumbnail_url: videoData.thumbnail_url,
          duration: videoData.duration,
        });
      case 'failed':
        return NextResponse.json({
          status: 'failed',
          error: videoData.error?.message || 'Video generation failed.',
        });
      case 'processing':
      case 'pending':
      case 'waiting':
      default:
        return NextResponse.json({
          status: 'processing',
        });
    }
  } catch (error: any) {
    console.error('[HeyGen Status] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
