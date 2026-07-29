const mineflayer = require('mineflayer');
const http = require('http');

// ==========================================
// 1. خادم HTTP وهمي لفحص الصحة (Health Checks) على منصة Railway
// ==========================================
const WEB_PORT = process.env.WEB_PORT || process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Minecraft AFK Bot is running smoothly!\n Status: OK');
});

server.listen(WEB_PORT, () => {
  console.log(`[HTTP] Health check server listening on port ${WEB_PORT}`);
});

// ==========================================
// 2. إعداد وقراءة متغيرات البيئة (Environment Variables)
// ==========================================
let rawHost = process.env.HOST || process.env.MC_HOST || 'localhost';
let rawPort = process.env.MC_PORT || process.env.PORT_MC || '25565';
const username = process.env.USERNAME || process.env.BOT_USERNAME || 'AFK_Bot';
const rawVersion = process.env.VERSION;
const version = (rawVersion && rawVersion !== 'false' && rawVersion !== 'auto') ? rawVersion : false;
const auth = process.env.AUTH || 'offline';
const password = process.env.PASSWORD || process.env.BOT_PASSWORD || null;

if (rawHost.includes(':')) {
  const parts = rawHost.split(':');
  rawHost = parts[0];
  rawPort = parts[1];
}

const config = {
  host: rawHost.trim(),
  port: parseInt(rawPort, 10),
  username: username.trim(),
  version: version,
  auth: auth,
  password: password
};

// ==========================================
// 3. إدارة البوت والاتصال تلقائياً (Auto-Reconnect & Bot Life Cycle)
// ==========================================
let bot = null;
let afkInterval = null;
let reconnectTimeout = null;
let isReconnecting = false;
let hasLoggedIn = false;

function createBot() {
  if (isReconnecting) return;
  hasLoggedIn = false;

  console.log(`[BOT] Connecting to ${config.host}:${config.port} as '${config.username}'...`);

  try {
    const botOptions = {
      host: config.host,
      port: config.port,
      username: config.username,
      auth: config.auth,
      checkTimeoutInterval: 60000
    };

    if (config.version) {
      botOptions.version = config.version;
    }

    bot = mineflayer.createBot(botOptions);
    setupBotEvents();
  } catch (err) {
    console.error('[BOT] Creation Error:', err.message || err);
    scheduleReconnect();
  }
}

function parseReason(reason) {
  if (!reason) return 'No reason provided';
  if (typeof reason === 'string') return reason;
  
  try {
    if (reason.text) return reason.text;
    if (reason.value && reason.value.text && reason.value.text.value) return reason.value.text.value;
    if (reason.extra && Array.isArray(reason.extra.value)) {
      return reason.extra.value.map(item => (typeof item === 'string' ? item : item.text || JSON.stringify(item))).join('');
    }
    return JSON.stringify(reason);
  } catch (e) {
    return String(reason);
  }
}

function setupBotEvents() {
  bot.once('spawn', () => {
    console.log(`[BOT] Connected successfully to server as '${bot.username}'!`);

    // إيقاف المحاكاة الفيزيائية للبوت نهائياً لمنع إرسال حزم الحركة التي تسبب الطرد
    try {
      bot.physicsEnabled = false;
    } catch (e) {}

    // تفعيل الـ Anti-AFK بعد 3 ثوانٍ
    setTimeout(() => {
      startAntiAFK();
    }, 3000);
  });

  // تسجيل الرسائل وتلبية طلبات AuthMe
  bot.on('message', (jsonMsg) => {
    try {
      const msgStr = jsonMsg.toString();
      if (!msgStr.trim()) return;

      console.log(`[SERVER MSG] ${msgStr}`);

      if (config.password && !hasLoggedIn) {
        const lower = msgStr.toLowerCase();
        if (lower.includes('/register') && !lower.includes('already')) {
          bot.chat(`/register ${config.password} ${config.password}`);
          console.log('[AUTH] Sent /register command.');
          hasLoggedIn = true;
        } else if (lower.includes('/login') && !lower.includes('already')) {
          bot.chat(`/login ${config.password}`);
          console.log('[AUTH] Sent /login command.');
          hasLoggedIn = true;
        }
      }
    } catch (e) {}
  });

  bot.on('kicked', (reason) => {
    const formattedReason = parseReason(reason);
    console.warn(`[BOT] Kicked from server. Reason: ${formattedReason}`);
    cleanUp();
    scheduleReconnect();
  });

  bot.on('error', (err) => {
    console.error(`[BOT] Network/Protocol Error:`, err.message || err);
    cleanUp();
    scheduleReconnect();
  });

  bot.on('end', (reason) => {
    console.warn(`[BOT] Connection closed (${reason || 'Disconnected'}).`);
    cleanUp();
    scheduleReconnect();
  });
}

// ==========================================
// 4. نظام Anti-AFK آمن بدون حزم حركية (No Movement Packets)
// ==========================================
function startAntiAFK() {
  stopAntiAFK();
  console.log('[ANTI-AFK] Safe Anti-AFK activated (Arm swinging every 30s).');

  afkInterval = setInterval(() => {
    if (!bot) return;

    try {
      // تحريك اليد فقط (Arm Swing) - لا يرسل حزم موقع أو سرعة مطلقاً
      bot.swingArm('right');
    } catch (err) {
      console.error('[ANTI-AFK] Error:', err.message);
    }
  }, 30000);
}

function stopAntiAFK() {
  if (afkInterval) {
    clearInterval(afkInterval);
    afkInterval = null;
  }
}

function cleanUp() {
  stopAntiAFK();
  hasLoggedIn = false;
  if (bot) {
    bot.removeAllListeners();
    bot = null;
  }
}

// ==========================================
// 5. آلية إعادة الاتصال التلقائي (Auto Reconnect)
// ==========================================
function scheduleReconnect() {
  if (reconnectTimeout || isReconnecting) return;

  isReconnecting = true;
  console.log('[RECONNECT] Reconnecting in 15 seconds...');

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    isReconnecting = false;
    createBot();
  }, 15000);
}

// ==========================================
// 6. حماية السكريبت من الإغلاق
// ==========================================
process.on('uncaughtException', (err) => {
  console.error('[PROCESS] Uncaught Exception caught:', err.message || err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[PROCESS] Unhandled Rejection:', reason);
});

// بدء البوت
createBot();
