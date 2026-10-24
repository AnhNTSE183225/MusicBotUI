import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, useCallback, useMemo, useRef, useLayoutEffect, type ReactNode } from 'react'
import { AudioLines, ArrowUpRight, Bug, CalendarDays, Check, ChevronDown, CircleHelp, FileText, Github, GitPullRequest, Headphones, Heart, Key, ListMusic, Loader2, MoreHorizontal, Music2, Pause, Play, Plus, Radio, RefreshCw, Repeat2, Settings2, SkipBack, SkipForward, Sparkles, Square, Trash2, User, Volume2, VolumeX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { checkAuth, getLoginUrl, getGuilds, getQueue, getStreamUrl, addSong, controlJoin, controlSkip, controlStop, controlPause, controlResume, controlLoop, controlVolume, controlSkipTo, controlRemove, controlClear, getLyrics, aiSuggest, aiConfirmSong, aiConfirmBatch, getAIAutoQueue, setAIAutoQueue, getGeminiKeys, contributeGeminiKey, deleteGeminiKey, type GuildSession, type AISong, type AIAutoQueueConfig, type GeminiKeyInfo, type GeminiKeysResponse } from '@/lib/api'

import { MarqueeText } from '@/components/MarqueeText'
import { PlaylistModal } from '@/components/PlaylistModal'
import { isYouTubePlaylistUrl } from '@/lib/youtube'
import { PatchNotesModal } from '@/components/PatchNotesModal'
import { CURRENT_VERSION, LATEST_PATCH, usePatchNotesReadState } from '@/data/patchNotes'
import { ScheduleView } from '@/components/ScheduleView'
import { useScheduleStore, countPendingInvites } from '@/lib/schedule'

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

export type LyricWord = { begin: number; end: number; text: string; trailing_space?: boolean }
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

export function optimizeThumbnailUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.includes('i.ytimg.com/vi/') || trimmed.includes('img.youtube.com/vi/')) {
    if (trimmed.includes('/hqdefault.jpg')) {
      return trimmed.replace('/hqdefault.jpg', '/maxresdefault.jpg');
    }
  }
  return trimmed;
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
  const queuePanelRef = useRef<HTMLDivElement | null>(null)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncRef = useRef<{ basePos: number; syncTime: number }>({ basePos: 0, syncTime: performance.now() })
  const userScrollingRef = useRef(false)
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---------------------------------------------------------------------------
  // AI Auto-Queue & Community Key state
  // ---------------------------------------------------------------------------
  const { unreadCount } = usePatchNotesReadState()
  const [patchNotesOpen, setPatchNotesOpen] = useState(false)
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false)
  const [playlistModalInitialUrl, setPlaylistModalInitialUrl] = useState('')
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiPanelTab, setAiPanelTab] = useState<'search' | 'autoqueue' | 'keys'>('search')
  const [aiSearchPrompt, setAiSearchPrompt] = useState('')
  const [aiAutoPrompt, setAiAutoPrompt] = useState('')
  const [aiCount, setAiCount] = useState(5)
  const [aiThreshold, setAiThreshold] = useState(2)
  const [aiAutoEnabled, setAiAutoEnabled] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiAdding, setAiAdding] = useState<Set<string>>(new Set())
  const [aiAddingAll, setAiAddingAll] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<AISong[]>([])
  const [aiError, setAiError] = useState('')
  const [aiConfig, setAiConfig] = useState<AIAutoQueueConfig | null>(null)

  // Local form draft state for Auto-fill modal (prevents SSE broadcast from stomping user edits)
  const [formAutoEnabled, setFormAutoEnabled] = useState(false)
  const [formAutoPrompt, setFormAutoPrompt] = useState('')
  const [formCount, setFormCount] = useState(5)
  const [formThreshold, setFormThreshold] = useState(2)

  useEffect(() => {
    if (aiPanelOpen) {
      setFormAutoEnabled(aiAutoEnabled)
      setFormAutoPrompt(aiAutoPrompt || aiConfig?.prompt || '')
      setFormCount(aiCount || aiConfig?.count || 5)
      setFormThreshold(aiThreshold || aiConfig?.threshold || 2)
    }
  }, [aiPanelOpen])

  // Community Key Management state
  const [geminiKeys, setGeminiKeys] = useState<GeminiKeyInfo[]>([])
  const [activeKeysCount, setActiveKeysCount] = useState(0)
  const [totalKeysCount, setTotalKeysCount] = useState(0)
  const [isKeyAdmin, setIsKeyAdmin] = useState(false)
  const [newKeyInput, setNewKeyInput] = useState('')
  const [keySubmitting, setKeySubmitting] = useState(false)
  const [keySubmitError, setKeySubmitError] = useState('')
  const [keySubmitSuccess, setKeySubmitSuccess] = useState('')


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

  const fetchLyrics = useCallback(async (isRetry = false) => {
    if (!currentGuildId || !current || stopped) {
      setLyrics(null);
      setLyricsLoading(false);
      return;
    }

    if (!isRetry) {
      setLyricsLoading(true);
    }

    try {
      const res = await getLyrics(currentGuildId);
      if (res && res.lyrics) {
        setLyrics(res.lyrics);
        setLyricsLoading(false);
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
      } else {
        setLyrics(null);
        setLyricsLoading(false);
        if (!isRetry) {
          retryTimeoutRef.current = setTimeout(() => {
            fetchLyrics(true);
          }, 2000);
        }
      }
    } catch {
      setLyrics(null);
      setLyricsLoading(false);
      if (!isRetry) {
        retryTimeoutRef.current = setTimeout(() => {
          fetchLyrics(true);
        }, 2000);
      }
    }
  }, [currentGuildId, current?.title, stopped]);

  // Load lyrics when current track changes
  useEffect(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (!currentGuildId || !current || stopped) {
      setLyrics(null);
      setLyricsLoading(false);
      return;
    }

    const savedOffset = localStorage.getItem(`offset_${current.title}`);
    setUserOffset(savedOffset ? parseFloat(savedOffset) : 0);

    fetchLyrics(false);

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [currentGuildId, current?.title, stopped, fetchLyrics]);

  // Load AI Auto-Queue config when guild changes
  useEffect(() => {
    if (!currentGuildId || !user) {
      setAiConfig(null);
      setAiAutoPrompt('');
      setAiSearchPrompt('');
      setAiCount(5);
      setAiThreshold(2);
      setAiAutoEnabled(false);
      setAiSuggestions([]);
      setAiError('');
      return;
    }
    let cancelled = false;
    setAiConfig(null);
    setAiAutoPrompt('');
    setAiCount(5);
    setAiThreshold(2);
    setAiAutoEnabled(false);
    setAiSuggestions([]);
    setAiError('');
    getAIAutoQueue(currentGuildId)
      .then(cfg => {
        if (cancelled) return;
        setAiConfig(cfg);
        setAiAutoPrompt(cfg.prompt || '');
        setAiCount(cfg.count ?? 5);
        setAiThreshold(cfg.threshold ?? 2);
        setAiAutoEnabled(cfg.enabled ?? false);
      })
      .catch(() => {
        if (cancelled) return;
        setAiConfig(null);
        setAiAutoPrompt('');
        setAiCount(5);
        setAiThreshold(2);
        setAiAutoEnabled(false);
      });
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
    if (activeTab === 'lyrics' && activeLineRef.current && lyricsContainerRef.current) {
      if (userScrollingRef.current) return;
      const container = lyricsContainerRef.current;
      const line = activeLineRef.current;
      const containerHeight = container.clientHeight;
      const lineOffsetTop = line.offsetTop;
      const lineHeight = line.clientHeight;
      const targetScrollTop = lineOffsetTop - (containerHeight / 2) + (lineHeight / 2);

      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      });
    }
  }, [activeLineIndex, activeTab]);

  const handleTabChange = (tab: 'queue' | 'lyrics') => {
    setActiveTab(tab);
    if (tab === 'lyrics' && !lyrics && !lyricsLoading && current && !stopped) {
      fetchLyrics(false);
    }
  };

  const toggleLyrics = () => {
    setActiveTab((prev) => {
      const next = prev === 'lyrics' ? 'queue' : 'lyrics';
      if (next === 'lyrics') {
        if (!lyrics && !lyricsLoading && current && !stopped) {
          fetchLyrics(false);
        }
        if (typeof window !== 'undefined' && window.innerWidth <= 740 && queuePanelRef.current) {
          queuePanelRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }
      return next;
    });
  };

  const adjustOffset = (delta: number) => {
    setUserOffset((prev) => {
      const next = Math.round((prev + delta) * 10) / 10;
      if (current?.title) {
        localStorage.setItem(`offset_${current.title}`, next.toString());
      }
      return next;
    });
  };

  const handleLyricsScroll = useCallback(() => {
    userScrollingRef.current = true;
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = setTimeout(() => {
      userScrollingRef.current = false;
    }, 4000);
  }, []);

  const handleSyncToLine = useCallback((line: LyricLine) => {
    userScrollingRef.current = false;
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }

    const introOffset = lyrics?.intro_offset || 0;
    const rawOffset = line.begin - position + introOffset;
    const roundedOffset = Math.round(rawOffset * 10) / 10;

    setUserOffset(roundedOffset);
    if (current?.title) {
      localStorage.setItem(`offset_${current.title}`, roundedOffset.toString());
    }
  }, [lyrics?.intro_offset, position, current?.title]);

  const resetOffset = () => {
    setUserOffset(0);
    if (current?.title) {
      localStorage.removeItem(`offset_${current.title}`);
    }
  };

  const refreshVoiceStatus = useCallback(async (manual = false) => {
    if (manual) setIsCheckingVoice(true);
    const startTs = Date.now();
    try {
      const g = await getGuilds();
      const list = g.guilds || [];
      setGuilds(list);
      if (list.length > 0) {
        const activeVoiceGuild = list.find((item) => Boolean(item.channel_id));
        const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const urlGuildId = urlParams?.get('guild');
        const matchedUrl = urlGuildId && list.find((item) => item.id === urlGuildId);

        setCurrentGuildId((prev) => {
          if (matchedUrl) {
            try { localStorage.setItem('selected_guild_id', matchedUrl.id); } catch {}
            return matchedUrl.id;
          }
          // If the user has joined a voice channel in any server, prioritize that server!
          if (activeVoiceGuild) {
            try { localStorage.setItem('selected_guild_id', activeVoiceGuild.id); } catch {}
            return activeVoiceGuild.id;
          }
          if (prev && list.some((item) => item.id === prev)) {
            return prev;
          }
          const savedGuildId = typeof window !== 'undefined' ? localStorage.getItem('selected_guild_id') : null;
          const matchedSaved = savedGuildId && list.find((item) => item.id === savedGuildId);
          return (matchedSaved || list[0]).id;
        });
        const active = list.find((item) => item.id === (matchedUrl ? matchedUrl.id : (activeVoiceGuild ? activeVoiceGuild.id : (currentGuildId || list[0].id))));
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
        const elapsed = Date.now() - startTs;
        if (elapsed < 600) {
          await new Promise((r) => setTimeout(r, 600 - elapsed));
        }
        setIsCheckingVoice(false);
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
          const savedGuildId = typeof window !== 'undefined' ? localStorage.getItem('selected_guild_id') : null;
          const matchedSaved = savedGuildId && list.find((item) => item.id === savedGuildId);
          const voiceGuild = list.find((item) => Boolean(item.channel_id));
          const initialGuild = matchedSaved || voiceGuild || list[0];

          setCurrentGuildId(initialGuild.id);
          setSummoned(initialGuild.bot_connected);
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
    const hasVoice = Boolean(guilds.length > 0 && currentGuildId);
    const intervalTime = hasVoice ? 12000 : 4000;
    const interval = setInterval(() => {
      if (document.hidden) return;
      refreshVoiceStatus();
    }, intervalTime);

    const handleFocus = () => {
      refreshVoiceStatus();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, guilds.length, currentGuildId, refreshVoiceStatus]);

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
                image: optimizeThumbnailUrl(state.current.thumbnail) || getImageForTrack(state.current.title),
                duration: state.current.duration || 0,
                requestedBy: state.current.requester_handle || 'Unknown',
                requestedAvatar: (state.current.requester_handle === 'AI Auto-Queue' || state.current.requester_avatar === '/logo_icon.svg')
                  ? logoIcon
                  : (state.current.requester_avatar || null)
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
            if (state.bot_connected !== undefined) {
              const isConn = !!state.bot_connected;
              setSummoned(isConn);
              if (!isConn) {
                setAiAutoEnabled(false);
                setAiConfig(prev => prev ? { ...prev, enabled: false } : prev);
              }
            }
            if (state.ai_auto_enabled !== undefined) {
              setAiAutoEnabled(!!state.ai_auto_enabled);
              setAiConfig(prev => {
                const base = prev || { enabled: false, prompt: '', count: 5, threshold: 2 };
                return {
                  ...base,
                  enabled: !!state.ai_auto_enabled,
                  prompt: state.ai_prompt !== undefined && state.ai_prompt !== null ? state.ai_prompt : base.prompt,
                  set_by_name: (state.ai_set_by_name && state.ai_set_by_name !== 'User') ? state.ai_set_by_name : (base.set_by_name && base.set_by_name !== 'User' ? base.set_by_name : (user?.global_name || user?.username || base.set_by_name)),
                  set_by_avatar: state.ai_set_by_avatar !== undefined && state.ai_set_by_avatar !== null ? state.ai_set_by_avatar : (base.set_by_avatar || (user?.avatar && user?.id ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null)),
                };
              });
            }
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
                    image: optimizeThumbnailUrl(q.thumbnail) || getImageForTrack(q.title),
                    duration: q.duration || 0,
                    requestedBy: q.requester_handle || 'Unknown',
                    requestedAvatar: (q.requester_handle === 'AI Auto-Queue' || q.requester_avatar === '/logo_icon.svg')
                      ? logoIcon
                      : (q.requester_avatar || null),
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
  
  const currentGuild = useMemo(() => guilds.find(g => g.id === currentGuildId) || guilds[0], [guilds, currentGuildId]);
  const currentGuildName = useMemo(() => currentGuild?.name || 'The Listening Room', [currentGuild]);
  const isGuildAdmin = Boolean(currentGuild?.is_admin);
  const [roomView, setRoomView] = useState<'room' | 'schedule'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const v = params.get('view') || params.get('tab');
      if (v === 'schedule') return 'schedule';
    }
    return 'room';
  });
  const { events: scheduleEvents, members: scheduleMembers } = useScheduleStore(currentGuildId);
  const pendingInvites = useMemo(() => countPendingInvites(scheduleEvents, user?.id || '', scheduleMembers), [scheduleEvents, user?.id, scheduleMembers]);
  const currentVoiceChannelName = useMemo(() => currentGuild?.channel_name || 'voice', [currentGuild]);

  const userVoiceGuild = useMemo(() => guilds.find((g) => Boolean(g.channel_id)), [guilds]);
  const isVoiceConnected = Boolean(user && (currentGuild?.channel_id || (roomView === 'room' && userVoiceGuild)));
  const isLocked = !isAuthLoaded || !user || (!isVoiceConnected && roomView === 'room');

  // Auto-switch to active voice server if user is in a voice channel
  useEffect(() => {
    if (roomView === 'room' && userVoiceGuild && userVoiceGuild.id !== currentGuildId) {
      setCurrentGuildId(userVoiceGuild.id);
      setSummoned(userVoiceGuild.bot_connected);
      try { localStorage.setItem('selected_guild_id', userVoiceGuild.id); } catch {}
    }
  }, [roomView, userVoiceGuild, currentGuildId]);

  const hasAutoRedirectedRef = useRef(false);
  useEffect(() => {
    if (isAuthLoaded && user && !hasAutoRedirectedRef.current) {
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const urlView = urlParams?.get('view') || urlParams?.get('tab');
      if (urlView === 'schedule') {
        setRoomView('schedule');
      } else {
        const anyVoice = guilds.some((g) => Boolean(g.channel_id));
        if (!anyVoice) {
          setRoomView('schedule');
        } else {
          const activeGuild = guilds.find((g) => Boolean(g.channel_id));
          if (activeGuild && activeGuild.id !== currentGuildId) {
            setCurrentGuildId(activeGuild.id);
            setSummoned(activeGuild.bot_connected);
            try { localStorage.setItem('selected_guild_id', activeGuild.id); } catch {}
          }
        }
      }
      hasAutoRedirectedRef.current = true;
    }
  }, [isAuthLoaded, user, guilds, currentGuildId]);

  const roomSwitchRef = useRef<HTMLDivElement>(null);
  const [roomSwitchIndicator, setRoomSwitchIndicator] = useState<{ left: number; width: number; ready: boolean }>({ left: 0, width: 0, ready: false });

  const updateRoomSwitchIndicator = useCallback(() => {
    if (!roomSwitchRef.current) return;
    const active = roomSwitchRef.current.querySelector<HTMLButtonElement>(`button[data-view="${roomView}"]`);
    if (active) {
      setRoomSwitchIndicator({
        left: active.offsetLeft,
        width: active.offsetWidth,
        ready: true,
      });
    }
  }, [roomView]);

  useLayoutEffect(() => {
    updateRoomSwitchIndicator();
  }, [updateRoomSwitchIndicator, pendingInvites]);

  useEffect(() => {
    window.addEventListener('resize', updateRoomSwitchIndicator);
    return () => window.removeEventListener('resize', updateRoomSwitchIndicator);
  }, [updateRoomSwitchIndicator]);

  const autoQueueDisplayPrompt = (aiConfig?.prompt || aiAutoPrompt || '').trim();
  const autoQueueAuthorName = (aiConfig?.set_by_name && aiConfig.set_by_name !== 'User')
    ? aiConfig.set_by_name
    : (user?.global_name || user?.username || 'Admin');
  const autoQueueAuthorAvatar = aiConfig?.set_by_avatar || (user?.avatar && user?.id ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null);

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
      if (isYouTubePlaylistUrl(url)) {
          setPlaylistModalInitialUrl(url);
          setPlaylistModalOpen(true);
          setQuery('');
          return;
      }
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
    if (!aiSearchPrompt.trim() || !currentGuildId || !isVoiceConnected) return;
    setAiLoading(true);
    setAiError('');
    setAiSuggestions([]);
    try {
      const res = await aiSuggest(currentGuildId, aiSearchPrompt.trim(), aiCount);
      const returnedSongs = (res.songs || []).slice(0, Math.max(1, aiCount));
      setAiSuggestions(returnedSongs);
    } catch (err: any) {
      setAiError(err?.message || 'AI service unavailable. Check GEMINI_API_KEY.');
    } finally {
      setAiLoading(false);
    }
  }, [aiSearchPrompt, aiCount, currentGuildId, isVoiceConnected]);

  const handleAIAddSong = useCallback(async (song: AISong) => {
    if (!currentGuildId || !isVoiceConnected) return;
    setAiAdding(prev => new Set(prev).add(song.url));
    try {
      await aiConfirmSong(currentGuildId, song);
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
    if (!currentGuildId || !isVoiceConnected || !aiSuggestions.length || aiAddingAll) return;
    const toAdd = [...aiSuggestions];
    setAiAddingAll(true);
    try {
      const res = await aiConfirmBatch(currentGuildId, toAdd);
      const added = res?.added_count ?? toAdd.length;
      setAiSuggestions([]);
      setNotice(`Added ${added} AI songs to queue`);
    } catch {
      // Fallback: sequential confirm with metadata
      let added = 0;
      for (const song of toAdd) {
        try {
          await aiConfirmSong(currentGuildId, song);
          added++;
        } catch { /* continue adding rest */ }
      }
      setAiSuggestions([]);
      setNotice(`Added ${added} AI songs to queue`);
    } finally {
      setAiAddingAll(false);
    }
  }, [currentGuildId, isVoiceConnected, aiSuggestions, aiAddingAll]);

  const handleAISaveConfig = useCallback(async (
    enabled: boolean,
    overridePrompt?: string,
    overrideCount?: number,
    overrideThreshold?: number
  ) => {
    if (!currentGuildId || !isVoiceConnected) return;
    if (!summoned) {
      setNotice('Bot must join a voice channel before enabling Auto-fill.');
      return;
    }
    const targetPrompt = (overridePrompt !== undefined ? overridePrompt : aiAutoPrompt).trim();
    const targetCount = overrideCount !== undefined ? overrideCount : aiCount;
    const targetThreshold = overrideThreshold !== undefined ? overrideThreshold : aiThreshold;
    const cfg: AIAutoQueueConfig = {
      enabled,
      prompt: targetPrompt,
      count: targetCount,
      threshold: targetThreshold,
    };
    try {
      const res = await setAIAutoQueue(currentGuildId, cfg);
      const updatedConfig: AIAutoQueueConfig = (res && res.config) ? res.config : {
        ...cfg,
        set_by_name: user?.global_name || user?.username || 'You',
        set_by_avatar: user?.avatar && user?.id ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null,
      };
      setAiConfig(updatedConfig);
      setAiAutoEnabled(enabled);
      setAiAutoPrompt(targetPrompt);
      if (overrideCount !== undefined) setAiCount(targetCount);
      if (overrideThreshold !== undefined) setAiThreshold(targetThreshold);
      setFormAutoEnabled(enabled);
      setFormAutoPrompt(targetPrompt);
      if (overrideCount !== undefined) setFormCount(targetCount);
      if (overrideThreshold !== undefined) setFormThreshold(targetThreshold);
      setNotice(enabled ? `AI Auto-Queue enabled ("${targetPrompt || 'Active'}")` : 'AI Auto-Queue disabled');
    } catch (err: any) {
      setNotice(err?.message || 'Failed to update AI config');
    }
  }, [currentGuildId, isVoiceConnected, summoned, aiAutoPrompt, aiCount, aiThreshold, user]);

  const handleUseSearchVibeForAutoQueue = useCallback(() => {
    if (!aiSearchPrompt.trim()) return;
    setAiAutoPrompt(aiSearchPrompt.trim());
    setFormAutoPrompt(aiSearchPrompt.trim());
    handleAISaveConfig(true, aiSearchPrompt.trim());
    setNotice(`Auto-fill vibe updated to: "${aiSearchPrompt.trim()}" (Auto-fill is ON)`);
  }, [aiSearchPrompt, handleAISaveConfig]);

  const fetchKeys = useCallback(async () => {
    try {
      const data = await getGeminiKeys();
      setGeminiKeys(data.keys || []);
      setActiveKeysCount(data.total_active || 0);
      setTotalKeysCount(data.total_keys || 0);
      setIsKeyAdmin(data.is_admin || false);
    } catch (err: any) {
      console.warn('Could not fetch Gemini keys:', err);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchKeys();
      const interval = setInterval(fetchKeys, 30000); // Polling every 30s
      return () => clearInterval(interval);
    }
  }, [user, fetchKeys]);

  const handleContributeKey = useCallback(async () => {
    const rawKey = newKeyInput.trim();
    if (!rawKey) return;
    setKeySubmitting(true);
    setKeySubmitError('');
    setKeySubmitSuccess('');
    try {
      const res = await contributeGeminiKey(rawKey);
      setKeySubmitSuccess(res.message || 'Key added successfully!');
      setNewKeyInput('');
      await fetchKeys();
      setNotice(res.message || 'Gemini API Key added to the pool!');
    } catch (err: any) {
      setKeySubmitError(err?.message || 'Key validation failed. Ensure the key is active in Google AI Studio.');
    } finally {
      setKeySubmitting(false);
    }
  }, [newKeyInput, fetchKeys]);

  const handleDeleteKey = useCallback(async (keyId: number) => {
    try {
      await deleteGeminiKey(keyId);
      await fetchKeys();
      setNotice('API Key removed from pool');
    } catch (err: any) {
      setNotice(err?.message || 'Failed to remove key');
    }
  }, [fetchKeys]);



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
        <div className="flex items-center gap-2">
          <a href="/" className="brand" aria-label="MusicBỏTúi Home">
          <img src={logoIcon} alt="MusicBỏTúi Logo" className="brand-logo-img" />
          <span className="logo-text">
            <span className="music">Music</span>
            <span className="botui">BỏTúi</span>
          </span>
        </a>
          <button
            type="button"
            onClick={() => setPatchNotesOpen(true)}
            className="patch-notes-pill"
            aria-label={`View release notes${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
          >
            <span className="patch-version">v{CURRENT_VERSION}</span>
            <span className="patch-sep">•</span>
            <span className="patch-highlight">{LATEST_PATCH.headline}</span>
            {unreadCount > 0 ? (
              <span className="patch-unread-badge" aria-label={`${unreadCount} unread updates`}>
                {unreadCount}
              </span>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-primary/80 shrink-0" />
            )}
          </button>
        </div>
        <div className="header-room">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="server-select" disabled={guilds.length === 0}>
                <span className="server-symbol"><Headphones size={15} /></span>
                <span className="truncate">{currentGuildName}</span>
                <ChevronDown size={14} className="shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="min-w-[200px]">
              <DropdownMenuLabel>Your servers</DropdownMenuLabel>
              {guilds.map(g => (
                <DropdownMenuItem
                  key={g.id}
                  onClick={() => {
                    setCurrentGuildId(g.id);
                    setSummoned(g.bot_connected);
                    try { localStorage.setItem('selected_guild_id', g.id); } catch {}
                  }}
                  className="flex items-center justify-between gap-2 cursor-pointer"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Headphones size={14} className="shrink-0 text-muted-foreground" />
                    <span className="truncate">{g.name}</span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    {g.channel_name && (
                      <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full font-medium">
                        🔊 {g.channel_name}
                      </span>
                    )}
                    {g.id === currentGuildId && <Check className="ml-1 text-primary shrink-0" size={13} />}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="header-divider" />
          <span className="header-channel">
            <Radio size={14} className="shrink-0" />
            <span className="truncate max-w-[120px]">{isVoiceConnected ? currentVoiceChannelName : 'offline'}</span>
          </span>
        </div>
        <div className="header-actions">
           <Tooltip>
             <TooltipTrigger asChild>
               <Button
                 variant="ghost"
                 size="sm"
                 aria-label="Community AI Pool Status and Contribution"
                 onClick={() => { setAiPanelTab('keys'); setAiPanelOpen(true); }}
                 className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-all ${
                   activeKeysCount > 0
                     ? 'bg-primary/10 text-primary border-primary/25 hover:bg-primary/20'
                     : 'bg-amber-500/10 text-amber-400 border-amber-500/25 hover:bg-amber-500/20'
                 }`}
               >
                 <Sparkles size={13} className={activeKeysCount > 0 ? 'text-primary' : 'text-amber-400'} />
                 <span className="ai-pool-label">AI Pool</span>
                 <span className="font-semibold px-1 py-0.2 rounded-full text-[10px] bg-white/10">
                   {activeKeysCount}/{totalKeysCount}
                 </span>
               </Button>
             </TooltipTrigger>
             <TooltipContent>
               {activeKeysCount > 0
                 ? `${activeKeysCount} operational Gemini key(s). Click to view pool or contribute a free key!`
                 : 'All Gemini keys currently exhausted! Click to contribute a free key.'}
             </TooltipContent>
           </Tooltip>
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
             <Button variant="secondary" size="sm" className="login-btn text-xs font-semibold" onClick={() => window.location.href = getLoginUrl()}>Login with Discord</Button>
           ) : (
             <>
               {!isVoiceConnected ? (
                 <span className="preview-tag text-amber-400/90 border-amber-400/30">Offline</span>
               ) : (
                 <span className="preview-tag text-emerald-400/90 border-emerald-500/30">Live</span>
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
                   <DropdownMenuItem onClick={() => setDialog('connection')}>
                     <Settings2 size={14} className="mr-1.5" /> Connection Settings
                   </DropdownMenuItem>
                   <DropdownMenuItem onClick={() => { setAiPanelTab('keys'); setAiPanelOpen(true); }}>
                     <Sparkles size={14} className="mr-1.5" /> Community AI Pool ({activeKeysCount}/{totalKeysCount})
                   </DropdownMenuItem>
                   <DropdownMenuItem onClick={() => setDialog('contribution')}>
                     <FileText size={14} className="mr-1.5" /> Release Notes (v{CURRENT_VERSION})
                    </DropdownMenuItem>
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
        data-view={roomView}
        style={isLocked ? { filter: 'blur(12px)', pointerEvents: 'none', userSelect: 'none' } : undefined}
        inert={isLocked ? true : undefined}
        aria-hidden={isLocked}
      >
        <div className="page-intro">
          <div>
            <div className="eyebrow">{roomView === 'schedule' ? `${currentGuildName.toUpperCase()} · SERVER CALENDAR` : 'GOOD MUSIC. BETTER COMPANY.'}</div>
            <h1>{roomView === 'schedule' ? 'Schedule' : 'Your listening room'}<span className="heading-dot">.</span></h1>
          </div>
          <div ref={roomSwitchRef} className="room-view-switch" role="tablist" aria-label="Section">
            <div
              className="room-view-switch-indicator"
              style={{
                transform: `translateX(${roomSwitchIndicator.left}px)`,
                width: `${roomSwitchIndicator.width}px`,
                opacity: roomSwitchIndicator.ready ? 1 : 0,
              }}
            />
            <button
              role="tab"
              data-view="room"
              aria-selected={roomView === 'room'}
              className={roomView === 'room' ? 'is-active' : ''}
              onClick={() => {
                const voiceGuild = guilds.find((g) => Boolean(g.channel_id));
                if (voiceGuild && voiceGuild.id !== currentGuildId) {
                  setCurrentGuildId(voiceGuild.id);
                  setSummoned(voiceGuild.bot_connected);
                  try { localStorage.setItem('selected_guild_id', voiceGuild.id); } catch {}
                }
                setRoomView('room');
              }}
            >
              <Music2 size={14} />Listening room
            </button>
            <button
              role="tab"
              data-view="schedule"
              aria-selected={roomView === 'schedule'}
              className={roomView === 'schedule' ? 'is-active' : ''}
              onClick={() => setRoomView('schedule')}
            >
              <CalendarDays size={14} />Schedule
              {pendingInvites > 0 && <span className="tab-badge" aria-label={`${pendingInvites} invites need a response`}>{pendingInvites}</span>}
            </button>
          </div>
        </div>

        {roomView === 'schedule' && (
          <ScheduleView
            guildId={currentGuildId}
            guildName={currentGuildName}
            userId={user?.id || ''}
            isAdmin={isGuildAdmin}
            guilds={guilds}
            onSelectGuild={(id) => {
              setCurrentGuildId(id);
              try { localStorage.setItem('selected_guild_id', id); } catch {}
              const g = guilds.find((item) => item.id === id);
              if (g) setSummoned(g.bot_connected);
            }}
          />
        )}

        <div className="music-layout">
          <section className="player-panel glass-surface" aria-label="Music player">
            <div className="section-topline"><div className="section-label"><span className={`equalizer ${playing && !stopped ? 'is-playing' : ''}`}><i /><i /><i /><i /></span>{stopped ? 'PLAYBACK STOPPED' : playing ? 'NOW PLAYING' : 'PAUSED'}</div><span className="source-tag"><span className="source-dot" /> Stream</span></div>
            <div className="artwork-stage">
              <img
                key={displayCurrent.id}
                className="album-art"
                src={optimizeThumbnailUrl(displayCurrent.image)}
                alt={`${displayCurrent.title} album artwork`}
                width={1024}
                height={1024}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src.includes('/maxresdefault.jpg')) {
                    target.src = target.src.replace('/maxresdefault.jpg', '/mqdefault.jpg');
                  }
                }}
              />
              <span className="album-caption">{displayCurrent.album}</span>
            </div>
            <div className="track-details"><div className="min-w-0 w-full"><h2><MarqueeText text={displayCurrent.title} active={!stopped} /></h2><div className="track-artist"><MarqueeText text={displayCurrent.artist} active={!stopped} /></div></div></div>
            {displayCurrent.requestedBy ? (
              <div className="track-context">
                {(displayCurrent.requestedBy === 'AI Auto-Queue' || displayCurrent.requestedAvatar === logoIcon || displayCurrent.requestedAvatar === '/logo_icon.svg') ? (
                  <img
                    src={logoIcon}
                    alt="AI Auto-Queue"
                    className="w-4 h-4 rounded-full bg-[#141c21] p-0.5 border border-[#00E676]/35 !object-contain shrink-0"
                  />
                ) : (displayCurrent.requestedAvatar || (user && user.username === displayCurrent.requestedBy && user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null)) ? (
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
                <IconControl label={activeTab === 'lyrics' ? 'View queue' : 'View lyrics'} active={activeTab === 'lyrics'} onClick={toggleLyrics}><AudioLines /></IconControl>
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="More playback options"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onClick={() => setNotice(`${displayCurrent.title} · ${displayCurrent.artist}`)}>Track details</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            </div>
            <div className="volume-controls"><IconControl label={volume ? 'Mute volume' : 'Unmute volume'} onClick={() => handleVolume(volume ? 0 : 75)}>{volume ? <Volume2 /> : <VolumeX />}</IconControl><Slider aria-label="Volume" value={[volume]} onValueChange={value => handleVolume(value[0] ?? 0)} max={100} step={1} /><span className="volume-value">{volume}%</span></div>
            <div className="player-footer"><Headphones size={14} /><span>Playing in <strong>{currentGuildName}</strong></span><span className="footer-quality">HIGH QUALITY</span></div>
          </section>

          <section ref={queuePanelRef} className="queue-panel glass-surface" aria-label="Track queue and lyrics">
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
                <p>
                  Your shared soundtrack.
                </p>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-1.5">
                  {/* Standalone AI Search & Preview Button */}
                  <button
                    id="ai-search-preview-btn"
                    aria-label="AI Search & Preview"
                    onClick={() => {
                      setAiPanelTab('search');
                      setAiPanelOpen(true);
                    }}
                    disabled={!isVoiceConnected}
                    className="ai-search-preview-btn"
                    title="Describe a vibe to search & preview AI song suggestions"
                  >
                    <Sparkles size={13} className="text-primary" />
                    <span>AI Search</span>
                  </button>

                  {/* Auto-fill Toggle + Rules Config */}
                  <div className="ai-outside-control">
                    <button
                      id="ai-auto-toggle-outside"
                      role="switch"
                      aria-checked={aiAutoEnabled}
                      onClick={() => {
                        if (!aiConfig?.prompt && !aiAutoEnabled) {
                          setAiPanelTab('autoqueue');
                          setAiPanelOpen(true);
                        } else {
                          handleAISaveConfig(!aiAutoEnabled);
                        }
                      }}
                      disabled={!isVoiceConnected || !summoned}
                      className={`ai-outside-switch ${aiAutoEnabled ? 'is-active' : ''}`}
                      title={!summoned ? 'Summon bot to voice before enabling Auto-fill' : aiAutoEnabled ? `Auto-fill is ON ("${aiConfig?.prompt || 'Active'}") — click to turn off` : 'Turn on AI Auto-fill'}
                    >
                      <Radio size={12} className={aiAutoEnabled ? "text-primary animate-pulse" : ""} />
                      <span className="ai-outside-label">Auto-fill</span>
                      <span className={`ai-outside-indicator ${aiAutoEnabled ? 'on' : 'off'}`}>
                        {aiAutoEnabled ? 'ON' : 'OFF'}
                      </span>
                    </button>
                    <button
                      id="ai-autoqueue-btn"
                      aria-label="AI Auto-Queue"
                      onClick={() => {
                        setAiPanelTab('autoqueue');
                        setAiPanelOpen(true);
                      }}
                      disabled={!isVoiceConnected}
                      className={`ai-outside-settings-btn ${aiConfig?.enabled ? 'text-primary' : ''}`}
                      title={aiConfig?.prompt ? `Current Auto-fill vibe: "${aiConfig.prompt}" (Click to edit rules)` : 'Auto-fill Rules & Settings'}
                    >
                      <Settings2 size={13} />
                    </button>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button aria-label="Panel options" className="queue-options-btn">
                      <MoreHorizontal size={18} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {activeTab === 'queue' ? (
                      <DropdownMenuItem onClick={async () => { if (currentGuildId) { try { await controlClear(currentGuildId); setNotice('Queue cleared'); } catch(e: any) { setNotice(e.message || 'Failed to clear queue'); } } }}>
                        <Trash2 />Clear queue
                      </DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuItem onClick={() => fetchLyrics(false)}>
                          <RefreshCw />Refresh lyrics
                        </DropdownMenuItem>
                        {userOffset !== 0 && (
                          <DropdownMenuItem onClick={resetOffset}>
                            Reset sync offset
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="queue-tabs">
              <div className="tab-pill-group">
                <Button
                  variant="ghost"
                  className={`queue-tab ${activeTab === 'queue' ? 'active-tab' : ''}`}
                  onClick={() => handleTabChange('queue')}
                >
                  <ListMusic size={14} className="mr-1.5" />
                  Queue
                  <span className="tab-badge">{queue.length}</span>
                </Button>
                <Button
                  variant="ghost"
                  className={`queue-tab ${activeTab === 'lyrics' ? 'active-tab' : ''}`}
                  onClick={() => handleTabChange('lyrics')}
                >
                  <AudioLines size={14} className="mr-1.5" />
                  Lyrics
                  {lyrics && <span className="tab-indicator-dot" title="Lyrics synced" />}
                </Button>
              </div>
              {activeTab === 'queue' ? (
                <span>{`${Math.round(total / 60)} min`}</span>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">
                    {lyrics?.provider ? `${lyrics.provider.toUpperCase()} ${lyrics.type === 'syllable' ? '• SYLLABLE' : '• SYNCED'}` : ''}
                  </span>
                  {!stopped && current && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Refresh lyrics"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          onClick={() => fetchLyrics(false)}
                          disabled={lyricsLoading}
                        >
                          <RefreshCw size={12} className={lyricsLoading ? 'animate-spin' : ''} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Refresh lyrics</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>

            {/* Auto-queue Vibe Display */}
            {autoQueueDisplayPrompt && (
              <div
                className="autoqueue-vibe-banner"
                onClick={() => {
                  setAiPanelTab('autoqueue');
                  setAiPanelOpen(true);
                }}
                role="button"
                tabIndex={0}
                title="Click to view or edit Auto-fill rules & vibe"
              >
                <div className="autoqueue-vibe-label">
                  <Radio size={11} className={aiAutoEnabled ? "text-primary animate-pulse" : "text-muted-foreground"} />
                  <span>Auto-queue:</span>
                </div>
                <div className="autoqueue-vibe-prompt-wrap">
                  <MarqueeText
                    text={autoQueueDisplayPrompt}
                    speed={22}
                    className="autoqueue-prompt-marquee"
                    contentClassName="text-[12px] font-medium text-foreground"
                  />
                </div>
                <div className="autoqueue-vibe-author">
                  <span className="autoqueue-vibe-sep">set by</span>
                  {autoQueueAuthorAvatar ? (
                    <img
                      src={autoQueueAuthorAvatar}
                      alt=""
                      className="autoqueue-author-avatar"
                    />
                  ) : (
                    <div className="autoqueue-author-fallback">
                      <User size={10} />
                    </div>
                  )}
                  <span className="autoqueue-author-name">{autoQueueAuthorName}</span>
                </div>
              </div>
            )}

            {activeTab === 'queue' && (
              <form className="add-track" onSubmit={handleAddSong}>
                <Music2 size={18} />
                <Input aria-label="Song search or URL" placeholder="Paste a link or search for a song" value={query} onChange={event => setQuery(event.target.value)} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Add playlist"
                      className="h-[27px] w-[27px] text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => {
                        const trimmed = query.trim();
                        setPlaylistModalInitialUrl(isYouTubePlaylistUrl(trimmed) ? trimmed : '');
                        setPlaylistModalOpen(true);
                      }}
                    >
                      <ListMusic size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Add playlist</TooltipContent>
                </Tooltip>
                <Button size="icon" aria-label="Add to queue" disabled={!query.trim()} type="submit"><Plus /></Button>
              </form>
            )}

            {activeTab === 'queue' ? (
              <div className="flex-1 flex flex-col min-h-0">
                <div className={`queue-list ${totalPages > 1 ? 'has-pagination' : ''}`}>{paginatedQueue.map((track) => {
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
                        <img
                          src={optimizeThumbnailUrl(track.image)}
                          alt=""
                          loading="lazy"
                          width={56}
                          height={56}
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (target.src.includes('/maxresdefault.jpg')) {
                              target.src = target.src.replace('/maxresdefault.jpg', '/mqdefault.jpg');
                            }
                          }}
                        />
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
                        <h3 className="min-w-0">
                          <MarqueeText
                            text={track.title}
                            className="w-full min-w-0"
                            active={isCurrent || undefined}
                            hoverOnly={!isCurrent}
                          />
                        </h3>
                        <MarqueeText
                          text={track.artist}
                          className="min-w-0 text-[11px] text-muted-foreground mt-0.5"
                          active={isCurrent || undefined}
                          hoverOnly={!isCurrent}
                        />
                        <div className="queue-requester">
                          <span>Added by</span>
                          {(track.requestedBy === 'AI Auto-Queue' || track.requestedAvatar === logoIcon || track.requestedAvatar === '/logo_icon.svg') ? (
                            <img
                              src={logoIcon}
                              alt="AI Auto-Queue"
                              className="w-3.5 h-3.5 rounded-full bg-[#141c21] p-0.5 border border-[#00E676]/35 !object-contain shrink-0"
                            />
                          ) : (track.requestedAvatar || (user && user.username === track.requestedBy && user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null)) ? (
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
                      {isCurrent && (
                        <span className="now-playing-badge">
                          {playing ? 'NOW PLAYING' : 'PAUSED'}
                        </span>
                      )}
                      <span className="track-duration">{formatTime(track.duration)}</span>
                      <IconControl label={`Remove ${track.title}`} onClick={() => handleRemove(track.originalIndex ?? 0)} className="remove-track">
                        <X size={15} />
                      </IconControl>
                    </div>
                  );
                })}{!queue.length && <div className="empty-queue"><ListMusic size={30} /><h3>A little quiet in here.</h3><p>No tracks in the queue.</p></div>}</div>
                {totalPages > 1 && (
                  <div className="queue-pagination">
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" disabled={validCurrentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Previous</Button>
                    <span className="text-xs text-muted-foreground font-medium">Page {validCurrentPage} of {totalPages}</span>
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" disabled={validCurrentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Next</Button>
                  </div>
                )}
                <div className="queue-bottom"><ListMusic size={15} /><span>{queue.length} tracks in the queue</span><span className="queue-bottom-dot" /><span>Made for sharing</span></div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="lyrics-view" ref={lyricsContainerRef} onScroll={handleLyricsScroll}>
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
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-xs"
                        onClick={() => fetchLyrics(false)}
                        disabled={lyricsLoading}
                      >
                        <RefreshCw size={13} className={`mr-1.5 ${lyricsLoading ? 'animate-spin' : ''}`} />
                        Check again
                      </Button>
                    </div>
                  ) : (
                    lyrics.lines.map((line, idx) => {
                      const isActive = idx === activeLineIndex;
                      return (
                        <div
                          key={idx}
                          ref={isActive ? activeLineRef : null}
                          className={`lyrics-line ${isActive ? 'is-active' : ''}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSyncToLine(line)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSyncToLine(line);
                            }
                          }}
                          aria-label={`Lyric line: ${line.text}. Click to sync playback.`}
                        >
                          <span className="lyrics-line-text">
                          {line.words && line.words.length > 0 ? (
                            line.words.map((w, wIdx) => {
                              const isSung = effectiveTime >= w.begin;
                              const isSinging = effectiveTime >= w.begin && effectiveTime <= w.end;

                              let hasSpace = true;
                              if (w.trailing_space !== undefined) {
                                hasSpace = !!w.trailing_space;
                              } else if (w.text.endsWith(' ')) {
                                hasSpace = true;
                              } else if (line.words && wIdx < line.words.length - 1 && line.text) {
                                const nextWord = line.words[wIdx + 1];
                                if (nextWord) {
                                  const curClean = w.text.trim();
                                  const nextClean = nextWord.text.trim();
                                  if (curClean && nextClean && line.text.includes(curClean + nextClean)) {
                                    hasSpace = false;
                                  }
                                }
                              } else if (wIdx === line.words.length - 1) {
                                hasSpace = false;
                              }

                              return (
                                <span
                                  key={wIdx}
                                  className={`lyrics-word ${isSinging ? 'is-singing' : isSung ? 'is-sung' : ''} ${hasSpace ? 'has-space' : ''}`}
                                >
                                  {w.text.trim()}
                                </span>
                              );
                            })
                          ) : (
                            line.text
                          )}
                          </span>
                          <span className="lyrics-line-sync-badge" aria-hidden="true">
                            <Play size={9} className="fill-current" />
                            <span>{formatTime(line.begin)}</span>
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                {lyrics && (
                  <div className="lyrics-sync-bar">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span>
                        Sync Offset:{' '}
                        <strong className="text-foreground font-mono">
                          {userOffset - (lyrics.intro_offset || 0) >= 0
                            ? `+${(userOffset - (lyrics.intro_offset || 0)).toFixed(1)}s`
                            : `${(userOffset - (lyrics.intro_offset || 0)).toFixed(1)}s`}
                        </strong>
                        {lyrics.intro_offset ? (
                          <span className="text-[11px] text-muted-foreground/80 font-mono ml-1.5">
                            {userOffset !== 0
                              ? `(Manual: ${userOffset >= 0 ? `+${userOffset.toFixed(1)}s` : `${userOffset.toFixed(1)}s`}, MV intro: ${lyrics.intro_offset.toFixed(1)}s)`
                              : `(incl. ${lyrics.intro_offset.toFixed(1)}s MV intro)`}
                          </span>
                        ) : null}
                      </span>
                      <span className="lyrics-sync-hint-chip">
                        <Sparkles size={10} className="text-primary shrink-0" />
                        <span>Click any line to sync</span>
                      </span>
                    </div>
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
                AI Music Assistant
              </DialogTitle>
              <DialogDescription className="ai-panel-desc">
                {aiPanelTab === 'search'
                  ? 'Describe a vibe to preview and curate songs. Nothing is queued automatically.'
                  : aiPanelTab === 'autoqueue'
                  ? 'Configure automatic queue replenishment when songs run low during playback.'
                  : 'Contribute and view shared Gemini API keys to keep AI recommendations fast and resilient.'}
              </DialogDescription>
            </DialogHeader>

            {/* Modal Tabs */}
            <div className="ai-modal-tabs">
              <button
                type="button"
                className={`ai-modal-tab ${aiPanelTab === 'search' ? 'is-active' : ''}`}
                onClick={() => setAiPanelTab('search')}
              >
                <Sparkles size={13} className="shrink-0" />
                <span>Search &amp; Preview</span>
              </button>
              <button
                type="button"
                className={`ai-modal-tab ${aiPanelTab === 'autoqueue' ? 'is-active' : ''}`}
                onClick={() => setAiPanelTab('autoqueue')}
              >
                <Radio size={13} className="shrink-0" />
                <span>Auto-fill Rules</span>
                {aiAutoEnabled && <span className="ai-modal-tab-badge">ON</span>}
              </button>
              <button
                type="button"
                className={`ai-modal-tab ${aiPanelTab === 'keys' ? 'is-active' : ''}`}
                onClick={() => { setAiPanelTab('keys'); fetchKeys(); }}
              >
                <Key size={13} className="shrink-0" />
                <span>Key Pool</span>
                <span className={`ai-modal-tab-badge ${activeKeysCount > 0 ? '' : 'text-amber-400 bg-amber-500/20'}`}>
                  {activeKeysCount}
                </span>
              </button>
            </div>

            {aiPanelTab === 'search' ? (
              <>
                {/* Search Prompt textarea */}
                <div className="ai-field">
                  <label htmlFor="ai-search-prompt-input" className="ai-label">Your vibe</label>
                  <textarea
                    id="ai-search-prompt-input"
                    className="ai-prompt-textarea"
                    rows={2}
                    placeholder="e.g. lo-fi chill buổi tối, K-pop sôi động, jazz cà phê..."
                    value={aiSearchPrompt}
                    onChange={e => setAiSearchPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAISuggest(); } }}
                    disabled={aiLoading}
                  />
                </div>

                {/* Config row for search */}
                <div className="ai-config-row">
                  <div className="ai-config-item">
                    <label htmlFor="ai-count-input" className="ai-label">Songs to preview</label>
                    <input
                      id="ai-count-input"
                      type="number"
                      className="ai-number-input"
                      value={aiCount}
                      min={1}
                      max={20}
                      onChange={e => {
                        const parsed = Number(e.target.value);
                        if (!Number.isFinite(parsed)) return;
                        setAiCount(Math.max(1, Math.min(20, parsed)));
                      }}
                    />
                  </div>
                </div>

                {/* Suggest button */}
                <Button
                  id="ai-suggest-btn"
                  className={`ai-suggest-btn ${aiLoading ? 'is-thinking' : ''}`}
                  onClick={handleAISuggest}
                  disabled={aiLoading || !aiSearchPrompt.trim() || !isVoiceConnected}
                >
                  {aiLoading ? (
                    <span className="ai-btn-thinking-state">
                      <Sparkles size={16} className="ai-btn-thinking-sparkle" />
                      <span>AI is thinking</span>
                      <span className="ai-btn-thinking-dots" aria-hidden="true">
                        <span className="ai-dot-pulse dot-1" />
                        <span className="ai-dot-pulse dot-2" />
                        <span className="ai-dot-pulse dot-3" />
                      </span>
                    </span>
                  ) : (
                    <><Sparkles size={15} /> Find songs</>
                  )}
                </Button>

                {/* Error */}
                {aiError && (
                  <p className="ai-error" role="alert">{aiError}</p>
                )}

                {/* Thinking Visualizer when loading */}
                {aiLoading && (
                  <div className="ai-thinking-card" role="status" aria-live="polite">
                    <div className="ai-thinking-glow-core">
                      <div className="ai-thinking-ring ring-1" />
                      <div className="ai-thinking-ring ring-2" />
                      <div className="ai-thinking-orb">
                        <Sparkles size={20} className="ai-thinking-icon" />
                      </div>
                    </div>
                    <div className="ai-thinking-meta">
                      <span className="ai-thinking-title">Tuning into your vibe</span>
                      <span className="ai-thinking-sub">Curating matches from YouTube Music…</span>
                    </div>
                    <div className="ai-thinking-bars" aria-hidden="true">
                      <span className="ai-wave-bar bar-1" />
                      <span className="ai-wave-bar bar-2" />
                      <span className="ai-wave-bar bar-3" />
                      <span className="ai-wave-bar bar-4" />
                      <span className="ai-wave-bar bar-5" />
                    </div>
                  </div>
                )}

                {/* Preview list */}
                {!aiLoading && aiSuggestions.length > 0 && (
                  <div className="ai-suggestions">
                    <div className="ai-suggestions-header">
                      <span className="ai-suggestions-label">{aiSuggestions.length} suggestions</span>
                      <button
                        className="ai-add-all-btn"
                        onClick={handleAIAddAll}
                        disabled={!isVoiceConnected || aiAddingAll}
                      >
                        {aiAddingAll ? (
                          <span className="ai-btn-inline-pulse">
                            <Sparkles size={12} className="ai-btn-thinking-sparkle" /> Adding all…
                          </span>
                        ) : (
                          <><Plus size={12} /> Add all</>
                        )}
                      </button>
                    </div>
                    <div className="ai-suggestions-list no-scrollbar">
                      {aiSuggestions.map((song, i) => {
                        const adding = aiAdding.has(song.url);
                        return (
                          <div key={`${song.url}-${i}`} className="ai-song-row">
                            <div className="ai-song-thumb-wrapper">
                              {song.thumbnail ? (
                                <img
                                  src={optimizeThumbnailUrl(song.thumbnail)}
                                  alt=""
                                  className="ai-song-thumb"
                                  loading="lazy"
                                  onError={(e) => {
                                    const target = e.currentTarget;
                                    if (target.src.includes('/maxresdefault.jpg')) {
                                      target.src = target.src.replace('/maxresdefault.jpg', '/mqdefault.jpg');
                                      return;
                                    }
                                    target.style.display = 'none';
                                    if (target.nextElementSibling) {
                                      (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                    }
                                  }}
                                />
                              ) : null}
                              <div
                                className="ai-song-thumb ai-song-thumb-placeholder"
                                style={song.thumbnail ? { display: 'none' } : undefined}
                              >
                                <Music2 size={14} />
                              </div>
                            </div>
                            <div className="ai-song-info">
                              <div className="ai-song-title" title={song.title}>{song.title}</div>
                              <div className="ai-song-artist" title={song.artist}>{song.artist}</div>
                            </div>
                            <span className="ai-song-duration">{formatTime(song.duration)}</span>
                            <button
                              aria-label={`Add ${song.title}`}
                              className="ai-song-add-btn"
                              onClick={() => handleAIAddSong(song)}
                              disabled={adding || !isVoiceConnected || aiAddingAll}
                            >
                              {adding ? <Sparkles size={13} className="ai-btn-thinking-sparkle" /> : <Plus size={13} />}
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Copy to auto-fill button */}
                    <button
                      type="button"
                      className="ai-use-vibe-btn"
                      onClick={handleUseSearchVibeForAutoQueue}
                      disabled={!summoned}
                      title={!summoned ? 'Summon bot to voice before enabling Auto-fill' : undefined}
                    >
                      <Sparkles size={13} />
                      <span>Use this vibe for background Auto-fill</span>
                    </button>
                  </div>
                )}
              </>
            ) : aiPanelTab === 'autoqueue' ? (
              <>
                {/* Auto-Queue Standing Vibe Banner */}
                <div className="ai-active-vibe-banner">
                  <div className="ai-active-vibe-header">
                    <span className="ai-active-vibe-title">Current Auto-fill Vibe</span>
                    <span className={`ai-outside-indicator ${aiAutoEnabled ? 'on' : 'off'}`}>
                      {aiAutoEnabled ? 'ACTIVE' : 'PAUSED'}
                    </span>
                  </div>
                  <div className="ai-active-vibe-text">
                    {aiConfig?.prompt ? `"${aiConfig.prompt}"` : 'No vibe configured yet'}
                  </div>
                  <div className="ai-active-vibe-meta">
                    {aiAutoEnabled
                      ? `Automatically adds ${aiCount} songs whenever fewer than ${aiThreshold} songs remain in queue.`
                      : 'Auto-fill is currently turned off for this server. Switch on below or on the header.'}
                  </div>
                </div>

                {/* Auto-Queue Vibe input */}
                <div className="ai-field">
                  <label htmlFor="ai-auto-prompt-input" className="ai-label">Edit Auto-fill Vibe</label>
                  <textarea
                    id="ai-auto-prompt-input"
                    className="ai-prompt-textarea"
                    rows={2}
                    placeholder="e.g. lo-fi chill buổi tối, K-pop sôi động, nhạc jazz cà phê..."
                    value={formAutoPrompt}
                    onChange={e => setFormAutoPrompt(e.target.value)}
                  />
                </div>

                {/* Config row */}
                <div className="ai-config-row">
                  <div className="ai-config-item">
                    <label htmlFor="ai-auto-count-input" className="ai-label">Songs to add per top-up</label>
                    <input
                      id="ai-auto-count-input"
                      type="number"
                      className="ai-number-input"
                      value={formCount}
                      min={1}
                      max={20}
                      onChange={e => {
                        const parsed = Number(e.target.value);
                        if (!Number.isFinite(parsed)) return;
                        setFormCount(Math.max(1, Math.min(20, parsed)));
                      }}
                    />
                  </div>
                  <div className="ai-config-item">
                    <label htmlFor="ai-threshold-input" className="ai-label">Auto-fill when &lt; songs left</label>
                    <input
                      id="ai-threshold-input"
                      type="number"
                      className="ai-number-input"
                      value={formThreshold}
                      min={1}
                      max={10}
                      onChange={e => {
                        const parsed = Number(e.target.value);
                        if (!Number.isFinite(parsed)) return;
                        setFormThreshold(Math.max(1, Math.min(10, parsed)));
                      }}
                    />
                  </div>
                </div>

                {!summoned && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                    <span>⚠️ The bot is not currently in a voice channel. Summon the bot to voice before enabling Auto-fill.</span>
                  </div>
                )}

                {/* Auto-fill toggle (Option A: local form toggle, committed upon Save) */}
                <div className="ai-toggle-row">
                  <button
                    id="ai-auto-toggle"
                    role="switch"
                    aria-label="Enable Auto-fill when queue runs low"
                    aria-checked={formAutoEnabled}
                    className={`ai-switch ${formAutoEnabled ? 'is-on' : ''}`}
                    onClick={() => setFormAutoEnabled(!formAutoEnabled)}
                    disabled={!summoned}
                    title={!summoned ? 'Bot must be summoned to voice first' : undefined}
                  >
                    <span className="ai-switch-thumb" />
                  </button>
                  <span className="ai-toggle-label">
                    Enable Auto-fill when queue runs low
                    {formAutoEnabled && <span className="ai-on-pill">ON</span>}
                  </span>
                </div>

                {/* Save button */}
                <Button
                  id="ai-save-autoqueue-btn"
                  className="ai-suggest-btn"
                  onClick={() => {
                    handleAISaveConfig(formAutoEnabled, formAutoPrompt, formCount, formThreshold);
                    setAiPanelOpen(false);
                  }}
                  disabled={!summoned || (formAutoEnabled && !formAutoPrompt.trim())}
                  title={!summoned ? 'Bot must be summoned to voice first' : undefined}
                >
                  <Check size={15} /> Save Auto-fill Settings
                </Button>
              </>
            ) : (
              <>
                {/* Community Key Pool Tab */}
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Key size={16} className="text-primary" />
                        <span className="font-semibold text-sm">Community Gemini Pool</span>
                      </div>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        activeKeysCount > 0
                          ? 'bg-primary/15 text-primary border border-primary/25'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                      }`}>
                        {activeKeysCount} Healthy / {totalKeysCount} Total
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      MusicBỏTúi operates 100% free! You can support the server by contributing your free Gemini API key from Google AI Studio. Keys are automatically rotated and failover to prevent rate limits.
                    </p>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline self-start pt-0.5"
                    >
                      Get your free Gemini Key from Google AI Studio <ArrowUpRight size={12} />
                    </a>
                  </div>

                  {/* Add Key Form */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">Contribute a Free Gemini Key</label>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder="Paste your Gemini API key (e.g. AIzaSy...)"
                        value={newKeyInput}
                        onChange={e => setNewKeyInput(e.target.value)}
                        disabled={keySubmitting}
                        className="font-mono text-xs"
                      />
                      <Button
                        size="sm"
                        onClick={handleContributeKey}
                        disabled={keySubmitting || !newKeyInput.trim()}
                        className="shrink-0"
                      >
                        {keySubmitting ? (
                          <><Loader2 size={14} className="animate-spin mr-1" /> Verifying...</>
                        ) : (
                          <><Check size={14} className="mr-1" /> Verify &amp; Add</>
                        )}
                      </Button>
                    </div>
                    {keySubmitError && (
                      <p className="text-xs text-destructive font-medium">{keySubmitError}</p>
                    )}
                    {keySubmitSuccess && (
                      <p className="text-xs text-primary font-medium">{keySubmitSuccess}</p>
                    )}
                  </div>

                  {/* Keys List */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                      <span>Contributed Keys</span>
                      <button
                        type="button"
                        onClick={fetchKeys}
                        className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
                      >
                        <RefreshCw size={11} /> Refresh
                      </button>
                    </div>

                    <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                      {geminiKeys.length === 0 ? (
                        <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-white/10 rounded-xl">
                          No community keys yet. Be the first to contribute a free key!
                        </div>
                      ) : (
                        geminiKeys.map(k => (
                          <div
                            key={k.id}
                            className="p-2.5 rounded-lg border border-white/10 bg-white/5 flex items-center justify-between text-xs gap-3"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  k.status === 'healthy'
                                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                                    : k.status === 'quota_exceeded'
                                    ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                                    : 'bg-rose-400'
                                }`}
                              />
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[11px] font-semibold text-foreground">
                                    {k.masked_key}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    by {k.added_by_username}
                                  </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                                  <span>Used: {k.total_uses} times</span>
                                  {k.status === 'quota_exceeded' && (
                                    <span className="text-amber-400 font-medium">
                                      {k.cooldown_remaining_seconds > 0
                                        ? `Quota full · Resets in ${Math.ceil(k.cooldown_remaining_seconds / 60)}m`
                                        : 'Cooling down'}
                                    </span>
                                  )}
                                  {k.status === 'invalid' && (
                                    <span className="text-rose-400 font-medium">Invalid or Revoked</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {isKeyAdmin && (
                              <button
                                type="button"
                                onClick={() => handleDeleteKey(k.id)}
                                aria-label="Delete key"
                                className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
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

      {/* Overlay: Logged in but not in a voice channel (exclusive to the listening room) */}
      {isAuthLoaded && user && !isVoiceConnected && roomView === 'room' && (
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
                You are signed in as <strong className="text-foreground">{user.username}</strong>, but you are not currently in a voice channel in {currentGuild ? <strong className="text-foreground">{currentGuild.name}</strong> : 'a Discord server where MusicBỏTúi is present'}.
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

              <Button
                variant="outline"
                size="lg"
                className="w-full font-medium flex items-center justify-center gap-2 cursor-pointer"
                onClick={() => setRoomView('schedule')}
              >
                <CalendarDays className="w-4 h-4 text-primary" />
                View Server Calendar & Events
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
      <PlaylistModal
        open={playlistModalOpen}
        onOpenChange={setPlaylistModalOpen}
        currentGuildId={currentGuildId}
        isVoiceConnected={isVoiceConnected}
        initialUrl={playlistModalInitialUrl}
        onSuccess={(count, title) => {
          setNotice(`Added ${count} song(s) from "${title}" to queue`);
          setPlaylistModalInitialUrl('');
        }}
        onError={(msg) => {
          setNotice(msg);
        }}
      />
      <PatchNotesModal
        open={patchNotesOpen}
        onOpenChange={setPatchNotesOpen}
      />
  </TooltipProvider>
}
