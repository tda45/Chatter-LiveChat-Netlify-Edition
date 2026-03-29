const SB_URL = "https://dxmqmgxwjrrrhubpnphf.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4bXFtZ3h3anJycmh1YnBucGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTQwOTksImV4cCI6MjA5MDM3MDA5OX0.U_pCKGG3EDCkmjBtUvJSXqv7UUTpN-gML4UHyRl89AM";

const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let currentUser = "";
let isCooldown = false;
let userChannel;

// 1. GİRİŞ VE HOŞGELDİN
document.getElementById("join-btn").onclick = async () => {
    const inputField = document.getElementById("username-input");
    const errorEl = document.getElementById("error-msg");
    const nick = inputField.value.trim();

    if (nick.length < 2) {
        errorEl.innerText = "İsim çok kısa!";
        return;
    }

    const { data: existingUser } = await supabaseClient
        .from('active_users')
        .select('username')
        .ilike('username', nick)
        .maybeSingle();

    if (existingUser) {
        errorEl.innerText = "Bu İsim Zaten Kullanımda";
        return;
    }

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

// 2. PRESENCE (VARLIK) TAKİBİ
function setupPresence(username) {
    userChannel = supabaseClient.channel('online-users', {
        config: { presence: { key: username } }
    });

    userChannel
        .on('presence', { event: 'leave' }, async ({ key }) => {
            await supabaseClient.from('active_users').delete().eq('username', key);
            if (key !== "SİSTEM") {
                await sendSystemMessage(`${key} Sunucudan Ayrıldı!`);
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await userChannel.track({ online_at: new Date().toISOString() });
            }
        });
}

// 3. MESAJ VE FOTOĞRAF GÖNDERME
async function sendSystemMessage(text) {
    await supabaseClient.from('messages').insert([{ "user": "SİSTEM", "content": text }]);
}

async function sendMessage(customContent = null) {
    const input = document.getElementById("message-input");
    const val = customContent || input.value.trim();
    const spamOverlay = document.getElementById("spam-overlay");

    if (!val) return;

    if (isCooldown) {
        spamOverlay.classList.add("show");
        setTimeout(() => spamOverlay.classList.remove("show"), 1500);
        return;
    }

    isCooldown = true;
    const { error } = await supabaseClient
        .from('messages')
        .insert([{ "user": currentUser, "content": val }]);
    
    if (!error && !customContent) input.value = "";
    setTimeout(() => { isCooldown = false; }, 1000);
}

// --- YENİ: CTRL+V İLE FOTOĞRAF YAPIŞTIRMA ---
document.getElementById("message-input").addEventListener("paste", function (e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            const reader = new FileReader();
            
            reader.onload = function (event) {
                const base64String = event.target.result;
                // Base64 verisini doğrudan mesaj olarak gönderiyoruz
                sendMessage(base64String);
            };
            
            reader.readAsDataURL(blob);
        }
    }
});

// 4. DİNLEME VE RENDER
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
    const isSystem = data.user === "SİSTEM";
    div.className = isSystem ? "msg-item system-msg" : "msg-item";
    
    const time = new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // İçerik fotoğraf mı yoksa metin mi kontrol et (Base64 kontrolü)
    let contentHTML = "";
    if (data.content.startsWith("data:image")) {
        contentHTML = `<img src="${data.content}" class="chat-img" style="max-width: 100%; border-radius: 10px; margin-top: 5px; border: 1px solid var(--cyber-red-glow);">`;
    } else {
        contentHTML = `<span class="m-text">${data.content}</span>`;
    }

    div.innerHTML = `
        <span class="m-user">${data.user} <small>${time}</small></span>
        ${contentHTML}
    `;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

document.getElementById("message-input").onkeyup = (e) => { if(e.key === "Enter") sendMessage(); };
document.getElementById("send-btn").onclick = () => sendMessage();