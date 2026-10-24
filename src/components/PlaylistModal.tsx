import { useState, useEffect, useCallback, useMemo } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, ListMusic, Loader2, Plus, X, AlertCircle } from 'lucide-react'
import { previewPlaylist, addPlaylist, type PlaylistPreviewResponse, type PlaylistTrack } from '@/lib/api'
import { isYouTubePlaylistUrl } from '@/lib/youtube'
import { optimizeThumbnailUrl } from '@/routes/index'

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export interface PlaylistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentGuildId: string | null;
  isVoiceConnected: boolean;
  initialUrl?: string;
  onSuccess?: (addedCount: number, playlistTitle: string) => void;
  onError?: (errorMessage: string) => void;
}

export function PlaylistModal({
  open,
  onOpenChange,
  currentGuildId,
  isVoiceConnected,
  initialUrl = '',
  onSuccess,
  onError,
}: PlaylistModalProps) {
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<PlaylistPreviewResponse | null>(null);

  const [startSong, setStartSong] = useState(1);
  const [endSong, setEndSong] = useState(1);

  // Sync initialUrl whenever dialog opens or initialUrl changes
  useEffect(() => {
    if (open) {
      if (initialUrl) {
        setUrl(initialUrl);
        handleFetchPreview(initialUrl);
      } else {
        setUrl('');
        setPreview(null);
        setError('');
      }
    } else {
      setError('');
    }
  }, [open, initialUrl]);

  const totalTracks = preview?.tracks.length ?? 0;

  // Clamped range values
  const clampedStart = useMemo(() => {
    if (totalTracks === 0) return 1;
    return Math.max(1, Math.min(startSong, totalTracks));
  }, [startSong, totalTracks]);

  const clampedEnd = useMemo(() => {
    if (totalTracks === 0) return 1;
    return Math.max(clampedStart, Math.min(endSong, totalTracks));
  }, [endSong, clampedStart, totalTracks]);

  const selectedCount = useMemo(() => {
    if (totalTracks === 0) return 0;
    return Math.max(0, clampedEnd - clampedStart + 1);
  }, [clampedStart, clampedEnd, totalTracks]);

  const handleFetchPreview = useCallback(async (targetUrl?: string) => {
    const queryUrl = (targetUrl ?? url).trim();
    if (!queryUrl || !currentGuildId) return;

    if (!isYouTubePlaylistUrl(queryUrl)) {
      setError('Please enter a valid YouTube playlist URL (with a "list=" parameter).');
      return;
    }

    setLoading(true);
    setError('');
    setPreview(null);

    try {
      const data = await previewPlaylist(currentGuildId, queryUrl);
      if (!data || !data.tracks || data.tracks.length === 0) {
        setError('No tracks found in this playlist. Please check that it is public or unlisted.');
        return;
      }
      setPreview(data);
      setStartSong(1);
      setEndSong(data.tracks.length);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch playlist preview.');
    } finally {
      setLoading(false);
    }
  }, [url, currentGuildId]);

  const handleApplyPreset = useCallback((count: number | 'all') => {
    if (!preview) return;
    setStartSong(1);
    if (count === 'all') {
      setEndSong(preview.tracks.length);
    } else {
      setEndSong(Math.min(count, preview.tracks.length));
    }
  }, [preview]);

  const handleAdd = useCallback(async () => {
    if (!preview || !currentGuildId || !isVoiceConnected || selectedCount === 0) return;

    setAdding(true);
    setError('');

    try {
      const selectedTracks = preview.tracks.slice(clampedStart - 1, clampedEnd);
      const res = await addPlaylist(currentGuildId, {
        title: preview.title,
        start_index: clampedStart,
        end_index: clampedEnd,
        tracks: selectedTracks.map(t => ({
          url: t.url,
          title: t.title,
          artist: t.artist,
          thumbnail: t.thumbnail,
          duration: t.duration,
        })),
      });

      const count = res.added_count || selectedTracks.length;
      onSuccess?.(count, preview.title);
      onOpenChange(false);
    } catch (err: any) {
      const msg = err?.message || 'Failed to add playlist tracks to queue.';
      setError(msg);
      onError?.(msg);
    } finally {
      setAdding(false);
    }
  }, [preview, currentGuildId, isVoiceConnected, selectedCount, clampedStart, clampedEnd, onSuccess, onError, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="playlist-modal glass-surface max-w-xl max-h-[90vh] flex flex-col p-6 gap-4">
        <DialogHeader className="pb-1">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-semibold text-foreground">
            <ListMusic className="text-primary" size={20} />
            <span>Add YouTube Playlist</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Preview playlist tracks, select the range from what song to what song to add, and queue them smoothly.
          </DialogDescription>
        </DialogHeader>

        {/* URL Input Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              aria-label="Playlist URL input"
              placeholder="Paste YouTube playlist URL (e.g. https://www.youtube.com/playlist?list=...)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleFetchPreview();
                }
              }}
              className="text-xs pr-8 h-9"
              disabled={loading || adding}
            />
            {url && (
              <button
                type="button"
                aria-label="Clear URL"
                onClick={() => { setUrl(''); setPreview(null); setError(''); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => handleFetchPreview()}
            disabled={!url.trim() || loading || adding}
            className="h-9 px-4 text-xs font-medium"
          >
            {loading ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
            Preview
          </Button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-center gap-2 p-3 text-xs rounded-lg bg-destructive/15 text-destructive border border-destructive/30">
            <AlertCircle size={15} className="shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Loading Indicator */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <Loader2 size={28} className="animate-spin text-primary" />
            <span className="text-xs font-medium">Fetching playlist metadata and tracks...</span>
          </div>
        )}

        {/* Preview Content */}
        {!loading && preview && (
          <div className="flex flex-col gap-4 min-h-0 flex-1 overflow-hidden">
            {/* Playlist Header Card */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-card/60 border border-border">
              {preview.thumbnail ? (
                <img
                  src={optimizeThumbnailUrl(preview.thumbnail)}
                  alt=""
                  className="w-14 h-14 rounded-md object-cover shrink-0 bg-muted"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (target.src.includes('/maxresdefault.jpg')) {
                      target.src = target.src.replace('/maxresdefault.jpg', '/mqdefault.jpg');
                    }
                  }}
                />
              ) : (
                <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
                  <ListMusic size={24} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-foreground truncate" title={preview.title}>
                  {preview.title}
                </h4>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  {preview.uploader && <span className="truncate">{preview.uploader}</span>}
                  {preview.uploader && <span>•</span>}
                  <span className="font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full text-[11px]">
                    {preview.total_tracks} songs
                  </span>
                </div>
              </div>
            </div>

            {/* Range Selection Controls */}
            <div className="flex flex-col gap-2.5 p-3 rounded-lg bg-card/40 border border-border/80">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">Select track range to add:</span>
                <span className="text-xs font-semibold text-primary">
                  {selectedCount} tracks selected (#{clampedStart} to #{clampedEnd})
                </span>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-muted-foreground mr-1">Presets:</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => handleApplyPreset('all')}
                >
                  All (1–{totalTracks})
                </Button>
                {totalTracks > 10 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => handleApplyPreset(10)}
                  >
                    First 10
                  </Button>
                )}
                {totalTracks > 25 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => handleApplyPreset(25)}
                  >
                    First 25
                  </Button>
                )}
                {totalTracks > 50 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => handleApplyPreset(50)}
                  >
                    First 50
                  </Button>
                )}
              </div>

              {/* Range Numeric Inputs */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <label htmlFor="start-song-input" className="text-xs text-muted-foreground whitespace-nowrap">
                    From song:
                  </label>
                  <Input
                    id="start-song-input"
                    type="number"
                    min={1}
                    max={totalTracks}
                    value={startSong}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) setStartSong(val);
                    }}
                    className="h-8 text-xs font-mono"
                    disabled={adding}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="end-song-input" className="text-xs text-muted-foreground whitespace-nowrap">
                    To song:
                  </label>
                  <Input
                    id="end-song-input"
                    type="number"
                    min={1}
                    max={totalTracks}
                    value={endSong}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) setEndSong(val);
                    }}
                    className="h-8 text-xs font-mono"
                    disabled={adding}
                  />
                </div>
              </div>
            </div>

            {/* Scrollable Tracks Preview List */}
            <div className="flex-1 min-h-[140px] max-h-[260px] overflow-y-auto rounded-lg border border-border/80 bg-background/50 divide-y divide-border/40 pr-1">
              {preview.tracks.map((track: PlaylistTrack) => {
                const isIncluded = track.index >= clampedStart && track.index <= clampedEnd;
                return (
                  <div
                    key={track.id || track.index}
                    className={`flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                      isIncluded
                        ? 'bg-primary/5 text-foreground'
                        : 'opacity-40 text-muted-foreground'
                    }`}
                  >
                    <span className="w-7 text-center font-mono text-[11px] shrink-0 font-medium">
                      {isIncluded ? (
                        <Check size={12} className="inline text-primary mr-0.5" />
                      ) : null}
                      {track.index}
                    </span>
                    {track.thumbnail ? (
                      <img
                        src={optimizeThumbnailUrl(track.thumbnail)}
                        alt=""
                        loading="lazy"
                        className="w-8 h-8 rounded object-cover shrink-0 bg-muted"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (target.src.includes('/maxresdefault.jpg')) {
                            target.src = target.src.replace('/maxresdefault.jpg', '/mqdefault.jpg');
                          }
                        }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-muted shrink-0 flex items-center justify-center text-muted-foreground">
                        <ListMusic size={14} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate" title={track.title}>
                        {track.title}
                      </div>
                      {track.artist && (
                        <div className="text-[11px] text-muted-foreground truncate">
                          {track.artist}
                        </div>
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                      {formatDuration(track.duration)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border mt-auto">
          {!isVoiceConnected ? (
            <span className="text-xs text-amber-500 font-medium">
              Join a voice channel first to queue tracks.
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {preview ? `Will add ${selectedCount} song(s) to queue` : 'Paste a playlist URL to start'}
            </span>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={adding}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={!preview || selectedCount === 0 || !isVoiceConnected || adding || loading}
              className="text-xs h-8 font-medium gap-1.5"
            >
              {adding ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus size={14} />
                  Add {selectedCount > 0 ? `${selectedCount} songs` : 'to Queue'}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
