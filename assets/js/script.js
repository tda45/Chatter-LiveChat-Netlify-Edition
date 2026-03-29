const SB_URL = "https://dxmqmgxwjrrrhubpnphf.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4bXFtZ3h3anJycmh1YnBucGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTQwOTksImV4cCI6MjA5MDM3MDA5OX0.U_pCKGG3EDCkmjBtUvJSXqv7UUTpN-gML4UHyRl89AM";

const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let currentUser = "";
let isCooldown = false;
let userChannel;
let typingTimeout;

// 1. TEMİZLİK VE GİRİŞ
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

// 2. PRESENCE SİSTEMİ (BOZUKLUKLAR GİDERİLDİ)
function setupPresence(username) {
    userChannel = supabaseClient.channel('online-users', {
        config: { presence: { key: username } }
    });

    userChannel
        .on('presence', { event: 'sync' }, () => {
            const state = userChannel.presenceState();
            updateTypingStatus(state);
        })
        .on('presence', { event: 'leave' }, async ({ key, leftPresences }) => {
            // Sadece gerçekten kanaldan kopanlar için ayrıldı mesajı gönder
            const currentState = userChannel.presenceState();
            if (!currentState[key]) {
                await supabaseClient.from('active_users').delete().eq('username', key);
                await sendSystemMessage(`${key} Sunucudan Ayrıldı!`);
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await userChannel.track({ online_at: new Date().toISOString(), isTyping: false });
            }
        });
}

function updateTypingStatus(state) {
    const header = document.querySelector('.user-profile');
    const oldStatus = document.querySelector('.typing-status');
    if (oldStatus) oldStatus.remove();

    Object.keys(state).forEach(user => {
        if (user !== currentUser) {
            // Kullanıcının herhangi bir aktif session'ında isTyping true ise göster
            const isTypingNow = state[user].some(p => p.isTyping === true);
            if (isTypingNow) {
                const span = document.createElement('span');
                span.className = 'typing-status';
                span.innerText = `(${user} Yazıyor...)`;
                header.appendChild(span);
            }
        }
    });
}

// YAZIYOR TETİKLEYİCİ
document.getElementById("message-input").addEventListener("input", () => {
    if (!userChannel) return;
    userChannel.track({ online_at: new Date().toISOString(), isTyping: true });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        if(userChannel) userChannel.track({ online_at: new Date().toISOString(), isTyping: false });
    }, 2500); // 2.5 saniye bekleme
});

// 3. MESAJLAŞMA (GÖRSEL VE YAZI)
async function sendSystemMessage(text) {
    await supabaseClient.from('messages').insert([{ "user": "SİSTEM", "content": text }]);
}

async function sendMessage(customContent = null) {
    const input = document.getElementById("message-input");
    const val = customContent || input.value.trim();
    if (!val || isCooldown) return;

    isCooldown = true;

    // MESAJ GİTMEDEN ÖNCE: Yazıyor bilgisini hemen KAPAT (Herkesin ekranında anında silinsin)
    if(userChannel) {
        await userChannel.track({ online_at: new Date().toISOString(), isTyping: false });
    }

    const { error } = await supabaseClient.from('messages').insert([{ "user": currentUser, "content": val }]);
    
    if (!error && !customContent) input.value = "";
    
    setTimeout(() => { isCooldown = false; }, 1000);
}

// 4. CTRL+V FOTOĞRAF
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

// 5. DİNLEME VE RENDER
function subscribeMessages() {
    supabaseClient.channel('public:messages').on('postgres_changes', { event: 'INSERT', table: 'messages' }, p => renderMessage(p.new)).subscribe();
}

async function loadMessages() {
    const { data } = await supabaseClient.from('messages').select('*').order('created_at', { ascending: true }).limit(50);
    const area = document.getElementById("chat-messages");
    if (!area) return;
    area.innerHTML = "";
    if (data) data.forEach(msg => renderMessage(msg));
}

function renderMessage(data) {
    const area = document.getElementById("chat-messages");
    if (!area) return;
    const div = document.createElement("div");
    const isSystem = data.user === "SİSTEM";
    div.className = isSystem ? "msg-item system-msg" : "msg-item";
    
    const time = new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    let contentHTML = data.content.startsWith("data:image") 
        ? `<img src="${data.content}" class="chat-img" style="max-width:100%; border-radius:10px; border:1px solid var(--cyber-red-glow); display:block; margin-top:5px;">` 
        : `<span class="m-text">${data.content}</span>`;

    div.innerHTML = `<span class="m-user">${data.user} <small>${time}</small></span>${contentHTML}`;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

document.getElementById("message-input").onkeyup = (e) => { if(e.key === "Enter") sendMessage(); };
document.getElementById("send-btn").onclick = () => sendMessage();