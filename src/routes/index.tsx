import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { AudioLines, ArrowUpRight, Bug, Check, ChevronDown, CircleHelp, FileText, Github, GitPullRequest, Headphones, Heart, ListMusic, Loader2, MoreHorizontal, Music2, Pause, Play, Plus, Radio, RefreshCw, Repeat2, Settings2, SkipBack, SkipForward, Sparkles, Square, Trash2, Volume2, VolumeX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { checkAuth, getLoginUrl, getGuilds, getQueue, getStreamUrl, addSong, controlJoin, controlSkip, controlStop, controlPause, controlResume, controlLoop, controlVolume, controlSkipTo, controlRemove, controlClear, getLyrics, aiSuggest, aiConfirmSong, getAIAutoQueue, setAIAutoQueue, type GuildSession, type AISong, type AIAutoQueueConfig } from '@/lib/api'
import { MarqueeText } from '@/components/MarqueeText'

import ocean from '@/assets/ocean-drive.jpg'
import dunes from '@/assets/sundown.jpg'
import coast from '@/assets/coastline.jpg'
import logoIcon from '@/assets/logo_icon.svg'
import logoFull from '@/assets/logo_full.svg'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'MusicBỏTúi — Your shared listening room' },
    { name: 'description', content: 'Your Discord listening room. An artwork-first MusicBỏTúi player with playback controls and a shared queue.' },
    { property: 'og:title', content: 'MusicBỏTúi — Your shared listening room' },
    { property: 'og:description', content: 'A beautiful space for the music you share on Discord with MusicBỏTúi.' },
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
  const [guilds, setGuilds] = useState<GuildSession[]>([])
  const [currentGuildId, setCurrentGuildId] = useState<string | null>(null)
  const [isCheckingVoice, setIsCheckingVoice] = useState(false)
  
  const [current, setCurrent] = useState<Track | null>(null)
  const [queue, setQueue] = useState<Track[]>([])
  const [playing, setPlaying] = useState(false)
  const [stopped, setStopped] = useState(true)
  const [loop, setLoop] = useState(false)
  const [volume, setVolume] = useState(75)
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<'connection' | 'help' | 'contribution' | null>(null)
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
  const syncRef = useRef<{ basePos: number; syncTime: number }>({ basePos: 0, syncTime: performance.now() })

  // ---------------------------------------------------------------------------
  // AI Auto-Queue state
  // ---------------------------------------------------------------------------
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiCount, setAiCount] = useState(5)
  const [aiThreshold, setAiThreshold] = useState(2)
  const [aiAutoEnabled, setAiAutoEnabled] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiAdding, setAiAdding] = useState<Set<string>>(new Set())
  const [aiSuggestions, setAiSuggestions] = useState<AISong[]>([])
  const [aiError, setAiError] = useState('')
  const [aiConfig, setAiConfig] = useState<AIAutoQueueConfig | null>(null)

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

  // High-resolution position ticker anchored to performance.now() and audio frames
  useEffect(() => {
    if (!playing || stopped) return;
    const timer = setInterval(() => {
      const elapsed = (performance.now() - syncRef.current.syncTime) / 1000;
      const currentPos = syncRef.current.basePos + elapsed;
      setPosition(currentPos);
    }, 100);
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

  // Load AI Auto-Queue config when guild changes
  useEffect(() => {
    if (!currentGuildId || !user) return;
    let cancelled = false;
    getAIAutoQueue(currentGuildId)
      .then(cfg => {
        if (cancelled) return;
        setAiConfig(cfg);
        setAiPrompt(cfg.prompt || '');
        setAiCount(cfg.count ?? 5);
        setAiThreshold(cfg.threshold ?? 2);
        setAiAutoEnabled(cfg.enabled ?? false);
      })
      .catch(() => { /* silently ignore if AI not configured */ });
    return () => { cancelled = true; };
  }, [currentGuildId, user]);


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

  const refreshVoiceStatus = useCallback(async (manual = false) => {
    if (manual) setIsCheckingVoice(true);
    try {
      const g = await getGuilds();
      const list = g.guilds || [];
      setGuilds(list);
      if (list.length > 0) {
        setCurrentGuildId((prev) => {
          if (prev && list.some((item) => item.id === prev)) {
            return prev;
          }
          return list[0].id;
        });
        const active = list.find((item) => item.id === (currentGuildId || list[0].id));
        if (active) {
          setSummoned(active.bot_connected);
        }
      } else {
        setCurrentGuildId(null);
        setSummoned(false);
      }
    } catch (e) {
      console.error('Failed to check voice status:', e);
    } finally {
      if (manual) {
        setTimeout(() => setIsCheckingVoice(false), 350);
      }
    }
  }, [currentGuildId]);

  // Auth & Guilds initial load
  useEffect(() => {
    let isMounted = true;
    checkAuth().then(async (u) => {
      if (!isMounted) return;
      if (u) {
        setUser(u);
        const g = await getGuilds();
        if (!isMounted) return;
        const list = g.guilds || [];
        setGuilds(list);
        if (list.length > 0) {
          setCurrentGuildId(list[0].id);
          setSummoned(list[0].bot_connected);
        } else {
          setCurrentGuildId(null);
          setSummoned(false);
        }
      }
      setIsAuthLoaded(true);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Poll voice status periodically and on window focus when user is logged in
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      refreshVoiceStatus();
    }, 3500);

    const handleFocus = () => {
      refreshVoiceStatus();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, refreshVoiceStatus]);

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
              const isPaused = !!state.is_paused;
              setPlaying(!isPaused);
              const serverPos = typeof state.position === 'number' ? state.position : 0;
              syncRef.current = { basePos: serverPos, syncTime: performance.now() };
              setPosition(serverPos);
            } else {
              setCurrent(null);
              setStopped(true);
              setPlaying(false);
              syncRef.current = { basePos: 0, syncTime: performance.now() };
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
  
  const isVoiceConnected = Boolean(user && guilds.length > 0 && currentGuildId);
  const isLocked = !isAuthLoaded || !user || !isVoiceConnected;

  const currentGuild = useMemo(() => guilds.find(g => g.id === currentGuildId), [guilds, currentGuildId]);
  const currentGuildName = useMemo(() => currentGuild?.name || 'The Listening Room', [currentGuild]);
  const currentVoiceChannelName = useMemo(() => currentGuild?.channel_name || 'voice', [currentGuild]);

  const handleSummon = useCallback(async () => {
      if (!currentGuildId || !isVoiceConnected) return;
      try {
          await controlJoin(currentGuildId);
          setSummoned(true);
      } catch(e) {
          setNotice('Failed to join channel');
      }
  }, [currentGuildId, isVoiceConnected]);

  const handleSkip = useCallback(async () => {
      if (!currentGuildId || !isVoiceConnected) return;
      try { await controlSkip(currentGuildId); } catch(e: any) { setNotice(e.message || 'Action failed'); }
  }, [currentGuildId, isVoiceConnected]);
  const handleStop = useCallback(async () => {
      if (!currentGuildId || !isVoiceConnected) return;
      try { await controlStop(currentGuildId); } catch(e: any) { setNotice(e.message || 'Action failed'); }
  }, [currentGuildId, isVoiceConnected]);
  const handleTogglePlay = useCallback(async () => {
      if (!currentGuildId || !isVoiceConnected) return;
      try {
          if (playing) {
              await controlPause(currentGuildId);
          } else {
              syncRef.current = { basePos: position, syncTime: performance.now() };
              await controlResume(currentGuildId);
          }
      } catch(e: any) {
          setNotice(e.message || 'Action failed');
      }
  }, [currentGuildId, isVoiceConnected, playing, position]);
  const handleLoop = useCallback(async () => {
      if (!currentGuildId || !isVoiceConnected) return;
      try {
          await controlLoop(currentGuildId);
      } catch(e: any) {
          setNotice(e.message || 'Action failed');
      }
  }, [currentGuildId, isVoiceConnected]);
  const handleVolume = useCallback(async (val: number) => {
      if (!currentGuildId || !isVoiceConnected) return;
      setVolume(val);
      try {
          await controlVolume(currentGuildId, val);
      } catch(e: any) {
          setNotice(e.message || 'Action failed');
      }
  }, [currentGuildId, isVoiceConnected]);
  
  const handleAddSong = useCallback(async (e: React.FormEvent) => {
      e.preventDefault();
      if (!query.trim() || !currentGuildId || !isVoiceConnected) return;
      const url = query.trim();
      setQuery('');
      try {
          await addSong(currentGuildId, url);
          setNotice('Added to queue');
      } catch(e) {
          setNotice('Failed to add song');
      }
  }, [currentGuildId, isVoiceConnected, query]);

  // ---------------------------------------------------------------------------
  // AI Auto-Queue handlers
  // ---------------------------------------------------------------------------

  const handleAISuggest = useCallback(async () => {
    if (!aiPrompt.trim() || !currentGuildId || !isVoiceConnected) return;
    setAiLoading(true);
    setAiError('');
    setAiSuggestions([]);
    try {
      const res = await aiSuggest(currentGuildId, aiPrompt.trim(), aiCount);
      setAiSuggestions(res.songs || []);
    } catch (err: any) {
      setAiError(err?.message || 'AI service unavailable. Check GEMINI_API_KEY.');
    } finally {
      setAiLoading(false);
    }
  }, [aiPrompt, aiCount, currentGuildId, isVoiceConnected]);

  const handleAIAddSong = useCallback(async (song: AISong) => {
    if (!currentGuildId || !isVoiceConnected) return;
    setAiAdding(prev => new Set(prev).add(song.url));
    try {
      await aiConfirmSong(currentGuildId, song.url);
      setNotice(`Added: ${song.title}`);
      // Remove from preview list after adding
      setAiSuggestions(prev => prev.filter(s => s.url !== song.url));
    } catch (err: any) {
      setNotice(err?.message || 'Failed to add song');
    } finally {
      setAiAdding(prev => { const n = new Set(prev); n.delete(song.url); return n; });
    }
  }, [currentGuildId, isVoiceConnected]);

  const handleAIAddAll = useCallback(async () => {
    if (!currentGuildId || !isVoiceConnected || !aiSuggestions.length) return;
    const toAdd = [...aiSuggestions];
    setAiSuggestions([]);
    for (const song of toAdd) {
      try {
        await aiConfirmSong(currentGuildId, song.url);
      } catch { /* continue adding rest */ }
    }
    setNotice(`Added ${toAdd.length} AI songs to queue`);
  }, [currentGuildId, isVoiceConnected, aiSuggestions]);

  const handleAISaveConfig = useCallback(async (enabled: boolean) => {
    if (!currentGuildId || !isVoiceConnected) return;
    const cfg: AIAutoQueueConfig = { enabled, prompt: aiPrompt, count: aiCount, threshold: aiThreshold };
    try {
      await setAIAutoQueue(currentGuildId, cfg);
      setAiConfig(cfg);
      setAiAutoEnabled(enabled);
      setNotice(enabled ? 'AI Auto-Queue enabled' : 'AI Auto-Queue disabled');
    } catch (err: any) {
      setNotice(err?.message || 'Failed to update AI config');
    }
  }, [currentGuildId, isVoiceConnected, aiPrompt, aiCount, aiThreshold]);


  const handleSkipTo = useCallback(async (index: number) => {
      if (!currentGuildId || !isVoiceConnected) return;
      try { await controlSkipTo(currentGuildId, index + 1); } catch(e: any) { setNotice(e.message || 'Action failed'); }
  }, [currentGuildId, isVoiceConnected]);

  const handleRemove = useCallback(async (index: number) => {
      if (!currentGuildId || !isVoiceConnected) return;
      try { await controlRemove(currentGuildId, index + 1); } catch(e: any) { setNotice(e.message || 'Action failed'); }
  }, [currentGuildId, isVoiceConnected]);

  return <TooltipProvider delayDuration={200}>
    <div className="music-app">
      <div className="ambient-art" aria-hidden="true"><img src={displayCurrent.image} alt="" /></div>
      <div className="ambient-shade" aria-hidden="true" />
      <header className="app-header">
        <a href="/" className="brand" aria-label="MusicBỏTúi Home">
          <img src={logoIcon} alt="MusicBỏTúi Logo" className="brand-logo-img" />
          <span className="logo-text">
            <span className="music">Music</span>
            <span className="botui">BỏTúi</span>
          </span>
        </a>
        <div className="header-room">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="server-select" disabled={!isVoiceConnected}>
                <span className="server-symbol"><Headphones size={15} /></span>
                {isVoiceConnected ? currentGuildName : 'No voice channel'}
                <ChevronDown size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              <DropdownMenuLabel>Your servers</DropdownMenuLabel>
              {guilds.map(g => (
                <DropdownMenuItem key={g.id} onClick={() => { setCurrentGuildId(g.id); setSummoned(g.bot_connected); }}>
                  <Headphones />
                  {g.name}
                  {g.id === currentGuildId && <Check className="ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="header-divider" />
          <span className="header-channel">
            <Radio size={14} /> {isVoiceConnected ? currentVoiceChannelName : 'offline'}
          </span>
        </div>
        <div className="header-actions">
           <Tooltip>
             <TooltipTrigger asChild>
               <Button
                 variant="ghost"
                 size="icon"
                 aria-label="Contribute or report a bug"
                 onClick={() => setDialog('contribution')}
                 className="text-muted-foreground hover:text-foreground"
               >
                 <Github size={17} />
               </Button>
             </TooltipTrigger>
             <TooltipContent>Contribute / Report Bug</TooltipContent>
           </Tooltip>
           {!isAuthLoaded ? null : !user ? (
             <Button variant="secondary" onClick={() => window.location.href = getLoginUrl()}>Login with Discord</Button>
           ) : (
             <>
               {!isVoiceConnected ? (
                 <span className="preview-tag text-amber-400/90 border-amber-400/30">Voice channel required</span>
               ) : (
                 <span className="preview-tag">Live Session</span>
               )}
               <IconControl label="Connection settings" onClick={() => setDialog('connection')} disabled={!isVoiceConnected}><Settings2 /></IconControl>
               <DropdownMenu>
                 <DropdownMenuTrigger asChild>
                   <Button variant="ghost" size="icon" className="user-avatar p-0 overflow-hidden" aria-label="Account menu">
                     {user.avatar ? (
                       <img src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`} alt="" className="w-full h-full object-cover rounded-full" />
                     ) : (
                       user.username.charAt(0).toUpperCase()
                     )}
                   </Button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent align="end">
                   <DropdownMenuLabel>Account · {user.username}</DropdownMenuLabel>
                   <DropdownMenuSeparator />
                   <DropdownMenuItem onClick={() => setDialog('contribution')}>
                     <Github size={14} className="mr-1.5" /> Contribute / Report Bug
                   </DropdownMenuItem>
                   <DropdownMenuSeparator />
                   <DropdownMenuItem onClick={() => { localStorage.removeItem('auth_token'); window.location.reload(); }}>
                     Logout
                   </DropdownMenuItem>
                 </DropdownMenuContent>
               </DropdownMenu>
             </>
           )}
        </div>
      </header>

      <main
        className="room-main"
        style={isLocked ? { filter: 'blur(12px)', pointerEvents: 'none', userSelect: 'none' } : undefined}
        inert={isLocked ? true : undefined}
        aria-hidden={isLocked}
      >
        <div className="page-intro"><div><div className="eyebrow">GOOD MUSIC. BETTER COMPANY.</div><h1>Your listening room<span className="heading-dot">.</span></h1></div></div>

        <div className="music-layout">
          <section className="player-panel glass-surface" aria-label="Music player">
            <div className="section-topline"><div className="section-label"><span className={`equalizer ${playing && !stopped ? 'is-playing' : ''}`}><i /><i /><i /><i /></span>{stopped ? 'PLAYBACK STOPPED' : playing ? 'NOW PLAYING' : 'PAUSED'}</div><span className="source-tag"><span className="source-dot" /> Stream</span></div>
            <div className="artwork-stage"><img key={displayCurrent.id} className="album-art" src={displayCurrent.image} alt={`${displayCurrent.title} album artwork`} width={1024} height={1024} /><span className="album-caption">{displayCurrent.album}</span></div>
            <div className="track-details"><div className="min-w-0 w-full"><h2><MarqueeText text={displayCurrent.title} active={!stopped} /></h2><div className="track-artist"><MarqueeText text={displayCurrent.artist} active={!stopped} /></div></div></div>
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
            <div className="queue-heading">
              <div>
                <h2>
                  Up next <span className="queue-count">{queue.length}</span>
                  {aiConfig?.enabled && (
                    <span className="ai-active-badge" title="AI Auto-Queue is active">
                      <Sparkles size={9} /> AI
                    </span>
                  )}
                </h2>
                <p>Your shared soundtrack.</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  id="ai-autoqueue-btn"
                  aria-label="AI Auto-Queue"
                  onClick={() => setAiPanelOpen(true)}
                  disabled={!isVoiceConnected}
                  className={`ai-toggle-btn ${aiConfig?.enabled ? 'is-active' : ''}`}
                  title="AI Auto-Queue"
                >
                  <Sparkles size={15} />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button aria-label="Queue options" className="queue-options-btn">
                      <MoreHorizontal size={18} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={async () => { if (currentGuildId) { try { await controlClear(currentGuildId); setNotice('Queue cleared'); } catch(e: any) { setNotice(e.message || 'Failed to clear queue'); } } }}>
                      <Trash2 />Clear queue
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
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

        {/* ---------------------------------------------------------------- */}
        {/* AI Auto-Queue Dialog                                              */}
        {/* ---------------------------------------------------------------- */}
        <Dialog open={aiPanelOpen} onOpenChange={open => { setAiPanelOpen(open); if (!open) setAiError(''); }}>
          <DialogContent className="ai-panel glass-surface" aria-labelledby="ai-panel-title">
            <DialogHeader>
              <DialogTitle id="ai-panel-title" className="ai-panel-title">
                <Sparkles size={18} className="text-primary" />
                AI Auto-Queue
              </DialogTitle>
              <DialogDescription className="ai-panel-desc">
                Describe a mood, genre, or style — AI will find matching songs and add them to the queue.
              </DialogDescription>
            </DialogHeader>

            {/* Prompt textarea */}
            <div className="ai-field">
              <label htmlFor="ai-prompt-input" className="ai-label">Your vibe</label>
              <textarea
                id="ai-prompt-input"
                className="ai-prompt-textarea"
                rows={2}
                placeholder="e.g. lo-fi chill buổi tối, K-pop sôi động, nhạc jazz cà phê..."
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAISuggest(); } }}
                disabled={aiLoading}
              />
            </div>

            {/* Config row */}
            <div className="ai-config-row">
              <div className="ai-config-item">
                <label htmlFor="ai-count-input" className="ai-label">Songs to add</label>
                <input
                  id="ai-count-input"
                  type="number"
                  className="ai-number-input"
                  value={aiCount}
                  min={1}
                  max={20}
                  onChange={e => setAiCount(Math.max(1, Math.min(20, Number(e.target.value))))}
                />
              </div>
              <div className="ai-config-item">
                <label htmlFor="ai-threshold-input" className="ai-label">Auto-fill when &lt; songs left</label>
                <input
                  id="ai-threshold-input"
                  type="number"
                  className="ai-number-input"
                  value={aiThreshold}
                  min={1}
                  max={10}
                  onChange={e => setAiThreshold(Math.max(1, Math.min(10, Number(e.target.value))))}
                />
              </div>
            </div>

            {/* Auto-fill toggle */}
            <div className="ai-toggle-row">
              <button
                id="ai-auto-toggle"
                role="switch"
                aria-checked={aiAutoEnabled}
                className={`ai-switch ${aiAutoEnabled ? 'is-on' : ''}`}
                onClick={() => handleAISaveConfig(!aiAutoEnabled)}
                disabled={!aiPrompt.trim()}
                title={aiPrompt.trim() ? undefined : 'Enter a prompt first'}
              >
                <span className="ai-switch-thumb" />
              </button>
              <span className="ai-toggle-label">
                Auto-fill when queue runs low
                {aiAutoEnabled && <span className="ai-on-pill">ON</span>}
              </span>
            </div>

            {/* Suggest button */}
            <Button
              id="ai-suggest-btn"
              className="ai-suggest-btn"
              onClick={handleAISuggest}
              disabled={aiLoading || !aiPrompt.trim() || !isVoiceConnected}
            >
              {aiLoading
                ? <><Loader2 size={15} className="animate-spin" /> Searching…</>
                : <><Sparkles size={15} /> Find songs</>}
            </Button>

            {/* Error */}
            {aiError && (
              <p className="ai-error" role="alert">{aiError}</p>
            )}

            {/* Preview list */}
            {aiSuggestions.length > 0 && (
              <div className="ai-suggestions">
                <div className="ai-suggestions-header">
                  <span className="ai-suggestions-label">{aiSuggestions.length} suggestions</span>
                  <button className="ai-add-all-btn" onClick={handleAIAddAll} disabled={!isVoiceConnected}>
                    <Plus size={12} /> Add all
                  </button>
                </div>
                <div className="ai-suggestions-list no-scrollbar">
                  {aiSuggestions.map((song, i) => {
                    const adding = aiAdding.has(song.url);
                    return (
                      <div key={`${song.url}-${i}`} className="ai-song-row">
                        {song.thumbnail ? (
                          <img src={song.thumbnail} alt="" className="ai-song-thumb" loading="lazy" />
                        ) : (
                          <div className="ai-song-thumb ai-song-thumb-placeholder"><Music2 size={14} /></div>
                        )}
                        <div className="ai-song-info">
                          <div className="ai-song-title">{song.title}</div>
                          <div className="ai-song-artist">{song.artist}</div>
                        </div>
                        <span className="ai-song-duration">{formatTime(song.duration)}</span>
                        <button
                          aria-label={`Add ${song.title}`}
                          className="ai-song-add-btn"
                          onClick={() => handleAIAddSong(song)}
                          disabled={adding || !isVoiceConnected}
                        >
                          {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        <div className="session-band">
          <div className="voice-icon"><Radio size={19} /></div>
          <div className="session-info">
            <strong>{summoned ? `Together in ${currentGuildName}` : `Waiting in ${currentGuildName}`}</strong>
            <span>{summoned ? `${currentGuildName} · #${currentVoiceChannelName}` : 'MusicBỏTúi is not in this channel'}</span>
          </div>
          <div className="session-status">
            {summoned ? (
              <><span className="status-dot" />Connected</>
            ) : (
              <Button size="sm" onClick={handleSummon} disabled={!isVoiceConnected}>
                <Plus size={14} />Summon bot
              </Button>
            )}
          </div>
          <span className="session-divider" />
          {summoned && (
            <Button
              variant="ghost"
              className="session-menu relative hover:text-red-400 hover:bg-red-500/10"
              style={{marginRight: '8px', color: '#ef4444'}}
              onClick={handleStop}
              disabled={!isVoiceConnected}
            >
              <Square size={15} className="mr-1.5" fill="currentColor" />
              Stop Bot
              <span className="absolute -top-1.5 -right-1.5 text-[10px] font-semibold bg-red-500/30 text-red-300 px-1.5 py-[1px] rounded pointer-events-none border border-red-500/30">
                {stopVotes}/{stopVotesReq || 1}
              </span>
            </Button>
          )}
          {!summoned && (
            <Button
              variant="ghost"
              className="session-menu"
              onClick={handleSummon}
              disabled={!isVoiceConnected}
            >
              <Headphones size={15} />Join channel
            </Button>
          )}
        </div>

        <section className="contribution-section glass-surface" aria-label="Open source contributions and bug reporting">
          <div className="contribution-header">
            <div className="flex items-center gap-3">
              <div className="contribution-icon-badge">
                <Github size={18} />
              </div>
              <div>
                <h2 className="contribution-title">Want to contribute or report a bug?</h2>
                <p className="contribution-subtitle">
                  MusicBỏTúi is open source! Have ideas, found an issue, or want to contribute code? We welcome all feedback and pull requests.
                </p>
              </div>
            </div>
          </div>

          <div className="contribution-grid">
            <div className="contribution-card">
              <div className="contribution-card-header">
                <div className="flex items-center justify-between">
                  <span className="contribution-badge">Frontend UI</span>
                  <a
                    href="https://github.com/AnhNTSE183225/MusicBotUI"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="contribution-repo-link"
                  >
                    AnhNTSE183225/MusicBotUI <ArrowUpRight size={13} />
                  </a>
                </div>
                <h3>Web Interface (MusicBỏTúi)</h3>
                <p>
                  React 19 web app with real-time synchronized lyrics, player controls, and queue management.
                </p>
              </div>
              <div className="contribution-card-actions">
                <Button variant="outline" size="sm" asChild className="contribution-btn">
                  <a href="https://github.com/AnhNTSE183225/MusicBotUI" target="_blank" rel="noopener noreferrer">
                    <Github size={14} className="mr-1.5" />
                    Contribute on UI
                  </a>
                </Button>
                <Button variant="ghost" size="sm" asChild className="contribution-btn text-muted-foreground hover:text-foreground">
                  <a href="https://github.com/AnhNTSE183225/MusicBotUI/issues" target="_blank" rel="noopener noreferrer">
                    <Bug size={14} className="mr-1.5 text-amber-400" />
                    Report UI Bug
                  </a>
                </Button>
              </div>
            </div>

            <div className="contribution-card">
              <div className="contribution-card-header">
                <div className="flex items-center justify-between">
                  <span className="contribution-badge">Backend Bot</span>
                  <a
                    href="https://github.com/AnhNTSE183225/music-bot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="contribution-repo-link"
                  >
                    AnhNTSE183225/music-bot <ArrowUpRight size={13} />
                  </a>
                </div>
                <h3>Discord Bot & API (MusicBỏTúi)</h3>
                <p>
                  Python bot with discord.py, FastAPI endpoints, voice streaming, queue orchestrations, and skip voting.
                </p>
              </div>
              <div className="contribution-card-actions">
                <Button variant="outline" size="sm" asChild className="contribution-btn">
                  <a href="https://github.com/AnhNTSE183225/music-bot" target="_blank" rel="noopener noreferrer">
                    <Github size={14} className="mr-1.5" />
                    Contribute on Backend
                  </a>
                </Button>
                <Button variant="ghost" size="sm" asChild className="contribution-btn text-muted-foreground hover:text-foreground">
                  <a href="https://github.com/AnhNTSE183225/music-bot/issues" target="_blank" rel="noopener noreferrer">
                    <Bug size={14} className="mr-1.5 text-amber-400" />
                    Report Bot Bug
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <footer className="app-footer">
          <span>Music brings us together.</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDialog('contribution')}>
              <Github size={13} className="mr-1" />Contribute & Bugs
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDialog('help')}>
              <CircleHelp size={13} className="mr-1" />Need a hand?
            </Button>
          </div>
        </footer>
      </main>

      {/* Overlay: Not logged in */}
      {isAuthLoaded && !user && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-w-md w-full p-8 text-center glass-surface flex flex-col items-center gap-6 rounded-2xl border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center gap-2.5">
              <img src={logoIcon} alt="MusicBỏTúi Logo" className="w-16 h-16 object-contain filter drop-shadow-[0_4px_16px_rgba(0,230,118,0.35)]" />
              <div className="logo-text text-2xl pt-1">
                <span className="music">Music</span>
                <span className="botui">BỏTúi</span>
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">Sign in to listen</h2>
              <p className="text-muted-foreground text-sm">
                Connect your Discord account to access your listening room, view the shared queue, and control MusicBỏTúi playback.
              </p>
            </div>
            <Button size="lg" className="w-full font-semibold" onClick={() => window.location.href = getLoginUrl()}>
              Login with Discord
            </Button>
            <div className="w-full border-t border-white/10 pt-4 flex flex-col items-center gap-2 text-xs text-muted-foreground">
              <span>Want to contribute or report a bug?</span>
              <div className="flex items-center gap-4 text-foreground/80 font-medium">
                <a
                  href="https://github.com/AnhNTSE183225/MusicBotUI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors inline-flex items-center gap-1"
                >
                  UI GitHub <ArrowUpRight size={12} />
                </a>
                <span>·</span>
                <a
                  href="https://github.com/AnhNTSE183225/music-bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors inline-flex items-center gap-1"
                >
                  Backend GitHub <ArrowUpRight size={12} />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overlay: Logged in but not in a voice channel */}
      {isAuthLoaded && user && !isVoiceConnected && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-w-md w-full p-8 text-center glass-surface flex flex-col items-center gap-6 rounded-2xl border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center gap-2.5">
              <img src={logoIcon} alt="MusicBỏTúi Logo" className="w-16 h-16 object-contain filter drop-shadow-[0_4px_16px_rgba(0,230,118,0.35)]" />
              <div className="logo-text text-2xl pt-1">
                <span className="music">Music</span>
                <span className="botui">BỏTúi</span>
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">Join a voice channel</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                You are signed in as <strong className="text-foreground">{user.username}</strong>, but you are not currently in a voice channel in a Discord server where MusicBỏTúi is present.
              </p>
              <p className="text-muted-foreground text-xs">
                Hop into any voice channel in Discord so MusicBỏTúi can stream music, sync lyrics, and manage the queue.
              </p>
            </div>

            <div className="w-full flex flex-col gap-2.5 pt-1">
              <Button
                size="lg"
                className="w-full font-semibold flex items-center justify-center gap-2"
                onClick={() => refreshVoiceStatus(true)}
                disabled={isCheckingVoice}
              >
                <RefreshCw className={`w-4 h-4 ${isCheckingVoice ? 'animate-spin' : ''}`} />
                {isCheckingVoice ? 'Checking channel status...' : "I've joined a voice channel"}
              </Button>
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1 pt-1">
                <span>Wrong Discord account?</span>
                <button
                  type="button"
                  className="text-primary hover:underline font-medium cursor-pointer"
                  onClick={() => { localStorage.removeItem('auth_token'); window.location.reload(); }}
                >
                  Log out
                </button>
              </div>
            </div>

            <div className="w-full border-t border-white/10 pt-4 flex flex-col items-center gap-2 text-xs text-muted-foreground">
              <span>Want to contribute or report a bug?</span>
              <div className="flex items-center gap-4 text-foreground/80 font-medium">
                <a
                  href="https://github.com/AnhNTSE183225/MusicBotUI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors inline-flex items-center gap-1"
                >
                  UI GitHub <ArrowUpRight size={12} />
                </a>
                <span>·</span>
                <a
                  href="https://github.com/AnhNTSE183225/music-bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors inline-flex items-center gap-1"
                >
                  Backend GitHub <ArrowUpRight size={12} />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {notice && <div className="notice" role="status">{notice}<Button variant="ghost" size="icon" aria-label="Dismiss notification" onClick={() => setNotice('')}><X /></Button></div>}
      <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null); }}>
        {dialog === 'contribution' ? (
          <DialogContent className="connection-dialog max-w-lg">
            <DialogHeader>
              <div className="dialog-icon flex items-center gap-2">
                <img src={logoIcon} alt="MusicBỏTúi" className="w-8 h-8 object-contain" />
              </div>
              <DialogTitle>Contribute to MusicBỏTúi & Report Bugs</DialogTitle>
              <DialogDescription>
                MusicBỏTúi is open source! Have an idea, found an issue, or want to build new features? We'd love your contributions.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2 text-left">
              <div className="p-3.5 rounded-lg border border-border bg-card/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">Frontend UI</span>
                  <a href="https://github.com/AnhNTSE183225/MusicBotUI" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    AnhNTSE183225/MusicBotUI <ArrowUpRight size={12} />
                  </a>
                </div>
                <p className="text-xs text-muted-foreground">React 19 web app with synchronized lyrics, playback controls, and queue.</p>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" asChild className="h-7 text-xs">
                    <a href="https://github.com/AnhNTSE183225/MusicBotUI" target="_blank" rel="noopener noreferrer">
                      <Github size={13} className="mr-1" /> View Repo
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" asChild className="h-7 text-xs text-amber-400 hover:text-amber-300">
                    <a href="https://github.com/AnhNTSE183225/MusicBotUI/issues" target="_blank" rel="noopener noreferrer">
                      <Bug size={13} className="mr-1" /> Report UI Bug
                    </a>
                  </Button>
                </div>
              </div>

              <div className="p-3.5 rounded-lg border border-border bg-card/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">Backend Bot</span>
                  <a href="https://github.com/AnhNTSE183225/music-bot" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    AnhNTSE183225/music-bot <ArrowUpRight size={12} />
                  </a>
                </div>
                <p className="text-xs text-muted-foreground">Discord bot voice player, yt-dlp audio streaming, FastAPI REST endpoints.</p>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" asChild className="h-7 text-xs">
                    <a href="https://github.com/AnhNTSE183225/music-bot" target="_blank" rel="noopener noreferrer">
                      <Github size={13} className="mr-1" /> View Repo
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" asChild className="h-7 text-xs text-amber-400 hover:text-amber-300">
                    <a href="https://github.com/AnhNTSE183225/music-bot/issues" target="_blank" rel="noopener noreferrer">
                      <Bug size={13} className="mr-1" /> Report Bot Bug
                    </a>
                  </Button>
                </div>
              </div>
            </div>
            <Button onClick={() => setDialog(null)}>Close</Button>
          </DialogContent>
        ) : (
          <DialogContent className="connection-dialog">
            <DialogHeader>
              <div className="dialog-icon flex items-center gap-2">
                <img src={logoIcon} alt="MusicBỏTúi" className="w-8 h-8 object-contain" />
              </div>
              <DialogTitle>{dialog === 'help' ? 'Your shared listening room' : 'Connect MusicBỏTúi'}</DialogTitle>
              <DialogDescription>{dialog === 'help' ? 'This is a live session connected to your Discord bot.' : 'You are currently connected to Discord with MusicBỏTúi.'}</DialogDescription>
            </DialogHeader>
            <div className="connection-detail">
              <span>Discord connection</span>
              <span className="text-muted-foreground">{isVoiceConnected ? 'Connected to voice' : 'Not in voice channel'}</span>
            </div>
            <div className="connection-detail">
              <span>Want to contribute or report a bug?</span>
              <Button variant="link" size="sm" className="h-auto p-0 text-primary" onClick={() => setDialog('contribution')}>
                GitHub Repositories
              </Button>
            </div>
            <Button onClick={() => setDialog(null)}>Back to the music</Button>
          </DialogContent>
        )}
      </Dialog>
    </div>
  </TooltipProvider>
}
