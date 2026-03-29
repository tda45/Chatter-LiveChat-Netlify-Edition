const SB_URL = "https://dxmqmgxwjrrrhubpnphf.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4bXFtZ3h3anJycmh1YnBucGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTQwOTksImV4cCI6MjA5MDM3MDA5OX0.U_pCKGG3EDCkmjBtUvJSXqv7UUTpN-gML4UHyRl89AM";

const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let currentUser = "";

// 1. GİRİŞ VE AD KONTROLÜ
document.getElementById("join-btn").onclick = async () => {
    const inputField = document.getElementById("username-input");
    const errorEl = document.getElementById("error-msg");
    const nick = inputField.value.trim();

    if (nick.length < 2) {
        errorEl.innerText = "İsim çok kısa!";
        return;
    }

    // Küçük harfe çevirerek veritabanında ara (Case-insensitive kontrol)
    const { data: existingUser, error: searchError } = await supabaseClient
        .from('active_users')
        .select('username')
        .ilike('username', nick) // ilike büyük/küçük harf bakmaz
        .maybeSingle();

    if (existingUser) {
        errorEl.innerText = "Bu İsim Zaten Kullanımda";
        return;
    }

    // İsim boşsa, kullanıcıyı 'active_users' tablosuna ekle
    const { error: insertError } = await supabaseClient
        .from('active_users')
        .insert([{ username: nick }]);

    if (insertError) {
        errorEl.innerText = "Giriş yapılamadı, tekrar dene.";
        console.error(insertError);
        return;
    }

    // Başarılı Giriş
    currentUser = nick;
    document.getElementById("login-screen").classList.remove("active");
    document.getElementById("chat-screen").classList.add("active");
    document.getElementById("display-username").innerText = currentUser;

    loadMessages();
    subscribeMessages();
};

// 2. MESAJ GÖNDERME
async function sendMessage() {
    const input = document.getElementById("message-input");
    const val = input.value.trim();
    
    if (val) {
        const { error } = await supabaseClient
            .from('messages')
            .insert([{ "user": currentUser, "content": val }]);
        
        if (error) {
            console.error("Hata:", error.message);
        } else {
            input.value = "";
        }
    }
}

// 3. MESAJLARI DİNLE VE YÜKLE
function subscribeMessages() {
    supabaseClient
        .channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', table: 'messages' }, payload => {
            renderMessage(payload.new);
        })
        .subscribe();
}

async function loadMessages() {
    const { data, error } = await supabaseClient
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(50);
    
    const area = document.getElementById("chat-messages");
    area.innerHTML = ""; // Önce temizle
    
    if (data) data.forEach(msg => renderMessage(msg));
}

function renderMessage(data) {
    const area = document.getElementById("chat-messages");
    const div = document.createElement("div");
    div.className = "msg-item";
    
    // Zaman formatı
    const time = new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `
        <span class="m-user">${data.user} <small style="color:#555; font-weight:normal;">${time}</small></span>
        <span class="m-text">${data.content}</span>
    `;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

// Enter tuşu desteği
document.getElementById("message-input").onkeyup = (e) => { if(e.key === "Enter") sendMessage(); };
document.getElementById("send-btn").onclick = sendMessage;