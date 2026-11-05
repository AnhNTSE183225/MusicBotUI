/**
 * Utilities for analyzing and handling YouTube URLs and playlists on the frontend.
 */

export function isYouTubePlaylistUrl(query: string): boolean {
  if (!query || typeof query !== 'string') return false;
  const trimmed = query.trim();

  // Quick check: must mention youtube or youtu.be and have a list param
  if (!/(?:youtube\.com|youtu\.be)/i.test(trimmed) || !/[?&]list=/i.test(trimmed)) {
    return false;
  }

  try {
    const urlObj = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    const listId = urlObj.searchParams.get('list');
    if (!listId) return false;

    // LL (Liked Videos) and WL (Watch Later) are private and require user login on YouTube
    const upperListId = listId.toUpperCase();
    if (upperListId.startsWith('LL') || upperListId.startsWith('WL')) {
      return false;
    }

    return true;
  } catch {
    // Regex fallback if URL constructor fails on unconventional inputs
    const match = trimmed.match(/[?&]list=([^&#]+)/i);
    if (match && match[1]) {
      const listId = match[1].toUpperCase();
      return !listId.startsWith('LL') && !listId.startsWith('WL');
    }
    return false;
  }
}

export function cleanPlaylistUrl(query: string): string {
  if (!query) return '';
  const trimmed = query.trim();
  try {
    const urlObj = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    const listId = urlObj.searchParams.get('list');
    const videoId = urlObj.searchParams.get('v');

    if (!listId) return trimmed;

    // YouTube Mixes (RD...) need the video parameter to anchor the radio mix
    if (listId.toUpperCase().startsWith('RD') && videoId) {
      return `https://www.youtube.com/watch?v=${videoId}&list=${listId}`;
    }

    return `https://www.youtube.com/playlist?list=${listId}`;
  } catch {
    return trimmed;
  }
}

/**
 * Strips playlist parameters (list, index, start_radio) from a YouTube URL
 * so normal paste/submit ignores the playlist and adds only the single song.
 */
export function stripPlaylistFromUrl(query: string): string {
  if (!query || typeof query !== 'string') return '';
  const trimmed = query.trim();

  if (!/(?:youtube\.com|youtu\.be)/i.test(trimmed)) {
    return trimmed;
  }

  try {
    const urlObj = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    let videoId = urlObj.searchParams.get('v');

    if (!videoId && urlObj.hostname.toLowerCase().includes('youtu.be')) {
      const parts = urlObj.pathname.replace(/^\/+/, '').split('/');
      if (parts[0]) videoId = parts[0];
    } else if (!videoId && urlObj.pathname.includes('/embed/')) {
      const parts = urlObj.pathname.split('/embed/')[1]?.split('/');
      if (parts?.[0]) videoId = parts[0];
    } else if (!videoId && urlObj.pathname.includes('/shorts/')) {
      const parts = urlObj.pathname.split('/shorts/')[1]?.split('/');
      if (parts?.[0]) videoId = parts[0];
    }

    if (videoId) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }

    return trimmed;
  } catch {
    // Regex fallback for watch?v=...&list=...
    const vMatch = trimmed.match(/[?&]v=([^&#]+)/i);
    if (vMatch && vMatch[1]) {
      return `https://www.youtube.com/watch?v=${vMatch[1]}`;
    }
    return trimmed;
  }
}
/**
 * Detects if a URL or string is a valid YouTube or YouTube Music link.
 */
export function isYouTubeUrl(query: string): boolean {
  if (!query || typeof query !== 'string') return false;
  const trimmed = query.trim();
  return /^(?:https?:\/\/)?(?:(?:www|m|music)\.)?(?:youtube\.com|youtu\.be)\/\S+$/i.test(trimmed);
}

/**
 * Extracts a YouTube URL from a drag-and-drop DataTransfer object.
 * Supports text/uri-list, text/plain, and text/html drag payloads.
 */
export function extractYouTubeUrlFromDataTransfer(dataTransfer: DataTransfer | null): string | null {
  if (!dataTransfer) return null;

  // 1. Try text/uri-list (standard for dragging links and tabs)
  try {
    const uriList = dataTransfer.getData('text/uri-list');
    if (uriList) {
      const lines = uriList.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && isYouTubeUrl(trimmed)) {
          return trimmed;
        }
      }
    }
  } catch {}

  // 2. Try text/plain (plain text drag or URL copy)
  try {
    const plainText = dataTransfer.getData('text/plain');
    if (plainText) {
      const trimmed = plainText.trim();
      if (isYouTubeUrl(trimmed)) {
        return trimmed;
      }
      const match = plainText.match(/https?:\/\/(?:(?:www|m|music)\.)?(?:youtube\.com|youtu\.be)\/[^\s"']+/i);
      if (match) {
        return match[0];
      }
    }
  } catch {}

  // 3. Try text/html (dragged rich anchor tags or web elements)
  try {
    const html = dataTransfer.getData('text/html');
    if (html) {
      const hrefMatch = html.match(/href=["'](https?:\/\/(?:(?:www|m|music)\.)?(?:youtube\.com|youtu\.be)\/[^"']+)["']/i);
      if (hrefMatch) {
        return hrefMatch[1];
      }
      const textMatch = html.match(/https?:\/\/(?:(?:www|m|music)\.)?(?:youtube\.com|youtu\.be)\/[^\s"']+/i);
      if (textMatch) {
        return textMatch[0];
      }
    }
  } catch {}

  return null;
}
