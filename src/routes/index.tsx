import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { AudioLines, ArrowUpRight, Check, ChevronDown, CircleHelp, Headphones, Heart, ListMusic, MoreHorizontal, Music2, Pause, Play, Plus, Radio, Repeat2, Settings2, SkipBack, SkipForward, Square, Trash2, Volume2, VolumeX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { checkAuth, getLoginUrl, getGuilds, getQueue, getStreamUrl, addSong, controlJoin, controlSkip, controlStop, controlPause, controlResume, controlLoop, controlVolume, controlSkipTo, controlRemove, controlClear } from '@/lib/api'

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
  const [liked, setLiked] = useState(false)
  const [volume, setVolume] = useState(75)
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<'connection' | 'help' | null>(null)
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<'queue' | 'history'>('queue')
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

  useEffect(() => {
    if (queueIndex >= 0) {
      setCurrentPage(Math.floor(queueIndex / ITEMS_PER_PAGE) + 1);
    }
  }, [queueIndex]);

  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  useEffect(() => {
    if (!playing || stopped) return;
    const timer = setInterval(() => setPosition(p => p + 1), 1000);
    return () => clearInterval(timer);
  }, [playing, stopped]);

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
          } catch (err) {}
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

  const displayCurrent = current || idleTrack;
  const total = queue.reduce((sum, track) => sum + track.duration, 0)
  
  const totalPages = Math.ceil(queue.length / ITEMS_PER_PAGE) || 1;
  // Ensure currentPage is within bounds if queue size changes
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedQueue = queue.slice((validCurrentPage - 1) * ITEMS_PER_PAGE, validCurrentPage * ITEMS_PER_PAGE);
  
  const currentGuildName = guilds.find(g => g.id === currentGuildId)?.name || 'The Listening Room';

  const handleSummon = async () => {
      if (!currentGuildId) return;
      try {
          await controlJoin(currentGuildId);
          setSummoned(true);
      } catch(e) {
          setNotice('Failed to join channel');
      }
  }

  const handleSkip = async () => {
      if (!currentGuildId) return;
      try { await controlSkip(currentGuildId); } catch(e: any) { setNotice(e.message || 'Action failed'); }
  }
  const handleStop = async () => {
      if (!currentGuildId) return;
      try { await controlStop(currentGuildId); } catch(e: any) { setNotice(e.message || 'Action failed'); }
  }
  const handleTogglePlay = async () => {
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
  }
  const handleLoop = async () => {
      if (!currentGuildId) return;
      try {
          await controlLoop(currentGuildId);
      } catch(e: any) {
          setNotice(e.message || 'Action failed');
      }
  }
  const handleVolume = async (val: number) => {
      if (!currentGuildId) return;
      setVolume(val);
      try {
          await controlVolume(currentGuildId, val);
      } catch(e: any) {
          setNotice(e.message || 'Action failed');
      }
  }
  
  const handleAddSong = async (e: React.FormEvent) => {
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
  }

  const handleSkipTo = async (index: number) => {
      if (!currentGuildId) return;
      try { await controlSkipTo(currentGuildId, index + 1); } catch(e: any) { setNotice(e.message || 'Action failed'); }
  }

  const handleRemove = async (index: number) => {
      if (!currentGuildId) return;
      try { await controlRemove(currentGuildId, index + 1); } catch(e: any) { setNotice(e.message || 'Action failed'); }
  }

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
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="user-avatar" aria-label="Account menu">{user.username.charAt(0).toUpperCase()}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Account · {user.username}</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem onClick={() => {localStorage.removeItem('auth_token'); window.location.reload()}}>Logout</DropdownMenuItem></DropdownMenuContent></DropdownMenu></>
           )}
        </div>
      </header>

      <main className="room-main" style={(!user && isAuthLoaded) ? { filter: 'blur(12px)', pointerEvents: 'none', userSelect: 'none' } : {}}>
        <div className="page-intro"><div><div className="eyebrow">GOOD MUSIC. BETTER COMPANY.</div><h1>Your listening room<span className="heading-dot">.</span></h1></div></div>

        <div className="music-layout">
          <section className="player-panel glass-surface" aria-label="Music player">
            <div className="section-topline"><div className="section-label"><span className={`equalizer ${playing && !stopped ? 'is-playing' : ''}`}><i /><i /><i /><i /></span>{stopped ? 'PLAYBACK STOPPED' : playing ? 'NOW PLAYING' : 'PAUSED'}</div><span className="source-tag"><span className="source-dot" /> YouTube</span></div>
            <div className="artwork-stage"><img key={displayCurrent.id} className="album-art" src={displayCurrent.image} alt={`${displayCurrent.title} album artwork`} width={1024} height={1024} /><span className="album-caption">{displayCurrent.album}</span></div>
            <div className="track-details"><div><h2>{displayCurrent.title}</h2><p>{displayCurrent.artist}</p></div></div>
            <div className="track-context">{displayCurrent.requestedAvatar ? <img src={displayCurrent.requestedAvatar} alt="" className="tiny-avatar !p-0 object-cover" /> : <span className="tiny-avatar">{displayCurrent.requestedBy.charAt(0).toUpperCase() || 'U'}</span>}Added by {displayCurrent.requestedBy}<span className="context-dot">·</span><span>{displayCurrent.album}</span></div>
            <div className="progress-area"><div className="progress-track" role="progressbar" aria-label="Track progress" aria-valuenow={stopped ? 0 : position} aria-valuemin={0} aria-valuemax={displayCurrent.duration}><progress value={stopped ? 0 : position} max={displayCurrent.duration} /></div><div className="time-labels"><span>{formatTime(stopped ? 0 : position)}</span><span>{formatTime(displayCurrent.duration)}</span></div></div>
            <div className="playback-controls">
                <IconControl label={loop ? 'Disable loop' : 'Loop track'} active={loop} onClick={handleLoop}><Repeat2 /></IconControl>
                <IconControl label="Previous track" disabled><SkipBack className="fill-current opacity-50" /></IconControl>
                <div className="relative">
                  <Button size="icon" className="play-button mx-2" aria-label={playing ? 'Pause playback' : 'Play playback'} onClick={handleTogglePlay}>{playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}</Button>
                  <span className="absolute -top-1 -right-0 text-[10px] bg-black/40 text-white px-1 py-[1px] rounded pointer-events-none border border-white/10">{playing ? pauseVotes : resumeVotes}/{playing ? (pauseVotesReq || 1) : (resumeVotesReq || 1)}</span>
                </div>
                <div className="relative">
                  <IconControl label="Skip track" onClick={handleSkip}><SkipForward className="fill-current" /></IconControl>
                  <span className="absolute -top-2 -right-3 text-[10px] bg-black/40 text-white px-1 py-[1px] rounded pointer-events-none border border-white/10">{skipVotes}/{skipVotesReq || 1}</span>
                </div>
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="More playback options"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onClick={() => setNotice(`${displayCurrent.title} · ${displayCurrent.artist}`)}>Track details</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            </div>
            <div className="volume-controls"><IconControl label={volume ? 'Mute volume' : 'Unmute volume'} onClick={() => handleVolume(volume ? 0 : 75)}>{volume ? <Volume2 /> : <VolumeX />}</IconControl><Slider aria-label="Volume" value={[volume]} onValueChange={value => handleVolume(value[0] ?? 0)} max={100} step={1} /><span className="volume-value">{volume}%</span></div>
            <div className="player-footer"><Headphones size={14} /><span>Playing in <strong>{currentGuildName}</strong></span><span className="footer-quality">HIGH QUALITY</span></div>
          </section>

          <section className="queue-panel glass-surface" aria-label="Track queue">
            <div className="queue-heading"><div><h2>Up next <span className="queue-count">{queue.length}</span></h2><p>Your shared soundtrack.</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Queue options" className="text-muted-foreground"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={async () => { if (currentGuildId) { try { await controlClear(currentGuildId); setNotice('Queue cleared'); } catch(e: any) { setNotice(e.message || 'Failed to clear queue'); } } }}><Trash2 />Clear queue</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
            <form className="add-track" onSubmit={handleAddSong}><Music2 size={18} /><Input aria-label="Song search or URL" placeholder="Paste a link or search for a song" value={query} onChange={event => setQuery(event.target.value)} /><Button size="icon" aria-label="Add to queue" disabled={!query.trim()} type="submit"><Plus /></Button></form>
            <div className="queue-tabs"><Button variant="ghost" className="queue-tab active-tab">Queue</Button><span>{`${Math.round(total / 60)} min`}</span></div>
            <div className="queue-list">{paginatedQueue.map((track) => <div className="queue-row" key={track.id}><span className="track-number">{String((track.originalIndex ?? 0) + 1).padStart(2, '0')}</span><div className="queue-art"><img src={track.image} alt="" loading="lazy" width={56} height={56} /><Button variant="ghost" size="icon" aria-label={`Play ${track.title} next`} className="queue-play" onClick={() => handleSkipTo(track.originalIndex ?? 0)}><Play className="fill-current" /></Button></div><div className="queue-track-info"><h3>{track.title}</h3><p>{track.artist}</p><span className="flex items-center gap-1">Added by {track.requestedAvatar ? <img src={track.requestedAvatar} alt="" className="w-4 h-4 rounded-full object-cover" /> : null} {track.requestedBy}</span></div><span className="track-duration">{formatTime(track.duration)}</span><IconControl label={`Remove ${track.title}`} onClick={() => handleRemove(track.originalIndex ?? 0)} className="remove-track"><X size={15} /></IconControl></div>)}{!queue.length && <div className="empty-queue"><ListMusic size={30} /><h3>A little quiet in here.</h3><p>No tracks in the queue.</p></div>}</div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white" disabled={validCurrentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Previous</Button>
                <span className="text-xs text-muted-foreground font-medium">Page {validCurrentPage} of {totalPages}</span>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white" disabled={validCurrentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Next</Button>
              </div>
            )}
            <div className="queue-bottom"><ListMusic size={15} /><span>{queue.length} tracks in the queue</span><span className="queue-bottom-dot" /><span>Made for sharing</span></div>
          </section>
        </div>
        <div className="session-band"><div className="voice-icon"><Radio size={19} /></div><div className="session-info"><strong>{summoned ? `Together in ${currentGuildName}` : `Waiting in ${currentGuildName}`}</strong><span>{summoned ? `${currentGuildName} · Listeners` : 'MusicBot is not in this channel'}</span></div><div className="session-status">{summoned ? <><span className="status-dot" />Connected</> : <Button size="sm" onClick={handleSummon}><Plus size={14} />Summon bot</Button>}</div><span className="session-divider" />{summoned && <Button variant="ghost" className="session-menu relative hover:text-red-400 hover:bg-red-500/10" style={{marginRight: '8px', color: '#ef4444'}} onClick={handleStop}><Square size={15} className="mr-1.5" fill="currentColor" />Stop Bot<span className="absolute -top-1.5 -right-1.5 text-[9px] font-medium bg-red-500/20 text-red-400 px-1 py-[1px] rounded pointer-events-none border border-red-500/20">{stopVotes}/{stopVotesReq || 1}</span></Button>}{!summoned && <Button variant="ghost" className="session-menu" onClick={handleSummon}><Headphones size={15} />Join channel</Button>}</div>
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
