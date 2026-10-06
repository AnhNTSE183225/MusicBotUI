let API_URL = "";
let LOGIN_URL = "";

// Elements
const loginContainer = document.getElementById("login-container");
const appContainer = document.getElementById("app-container");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");

const userAvatar = document.getElementById("user-avatar");
const usernameEl = document.getElementById("username");
const serverList = document.getElementById("server-list");

const noServerSelected = document.getElementById("no-server-selected");
const serverDashboard = document.getElementById("server-dashboard");
const serverIcon = document.getElementById("server-icon");
const serverNameEl = document.getElementById("server-name");

const currentSongTitle = document.getElementById("current-song-title");
const queueList = document.getElementById("queue-list");
const songUrlInput = document.getElementById("song-url");
const btnAdd = document.getElementById("btn-add");

const btnStop = document.getElementById("btn-stop");
const btnPause = document.getElementById("btn-pause");
const btnSkip = document.getElementById("btn-skip");
const btnLoop = document.getElementById("btn-loop");
const volumeSlider = document.getElementById("volume-slider");
const volumeValue = document.getElementById("volume-value");

let currentGuildId = null;
let pollInterval = null;
let currentUserId = null;
let currentIsAdmin = false;

// Helper to make API calls with credentials
async function fetchApi(endpoint, options = {}) {
    const token = localStorage.getItem('auth_token');
    if (token) {
        if (!options.headers) options.headers = {};
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    const res = await fetch(`${API_URL}${endpoint}`, options);
    if (res.status === 401 || res.status === 403) {
        showLogin();
        throw new Error("Unauthorized");
    }
    if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
    }
    return res.json();
}

function showLogin() {
    loginContainer.classList.remove("hidden");
    appContainer.classList.add("hidden");
    if (pollInterval) clearInterval(pollInterval);
}

function showApp() {
    loginContainer.classList.add("hidden");
    appContainer.classList.remove("hidden");
}

async function init() {
    try {
        const configRes = await fetch("config.yml");
        const yamlText = await configRes.text();
        const config = jsyaml.load(yamlText);
        
        const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        const baseUrl = isLocal ? "http://localhost:8000" : config.production_api_url;
        
        API_URL = baseUrl + "/api";
        LOGIN_URL = baseUrl + "/login";
    } catch (e) {
        console.error("Failed to load config.yml", e);
        alert("Failed to load config.yml. Make sure it exists.");
        return;
    }

    // Parse token from URL if redirected from login
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
        localStorage.setItem('auth_token', token);
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    try {
        const userData = await fetchApi("/me");
        const user = userData.user;
        currentUserId = parseInt(user.id);
        
        usernameEl.textContent = user.username;
        userAvatar.src = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
        
        showApp();
        loadGuilds();
    } catch (e) {
        console.error("Not logged in or error:", e);
        showLogin();
    }
}

async function loadGuilds() {
    try {
        const data = await fetchApi("/voice_status");
        serverList.innerHTML = "";
        
        if (data.sessions.length === 0) {
            // User is not in any voice channels
            document.getElementById("no-server-selected").innerHTML = `
                <i class="fas fa-headphones"></i>
                <h2>Not in a Voice Channel</h2>
                <p>You must be in a Discord voice channel (in a server that has the bot) to use this UI.</p>
                <p style="font-size: 14px; margin-top: 10px;">Join a voice channel in Discord, then refresh this page.</p>
            `;
            return;
        }

        data.sessions.forEach(session => {
            const li = document.createElement("li");
            li.className = "server-item";
            li.dataset.id = session.guild_id;
            
            const iconUrl = session.guild_icon ? session.guild_icon : 'https://cdn.discordapp.com/embed/avatars/1.png';
            
            li.innerHTML = `
                <img src="${iconUrl}" alt="${session.guild_name}" class="server-list-icon">
                <div style="display:flex; flex-direction:column; overflow:hidden;">
                    <span style="white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${session.guild_name}</span>
                    <span style="font-size: 11px; color: var(--text-muted);">${session.channel_name}</span>
                </div>
            `;
            
            li.addEventListener("click", () => selectGuild(session.guild_id, session.guild_name, iconUrl, session.channel_name, session.bot_connected, session.is_admin));
            serverList.appendChild(li);
        });
        
        // Auto select first session
        const first = data.sessions[0];
        selectGuild(first.guild_id, first.guild_name, first.guild_icon || 'https://cdn.discordapp.com/embed/avatars/1.png', first.channel_name, first.bot_connected, first.is_admin);

    } catch (e) {
        console.error("Failed to load voice status", e);
    }
}

function selectGuild(id, name, iconUrl, channelName, botConnected, isAdmin) {
    document.querySelectorAll(".server-item").forEach(el => el.classList.remove("active"));
    const activeItem = document.querySelector(`.server-item[data-id="${id}"]`);
    if(activeItem) activeItem.classList.add("active");
    
    currentGuildId = id;
    currentIsAdmin = isAdmin;
    serverNameEl.textContent = name;
    serverIcon.src = iconUrl;
    document.getElementById("channel-name").textContent = channelName;
    
    noServerSelected.classList.add("hidden");
    serverDashboard.classList.remove("hidden");
    
    const btnJoin = document.getElementById("btn-join");
    const playerArea = document.getElementById("player-area");
    const adminControls = document.getElementById("admin-controls-section");
    
    if (!botConnected) {
        btnJoin.classList.remove("hidden");
        playerArea.classList.add("hidden");
    } else {
        btnJoin.classList.add("hidden");
        playerArea.classList.remove("hidden");
        
        if (isAdmin) {
            adminControls.classList.remove("hidden");
        } else {
            adminControls.classList.add("hidden");
        }
    }
    
    if (pollInterval) clearInterval(pollInterval);
    pollQueue();
    pollInterval = setInterval(pollQueue, 3000); // Poll every 3 seconds
}

// Attach event listener for the new Join button
document.getElementById("btn-join").addEventListener("click", async () => {
    if (!currentGuildId) return;
    
    const btnJoin = document.getElementById("btn-join");
    btnJoin.disabled = true;
    btnJoin.textContent = "Joining...";
    
    try {
        await fetchApi(`/controls/${currentGuildId}/join`, { method: "POST" });
        // After joining, reload the list to update bot_connected
        setTimeout(() => {
            loadGuilds();
            btnJoin.disabled = false;
            btnJoin.textContent = "Summon Bot";
        }, 1500);
    } catch (e) {
        alert("Failed to join voice channel: " + e.message);
        btnJoin.disabled = false;
        btnJoin.textContent = "Summon Bot";
    }
});

async function pollQueue() {
    if (!currentGuildId) return;
    
    try {
        const state = await fetchApi(`/queue/${currentGuildId}`);
        updateDashboard(state);
    } catch (e) {
        console.error("Failed to poll queue", e);
    }
}

function updateDashboard(state) {
    if (state.current) {
        currentSongTitle.textContent = state.current.title;
    } else {
        currentSongTitle.textContent = "Nothing playing";
    }
    
    let vol = state.volume;
    if (vol <= 1.0 && vol > 0 || vol === 0 || vol === 1) {
        vol = Math.round(vol * 100);
    } else if (vol === undefined) {
        vol = 100;
    }
    volumeSlider.value = vol;
    volumeValue.textContent = `${vol}%`;
    
    if (state.loop) {
        btnLoop.style.color = "var(--primary)";
    } else {
        btnLoop.style.color = "var(--text-normal)";
    }
    
    if (state.is_paused) {
        btnPause.innerHTML = `<i class="fas fa-play"></i> Resume`;
        btnPause.style.color = "var(--primary)";
        btnPause.dataset.state = "paused";
    } else {
        btnPause.innerHTML = `<i class="fas fa-pause"></i> Pause`;
        btnPause.style.color = "var(--text-normal)";
        btnPause.dataset.state = "playing";
    }
    
    queueList.innerHTML = "";
    
    if (state.queue && state.queue.length > 0) {
        state.queue.forEach((song, idx) => {
            const isPlaying = (state.queue_index !== undefined && idx === state.queue_index) || 
                              (state.queue_index === undefined && state.current && song.title === state.current.title);

            const li = document.createElement("li");
            li.className = "queue-item";
            
            if (isPlaying) {
                li.style.backgroundColor = "var(--bg-tertiary)";
                li.style.borderLeft = "3px solid var(--primary)";
            }
            
            const isOwner = song.requester_id === currentUserId;
            const canRemove = currentIsAdmin || isOwner;
            
            let actionsHTML = `<div class="queue-actions">`;
            if (currentIsAdmin) {
                actionsHTML += `<button class="btn small primary" onclick="skiptoSong(${idx + 1})" title="Skip to here"><i class="fas fa-play"></i></button>`;
            }
            if (canRemove) {
                actionsHTML += `<button class="btn small danger" onclick="removeSong(${idx + 1})" title="Remove"><i class="fas fa-trash"></i></button>`;
            }
            actionsHTML += `</div>`;
            
            const requester = song.requester_handle || "unknown";
            
            let titleHtml = isPlaying ? `<span style="color: var(--primary);">${idx + 1}. ${song.title} (Playing)</span>` : `${idx + 1}. ${song.title}`;
            
            li.innerHTML = `
                <div style="display:flex; flex-direction:column; overflow:hidden;">
                    <span class="queue-title">${titleHtml}</span>
                    <span style="font-size: 12px; color: var(--text-muted);">Added by: ${requester}</span>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span class="queue-duration">${formatDuration(song.duration)}</span>
                    ${actionsHTML}
                </div>
            `;
            queueList.appendChild(li);
        });
    } else {
        queueList.innerHTML = "<li class='queue-item'>Queue is empty</li>";
    }
}

function formatDuration(seconds) {
    if (!seconds) return "??:??";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Event Listeners
loginBtn.addEventListener("click", () => {
    window.location.href = LOGIN_URL;
});

logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("auth_token");
    showLogin();
});

btnAdd.addEventListener("click", async () => {
    const url = songUrlInput.value.trim();
    if (!url || !currentGuildId) return;
    
    btnAdd.disabled = true;
    btnAdd.textContent = "Adding...";
    
    try {
        await fetchApi(`/queue/${currentGuildId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url })
        });
        songUrlInput.value = "";
        pollQueue();
    } catch (e) {
        alert("Failed to add song: " + e.message);
    } finally {
        btnAdd.disabled = false;
        btnAdd.textContent = "Add to Queue";
    }
});

btnSkip.addEventListener("click", async () => {
    if (!currentGuildId) return;
    try {
        await fetchApi(`/controls/${currentGuildId}/skip`, { method: "POST" });
        setTimeout(pollQueue, 1000);
    } catch (e) {
        console.error(e);
    }
});

btnStop.addEventListener("click", async () => {
    if (!currentGuildId) return;
    try {
        await fetchApi(`/controls/${currentGuildId}/stop`, { method: "POST" });
        setTimeout(pollQueue, 1000);
    } catch (e) {
        console.error(e);
    }
});

btnPause.addEventListener("click", async () => {
    if (!currentGuildId) return;
    const isPaused = btnPause.dataset.state === "paused";
    const endpoint = isPaused ? `/controls/${currentGuildId}/resume` : `/controls/${currentGuildId}/pause`;
    try {
        await fetchApi(endpoint, { method: "POST" });
        setTimeout(pollQueue, 500);
    } catch (e) {
        console.error(e);
    }
});

btnLoop.addEventListener("click", async () => {
    if (!currentGuildId) return;
    try {
        await fetchApi(`/controls/${currentGuildId}/loop`, { method: "POST" });
        setTimeout(pollQueue, 1000);
    } catch (e) {
        console.error(e);
    }
});

volumeSlider.addEventListener("change", async () => {
    if (!currentGuildId) return;
    const vol = parseInt(volumeSlider.value);
    try {
        await fetchApi(`/controls/${currentGuildId}/volume`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ volume: vol })
        });
        volumeValue.textContent = `${vol}%`;
    } catch (e) {
        console.error(e);
    }
});

// Start
init();

async function skiptoSong(index) {
    if (!currentGuildId) return;
    try {
        await fetchApi(`/controls/${currentGuildId}/skipto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index })
        });
        setTimeout(pollQueue, 1000);
    } catch (e) {
        console.error(e);
    }
}

async function removeSong(index) {
    if (!currentGuildId) return;
    try {
        await fetchApi(`/controls/${currentGuildId}/remove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index })
        });
        setTimeout(pollQueue, 1000);
    } catch (e) {
        console.error(e);
    }
}

