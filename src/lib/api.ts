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
        const body = await res.text().catch(() => '');
        throw new Error(body || `API error: ${res.status}`);
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

export async function getGuilds() {
    const data = await fetchApi("/voice_status");
    // Format the response so that it aligns with what the UI expects for guilds
    // The UI expects an array of guilds with id, name, and bot_connected
    const guilds = data.sessions.map((s: any) => ({
        id: s.guild_id,
        name: s.guild_name,
        bot_connected: s.bot_connected
    }));
    return { guilds };
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

