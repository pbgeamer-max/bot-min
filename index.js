const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalBlock, GoalNear } = goals;
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
let userDisconnected = false;

let botStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
let connectedSince = null;
const maxLogs = 200;
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

// إعدادات البوت
let config = {
  host: process.env.HOST || process.env.MC_HOST || 'localhost',
  port: parseInt(process.env.MC_PORT || process.env.PORT_MC || '25565', 10),
  username: process.env.USERNAME || process.env.BOT_USERNAME || 'AFK_Bot',
  version: (process.env.VERSION && process.env.VERSION !== 'false' && process.env.VERSION !== 'auto') ? process.env.VERSION : false,
  auth: process.env.AUTH || 'offline',
  password: process.env.PASSWORD || process.env.BOT_PASSWORD || null,
  // إعدادات الموقع والأوامر
  targetPos: {
    x: process.env.TARGET_X !== undefined && process.env.TARGET_X !== '' ? parseFloat(process.env.TARGET_X) : null,
    y: process.env.TARGET_Y !== undefined && process.env.TARGET_Y !== '' ? parseFloat(process.env.TARGET_Y) : null,
    z: process.env.TARGET_Z !== undefined && process.env.TARGET_Z !== '' ? parseFloat(process.env.TARGET_Z) : null
  },
  autoWalkToPos: process.env.AUTO_WALK === 'true',
  lockPosition: process.env.LOCK_POS === 'true',
  autoCommand: process.env.AUTO_COMMAND || '',
  autoCommandDelay: parseInt(process.env.AUTO_COMMAND_DELAY || '7', 10)
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

  addLog('bot', `جاري الاتصال بالسيرفر ${config.host}:${config.port} باسم '${config.username}' (${config.auth === 'microsoft' ? 'حساب مايكروسوفت أصلي' : 'مكرك/Offline'})...`);

  try {
    const botOptions = {
      host: config.host,
      port: config.port,
      username: config.username,
      auth: config.auth,
      checkTimeoutInterval: 90000,
      profilesFolder: path.join(__dirname, 'auth-cache')
    };

    if (config.version && config.version !== 'auto') {
      botOptions.version = config.version;
    }

    if (config.auth === 'microsoft') {
      botOptions.onMsaCode = (data) => {
        addLog('auth', `🔐 [تسجيل مايكروسوفت] مطلوب المصادقة لمرة واحدة:`);
        addLog('auth', `1️⃣ افتح الرابط: ${data.verification_uri}`);
        addLog('auth', `2️⃣ أدخل الكود: ${data.user_code}`);
        addLog('auth', `🔗 رابط مباشر: https://microsoft.com/link?otc=${data.user_code}`);
      };
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

    // تحميل إضافة الملاحة والحركة
    try {
      bot.loadPlugin(pathfinder);
      addLog('bot', 'تم تفعيل نظام الملاحة الذكي (Pathfinder) لتحديد وتتبع الموقع.');
    } catch (err) {
      addLog('error', `تعذر تفعيل Pathfinder: ${err.message}`);
    }

    // تفعيل Anti-AFK بعد 3 ثوانٍ
    setTimeout(() => {
      startAntiAFK();
    }, 3000);

    // تنفيذ الأمر التلقائي إن وجد (مثل /smp في DonutSMP)
    if (config.autoCommand && config.autoCommand.trim()) {
      const delayMs = (config.autoCommandDelay || 7) * 1000;
      addLog('system', `سيتم إرسال الأمر التلقائي (${config.autoCommand}) بعد ${config.autoCommandDelay || 7} ثوانٍ...`);
      setTimeout(() => {
        if (bot && botStatus === 'connected') {
          bot.chat(config.autoCommand.trim());
          addLog('chat', `[أمر تلقائي] تم إرسال: ${config.autoCommand}`);

          // الانتقال التلقائي للموقع بعد الدخول لعالم السيرفر
          if (config.autoWalkToPos && config.targetPos && config.targetPos.x !== null) {
            setTimeout(() => {
              goToCoordinates(config.targetPos.x, config.targetPos.y, config.targetPos.z);
            }, 3000);
          }
        }
      }, delayMs);
    } else if (config.autoWalkToPos && config.targetPos && config.targetPos.x !== null) {
      setTimeout(() => {
        goToCoordinates(config.targetPos.x, config.targetPos.y, config.targetPos.z);
      }, 4000);
    }
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

  // أحداث الملاحة والحركة
  bot.on('goal_reached', () => {
    addLog('success', `🎯 وصل البوت إلى المكان المحدد بنجاح!`);
    try {
      bot.clearControlStates();
    } catch (e) {}
  });

  bot.on('path_reset', (reason) => {
    if (reason === 'stuck') {
      addLog('warn', 'عالق في المسار (Stuck)، يحاول البوت إعادة توجيه نفسه...');
    }
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

// التوجه إلى إحداثيات محددة
function goToCoordinates(x, y, z) {
  if (!bot || botStatus !== 'connected') {
    return { success: false, message: 'البوت غير متصل حالياً بالسيرفر' };
  }
  if (!bot.pathfinder) {
    return { success: false, message: 'نظام الحركة Pathfinder غير جاهز' };
  }

  const targetX = parseFloat(x);
  const targetY = parseFloat(y);
  const targetZ = parseFloat(z);

  if (isNaN(targetX) || isNaN(targetY) || isNaN(targetZ)) {
    return { success: false, message: 'إحداثيات غير صحيحة، تأكد من إدخال أرقام صحيحة لـ X, Y, Z' };
  }

  try {
    const defaultMove = new Movements(bot);
    defaultMove.canDig = false; // عدم تكسير البلوكات
    defaultMove.allow1by1towers = false;
    defaultMove.canOpenDoors = true;
    bot.pathfinder.setMovements(defaultMove);

    addLog('bot', `بدء التوجه إلى الإحداثيات: X=${targetX.toFixed(1)}, Y=${targetY.toFixed(1)}, Z=${targetZ.toFixed(1)}...`);
    const goal = new GoalNear(targetX, targetY, targetZ, 0.7);
    bot.pathfinder.setGoal(goal);

    return { success: true, message: `جاري التوجه إلى الموقع (${targetX.toFixed(1)}, ${targetY.toFixed(1)}, ${targetZ.toFixed(1)})` };
  } catch (err) {
    addLog('error', `خطأ أثناء الملاحة: ${err.message}`);
    return { success: false, message: err.message };
  }
}

// إيقاف الحركة
function stopMovement() {
  if (!bot || !bot.pathfinder) return false;
  try {
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
    addLog('bot', 'تم إيقاف حركة البوت.');
    return true;
  } catch (e) {
    return false;
  }
}

// نظام Anti-AFK الذكي مع حماية وتثبيت الموقع
function startAntiAFK() {
  stopAntiAFK();
  addLog('afk', 'تم تفعيل Anti-AFK الذكي (حركات عشوائية آمنة مع تثبيت مكان الوقوف).');

  afkInterval = setInterval(() => {
    if (!bot || botStatus !== 'connected' || !bot.entity) return;

    // فحص تثبيت الموقع (Lock Position)
    if (config.lockPosition && config.targetPos && config.targetPos.x !== null) {
      const pos = bot.entity.position;
      const dx = pos.x - config.targetPos.x;
      const dz = pos.z - config.targetPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // إذا ابتعد البوت أكثر من 2 بلوك ولا يتحرك حالياً، يعود فوراً
      if (dist > 2.0 && bot.pathfinder && !bot.pathfinder.isMoving()) {
        addLog('warn', `تم رصد تحرك البوت بعيداً عن موقعه (${dist.toFixed(1)} بلوك)! جاري العودة للمكان المحدد...`);
        goToCoordinates(config.targetPos.x, config.targetPos.y, config.targetPos.z);
        return;
      }
    }

    // إذا كان البوت يسير حالياً، لا نقاطعه بحركات
    if (bot.pathfinder && bot.pathfinder.isMoving()) return;

    // حركات Anti-AFK آمنة لا تغير مكان البوت
    try {
      bot.swingArm('right');

      // التفات خفيف جداً وطبيعي بالرأس
      const subtleYaw = bot.entity.yaw + (Math.random() * 0.4 - 0.2);
      bot.look(subtleYaw, bot.entity.pitch, true);

      // انحناء (Sneak) لطيف لمدة 400ms ثم النهوض
      bot.setControlState('sneak', true);
      setTimeout(() => {
        if (bot) bot.setControlState('sneak', false);
      }, 400);
    } catch (err) {}
  }, 20000);
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
      if (bot.pathfinder) {
        bot.pathfinder.setGoal(null);
      }
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

// تسجيل الدخول
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === WEB_PASSWORD) {
    req.session.authenticated = true;
    return res.json({ success: true, message: 'تم تسجيل الدخول بنجاح' });
  } else {
    return res.status(401).json({ success: false, message: 'كلمة المرور غير صحيحة!' });
  }
});

// تسجيل الخروج
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// التحقق من الجلسة
app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.json({ authenticated: true });
  }
  return res.json({ authenticated: false });
});

// حالة البوت والسجلات والإحداثيات اللحظية
app.get('/api/status', requireAuth, (req, res) => {
  let uptimeSeconds = 0;
  if (botStatus === 'connected' && connectedSince) {
    uptimeSeconds = Math.floor((new Date() - connectedSince) / 1000);
  }

  // موقع البوت الحالي إن كان متصلاً
  let currentPos = null;
  let isMoving = false;
  if (bot && bot.entity && bot.entity.position) {
    currentPos = {
      x: parseFloat(bot.entity.position.x.toFixed(2)),
      y: parseFloat(bot.entity.position.y.toFixed(2)),
      z: parseFloat(bot.entity.position.z.toFixed(2)),
      yaw: parseFloat(bot.entity.yaw.toFixed(2)),
      pitch: parseFloat(bot.entity.pitch.toFixed(2))
    };
    if (bot.pathfinder) {
      isMoving = bot.pathfinder.isMoving();
    }
  }

  res.json({
    status: botStatus,
    config: {
      host: config.host,
      port: config.port,
      username: config.username,
      version: config.version || 'auto',
      auth: config.auth,
      hasPassword: !!config.password,
      targetPos: config.targetPos,
      autoWalkToPos: config.autoWalkToPos,
      lockPosition: config.lockPosition,
      autoCommand: config.autoCommand,
      autoCommandDelay: config.autoCommandDelay
    },
    position: currentPos,
    isMoving,
    uptimeSeconds,
    logs: logs
  });
});

// إرسال أمر حركة إلى إحداثيات محددة
app.post('/api/bot/move', requireAuth, (req, res) => {
  const { x, y, z } = req.body;
  const result = goToCoordinates(x, y, z);
  res.json(result);
});

// إيقاف الحركة
app.post('/api/bot/stop-move', requireAuth, (req, res) => {
  const stopped = stopMovement();
  res.json({ success: stopped });
});

// إرسال رسالة أو أمر في الشات (/smp, /home, etc.)
app.post('/api/bot/chat', requireAuth, (req, res) => {
  const { message } = req.body;
  if (!bot || botStatus !== 'connected') {
    return res.status(400).json({ success: false, message: 'البوت غير متصل بالسيرفر' });
  }
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: 'الرسالة فارغة' });
  }

  const cleanMsg = message.trim();
  bot.chat(cleanMsg);
  addLog('chat', `[أمر يدوي] ${cleanMsg}`);
  res.json({ success: true, message: 'تم إرسال الرسالة إلى السيرفر' });
});

// حفظ وتحديث إعدادات الهدف والموقع
app.post('/api/bot/set-target', requireAuth, (req, res) => {
  const { x, y, z, autoWalkToPos, lockPosition, autoCommand, autoCommandDelay } = req.body;

  if (x !== undefined && y !== undefined && z !== undefined) {
    config.targetPos = {
      x: x !== null && x !== '' ? parseFloat(x) : null,
      y: y !== null && y !== '' ? parseFloat(y) : null,
      z: z !== null && z !== '' ? parseFloat(z) : null
    };
  }

  if (autoWalkToPos !== undefined) config.autoWalkToPos = !!autoWalkToPos;
  if (lockPosition !== undefined) config.lockPosition = !!lockPosition;
  if (autoCommand !== undefined) config.autoCommand = autoCommand.trim();
  if (autoCommandDelay !== undefined) config.autoCommandDelay = parseInt(autoCommandDelay, 10) || 7;

  addLog('system', 'تم حفظ وتحديث إعدادات موقع الوقوف.');
  res.json({ success: true, targetPos: config.targetPos, autoWalkToPos: config.autoWalkToPos, lockPosition: config.lockPosition });
});

// بدء الاتصال بالسيرفر
app.post('/api/bot/connect', requireAuth, (req, res) => {
  const {
    host,
    port,
    username,
    password,
    version,
    auth,
    targetX,
    targetY,
    targetZ,
    autoWalkToPos,
    lockPosition,
    autoCommand,
    autoCommandDelay
  } = req.body;

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

  // إعدادات الموقع
  if (targetX !== undefined && targetY !== undefined && targetZ !== undefined) {
    config.targetPos = {
      x: targetX !== null && targetX !== '' ? parseFloat(targetX) : null,
      y: targetY !== null && targetY !== '' ? parseFloat(targetY) : null,
      z: targetZ !== null && targetZ !== '' ? parseFloat(targetZ) : null
    };
  }
  if (autoWalkToPos !== undefined) config.autoWalkToPos = !!autoWalkToPos;
  if (lockPosition !== undefined) config.lockPosition = !!lockPosition;
  if (autoCommand !== undefined) config.autoCommand = autoCommand.trim();
  if (autoCommandDelay !== undefined) config.autoCommandDelay = parseInt(autoCommandDelay, 10) || 7;

  userDisconnected = false;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  addLog('system', 'تم استلام طلب اتصال جديد...');
  createBot();

  res.json({ success: true, message: 'جاري بدء اتصال البوت...' });
});

// إيقاف وفصل البوت
app.post('/api/bot/disconnect', requireAuth, (req, res) => {
  userDisconnected = true;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  cleanUp();
  botStatus = 'disconnected';
  addLog('system', 'تم إيقاف البوت وفصله بناءً على طلبك.');

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
  console.log(`[HTTP] Protected with password (WEB_PASSWORD or default: 'f1bot123')`);
  console.log(`==================================================`);
  addLog('system', `انطلق خادم الويب على المنفذ ${WEB_PORT}. جاهز للاستخدام!`);

  if (config.host && config.host !== 'localhost') {
    createBot();
  }
});
