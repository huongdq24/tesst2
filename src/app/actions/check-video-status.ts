'use server';

/**
 * Server action to check the status of a video generation LRO.
 * Uses raw REST API calls instead of Genkit for reliability.
 */

interface CheckStatusResult {
  status: 'processing' | 'completed' | 'failed';
  progress?: number;
  videoUrl?: string;
  error?: string;
}

/**
 * Extracts a video URL from the completed operation response.
 */
function extractVideoFromOperation(operation: any): string | null {
  if (!operation) return null;

  // Log the full response structure for debugging
  console.log('[CheckStatus] Full operation response keys:', JSON.stringify(Object.keys(operation)));
  if (operation.response) {
    console.log('[CheckStatus] Response keys:', JSON.stringify(Object.keys(operation.response)));
  }

  // Pattern 1: response.generateVideoResponse.generatedSamples (Veo 2.x & 3.x standard)
  try {
    const samples = operation.response?.generateVideoResponse?.generatedSamples;
    if (samples && samples.length > 0) {
      const video = samples[0]?.video;
      if (video?.uri) {
        console.log('[CheckStatus] Found video via Pattern 1 (generateVideoResponse.generatedSamples)');
        return video.uri;
      }
    }
  } catch (e) { /* ignore */ }

  // Pattern 2: response.videos array
  try {
    const videos = operation.response?.videos;
    if (videos && videos.length > 0) {
      const video = videos[0];
      if (video.uri) {
        console.log('[CheckStatus] Found video via Pattern 2a (response.videos[].uri)');
        return video.uri;
      }
      if (video.gcsUri) {
        console.log('[CheckStatus] Found video via Pattern 2b (response.videos[].gcsUri)');
        return video.gcsUri;
      }
      if (video.bytesBase64Encoded) {
        console.log('[CheckStatus] Found video via Pattern 2c (base64 encoded)');
        return `data:${video.mimeType || 'video/mp4'};base64,${video.bytesBase64Encoded}`;
      }
    }
  } catch (e) { /* ignore */ }

  // Pattern 3: Direct video in metadata
  try {
    const metadata = operation.metadata;
    if (metadata?.videos && metadata.videos.length > 0) {
      const v = metadata.videos[0];
      if (v.uri) {
        console.log('[CheckStatus] Found video via Pattern 3a (metadata.videos[].uri)');
        return v.uri;
      }
      if (v.gcsUri) {
        console.log('[CheckStatus] Found video via Pattern 3b (metadata.videos[].gcsUri)');
        return v.gcsUri;
      }
    }
  } catch (e) { /* ignore */ }

  // Pattern 4: Deep search — walk all keys looking for a video URI
  try {
    const responseStr = JSON.stringify(operation.response || operation);
    // Look for generativelanguage.googleapis.com file URIs
    const fileUriMatch = responseStr.match(/"(https:\/\/generativelanguage\.googleapis\.com\/[^"]+)"/);  
    if (fileUriMatch) {
      console.log('[CheckStatus] Found video via Pattern 4 (deep URI search)');
      return fileUriMatch[1];
    }
    // Look for any "uri" field containing a video-like URL
    const uriMatch = responseStr.match(/"uri"\s*:\s*"(https?:\/\/[^"]+)"/);  
    if (uriMatch) {
      console.log('[CheckStatus] Found video via Pattern 4b (generic uri field)');
      return uriMatch[1];
    }
  } catch (e) { /* ignore */ }

  return null;
}

/**
 * Format error messages for user display.
 */
function formatDetailedError(message: string): string {
  if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
    return `🚫 Quá giới hạn API (Rate Limit). Vui lòng đợi vài phút trước khi thử lại.`;
  }
  if (message.includes('403') || message.includes('PERMISSION_DENIED')) {
    return `🔑 API Key không hợp lệ hoặc không có quyền sử dụng model này.`;
  }
  if (message.includes('content policy') || message.includes('SAFETY') || message.includes('blockReason')) {
    return `⛔ Yêu cầu đã bị chặn do vi phạm chính sách nội dung. Vui lòng thử prompt khác.`;
  }
  if (message.includes('DEADLINE_EXCEEDED') || message.includes('timeout')) {
    return `⏱️ Quá thời gian xử lý. Vui lòng thử lại.`;
  }
  if (message.includes('500') || message.includes('INTERNAL')) {
    return `🔧 Lỗi máy chủ Google AI tạm thời. Vui lòng thử lại sau ít phút.`;
  }
  return `❌ Lỗi: ${message.substring(0, 300)}`;
}


/**
 * Server action to check the status of a video generation LRO operation.
 * Uses raw REST API to poll the operation status.
 */
export async function checkVideoStatus(operationName: string, apiKey: string): Promise<CheckStatusResult> {
  if (!operationName) {
    return { status: 'failed', error: 'No operation name provided.' };
  }
  if (!apiKey) {
    return { status: 'failed', error: 'API key is required for status checking.' };
  }

  try {
    // Call the Google AI REST API to check operation status
    const url = `https://generativelanguage.googleapis.com/v1beta/${operationName}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage = `API returned ${response.status}: ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorBody);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch (e) { /* ignore parse error */ }

      return { status: 'failed', error: formatDetailedError(errorMessage) };
    }

    const operation = await response.json();

    // Check if the operation is still in progress
    if (!operation.done) {
      const progress = operation.metadata?.['@type']?.includes('GenerateVideoMetadata')
        ? 50 // Placeholder progress since Google doesn't provide exact %
        : 0;
      return { status: 'processing', progress };
    }

    // Operation is done - check for errors
    if (operation.error) {
      const errorMessage = operation.error.message || 'Unknown error during video generation.';
      return { status: 'failed', error: formatDetailedError(errorMessage) };
    }

    // Operation is done and successful - extract video URL
    const videoUrl = extractVideoFromOperation(operation);

    if (!videoUrl) {
      // Log the FULL response so we can add the correct pattern next time
      console.error('[CheckStatus] Complete operation but no video found. FULL RESPONSE:', JSON.stringify(operation, null, 2));
      return {
        status: 'failed',
        error: '❌ Video đã được tạo xong nhưng không tìm thấy URL video trong kết quả. Vui lòng thử lại.',
      };
    }

    // For Google AI file URIs, append API key as query param for download access
    let accessibleUrl = videoUrl;
    if (videoUrl.startsWith('https://generativelanguage.googleapis.com')) {
      const separator = videoUrl.includes('?') ? '&' : '?';
      accessibleUrl = `${videoUrl}${separator}key=${apiKey}`;
    }

    console.log('[CheckStatus] Video URL ready:', accessibleUrl.substring(0, 100) + '...');

    return {
      status: 'completed',
      progress: 100,
      videoUrl: accessibleUrl,
    };

  } catch (err: any) {
    console.error(`[CheckStatus] Error checking operation ${operationName}:`, err);
    return { status: 'failed', error: formatDetailedError(err.message || 'Unknown error') };
  }
}
