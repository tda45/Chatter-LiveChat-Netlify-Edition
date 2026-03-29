// --- CONFIG ---
const SB_URL = "https://dxmqmgxwjrrrhubpnphf.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4bXFtZ3h3anJycmh1YnBucGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTQwOTksImV4cCI6MjA5MDM3MDA5OX0.U_pCKGG3EDCkmjBtUvJSXqv7UUTpN-gML4UHyRl89AM";
const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let currentUser = "";
let isCooldown = false;

// --- 1. FONKSİYONLAR ---

// Eski Mesajları Sil (24 Saat)
async function autoClean() {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabaseClient.from('messages').delete().lt('created_at', yesterday);
}

// Sistem Mesajı Gönder
async function sendSys(txt) {
    await supabaseClient.from('messages').insert([{ user: "SİSTEM", content: txt }]);
}

// Mesaj/Fotoğraf Gönder
async function sendMsg(content = null) {
    const input = document.getElementById("message-input");
    const val = content || input.value.trim();

    if (!val || isCooldown) return;

    isCooldown = true;
    const { error } = await supabaseClient.from('messages').insert([{ user: currentUser, content: val }]);
    
    if (!error && !content) input.value = "";
    setTimeout(() => isCooldown = false, 1000);
}

// --- 2. GİRİŞ İŞLEMİ ---
document.getElementById("join-btn").onclick = async () => {
    const nick = document.getElementById("username-input").value.trim();
    const errorEl = document.getElementById("error-msg");

    if (nick.length < 2) {
        errorEl.innerText = "İsim çok kısa!";
        return;
    }

    // İsim kullanımda mı?
    const { data: userExists } = await supabaseClient.from('active_users').select('username').ilike('username', nick).maybeSingle();
    if (userExists) {
        errorEl.innerText = "Bu isim zaten içeride biri tarafından kullanılıyor.";
        return;
    }

    // Veritabanına ekle
    await autoClean();
    await supabaseClient.from('active_users').insert([{ username: nick }]);
    
    currentUser = nick;
    document.getElementById("login-screen").classList.remove("active");
    document.getElementById("chat-screen").classList.add("active");
    document.getElementById("display-username").innerText = currentUser;

    await sendSys(`${currentUser} katıldı.`);
    
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
    const isSys = data.user === "SİSTEM";
    
    div.className = isSys ? "msg-item system-msg" : "msg-item";
    const time = new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let body = data.content.startsWith("data:image") 
        ? `<img src="${data.content}" style="max-width:100%; border-radius:8px; margin-top:5px; display:block; border:1px solid var(--cyber-red-glow);">`
        : `<span class="m-text">${data.content}</span>`;

    div.innerHTML = `<span class="m-user">${data.user} <small>${time}</small></span>${body}`;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

// --- 4. EKSTRA ÖZELLİKLER ---

// Fotoğraf Yapıştır
document.getElementById("message-input").onpaste = (e) => {
    const item = e.clipboardData.items[0];
    if (item && item.type.includes('image')) {
        const reader = new FileReader();
        reader.onload = (ev) => sendMsg(ev.target.result);
        reader.readAsDataURL(item.getAsFile());
    }
};

// Çıkış Yapınca Sil (Kısıtlı çalışır ama en iyisi budur)
window.onbeforeunload = () => {
    if (currentUser) {
        supabaseClient.from('active_users').delete().eq('username', currentUser);
        sendSys(`${currentUser} ayrıldı.`);
    }
};

// Enter ile gönder
document.getElementById("message-input").onkeydown = (e) => { if(e.key === "Enter") sendMsg(); };
document.getElementById("send-btn").onclick = () => sendMsg();