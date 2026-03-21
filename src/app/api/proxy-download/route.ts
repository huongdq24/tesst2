import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const fullUrl = new URL(request.url);
  const url = fullUrl.searchParams.get('url');
  let filename = fullUrl.searchParams.get('filename') || 'igen-audio.mp3';
  
  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  // Sanitize filename: remove special characters that might break headers
  // Only allow alphanumeric, spaces, dots, and common vietnamese chars
  filename = filename.replace(/[<>:"/\\|?*]/g, '_');

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch source: ${response.statusText}`);
    }

    const contentType = response.headers.get('Content-Type') || (filename.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4');
    const arrayBuffer = await response.arrayBuffer();

    // Ensure filename isn't truncated or missing extension
    if (!filename.includes('.')) {
      filename += '.mp3';
    }

    // Clean up filename for header compatibility - remove newlines/tabs
    const cleanFilename = filename.replace(/[\r\n\t]/g, ' ').trim();
    const asciiFilename = cleanFilename.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    
    // RFC 6266 / RFC 5987 compliant header
    // Use filename for legacy (ASCII only), filename* for modern browsers (UTF-8)
    headers.set('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(cleanFilename)}`);
    headers.set('Access-Control-Allow-Origin', '*');

    return new NextResponse(arrayBuffer, { headers });

  } catch (error: any) {
    console.error('[Proxy Download] CRITICAL ERROR:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
