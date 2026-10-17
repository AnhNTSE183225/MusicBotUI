import { load } from 'js-yaml';

let API_URL = "";
let LOGIN_URL = "";

export async function initConfig() {
    if (API_URL) return; // Already initialized
    try {
        const isLocal = import.meta.env.DEV;
        const configPath = isLocal ? "/config.yml" : "/config.prod.yml";
        
        const configRes = await fetch(configPath);
        if (!configRes.ok) {
            throw new Error(`Failed to load ${configPath}: ${configRes.statusText}`);
        }
        
        const yamlText = await configRes.text();
        const config = load(yamlText) as any;
        
        // Support both old production_api_url and new api_url
        const baseUrl = config.api_url || config.production_api_url || (isLocal ? "http://localhost:8000" : "");
        
        API_URL = baseUrl + "/api";
        LOGIN_URL = baseUrl + "/login";
    } catch (e) {
        console.error("Failed to load configuration", e);
        throw e;
    }
}

export function getLoginUrl() {
    return LOGIN_URL;
}

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
    await initConfig();
    const token = localStorage.getItem('auth_token');
    
    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string> || {})
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    options.headers = headers;
    
    const res = await fetch(`${API_URL}${endpoint}`, options);
    if (res.status === 401 || res.status === 403) {
        throw new Error("Unauthorized");
    }
    if (!res.ok) {
        let msg = `API error: ${res.status}`;
        try {
            const data = await res.json();
            if (data?.detail) {
                msg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
            }
        } catch {
            const body = await res.text().catch(() => '');
            if (body) msg = body;
        }
        throw new Error(msg);
    }
    return res.json();
}

export async function checkAuth() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
        localStorage.setItem('auth_token', token);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    try {
        const userData = await fetchApi("/me");
        return userData.user;
    } catch (e) {
        return null;
    }
}

export interface GuildSession {
    id: string;
    name: string;
    icon?: string | null;
    channel_id?: string;
    channel_name?: string;
    bot_connected: boolean;
    is_admin?: boolean;
}

export async function getGuilds(): Promise<{ guilds: GuildSession[] }> {
    try {
        const data = await fetchApi("/voice_status");
        if (!data || !Array.isArray(data.sessions)) {
            return { guilds: [] };
        }
        const guilds: GuildSession[] = data.sessions.map((s: any) => ({
            id: String(s.guild_id),
            name: s.guild_name || 'Server',
            icon: s.guild_icon || null,
            channel_id: s.channel_id ? String(s.channel_id) : undefined,
            channel_name: s.channel_name || undefined,
            bot_connected: Boolean(s.bot_connected),
            is_admin: Boolean(s.is_admin)
        }));
        return { guilds };
    } catch (e) {
        console.error("Failed to fetch guilds voice status", e);
        return { guilds: [] };
    }
}

export async function getQueue(guildId: string) {
    return await fetchApi(`/queue/${guildId}`);
}

export async function getStreamUrl(guildId: string) {
    await initConfig();
    const token = localStorage.getItem('auth_token');
    return `${API_URL}/stream/${guildId}?token=${token}`;
}

export async function addSong(guildId: string, url: string) {
    return await fetchApi(`/queue/${guildId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
    });
}

export async function controlJoin(guildId: string) {
    return await fetchApi(`/controls/${guildId}/join`, { method: "POST" });
}

export async function controlSkip(guildId: string) {
    return await fetchApi(`/controls/${guildId}/skip`, { method: "POST" });
}

export async function controlStop(guildId: string) {
    return await fetchApi(`/controls/${guildId}/stop`, { method: "POST" });
}

export async function controlPause(guildId: string) {
    return await fetchApi(`/controls/${guildId}/pause`, { method: "POST" });
}

export async function controlResume(guildId: string) {
    return await fetchApi(`/controls/${guildId}/resume`, { method: "POST" });
}

export async function controlLoop(guildId: string) {
    return await fetchApi(`/controls/${guildId}/loop`, { method: "POST" });
}

export async function controlVolume(guildId: string, volume: number) {
    return await fetchApi(`/controls/${guildId}/volume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volume })
    });
}

export async function controlSkipTo(guildId: string, index: number) {
    return await fetchApi(`/controls/${guildId}/skipto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index })
    });
}

export async function controlRemove(guildId: string, index: number) {
    return await fetchApi(`/controls/${guildId}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index })
    });
}

export async function controlClear(guildId: string) {
    return await fetchApi(`/controls/${guildId}/clear`, { method: "POST" });
}

export async function getLyrics(guildId: string) {
    return await fetchApi(`/lyrics/${guildId}`);
}

// ---------------------------------------------------------------------------
// AI Auto-Queue API
// ---------------------------------------------------------------------------

/** A single AI-suggested song returned from the suggest endpoint. */
export interface AISong {
    title: string;
    artist: string;
    duration: number;
    url: string;
    thumbnail: string;
}

/** Configuration stored server-side for a guild's AI Auto-Queue daemon. */
export interface AIAutoQueueConfig {
    enabled: boolean;
    prompt: string;
    count: number;
    threshold: number;
    set_by_name?: string | null;
    set_by_avatar?: string | null;
}

/**
 * Ask the backend (Gemini + yt-dlp) for song suggestions.
 * Returns a preview list — nothing is added to the queue yet.
 */
export async function aiSuggest(
    guildId: string,
    prompt: string,
    count = 5,
): Promise<{ songs: AISong[]; prompt: string }> {
    return await fetchApi(`/ai/${guildId}/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, count }),
    });
}

/** Add a single AI-suggested song to the queue. Accepts song object or url string. */
export async function aiConfirmSong(guildId: string, songOrUrl: AISong | string) {
    const payload = typeof songOrUrl === 'string'
        ? { url: songOrUrl }
        : {
            url: songOrUrl.url,
            title: songOrUrl.title,
            artist: songOrUrl.artist,
            thumbnail: songOrUrl.thumbnail,
            duration: songOrUrl.duration,
        };
    return await fetchApi(`/ai/${guildId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

/** Add a list of AI-suggested songs to the queue in bulk. */
export async function aiConfirmBatch(guildId: string, songs: AISong[]) {
    const payload = {
        songs: songs.map(s => ({
            url: s.url,
            title: s.title,
            artist: s.artist,
            thumbnail: s.thumbnail,
            duration: s.duration,
        }))
    };
    return await fetchApi(`/ai/${guildId}/confirm_batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

/** Fetch the current AI Auto-Queue configuration for a guild. */
export async function getAIAutoQueue(guildId: string): Promise<AIAutoQueueConfig> {
    return await fetchApi(`/ai/${guildId}/autoqueue`);
}

/** Enable / disable AI Auto-Queue daemon and update its parameters. */
export async function setAIAutoQueue(guildId: string, cfg: AIAutoQueueConfig) {
    return await fetchApi(`/ai/${guildId}/autoqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
    });
}

export interface GeminiKeyInfo {
    id: number;
    masked_key: string;
    added_by_user_id: string;
    added_by_username: string;
    added_by_avatar: string | null;
    added_at: number;
    is_active: boolean;
    status: 'healthy' | 'quota_exceeded' | 'invalid';
    status_message: string;
    cooldown_remaining_seconds: number;
    total_uses: number;
    last_used_at: number;
}

export interface GeminiKeysResponse {
    keys: GeminiKeyInfo[];
    total_active: number;
    total_keys: number;
    is_admin: boolean;
}

/** Get all contributed Gemini keys in the pool with health statistics. */
export async function getGeminiKeys(): Promise<GeminiKeysResponse> {
    return await fetchApi('/ai/keys');
}

/** Validate and add a contributed Gemini key to the pool. */
export async function contributeGeminiKey(apiKey: string): Promise<{ status: string; message: string }> {
    return await fetchApi('/ai/keys/contribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
    });
}

/** Delete a Gemini key from the pool (admin only). */
export async function deleteGeminiKey(keyId: number): Promise<{ status: string }> {
    return await fetchApi(`/ai/keys/${keyId}`, {
        method: 'DELETE',
    });
}

