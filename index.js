const mineflayer = require('mineflayer');
const express = require('express');
const session = require('express-session');
const path = require('path');

// ==========================================
// 1. إعدادات خادم الويب (Express Web Server & Auth)
// ==========================================
const app = express();
const WEB_PORT = process.env.WEB_PORT || process.env.PORT || 3000;
const WEB_PASSWORD = process.env.WEB_PASSWORD || 'f1bot123';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'f1-minecraft-bot-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// إتاحة الملفات الإستاتيكية
app.use(express.static(path.join(__dirname, 'public')));

// Middleware للتحقق من المصادقة للمسارات المحمية
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized', message: 'يرجى تسجيل الدخول أولاً' });
}

// ==========================================
// 2. حالة البوت والسجلات (State & Logs)
// ==========================================
let bot = null;
let afkInterval = null;
let reconnectTimeout = null;
let isReconnecting = false;
let hasLoggedIn = false;
let userDisconnected = false; // إذا قام المستخدم بالضغط على زر الفصل بنفسه

let botStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
let connectedSince = null;
const maxLogs = 150;
const logs = [];

function addLog(type, message) {
  const timestamp = new Date().toLocaleTimeString('ar-EG', { hour12: false });
  const logEntry = { timestamp, type, message };
  logs.push(logEntry);
  if (logs.length > maxLogs) {
    logs.shift();
  }
  console.log(`[${timestamp}] [${type.toUpperCase()}] ${message}`);
}

// إعدادات البوت الافتراضية
let config = {
  host: process.env.HOST || process.env.MC_HOST || 'localhost',
  port: parseInt(process.env.MC_PORT || process.env.PORT_MC || '25565', 10),
  username: process.env.USERNAME || process.env.BOT_USERNAME || 'AFK_Bot',
  version: (process.env.VERSION && process.env.VERSION !== 'false' && process.env.VERSION !== 'auto') ? process.env.VERSION : false,
  auth: process.env.AUTH || 'offline',
  password: process.env.PASSWORD || process.env.BOT_PASSWORD || null
};

// معالجة الهوست والبورت إذا كانا مكتوبين معاً
if (config.host.includes(':')) {
  const parts = config.host.split(':');
  config.host = parts[0];
  config.port = parseInt(parts[1], 10) || 25565;
}

// ==========================================
// 3. إدارة البوت والاتصال (Mineflayer Lifecycle)
// ==========================================
function createBot() {
  if (bot) {
    cleanUp();
  }

  userDisconnected = false;
  isReconnecting = false;
  hasLoggedIn = false;
  botStatus = 'connecting';

  addLog('bot', `جاري الاتصال بالسيرفر ${config.host}:${config.port} باسم '${config.username}'...`);

  try {
    const botOptions = {
      host: config.host,
      port: config.port,
      username: config.username,
      auth: config.auth,
      checkTimeoutInterval: 60000
    };

    if (config.version && config.version !== 'auto') {
      botOptions.version = config.version;
    }

    bot = mineflayer.createBot(botOptions);
    setupBotEvents();
  } catch (err) {
    botStatus = 'disconnected';
    addLog('error', `خطأ أثناء إنشاء البوت: ${err.message || err}`);
    scheduleReconnect();
  }
}

function parseReason(reason) {
  if (!reason) return 'لا يوجد سبب مكتوب';
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
    botStatus = 'connected';
    connectedSince = new Date();
    addLog('success', `تم الاتصال بالسيرفر بنجاح باسم '${bot.username}'!`);

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

      addLog('chat', msgStr);

      if (config.password && !hasLoggedIn) {
        const lower = msgStr.toLowerCase();
        if (lower.includes('/register') && !lower.includes('already')) {
          bot.chat(`/register ${config.password} ${config.password}`);
          addLog('auth', 'تم إرسال أمر التسجيل /register');
          hasLoggedIn = true;
        } else if (lower.includes('/login') && !lower.includes('already')) {
          bot.chat(`/login ${config.password}`);
          addLog('auth', 'تم إرسال أمر تسجيل الدخول /login');
          hasLoggedIn = true;
        }
      }
    } catch (e) {}
  });

  bot.on('kicked', (reason) => {
    const formattedReason = parseReason(reason);
    botStatus = 'disconnected';
    addLog('warn', `تم طرد البوت من السيرفر. السبب: ${formattedReason}`);
    cleanUp();
    scheduleReconnect();
  });

  bot.on('error', (err) => {
    botStatus = 'disconnected';
    addLog('error', `خطأ في اتصال البوت: ${err.message || err}`);
    cleanUp();
    scheduleReconnect();
  });

  bot.on('end', (reason) => {
    botStatus = 'disconnected';
    addLog('warn', `انقطع الاتصال بالسيرفر (${reason || 'Disconnected'}).`);
    cleanUp();
    scheduleReconnect();
  });
}

function startAntiAFK() {
  stopAntiAFK();
  addLog('afk', 'تم تفعيل Anti-AFK الآمن (تحريك اليد كل 30 ثانية).');

  afkInterval = setInterval(() => {
    if (!bot || botStatus !== 'connected') return;

    try {
      bot.swingArm('right');
    } catch (err) {
      addLog('error', `خطأ أثناء تحريك اليد: ${err.message}`);
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
    try {
      bot.removeAllListeners();
      bot.end();
    } catch (e) {}
    bot = null;
  }
}

function scheduleReconnect() {
  if (userDisconnected) {
    addLog('system', 'تم فصل الاتصال بواسطة المستخدم، لن يتم إعادة الاتصال تلقائياً.');
    return;
  }

  if (reconnectTimeout || isReconnecting) return;

  isReconnecting = true;
  addLog('reconnect', 'سيتم محاولة إعادة الاتصال خلال 15 ثانية...');

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    isReconnecting = false;
    createBot();
  }, 15000);
}

// ==========================================
// 4. مسارات الـ API (Express Routes)
// ==========================================

// مسار تسجيل الدخول
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === WEB_PASSWORD) {
    req.session.authenticated = true;
    return res.json({ success: true, message: 'تم تسجيل الدخول بنجاح' });
  } else {
    return res.status(401).json({ success: false, message: 'كلمة المرور غير صحيحة!' });
  }
});

// مسار تسجيل الخروج
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// التحقق من حالة التوثيق
app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.json({ authenticated: true });
  }
  return res.json({ authenticated: false });
});

// جلب حالة البوت السلسلة والسجلات
app.get('/api/status', requireAuth, (req, res) => {
  let uptimeSeconds = 0;
  if (botStatus === 'connected' && connectedSince) {
    uptimeSeconds = Math.floor((new Date() - connectedSince) / 1000);
  }

  res.json({
    status: botStatus,
    config: {
      host: config.host,
      port: config.port,
      username: config.username,
      version: config.version || 'auto',
      auth: config.auth,
      hasPassword: !!config.password
    },
    uptimeSeconds,
    logs: logs
  });
});

// بدء الاتصال بالسيرفر بإعدادات جديدة
app.post('/api/bot/connect', requireAuth, (req, res) => {
  const { host, port, username, password, version, auth } = req.body;

  if (!host) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال عنوان IP الخاص بالسيرفر' });
  }

  let rawHost = host.trim();
  let rawPort = port ? parseInt(port, 10) : 25565;

  if (rawHost.includes(':')) {
    const parts = rawHost.split(':');
    rawHost = parts[0];
    rawPort = parseInt(parts[1], 10) || 25565;
  }

  config.host = rawHost;
  config.port = rawPort;
  config.username = (username && username.trim()) ? username.trim() : 'AFK_Bot';
  config.version = (version && version !== 'auto') ? version : false;
  config.auth = auth || 'offline';
  if (password !== undefined && password !== null) {
    config.password = password.trim() ? password.trim() : null;
  }

  userDisconnected = false;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  addLog('system', 'تم استلام طلب اتصال جديد من لوحة التحكم...');
  createBot();

  res.json({ success: true, message: 'جاري بدء اتصال البوت...' });
});

// إيقاف البوت وفصله
app.post('/api/bot/disconnect', requireAuth, (req, res) => {
  userDisconnected = true;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  cleanUp();
  botStatus = 'disconnected';
  addLog('system', 'تم إيقاف البوت وفصله عن السيرفر بناءً على طلبك.');

  res.json({ success: true, message: 'تم فصل البوت بنجاح' });
});

// ==========================================
// 5. حماية العملية وتشغيل خادم الويب
// ==========================================
process.on('uncaughtException', (err) => {
  addLog('error', `Uncaught Exception: ${err.message || err}`);
});

process.on('unhandledRejection', (reason, promise) => {
  addLog('error', `Unhandled Rejection: ${reason}`);
});

app.listen(WEB_PORT, () => {
  console.log(`==================================================`);
  console.log(`[HTTP] Web Dashboard running at: http://localhost:${WEB_PORT}`);
  console.log(`[HTTP] Protected with password (WEB_PASSWORD environment variable or default: 'f1bot123')`);
  console.log(`==================================================`);
  addLog('system', `انطلق خادم الويب على المنفذ ${WEB_PORT}. جاهز للاستخدام!`);
  
  // تشغيل البوت تلقائياً إذا كان هناك HOST محدد مسبقاً وغير localhost
  if (config.host && config.host !== 'localhost') {
    createBot();
  }
});
