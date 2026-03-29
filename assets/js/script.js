// --- CONFIG ---
const SB_URL = "https://dxmqmgxwjrrrhubpnphf.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4bXFtZ3h3anJycmh1YnBucGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTQwOTksImV4cCI6MjA5MDM3MDA5OX0.U_pCKGG3EDCkmjBtUvJSXqv7UUTpN-gML4UHyRl89AM";
const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let currentUser = "";
let isCooldown = false;
let heartbeatInterval;

// --- 1. SİSTEM FONKSİYONLARI ---

async function autoClean() {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabaseClient.from('messages').delete().lt('created_at', yesterday);
}

// Kalp Atışı: Her 2 saniyede bir "ben buradayım" sinyali gönderir
function startHeartbeat() {
    heartbeatInterval = setInterval(async () => {
        if (currentUser) {
            await supabaseClient
                .from('active_users')
                .update({ last_seen: new Date().toISOString() })
                .eq('username', currentUser);
        }
    }, 2000); 
}

// Sistem Mesajı Gönderme
async function sendSys(txt) {
    await supabaseClient.from('messages').insert([{ user: "SİSTEM", content: txt }]);
}

// MESAJ GÖNDERME VE SPAM FİLTRESİ
async function sendMsg(content = null) {
    const input = document.getElementById("message-input");
    const overlay = document.getElementById("spam-overlay");
    const val = content || input.value.trim();

    if (!val) return;

    // Spam Kontrolü
    if (isCooldown) {
        overlay.classList.add("show");
        setTimeout(() => overlay.classList.remove("show"), 2000);
        return;
    }

    isCooldown = true;
    input.placeholder = "Gönderiliyor...";

    const { error } = await supabaseClient.from('messages').insert([{ user: currentUser, content: val }]);
    
    if (!error && !content) {
        input.value = "";
    }

    // 1.5 saniye sonra tekrar mesaj atabilir
    setTimeout(() => {
        isCooldown = false;
        input.placeholder = "Mesaj yaz...";
    }, 1500);
}

// --- 2. GİRİŞ İŞLEMİ (AKILLI KONTROL) ---
document.getElementById("join-btn").onclick = async () => {
    const nick = document.getElementById("username-input").value.trim();
    const errorEl = document.getElementById("error-msg");

    if (nick.length < 2) {
        errorEl.innerText = "İsim çok kısa!";
        return;
    }

    // İsim kullanımda mı kontrol et + Hayalet temizliği
    const { data: userData } = await supabaseClient
        .from('active_users')
        .select('username, last_seen')
        .ilike('username', nick)
        .maybeSingle();

    if (userData) {
        const lastSeen = new Date(userData.last_seen);
        const now = new Date();
        const diff = (now - lastSeen) / 1000;

        // Eğer son 5 saniyedir sinyal yoksa kullanıcıyı "ölü" say ve sil
        if (diff < 5) { 
            errorEl.innerText = "Bu isim aktif. Lütfen 5 sn bekleyin.";
            return;
        } else {
            await supabaseClient.from('active_users').delete().eq('username', nick);
        }
    }

    await autoClean();
    const { error: loginError } = await supabaseClient
        .from('active_users')
        .insert([{ username: nick, last_seen: new Date().toISOString() }]);
    
    if (loginError) {
        errorEl.innerText = "Giriş yapılamadı!";
        return;
    }

    currentUser = nick;
    document.getElementById("login-screen").classList.remove("active");
    document.getElementById("chat-screen").classList.add("active");
    document.getElementById("display-username").innerText = currentUser;

    await sendSys(`${currentUser} sunucuya katıldı.`);
    
    startHeartbeat(); 
    loadMsgs();
    listenMsgs();
};

// --- 3. REALTIME & RENDER ---
function listenMsgs() {
    supabaseClient
        .channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', table: 'messages' }, payload => render(payload.new))
        .subscribe();
}

async function loadMsgs() {
    const { data } = await supabaseClient.from('messages').select('*').order('created_at', { ascending: true }).limit(50);
    const area = document.getElementById("chat-messages");
    area.innerHTML = "";
    if (data) data.forEach(m => render(m));
}

function render(data) {
    const area = document.getElementById("chat-messages");
    if (!area) return;

    const div = document.createElement("div");
    const isSys = data.user === "SİSTEM";
    div.className = isSys ? "msg-item system-msg" : "msg-item";
    
    const time = new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let body = data.content.startsWith("data:image") 
        ? `<img src="${data.content}" class="chat-img">`
        : `<span class="m-text">${data.content}</span>`;

    // Sistem mesajıysa farklı, normalse farklı render et
    if (isSys) {
        div.innerHTML = `<span class="m-text">${data.content}</span>`;
    } else {
        div.innerHTML = `<span class="m-user">${data.user} <small>${time}</small></span>${body}`;
    }
    
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

// --- 4. EKSTRALAR ---

// CTRL+V Fotoğraf Yapıştırma
document.getElementById("message-input").onpaste = (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            const reader = new FileReader();
            reader.onload = (ev) => sendMsg(ev.target.result);
            reader.readAsDataURL(items[i].getAsFile());
        }
    }
};

// Sayfa kapanırken silme emri gönder
window.onbeforeunload = () => {
    if (currentUser) {
        supabaseClient.from('active_users').delete().eq('username', currentUser);
    }
};

document.getElementById("message-input").onkeydown = (e) => { if(e.key === "Enter") sendMsg(); };
document.getElementById("send-btn").onclick = () => sendMsg();