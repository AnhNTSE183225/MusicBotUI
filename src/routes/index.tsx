import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { AudioLines, ArrowUpRight, Check, ChevronDown, CircleHelp, FileText, Headphones, Heart, ListMusic, MoreHorizontal, Music2, Pause, Play, Plus, Radio, Repeat2, Settings2, SkipBack, SkipForward, Square, Trash2, Volume2, VolumeX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { checkAuth, getLoginUrl, getGuilds, getQueue, getStreamUrl, addSong, controlJoin, controlSkip, controlStop, controlPause, controlResume, controlLoop, controlVolume, controlSkipTo, controlRemove, controlClear, getLyrics } from '@/lib/api'
import { MarqueeText } from '@/components/MarqueeText'

import ocean from '@/assets/ocean-drive.jpg'
import dunes from '@/assets/sundown.jpg'
import coast from '@/assets/coastline.jpg'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'MusicBot — Your shared listening room' },
    { name: 'description', content: 'Your Discord listening room. An artwork-first MusicBot player with playback controls and a shared queue.' },
    { property: 'og:title', content: 'MusicBot — Your shared listening room' },
    { property: 'og:description', content: 'A beautiful space for the music you share on Discord.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: MusicRoom,
})

function formatTime(seconds: number) {
  if (!seconds) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function IconControl({ label, children, onClick, active = false, disabled = false, className = '' }: { label: string; children: ReactNode; onClick?: () => void; active?: boolean; disabled?: boolean; className?: string }) {
  return <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick} className={`${active ? 'text-primary' : 'text-muted-foreground'} ${className}`}>{children}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}

export type Track = { id: string; title: string; artist: string; album: string; image: string; duration: number; requestedBy: string; requestedAvatar?: string | null; originalIndex?: number }

export type LyricWord = { begin: number; end: number; text: string }
export type LyricLine = { begin: number; end: number; text: string; words?: LyricWord[] | null }
export type LyricsData = { type: 'syllable' | 'line'; provider: string; intro_offset?: number; lines: LyricLine[] }

const images = [ocean, dunes, coast];
function getImageForTrack(title: string) {
    if (!title) return images[0];
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
        hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    return images[Math.abs(hash) % images.length];
}

const idleTrack: Track = {
    id: 'idle', title: 'Nothing playing', artist: 'Waiting for a song', album: '', image: ocean, duration: 0, requestedBy: ''
}

function MusicRoom() {
  const [user, setUser] = useState<any>(null)
  const [isAuthLoaded, setIsAuthLoaded] = useState(false)
  const [guilds, setGuilds] = useState<any[]>([])
  const [currentGuildId, setCurrentGuildId] = useState<string | null>(null)
  
  const [current, setCurrent] = useState<Track | null>(null)
  const [queue, setQueue] = useState<Track[]>([])
  const [playing, setPlaying] = useState(false)
  const [stopped, setStopped] = useState(true)
  const [loop, setLoop] = useState(false)
  const [volume, setVolume] = useState(75)
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<'connection' | 'help' | null>(null)
  const [notice, setNotice] = useState('')
  const [summoned, setSummoned] = useState(false)
  const [position, setPosition] = useState(0)
  const [skipVotes, setSkipVotes] = useState(0)
  const [skipVotesReq, setSkipVotesReq] = useState(0)
  const [pauseVotes, setPauseVotes] = useState(0)
  const [pauseVotesReq, setPauseVotesReq] = useState(0)
  const [resumeVotes, setResumeVotes] = useState(0)
  const [resumeVotesReq, setResumeVotesReq] = useState(0)
  const [stopVotes, setStopVotes] = useState(0)
  const [stopVotesReq, setStopVotesReq] = useState(0)
  
  const [currentPage, setCurrentPage] = useState(1)
  const [queueIndex, setQueueIndex] = useState(-1)
  const ITEMS_PER_PAGE = 10

  const [activeTab, setActiveTab] = useState<'queue' | 'lyrics'>('queue')
  const [lyrics, setLyrics] = useState<LyricsData | null>(null)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [userOffset, setUserOffset] = useState<number>(0)
  const activeLineRef = useRef<HTMLDivElement | null>(null)
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (queueIndex >= 0) {
      setCurrentPage(Math.floor(queueIndex / ITEMS_PER_PAGE) + 1);
    }
  }, [queueIndex]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!playing || stopped) return;
    const timer = setInterval(() => setPosition(p => p + 1), 1000);
    return () => clearInterval(timer);
  }, [playing, stopped]);

  // Load lyrics when current track changes
  useEffect(() => {
    if (!currentGuildId || !current || stopped) {
      setLyrics(null);
      return;
    }

    const savedOffset = localStorage.getItem(`offset_${current.title}`);
    setUserOffset(savedOffset ? parseFloat(savedOffset) : 0);

    let isSubscribed = true;
    setLyricsLoading(true);
    getLyrics(currentGuildId)
      .then((res: any) => {
        if (!isSubscribed) return;
        if (res && res.lyrics) {
          setLyrics(res.lyrics);
        } else {
          setLyrics(null);
        }
      })
      .catch(() => {
        if (isSubscribed) setLyrics(null);
      })
      .finally(() => {
        if (isSubscribed) setLyricsLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [currentGuildId, current?.title, stopped]);

  const effectiveTime = useMemo(() => {
    return Math.max(0, position + userOffset - (lyrics?.intro_offset || 0));
  }, [position, userOffset, lyrics?.intro_offset]);

  const activeLineIndex = useMemo(() => {
    if (!lyrics || !lyrics.lines.length) return -1;
    return lyrics.lines.findIndex((line, i) => {
      const nextLine = lyrics.lines[i + 1];
      const end = nextLine ? nextLine.begin : line.end;
      return effectiveTime >= line.begin && effectiveTime < end;
    });
  }, [lyrics, effectiveTime]);

  useEffect(() => {
    if (activeTab === 'lyrics' && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLineIndex, activeTab]);

  const adjustOffset = (delta: number) => {
    setUserOffset((prev) => {
      const next = Math.round((prev + delta) * 10) / 10;
      if (current?.title) {
        localStorage.setItem(`offset_${current.title}`, next.toString());
      }
      return next;
    });
  };

  const resetOffset = () => {
    setUserOffset(0);
    if (current?.title) {
      localStorage.removeItem(`offset_${current.title}`);
    }
  };

    // Auth & Guilds
  useEffect(() => {
    checkAuth().then(u => {
      if (u) {
        setUser(u);
        getGuilds().then(g => {
          const list = g.guilds || [];
          setGuilds(list);
          if (list.length > 0) {
            setCurrentGuildId(list[0].id);
            setSummoned(list[0].bot_connected);
          }
        });
      }
      setIsAuthLoaded(true);
    });
  }, []);

  // SSE connection
  useEffect(() => {
    if (!currentGuildId || !user) return;
    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const connect = async () => {
      try {
        const streamUrl = await getStreamUrl(currentGuildId);
        if (!isMounted) return;
        eventSource = new EventSource(streamUrl);
        
        eventSource.onmessage = (event) => {
          try {
            const state = JSON.parse(event.data);
            
            if (state.current) {
              setCurrent({
                id: 'current',
                title: state.current.title,
                artist: state.current.artist || 'Unknown Artist',
                album: 'Discord',
                image: state.current.thumbnail || getImageForTrack(state.current.title),
                duration: state.current.duration || 0,
                requestedBy: state.current.requester_handle || 'Unknown',
                requestedAvatar: state.current.requester_avatar || null
              });
              setStopped(false);
              setPlaying(!state.is_paused);
              setPosition(Math.floor(state.position || 0));
            } else {
              setCurrent(null);
              setStopped(true);
              setPlaying(false);
              setPosition(0);
            }
            
            if (state.volume !== undefined) {
               let vol = state.volume;
               if (vol <= 1.0 && vol > 0 || vol === 0 || vol === 1) vol = Math.round(vol * 100);
               setVolume(vol);
            }
            if (state.loop !== undefined) setLoop(!!state.loop);
            if (state.bot_connected !== undefined) setSummoned(!!state.bot_connected);
            if (state.skip_votes !== undefined) setSkipVotes(state.skip_votes);
            if (state.skip_votes_required !== undefined) setSkipVotesReq(state.skip_votes_required);
            if (state.pause_votes !== undefined) setPauseVotes(state.pause_votes);
            if (state.pause_votes_required !== undefined) setPauseVotesReq(state.pause_votes_required);
            if (state.resume_votes !== undefined) setResumeVotes(state.resume_votes);
            if (state.resume_votes_required !== undefined) setResumeVotesReq(state.resume_votes_required);
            if (state.stop_votes !== undefined) setStopVotes(state.stop_votes);
            if (state.stop_votes_required !== undefined) setStopVotesReq(state.stop_votes_required);
            if (state.queue_index !== undefined) setQueueIndex(state.queue_index);
            
            if (state.queue && state.queue.length > 0) {
                setQueue(state.queue.map((q: any, i: number) => ({
                    id: `q-${i}`,
                    title: q.title,
                    artist: q.artist || 'Unknown Artist',
                    album: 'Discord',
                    image: q.thumbnail || getImageForTrack(q.title),
                    duration: q.duration || 0,
                    requestedBy: q.requester_handle || 'Unknown',
                    requestedAvatar: q.requester_avatar || null,
                    originalIndex: i
                })));
            } else {
                setQueue([]);
            }
          } catch (err) { console.warn('SSE parse error:', err); }
        };

        eventSource.onerror = () => {
          eventSource?.close();
          if (isMounted) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };
      } catch (err) {
        if (isMounted) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      }
    };
    
    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) eventSource.close();
    };
  }, [currentGuildId, user]);

  const displayCurrent = useMemo(() => current || idleTrack, [current]);
  const total = useMemo(() => queue.reduce((sum, track) => sum + track.duration, 0), [queue])
  
  const totalPages = useMemo(() => Math.ceil(queue.length / ITEMS_PER_PAGE) || 1, [queue.length]);
  // Ensure currentPage is within bounds if queue size changes
  const validCurrentPage = useMemo(() => Math.min(Math.max(1, currentPage), totalPages), [currentPage, totalPages]);
  const paginatedQueue = useMemo(() => queue.slice((validCurrentPage - 1) * ITEMS_PER_PAGE, validCurrentPage * ITEMS_PER_PAGE), [queue, validCurrentPage]);
  
  const currentGuildName = useMemo(() => guilds.find(g => g.id === currentGuildId)?.name || 'The Listening Room', [guilds, currentGuildId]);

  const handleSummon = useCallback(async () => {
      if (!currentGuildId) return;
      try {
          await controlJoin(currentGuildId);
          setSummoned(true);
      } catch(e) {
          setNotice('Failed to join channel');
      }
  }, [currentGuildId]);

  const handleSkip = useCallback(async () => {
      if (!currentGuildId) return;
      try { await controlSkip(currentGuildId); } catch(e: any) { setNotice(e.message || 'Action failed'); }
  }, [currentGuildId]);
  const handleStop = useCallback(async () => {
      if (!currentGuildId) return;
      try { await controlStop(currentGuildId); } catch(e: any) { setNotice(e.message || 'Action failed'); }
  }, [currentGuildId]);
  const handleTogglePlay = useCallback(async () => {
      if (!currentGuildId) return;
      try {
          if (playing) {
              await controlPause(currentGuildId);
          } else {
              await controlResume(currentGuildId);
          }
      } catch(e: any) {
          setNotice(e.message || 'Action failed');
      }
  }, [currentGuildId, playing]);
  const handleLoop = useCallback(async () => {
      if (!currentGuildId) return;
      try {
          await controlLoop(currentGuildId);
      } catch(e: any) {
          setNotice(e.message || 'Action failed');
      }
  }, [currentGuildId]);
  const handleVolume = useCallback(async (val: number) => {
      if (!currentGuildId) return;
      setVolume(val);
      try {
          await controlVolume(currentGuildId, val);
      } catch(e: any) {
          setNotice(e.message || 'Action failed');
      }
  }, [currentGuildId]);
  
  const handleAddSong = useCallback(async (e: React.FormEvent) => {
      e.preventDefault();
      if (!query.trim() || !currentGuildId) return;
      const url = query.trim();
      setQuery('');
      try {
          await addSong(currentGuildId, url);
          setNotice('Added to queue');
      } catch(e) {
          setNotice('Failed to add song');
      }
  }, [currentGuildId, query]);

  const handleSkipTo = useCallback(async (index: number) => {
      if (!currentGuildId) return;
      try { await controlSkipTo(currentGuildId, index + 1); } catch(e: any) { setNotice(e.message || 'Action failed'); }
  }, [currentGuildId]);

  const handleRemove = useCallback(async (index: number) => {
      if (!currentGuildId) return;
      try { await controlRemove(currentGuildId, index + 1); } catch(e: any) { setNotice(e.message || 'Action failed'); }
  }, [currentGuildId]);

  return <TooltipProvider delayDuration={200}>
    <div className="music-app">
      <div className="ambient-art" aria-hidden="true"><img src={displayCurrent.image} alt="" /></div>
      <div className="ambient-shade" aria-hidden="true" />
      <header className="app-header">
        <a href="/" className="brand"><span className="brand-mark"><AudioLines /></span><span>musicbot<span className="brand-dot">.</span></span></a>
        <div className="header-room"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="server-select"><span className="server-symbol"><Headphones size={15} /></span>{currentGuildName}<ChevronDown size={14} /></Button></DropdownMenuTrigger><DropdownMenuContent align="center"><DropdownMenuLabel>Your servers</DropdownMenuLabel>{guilds.map(g => <DropdownMenuItem key={g.id} onClick={() => {setCurrentGuildId(g.id); setSummoned(g.bot_connected)}}><Headphones />{g.name}{g.id === currentGuildId && <Check className="ml-auto" />}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu><span className="header-divider" /><span className="header-channel"><Radio size={14} /> lounge</span></div>
        <div className="header-actions">
           {!isAuthLoaded ? null : !user ? <Button variant="secondary" onClick={() => window.location.href = getLoginUrl()}>Login with Discord</Button> : (
            <><span className="preview-tag">Live Session</span>
            <IconControl label="Connection settings" onClick={() => setDialog('connection')}><Settings2 /></IconControl>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="user-avatar p-0 overflow-hidden" aria-label="Account menu">{user.avatar ? <img src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`} alt="" className="w-full h-full object-cover rounded-full" /> : (user.username.charAt(0).toUpperCase())}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Account · {user.username}</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem onClick={() => {localStorage.removeItem('auth_token'); window.location.reload()}}>Logout</DropdownMenuItem></DropdownMenuContent></DropdownMenu></>
           )}
        </div>
      </header>

      <main className="room-main" style={(!user && isAuthLoaded) ? { filter: 'blur(12px)', pointerEvents: 'none', userSelect: 'none' } : {}}>
        <div className="page-intro"><div><div className="eyebrow">GOOD MUSIC. BETTER COMPANY.</div><h1>Your listening room<span className="heading-dot">.</span></h1></div></div>

        <div className="music-layout">
          <section className="player-panel glass-surface" aria-label="Music player">
            <div className="section-topline"><div className="section-label"><span className={`equalizer ${playing && !stopped ? 'is-playing' : ''}`}><i /><i /><i /><i /></span>{stopped ? 'PLAYBACK STOPPED' : playing ? 'NOW PLAYING' : 'PAUSED'}</div><span className="source-tag"><span className="source-dot" /> Stream</span></div>
            <div className="artwork-stage"><img key={displayCurrent.id} className="album-art" src={displayCurrent.image} alt={`${displayCurrent.title} album artwork`} width={1024} height={1024} /><span className="album-caption">{displayCurrent.album}</span></div>
            <div className="track-details"><div className="min-w-0 w-full"><h2><MarqueeText text={displayCurrent.title} active={!stopped} /></h2><p><MarqueeText text={displayCurrent.artist} active={!stopped} /></p></div></div>
            {displayCurrent.requestedBy ? (
              <div className="track-context">
                {(displayCurrent.requestedAvatar || (user && user.username === displayCurrent.requestedBy && user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null)) ? (
                  <img
                    src={displayCurrent.requestedAvatar || `https://cdn.discordapp.com/avatars/${user?.id}/${user?.avatar}.png?size=64`}
                    alt=""
                    className="tiny-avatar !p-0 object-cover"
                  />
                ) : (
                  <span className="tiny-avatar">{displayCurrent.requestedBy.charAt(0).toUpperCase()}</span>
                )}
                Added by {displayCurrent.requestedBy}
                {displayCurrent.album ? (
                  <>
                    <span className="context-dot">·</span>
                    <span>{displayCurrent.album}</span>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="track-context">
                <span className="tiny-avatar flex items-center justify-center">
                  <Headphones size={12} className="text-muted-foreground" />
                </span>
                <span>Ready to play</span>
                <span className="context-dot">·</span>
                <span>Shared queue</span>
              </div>
            )}
            <div className="progress-area"><div className="progress-track" role="progressbar" aria-label="Track progress" aria-valuenow={stopped ? 0 : position} aria-valuemin={0} aria-valuemax={displayCurrent.duration}><progress value={stopped ? 0 : position} max={displayCurrent.duration} /></div><div className="time-labels"><span>{formatTime(stopped ? 0 : position)}</span><span>{formatTime(displayCurrent.duration)}</span></div></div>
            <div className="playback-controls">
                <IconControl label={loop ? 'Disable loop' : 'Loop track'} active={loop} onClick={handleLoop}><Repeat2 /></IconControl>
                <IconControl label="Previous track" disabled><SkipBack className="fill-current opacity-50" /></IconControl>
                <div className="relative">
                  <Button size="icon" className="play-button mx-2" aria-label={playing ? 'Pause playback' : 'Play playback'} onClick={handleTogglePlay}>{playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}</Button>
                  <span className="absolute -top-1 -right-0 text-[11px] font-medium bg-black/60 text-white px-1.5 py-[1px] rounded pointer-events-none border border-white/10">{playing ? pauseVotes : resumeVotes}/{playing ? (pauseVotesReq || 1) : (resumeVotesReq || 1)}</span>
                </div>
                <div className="relative">
                  <IconControl label="Skip track" onClick={handleSkip}><SkipForward className="fill-current" /></IconControl>
                  <span className="absolute -top-2 -right-3 text-[11px] font-medium bg-black/60 text-white px-1.5 py-[1px] rounded pointer-events-none border border-white/10">{skipVotes}/{skipVotesReq || 1}</span>
                </div>
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="More playback options"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onClick={() => setNotice(`${displayCurrent.title} · ${displayCurrent.artist}`)}>Track details</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            </div>
            <div className="volume-controls"><IconControl label={volume ? 'Mute volume' : 'Unmute volume'} onClick={() => handleVolume(volume ? 0 : 75)}>{volume ? <Volume2 /> : <VolumeX />}</IconControl><Slider aria-label="Volume" value={[volume]} onValueChange={value => handleVolume(value[0] ?? 0)} max={100} step={1} /><span className="volume-value">{volume}%</span></div>
            <div className="player-footer"><Headphones size={14} /><span>Playing in <strong>{currentGuildName}</strong></span><span className="footer-quality">HIGH QUALITY</span></div>
          </section>

          <section className="queue-panel glass-surface" aria-label="Track queue">
            <div className="queue-heading"><div><h2>Up next <span className="queue-count">{queue.length}</span></h2><p>Your shared soundtrack.</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Queue options" className="text-muted-foreground"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={async () => { if (currentGuildId) { try { await controlClear(currentGuildId); setNotice('Queue cleared'); } catch(e: any) { setNotice(e.message || 'Failed to clear queue'); } } }}><Trash2 />Clear queue</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
            <form className="add-track" onSubmit={handleAddSong}><Music2 size={18} /><Input aria-label="Song search or URL" placeholder="Paste a link or search for a song" value={query} onChange={event => setQuery(event.target.value)} /><Button size="icon" aria-label="Add to queue" disabled={!query.trim()} type="submit"><Plus /></Button></form>
            <div className="queue-tabs">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  className={`queue-tab ${activeTab === 'queue' ? 'active-tab' : ''}`}
                  onClick={() => setActiveTab('queue')}
                >
                  Queue
                </Button>
                <Button
                  variant="ghost"
                  className={`queue-tab ${activeTab === 'lyrics' ? 'active-tab' : ''}`}
                  onClick={() => setActiveTab('lyrics')}
                >
                  Lyrics
                </Button>
              </div>
              {activeTab === 'queue' ? (
                <span>{`${Math.round(total / 60)} min`}</span>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  {lyrics?.provider ? `${lyrics.provider.toUpperCase()} ${lyrics.type === 'syllable' ? '• SYLLABLE' : '• SYNCED'}` : ''}
                </span>
              )}
            </div>

            {activeTab === 'queue' ? (
              <>
                <div className="queue-list">{paginatedQueue.map((track) => {
                  const isCurrent = !stopped && (queueIndex >= 0 ? track.originalIndex === queueIndex : (Boolean(current) && track.title === current?.title));
                  return (
                    <div className={`queue-row ${isCurrent ? 'is-current' : ''}`} key={track.id}>
                      <span className={`track-number ${isCurrent ? 'text-primary font-semibold flex items-center justify-center' : ''}`}>
                        {isCurrent && playing && !stopped ? (
                          <span className="equalizer is-playing" aria-label="Now playing">
                            <i /><i /><i />
                          </span>
                        ) : (
                          String((track.originalIndex ?? 0) + 1).padStart(2, '0')
                        )}
                      </span>
                      <div className="queue-art">
                        <img src={track.image} alt="" loading="lazy" width={56} height={56} />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={isCurrent ? (playing ? 'Pause' : 'Resume') : `Play ${track.title} next`}
                          className="queue-play"
                          onClick={() => isCurrent ? handleTogglePlay() : handleSkipTo(track.originalIndex ?? 0)}
                        >
                          {isCurrent && playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
                        </Button>
                      </div>
                      <div className="queue-track-info">
                        <h3 className="flex items-center gap-1.5 min-w-0">
                          <MarqueeText
                            text={track.title}
                            className="flex-1 min-w-0"
                            active={isCurrent || undefined}
                            hoverOnly={!isCurrent}
                          />
                          {isCurrent && (
                            <span className="now-playing-badge">
                              {playing ? 'NOW PLAYING' : 'PAUSED'}
                            </span>
                          )}
                        </h3>
                        <MarqueeText
                          text={track.artist}
                          className="min-w-0 text-[11px] text-muted-foreground mt-0.5"
                          active={isCurrent || undefined}
                          hoverOnly={!isCurrent}
                        />
                        <div className="queue-requester">
                          <span>Added by</span>
                          {(track.requestedAvatar || (user && user.username === track.requestedBy && user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null)) ? (
                            <img
                              src={track.requestedAvatar || `https://cdn.discordapp.com/avatars/${user?.id}/${user?.avatar}.png?size=64`}
                              alt=""
                              className="queue-requester-avatar"
                            />
                          ) : track.requestedBy ? (
                            <span className="tiny-avatar !w-3.5 !h-3.5 !text-[7px]">
                              {track.requestedBy.charAt(0).toUpperCase()}
                            </span>
                          ) : null}
                          <span className="queue-requester-name">{track.requestedBy || 'Unknown'}</span>
                        </div>
                      </div>
                      <span className="track-duration">{formatTime(track.duration)}</span>
                      <IconControl label={`Remove ${track.title}`} onClick={() => handleRemove(track.originalIndex ?? 0)} className="remove-track">
                        <X size={15} />
                      </IconControl>
                    </div>
                  );
                })}{!queue.length && <div className="empty-queue"><ListMusic size={30} /><h3>A little quiet in here.</h3><p>No tracks in the queue.</p></div>}</div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white" disabled={validCurrentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Previous</Button>
                    <span className="text-xs text-muted-foreground font-medium">Page {validCurrentPage} of {totalPages}</span>
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white" disabled={validCurrentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Next</Button>
                  </div>
                )}
                <div className="queue-bottom"><ListMusic size={15} /><span>{queue.length} tracks in the queue</span><span className="queue-bottom-dot" /><span>Made for sharing</span></div>
              </>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="lyrics-view" ref={lyricsContainerRef}>
                  {lyricsLoading ? (
                    <div className="empty-queue">
                      <Music2 size={26} className="animate-spin text-primary" />
                      <h3>Loading lyrics...</h3>
                      <p>Searching synchronized lyrics</p>
                    </div>
                  ) : stopped || !current ? (
                    <div className="empty-queue">
                      <Music2 size={26} />
                      <h3>Nothing playing</h3>
                      <p>Start a song to see synchronized lyrics.</p>
                    </div>
                  ) : !lyrics || !lyrics.lines.length ? (
                    <div className="empty-queue">
                      <FileText size={26} />
                      <h3>No lyrics found</h3>
                      <p>No synchronized lyrics match this recording.</p>
                    </div>
                  ) : (
                    lyrics.lines.map((line, idx) => {
                      const isActive = idx === activeLineIndex;
                      return (
                        <div
                          key={idx}
                          ref={isActive ? activeLineRef : null}
                          className={`lyrics-line ${isActive ? 'is-active' : ''}`}
                        >
                          {line.words && line.words.length > 0 ? (
                            line.words.map((w, wIdx) => {
                              const isSung = effectiveTime >= w.begin;
                              const isSinging = effectiveTime >= w.begin && effectiveTime <= w.end;
                              return (
                                <span
                                  key={wIdx}
                                  className={`lyrics-word ${isSinging ? 'is-singing' : isSung ? 'is-sung' : ''}`}
                                >
                                  {w.text}
                                </span>
                              );
                            })
                          ) : (
                            line.text
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {lyrics && (
                  <div className="lyrics-sync-bar">
                    <span>
                      Sync Offset:{' '}
                      <strong className="text-foreground">
                        {userOffset >= 0 ? `+${userOffset.toFixed(1)}s` : `${userOffset.toFixed(1)}s`}
                      </strong>
                      {lyrics.intro_offset ? ` (MV intro: -${lyrics.intro_offset.toFixed(1)}s)` : ''}
                    </span>
                    <div className="lyrics-sync-controls">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[11px]"
                        onClick={() => adjustOffset(-0.5)}
                      >
                        -0.5s
                      </Button>
                      {userOffset !== 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[11px]"
                          onClick={resetOffset}
                        >
                          Reset
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[11px]"
                        onClick={() => adjustOffset(0.5)}
                      >
                        +0.5s
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
        <div className="session-band"><div className="voice-icon"><Radio size={19} /></div><div className="session-info"><strong>{summoned ? `Together in ${currentGuildName}` : `Waiting in ${currentGuildName}`}</strong><span>{summoned ? `${currentGuildName} · Listeners` : 'MusicBot is not in this channel'}</span></div><div className="session-status">{summoned ? <><span className="status-dot" />Connected</> : <Button size="sm" onClick={handleSummon}><Plus size={14} />Summon bot</Button>}</div><span className="session-divider" />{summoned && <Button variant="ghost" className="session-menu relative hover:text-red-400 hover:bg-red-500/10" style={{marginRight: '8px', color: '#ef4444'}} onClick={handleStop}><Square size={15} className="mr-1.5" fill="currentColor" />Stop Bot<span className="absolute -top-1.5 -right-1.5 text-[10px] font-semibold bg-red-500/30 text-red-300 px-1.5 py-[1px] rounded pointer-events-none border border-red-500/30">{stopVotes}/{stopVotesReq || 1}</span></Button>}{!summoned && <Button variant="ghost" className="session-menu" onClick={handleSummon}><Headphones size={15} />Join channel</Button>}</div>
        <footer className="app-footer"><span>Music brings us together.</span><Button variant="ghost" size="sm" onClick={() => setDialog('help')}><CircleHelp size={14} />Need a hand?</Button></footer>
      </main>

      {!user && isAuthLoaded && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/40">
          <div className="max-w-md w-full mx-4 p-8 text-center glass-surface flex flex-col items-center gap-6 rounded-2xl border border-white/10 shadow-2xl">
            <div className="bg-primary/20 p-4 rounded-full">
              <AudioLines className="w-10 h-10 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">Sign in to listen</h2>
              <p className="text-muted-foreground text-sm">
                You need to connect your Discord account to access the listening room, view the shared queue, and control playback.
              </p>
            </div>
            <Button size="lg" className="w-full font-semibold" onClick={() => window.location.href = getLoginUrl()}>
              Login with Discord
            </Button>
          </div>
        </div>
      )}

      {notice && <div className="notice" role="status">{notice}<Button variant="ghost" size="icon" aria-label="Dismiss notification" onClick={() => setNotice('')}><X /></Button></div>}
      <Dialog open={dialog !== null} onOpenChange={open => {if (!open) setDialog(null)}}><DialogContent className="connection-dialog"><DialogHeader><div className="dialog-icon"><AudioLines size={26} /></div><DialogTitle>{dialog === 'help' ? 'Your shared listening room' : 'Connect your MusicBot'}</DialogTitle><DialogDescription>{dialog === 'help' ? 'This is a live session connected to your Discord bot.' : 'You are currently connected to Discord.'}</DialogDescription></DialogHeader><div className="connection-detail"><span>Discord connection</span><span className="text-muted-foreground">Configured</span></div><Button onClick={() => setDialog(null)}>Back to the music</Button></DialogContent></Dialog>
    </div>
  </TooltipProvider>
}
