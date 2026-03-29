const SB_URL = "https://dxmqmgxwjrrrhubpnphf.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4mXFtZ3h3anJycmh1YnBucGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTQwOTksImV4cCI6MjA5MDM3MDA5OX0.U_pCKGG3EDCkmjBtUvJSXqv7UUTpN-gML4UHyRl89AM";
const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let currentUser = "";

// Giriş Butonu
document.getElementById("join-btn").onclick = () => {
    const nick = document.getElementById("username-input").value.trim();
    if (nick.length < 2) return alert("Nick çok kısa!");
    
    currentUser = nick;
    document.getElementById("login-screen").classList.remove("active");
    document.getElementById("chat-screen").classList.add("active");
    document.getElementById("display-username").innerText = currentUser;

    loadMessages();
    subscribeMessages();
};

// Mesaj Gönderme
async function sendMessage() {
    const input = document.getElementById("message-input");
    const val = input.value.trim();
    
    if (val) {
        const { error } = await supabaseClient
            .from('messages')
            .insert([{ "user": currentUser, "content": val }]);
        
        if (error) {
            console.error("Mesaj gönderilemedi:", error.message);
            alert("Hata: " + error.message);
        } else {
            input.value = "";
        }
    }
}

// Mesajları Dinle
function subscribeMessages() {
    supabaseClient
        .channel('any')
        .on('postgres_changes', { event: 'INSERT', table: 'messages' }, payload => {
            renderMessage(payload.new);
        })
        .subscribe();
}

async function loadMessages() {
    const { data } = await supabaseClient.from('messages').select('*').order('created_at', { ascending: true });
    if (data) {
        document.getElementById("chat-messages").innerHTML = ""; // Temizle
        data.forEach(msg => renderMessage(msg));
    }
}

function renderMessage(data) {
    const area = document.getElementById("chat-messages");
    const div = document.createElement("div");
    div.className = "msg-item";
    div.innerHTML = `<span class="m-user">${data.user}:</span> <span class="m-text">${data.content}</span>`;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

document.getElementById("send-btn").onclick = sendMessage;
document.getElementById("message-input").onkeyup = (e) => { if(e.key === "Enter") sendMessage(); };