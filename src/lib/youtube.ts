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
