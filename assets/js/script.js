const SB_URL = "https://dxmqmgxwjrrrhubpnphf.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4bXFtZ3h3anJycmh1YnBucGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTQwOTksImV4cCI6MjA5MDM3MDA5OX0.U_pCKGG3EDCkmjBtUvJSXqv7UUTpN-gML4UHyRl89AM";

const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let currentUser = "";
let isCooldown = false;

// 1. GİRİŞ VE HOŞGELDİN MESAJI
document.getElementById("join-btn").onclick = async () => {
    const inputField = document.getElementById("username-input");
    const errorEl = document.getElementById("error-msg");
    const nick = inputField.value.trim();

    if (nick.length < 2) {
        errorEl.innerText = "İsim çok kısa!";
        return;
    }

    // Kullanıcı Adı Kontrolü
    const { data: existingUser } = await supabaseClient
        .from('active_users')
        .select('username')
        .ilike('username', nick)
        .maybeSingle();

    if (existingUser) {
        errorEl.innerText = "Bu İsim Zaten Kullanımda";
        return;
    }

    // Kayıt ekle
    await supabaseClient.from('active_users').insert([{ username: nick }]);

    currentUser = nick;
    document.getElementById("login-screen").classList.remove("active");
    document.getElementById("chat-screen").classList.add("active");
    document.getElementById("display-username").innerText = currentUser;

    // OTOMATİK HOŞGELDİN MESAJI (SİSTEM)
    await sendSystemMessage(`${currentUser} Sunucuya Hoşgeldin Burda Lütfen Küfür Etmessen Çok Mutlu Edersiniz İyi Yazışmalar!`);

    loadMessages();
    subscribeMessages();
};

// 2. SİSTEM MESAJI GÖNDERİCİ
async function sendSystemMessage(text) {
    await supabaseClient
        .from('messages')
        .insert([{ "user": "SİSTEM", "content": text }]);
}

// 3. MESAJ GÖNDERME VE SPAM FİLTRESİ
async function sendMessage() {
    const input = document.getElementById("message-input");
    const val = input.value.trim();
    const spamOverlay = document.getElementById("spam-overlay");

    if (!val) return;

    if (isCooldown) {
        // Spam Uyarısını Göster
        spamOverlay.classList.add("show");
        setTimeout(() => spamOverlay.classList.remove("show"), 1500);
        return;
    }

    isCooldown = true;
    const { error } = await supabaseClient
        .from('messages')
        .insert([{ "user": currentUser, "content": val }]);
    
    if (!error) input.value = "";

    // 1 Saniye Bekleme Süresi
    setTimeout(() => { isCooldown = false; }, 1000);
}

// 4. AYRILMA BİLDİRİMİ (Sekme Kapanınca)
window.addEventListener('beforeunload', async () => {
    if (currentUser) {
        // Bu işlem hızlı olmalı, navigator.sendBeacon alternatifi ama Supabase insert de genellikle yetişir
        await sendSystemMessage(`${currentUser} Sunucudan Ayrıldı!`);
        await supabaseClient.from('active_users').delete().ilike('username', currentUser);
    }
});

// 5. DİNLEME VE YÜKLEME
function subscribeMessages() {
    supabaseClient
        .channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', table: 'messages' }, payload => {
            renderMessage(payload.new);
        })
        .subscribe();
}

async function loadMessages() {
    const { data } = await supabaseClient.from('messages').select('*').order('created_at', { ascending: true }).limit(50);
    const area = document.getElementById("chat-messages");
    area.innerHTML = "";
    if (data) data.forEach(msg => renderMessage(msg));
}

function renderMessage(data) {
    const area = document.getElementById("chat-messages");
    const div = document.createElement("div");
    
    // Sistem mesajı ise farklı stil ver
    const isSystem = data.user === "SİSTEM";
    div.className = isSystem ? "msg-item system-msg" : "msg-item";
    
    const time = new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `
        <span class="m-user">${data.user} <small>${time}</small></span>
        <span class="m-text">${data.content}</span>
    `;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

document.getElementById("message-input").onkeyup = (e) => { if(e.key === "Enter") sendMessage(); };
document.getElementById("send-btn").onclick = sendMessage;