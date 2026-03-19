import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');

  if (!videoUrl) {
    return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
  }

  try {
    const response = await fetch(videoUrl);
    
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
    console.error('Error proxying video:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
