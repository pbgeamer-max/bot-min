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
// التعرف التلقائي إذا لم يتم التحديد أو في حال كانت القيمة auto / false
const version = (rawVersion && rawVersion !== 'false' && rawVersion !== 'auto') ? rawVersion : false;
const auth = process.env.AUTH || 'offline';  // offline لسيرفرات Aternos المكركة
const password = process.env.PASSWORD || process.env.BOT_PASSWORD || null;

// معالجة حالة إدخال العنوان المدمج بالبورت (مثال: server.aternos.me:12345)
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

function createBot() {
  if (isReconnecting) return;

  console.log(`[BOT] Connecting to ${config.host}:${config.port} as '${config.username}' (Version: ${config.version || 'Auto-Detect'})...`);

  try {
    const botOptions = {
      host: config.host,
      port: config.port,
      username: config.username,
      auth: config.auth
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
      return JSON.stringify(reason.extra.value);
    }
    return JSON.stringify(reason);
  } catch (e) {
    return String(reason);
  }
}

function setupBotEvents() {
  // عند دخول البوت إلى السيرفر بنجاح
  bot.once('spawn', () => {
    console.log(`[BOT] Connected successfully to server as '${bot.username}'!`);
    startAntiAFK();

    // إذا كان هناك كلمة سر محددة في متغيرات البيئة، إرسال تسجيل الدخول تلقائياً
    if (config.password) {
      setTimeout(() => {
        if (bot) {
          bot.chat(`/register ${config.password} ${config.password}`);
          bot.chat(`/login ${config.password}`);
          console.log('[AUTH] Sent /login and /register commands.');
        }
      }, 2000);
    }
  });

  // تسجيل الرسائل التي تصل في الشات
  bot.on('chat', (sender, message) => {
    if (sender === bot.username) return;
    console.log(`[CHAT] <${sender}> ${message}`);
  });

  // تسجيل جميع رسائل النظام وشاشة السيرفر
  bot.on('message', (jsonMsg) => {
    try {
      const msgStr = jsonMsg.toString();
      if (msgStr.trim()) {
        console.log(`[SERVER MSG] ${msgStr}`);
        
        // التحقق التلقائي من طلبات تسجيل الدخول في السيرفرات التي تستخدم إضافات الحماية
        if (config.password) {
          const lower = msgStr.toLowerCase();
          if (lower.includes('/register')) {
            bot.chat(`/register ${config.password} ${config.password}`);
            console.log('[AUTH] Responded to /register prompt');
          } else if (lower.includes('/login')) {
            bot.chat(`/login ${config.password}`);
            console.log('[AUTH] Responded to /login prompt');
          }
        }
      }
    } catch (e) {}
  });

  // معالجة حالة الطرد (Kicked)
  bot.on('kicked', (reason, loggedIn) => {
    const formattedReason = parseReason(reason);
    console.warn(`[BOT] Kicked from server. Detailed Reason:`, formattedReason);
    cleanUp();
    scheduleReconnect();
  });

  // معالجة الأخطاء (Error)
  bot.on('error', (err) => {
    console.error(`[BOT] Network/Protocol Error:`, err.message || err);
    cleanUp();
    scheduleReconnect();
  });

  // معالجة قطع الاتصال (End)
  bot.on('end', (reason) => {
    console.warn(`[BOT] Connection closed (${reason || 'Disconnected'}).`);
    cleanUp();
    scheduleReconnect();
  });
}

// ==========================================
// 4. نظام Anti-AFK الحركي التفاعلي
// ==========================================
function startAntiAFK() {
  stopAntiAFK();
  console.log('[ANTI-AFK] System activated. Executing random actions every 30 seconds.');

  afkInterval = setInterval(() => {
    if (!bot || !bot.entity) return;

    const actionIndex = Math.floor(Math.random() * 4);

    switch (actionIndex) {
      case 0:
        // القفز
        bot.setControlState('jump', true);
        setTimeout(() => {
          if (bot) bot.setControlState('jump', false);
        }, 500);
        break;

      case 1:
        // تحريك اليد (Swing Arm)
        try {
          bot.swingArm('right');
        } catch (e) {}
        break;

      case 2:
        // التدوير والالتفاف في الاتجاهات
        const yaw = (Math.random() - 0.5) * Math.PI * 2;
        const pitch = (Math.random() - 0.5) * (Math.PI / 2);
        bot.look(yaw, pitch, true).catch(() => {});
        break;

      case 3:
        // الانحناء (Sneak)
        bot.setControlState('sneak', true);
        setTimeout(() => {
          if (bot) bot.setControlState('sneak', false);
        }, 1000);
        break;
    }
  }, 30000); // تنفيذه كل 30 ثانية
}

function stopAntiAFK() {
  if (afkInterval) {
    clearInterval(afkInterval);
    afkInterval = null;
  }
}

function cleanUp() {
  stopAntiAFK();
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
  }, 15000); // 15 ثانية
}

// ==========================================
// 6. حماية السكريبت من الإغلاق في حال الأخطاء غير المتوقعة
// ==========================================
process.on('uncaughtException', (err) => {
  console.error('[PROCESS] Uncaught Exception caught:', err.message || err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[PROCESS] Unhandled Rejection:', reason);
});

// بدء البوت
createBot();
