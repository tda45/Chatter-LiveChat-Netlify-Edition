const SB_URL = "https://dxmqmgxwjrrrhubpnphf.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4mXFtZ3h3anJycmh1YnBucGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTQwOTksImV4cCI6MjA5MDM3MDA5OX0.U_pCKGG3EDCkmjBtUvJSXqv7UUTpN-gML4UHyRl89AM";
const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let currentUser = localStorage.getItem("chatter_nick") || "";
let lastSentTime = 0;

// 1. Mobil Kontrol
if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
    window.location.href = "engel.html";
}

// 2. Giriş Fonksiyonu
document.getElementById("join-btn").onclick = async () => {
    const nick = document.getElementById("username-input").value.trim();
    if (nick.length < 2) return;

    // Kullanıcı adı kontrolü
    const { data } = await supabaseClient.from('active_users').select().ilike('username', nick);
    
    if (data && data.length > 0) {
        document.getElementById("error-msg").innerText = "Bu İsim Zaten Kullanımda";
        return;
    }

    currentUser = nick;
    localStorage.setItem("chatter_nick", nick);
    await supabaseClient.from('active_users').insert([{ username: nick.toLowerCase() }]);
    
    initChat();
};

function initChat() {
    document.getElementById("login-screen").classList.remove("active");
    document.getElementById("chat-screen").classList.add("active");
    document.getElementById("display-username").innerText = currentUser;
    
    // Geçmiş mesajları yükle
    loadMessages();
    // Realtime dinle
    subscribeMessages();
}

async function loadMessages() {
    const { data } = await supabaseClient.from('messages').select().order('created_at', { ascending: true }).limit(50);
    if (data) data.forEach(msg => renderMessage(msg));
}

function subscribeMessages() {
    supabaseClient
        .channel('room1')
        .on('postgres_changes', { event: 'INSERT', table: 'messages' }, payload => {
            renderMessage(payload.new);
        })
        .subscribe();
}

async function sendMessage() {
    const now = Date.now();
    if (now - lastSentTime < 2000) {
        alert("Spam yapma! 2 saniye bekle.");
        return;
    }

    const input = document.getElementById("message-input");
    const val = input.value.trim();
    
    if (val) {
        lastSentTime = now;
        await supabaseClient.from('messages').insert([{ user: currentUser, content: val }]);
        input.value = "";
    }
}

function renderMessage(data) {
    const area = document.getElementById("chat-messages");
    const time = new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const div = document.createElement("div");
    div.className = "msg-item";
    div.innerHTML = `<span class="m-time">${time}</span><span class="m-user">${data.user}:</span><span class="m-text">${data.content}</span>`;
    
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

// Event Listeners
document.getElementById("send-btn").onclick = sendMessage;
document.getElementById("message-input").onkeyup = (e) => { if(e.key === "Enter") sendMessage(); };