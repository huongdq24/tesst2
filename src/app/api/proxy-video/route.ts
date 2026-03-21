import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');

  if (!videoUrl) {
    return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
  }

  try {
    // FIX #7: Add 60-second timeout to prevent indefinite hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(videoUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.statusText}`);
    }

    const contentType = response.headers.get('Content-Type') || 'video/mp4';
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    // Allow the browser to process it properly
    headers.set('Access-Control-Allow-Origin', '*');

    // Return the readable stream directly to the client
    return new NextResponse(response.body, { headers });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('Video proxy timeout: request took longer than 60 seconds');
      return NextResponse.json({ error: 'Video download timed out after 60 seconds' }, { status: 504 });
    }
    console.error('Error proxying video:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
