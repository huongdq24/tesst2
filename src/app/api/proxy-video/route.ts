import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');

  if (!videoUrl) {
    return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
  }

  try {
    // FIX: Add 60-second timeout to prevent indefinite hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    // FIX: For Google AI video URLs, extract the API key and forward it as a header
    // The URL format is: https://generativelanguage.googleapis.com/.../files/xxx?key=API_KEY
    const fetchHeaders: Record<string, string> = {};
    let cleanUrl = videoUrl;

    if (videoUrl.includes('generativelanguage.googleapis.com')) {
      try {
        const urlObj = new URL(videoUrl);
        const apiKey = urlObj.searchParams.get('key');
        if (apiKey) {
          fetchHeaders['x-goog-api-key'] = apiKey;
          // Remove the key from the URL to avoid it being logged in server access logs
          urlObj.searchParams.delete('key');
          cleanUrl = urlObj.toString();
        }
      } catch (e) {
        // If URL parsing fails, just use the original URL
        console.warn('[ProxyVideo] Failed to parse video URL:', e);
      }
    }

    const response = await fetch(cleanUrl, {
      signal: controller.signal,
      headers: fetchHeaders,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`[ProxyVideo] Fetch failed: ${response.status} ${response.statusText}`, errorText.substring(0, 200));
      throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
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
