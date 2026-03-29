// --- CONFIG ---
const SB_URL = "https://dxmqmgxwjrrrhubpnphf.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4bXFtZ3h3anJycmh1YnBucGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTQwOTksImV4cCI6MjA5MDM3MDA5OX0.U_pCKGG3EDCkmjBtUvJSXqv7UUTpN-gML4UHyRl89AM";
const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let currentUser = "";
let isCooldown = false;
let heartbeatInterval;

// --- 1. FONKSİYONLAR ---

// 24 Saatlik Temizlik
async function autoClean() {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabaseClient.from('messages').delete().lt('created_at', yesterday);
}

// Kalp Atışı (Ben buradayım sinyali)
function startHeartbeat() {
    heartbeatInterval = setInterval(async () => {
        if (currentUser) {
            await supabaseClient
                .from('active_users')
                .update({ last_seen: new Date().toISOString() })
                .eq('username', currentUser);
        }
    }, 5000); // her 5 saniyede bir güncelle
}

async function sendSys(txt) {
    await supabaseClient.from('messages').insert([{ user: "SİSTEM", content: txt }]);
}

async function sendMsg(content = null) {
    const input = document.getElementById("message-input");
    const val = content || input.value.trim();
    if (!val || isCooldown) return;
    isCooldown = true;
    const { error } = await supabaseClient.from('messages').insert([{ user: currentUser, content: val }]);
    if (!error && !content) input.value = "";
    setTimeout(() => isCooldown = false, 1000);
}

// --- 2. GİRİŞ İŞLEMİ (AKILLI KONTROL) ---
document.getElementById("join-btn").onclick = async () => {
    const nick = document.getElementById("username-input").value.trim();
    const errorEl = document.getElementById("error-msg");

    if (nick.length < 2) {
        errorEl.innerText = "İsim çok kısa!";
        return;
    }

    // İsim Kontrolü + Hayalet Kullanıcı Temizliği
    const { data: userData } = await supabaseClient
        .from('active_users')
        .select('username, last_seen')
        .ilike('username', nick)
        .maybeSingle();

    if (userData) {
        const lastSeen = new Date(userData.last_seen);
        const now = new Date();
        const diff = (now - lastSeen) / 1000; // saniye cinsinden fark

        if (diff < 15) { // Eğer son 15 saniye içinde aktifse, gerçekten içeridedir.
            errorEl.innerText = "Bu isim şu an aktif bir kullanıcı tarafından kullanılıyor.";
            return;
        } else {
            // Eğer 15 saniyedir ses yoksa, eski kaydı sil ki yeni giriş yapılsın
            await supabaseClient.from('active_users').delete().eq('username', nick);
        }
    }

    await autoClean();
    await supabaseClient.from('active_users').insert([{ username: nick, last_seen: new Date().toISOString() }]);
    
    currentUser = nick;
    document.getElementById("login-screen").classList.remove("active");
    document.getElementById("chat-screen").classList.add("active");
    document.getElementById("display-username").innerText = currentUser;

    await sendSys(`${currentUser} katıldı.`);
    
    startHeartbeat(); // Kalp atışını başlat
    loadMsgs();
    listenMsgs();
};

// --- 3. REALTIME & LİSTELEME ---
function listenMsgs() {
    supabaseClient
        .channel('any')
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
    const div = document.createElement("div");
    div.className = data.user === "SİSTEM" ? "msg-item system-msg" : "msg-item";
    const time = new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let body = data.content.startsWith("data:image") 
        ? `<img src="${data.content}" style="max-width:100%; border-radius:8px; display:block; border:1px solid var(--cyber-red-glow);">`
        : `<span class="m-text">${data.content}</span>`;

    div.innerHTML = `<span class="m-user">${data.user} <small>${time}</small></span>${body}`;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

// --- 4. EVENTLER ---
document.getElementById("message-input").onpaste = (e) => {
    const item = e.clipboardData.items[0];
    if (item && item.type.includes('image')) {
        const reader = new FileReader();
        reader.onload = (ev) => sendMsg(ev.target.result);
        reader.readAsDataURL(item.getAsFile());
    }
};

// Çıkışta temizlik (Bonus)
window.onbeforeunload = () => {
    if (currentUser) {
        supabaseClient.from('active_users').delete().eq('username', currentUser);
    }
};

document.getElementById("message-input").onkeydown = (e) => { if(e.key === "Enter") sendMsg(); };
document.getElementById("send-btn").onclick = () => sendMsg();