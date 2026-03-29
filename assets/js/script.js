const SB_URL = "https://dxmqmgxwjrrrhubpnphf.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4bXFtZ3h3anJycmh1YnBucGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTQwOTksImV4cCI6MjA5MDM3MDA5OX0.U_pCKGG3EDCkmjBtUvJSXqv7UUTpN-gML4UHyRl89AM";

const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let currentUser = "";
let isCooldown = false;
let userChannel;
let typingTimeout;

// 1. GİRİŞ VE TEMİZLİK
async function cleanOldMessages() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabaseClient.from('messages').delete().lt('created_at', twentyFourHoursAgo);
}

document.getElementById("join-btn").onclick = async () => {
    const inputField = document.getElementById("username-input");
    const errorEl = document.getElementById("error-msg");
    const nick = inputField.value.trim();

    if (nick.length < 2) {
        errorEl.innerText = "İsim çok kısa!";
        return;
    }

    const { data: existingUser } = await supabaseClient.from('active_users').select('username').ilike('username', nick).maybeSingle();
    if (existingUser) {
        errorEl.innerText = "Bu İsim Zaten Kullanımda";
        return;
    }

    await cleanOldMessages();
    await supabaseClient.from('active_users').insert([{ username: nick }]);

    currentUser = nick;
    document.getElementById("login-screen").classList.remove("active");
    document.getElementById("chat-screen").classList.add("active");
    document.getElementById("display-username").innerText = currentUser;

    await sendSystemMessage(`${currentUser} Sunucuya Hoşgeldin!`);

    setupPresence(nick);
    loadMessages();
    subscribeMessages();
};

// 2. PRESENCE VE YAZIYOR KONTROLÜ
function setupPresence(username) {
    userChannel = supabaseClient.channel('online-users', {
        config: { presence: { key: username } }
    });

    userChannel
        .on('presence', { event: 'sync' }, () => {
            const state = userChannel.presenceState();
            updateTypingStatus(state);
        })
        .on('presence', { event: 'leave' }, async ({ key }) => {
            await supabaseClient.from('active_users').delete().eq('username', key);
            if (key !== "SİSTEM") await sendSystemMessage(`${key} Sunucudan Ayrıldı!`);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await userChannel.track({ online_at: new Date().toISOString(), isTyping: false });
            }
        });
}

// "Yazıyor..." Yazısını Ekrana Basan Fonksiyon
function updateTypingStatus(state) {
    const header = document.querySelector('.user-profile');
    // Eski yazıyor yazısını temizle
    const oldStatus = document.querySelector('.typing-status');
    if (oldStatus) oldStatus.remove();

    Object.keys(state).forEach(user => {
        // Eğer yazan kişi biz değilsek ve isTyping değeri true ise
        if (user !== currentUser && state[user][0].isTyping) {
            const span = document.createElement('span');
            span.className = 'typing-status';
            span.innerText = `(${user} Yazıyor...)`;
            header.appendChild(span);
        }
    });
}

// Klavye Hareketlerini Dinle
document.getElementById("message-input").addEventListener("input", () => {
    if (!userChannel) return;

    // "Yazıyor" bilgisini kanala gönder
    userChannel.track({ online_at: new Date().toISOString(), isTyping: true });

    // 2 saniye boyunca bir şey yazmazsa "Yazıyor" bilgisini kapat
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        userChannel.track({ online_at: new Date().toISOString(), isTyping: false });
    }, 2000);
});

// 3. MESAJLAŞMA SİSTEMİ (Değişmedi)
async function sendSystemMessage(text) {
    await supabaseClient.from('messages').insert([{ "user": "SİSTEM", "content": text }]);
}

async function sendMessage(customContent = null) {
    const input = document.getElementById("message-input");
    const val = customContent || input.value.trim();
    if (!val || isCooldown) return;

    isCooldown = true;
    await supabaseClient.from('messages').insert([{ "user": currentUser, "content": val }]);
    if (!customContent) input.value = "";
    // Mesaj gidince yazıyor bilgisini hemen kapat
    userChannel.track({ online_at: new Date().toISOString(), isTyping: false });
    setTimeout(() => { isCooldown = false; }, 1000);
}

// CTRL+V FOTOĞRAF (Değişmedi)
document.getElementById("message-input").addEventListener("paste", function (e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.indexOf('image') !== -1) {
            const reader = new FileReader();
            reader.onload = (event) => sendMessage(event.target.result);
            reader.readAsDataURL(item.getAsFile());
        }
    }
});

// 4. DİNLEME VE RENDER (Değişmedi)
function subscribeMessages() {
    supabaseClient.channel('public:messages').on('postgres_changes', { event: 'INSERT', table: 'messages' }, p => renderMessage(p.new)).subscribe();
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
    div.className = data.user === "SİSTEM" ? "msg-item system-msg" : "msg-item";
    const time = new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    let contentHTML = data.content.startsWith("data:image") 
        ? `<img src="${data.content}" class="chat-img" style="max-width:100%; border-radius:10px; border:1px solid var(--cyber-red-glow); display:block;">` 
        : `<span class="m-text">${data.content}</span>`;

    div.innerHTML = `<span class="m-user">${data.user} <small>${time}</small></span>${contentHTML}`;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

document.getElementById("message-input").onkeyup = (e) => { if(e.key === "Enter") sendMessage(); };
document.getElementById("send-btn").onclick = () => sendMessage();