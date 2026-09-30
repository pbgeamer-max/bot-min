const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalNear } = goals;
const path = require('path');
const fs = require('fs');

// قاموس لتخزين كائنات البوتات الشغالة لكل مستخدم
// Key: userId -> Value: BotInstanceData
const activeBots = new Map();

function getOrCreateUserBotData(userId) {
  const cleanId = userId.trim().toLowerCase();
  if (!activeBots.has(cleanId)) {
    activeBots.set(cleanId, {
      userId: cleanId,
      bot: null,
      botStatus: 'disconnected', // 'disconnected' | 'connecting' | 'connected'
      connectedSince: null,
      userDisconnected: false,
      reconnectTimeout: null,
      isReconnecting: false,
      hasLoggedIn: false,
      afkInterval: null,
      logs: [],
      config: {
        host: 'donutsmp.net',
        port: 25565,
        username: `AFK_${cleanId}`,
        version: 'auto',
        auth: 'microsoft',
        password: null,
        targetPos: { x: null, y: null, z: null },
        autoWalkToPos: false,
        lockPosition: false,
        autoCommand: '/smp',
        autoCommandDelay: 7
      }
    });
  }
  return activeBots.get(cleanId);
}

function addBotLog(userData, type, message) {
  const timestamp = new Date().toLocaleTimeString('ar-EG', { hour12: false });
  const logEntry = { timestamp, type, message };
  userData.logs.push(logEntry);
  if (userData.logs.length > 150) {
    userData.logs.shift();
  }
  console.log(`[${userData.userId.toUpperCase()}] [${timestamp}] [${type.toUpperCase()}] ${message}`);
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

// 1. بدء تشغيل البوت للمستخدم
function startBotForUser(userId, newConfig = {}) {
  const userData = getOrCreateUserBotData(userId);

  if (userData.bot) {
    cleanUpBot(userData);
  }

  // دمج الإعدادات الجديدة
  userData.config = { ...userData.config, ...newConfig };
  userData.userDisconnected = false;
  userData.isReconnecting = false;
  userData.hasLoggedIn = false;
  userData.botStatus = 'connecting';

  addBotLog(userData, 'bot', `جاري الاتصال بالسيرفر ${userData.config.host}:${userData.config.port} باسم '${userData.config.username}' (${userData.config.auth === 'microsoft' ? 'Microsoft رسمي' : 'مكرك'})...`);

  // مجلد كاش مخصص لكل مستخدم لتسجيلات الدخول
  const userAuthFolder = path.join(__dirname, 'auth-cache', userData.userId);
  if (!fs.existsSync(userAuthFolder)) {
    fs.mkdirSync(userAuthFolder, { recursive: true });
  }

  try {
    const botOptions = {
      host: userData.config.host,
      port: userData.config.port,
      username: userData.config.username,
      auth: userData.config.auth,
      checkTimeoutInterval: 90000,
      profilesFolder: userAuthFolder
    };

    if (userData.config.version && userData.config.version !== 'auto') {
      botOptions.version = userData.config.version;
    }

    if (userData.config.auth === 'microsoft') {
      botOptions.onMsaCode = (data) => {
        addBotLog(userData, 'auth', `🔐 [تسجيل مايكروسوفت] مطلوب المصادقة لمرة واحدة:`);
        addBotLog(userData, 'auth', `1️⃣ افتح: ${data.verification_uri}`);
        addBotLog(userData, 'auth', `2️⃣ أدخل الكود: ${data.user_code}`);
        addBotLog(userData, 'auth', `🔗 رابط مباشر: https://microsoft.com/link?otc=${data.user_code}`);
      };
    }

    const bot = mineflayer.createBot(botOptions);
    userData.bot = bot;
    setupBotEvents(userData, bot);
    return { success: true, message: 'جاري بدء اتصال البوت...' };
  } catch (err) {
    userData.botStatus = 'disconnected';
    addBotLog(userData, 'error', `خطأ أثناء إنشاء البوت: ${err.message || err}`);
    scheduleReconnect(userData);
    return { success: false, message: err.message };
  }
}

// 2. إعداد أحداث البوت
function setupBotEvents(userData, bot) {
  bot.once('spawn', () => {
    userData.botStatus = 'connected';
    userData.connectedSince = new Date();
    addBotLog(userData, 'success', `تم الاتصال بالسيرفر بنجاح باسم '${bot.username}'!`);

    try {
      bot.loadPlugin(pathfinder);
      addBotLog(userData, 'bot', 'تم تفعيل نظام الملاحة الذكي (Pathfinder).');
    } catch (err) {
      addBotLog(userData, 'error', `تعذر تفعيل Pathfinder: ${err.message}`);
    }

    // تفعيل Anti-AFK
    setTimeout(() => {
      startAntiAFK(userData);
    }, 3000);

    // تنفيذ الأمر التلقائي (مثل /smp)
    const conf = userData.config;
    if (conf.autoCommand && conf.autoCommand.trim()) {
      const delayMs = (conf.autoCommandDelay || 7) * 1000;
      addBotLog(userData, 'system', `سيتم إرسال الأمر (${conf.autoCommand}) بعد ${conf.autoCommandDelay || 7} ثوانٍ...`);
      setTimeout(() => {
        if (userData.bot && userData.botStatus === 'connected') {
          userData.bot.chat(conf.autoCommand.trim());
          addBotLog(userData, 'chat', `[أمر تلقائي] تم إرسال: ${conf.autoCommand}`);

          if (conf.autoWalkToPos && conf.targetPos && conf.targetPos.x !== null) {
            setTimeout(() => {
              goToCoordinates(userData.userId, conf.targetPos.x, conf.targetPos.y, conf.targetPos.z);
            }, 3000);
          }
        }
      }, delayMs);
    } else if (conf.autoWalkToPos && conf.targetPos && conf.targetPos.x !== null) {
      setTimeout(() => {
        goToCoordinates(userData.userId, conf.targetPos.x, conf.targetPos.y, conf.targetPos.z);
      }, 4000);
    }
  });

  bot.on('message', (jsonMsg) => {
    try {
      const msgStr = jsonMsg.toString();
      if (!msgStr.trim()) return;

      addBotLog(userData, 'chat', msgStr);

      if (userData.config.password && !userData.hasLoggedIn) {
        const lower = msgStr.toLowerCase();
        if (lower.includes('/register') && !lower.includes('already')) {
          bot.chat(`/register ${userData.config.password} ${userData.config.password}`);
          addBotLog(userData, 'auth', 'تم إرسال أمر التسجيل /register');
          userData.hasLoggedIn = true;
        } else if (lower.includes('/login') && !lower.includes('already')) {
          bot.chat(`/login ${userData.config.password}`);
          addBotLog(userData, 'auth', 'تم إرسال أمر تسجيل الدخول /login');
          userData.hasLoggedIn = true;
        }
      }
    } catch (e) {}
  });

  bot.on('goal_reached', () => {
    addBotLog(userData, 'success', `🎯 وصل البوت إلى المكان المحدد بنجاح!`);
    try {
      bot.clearControlStates();
    } catch (e) {}
  });

  bot.on('kicked', (reason) => {
    const formattedReason = parseReason(reason);
    userData.botStatus = 'disconnected';
    addBotLog(userData, 'warn', `تم طرد البوت من السيرفر. السبب: ${formattedReason}`);
    cleanUpBot(userData);
    scheduleReconnect(userData);
  });

  bot.on('error', (err) => {
    userData.botStatus = 'disconnected';
    addBotLog(userData, 'error', `خطأ في اتصال البوت: ${err.message || err}`);
    cleanUpBot(userData);
    scheduleReconnect(userData);
  });

  bot.on('end', (reason) => {
    userData.botStatus = 'disconnected';
    addBotLog(userData, 'warn', `انقطع الاتصال بالسيرفر (${reason || 'Disconnected'}).`);
    cleanUpBot(userData);
    scheduleReconnect(userData);
  });
}

// 3. التوجه نحو إحداثيات محددة
function goToCoordinates(userId, x, y, z) {
  const userData = getOrCreateUserBotData(userId);
  const bot = userData.bot;

  if (!bot || userData.botStatus !== 'connected') {
    return { success: false, message: 'البوت غير متصل حالياً بالسيرفر' };
  }
  if (!bot.pathfinder) {
    return { success: false, message: 'نظام الحركة Pathfinder غير جاهز' };
  }

  const targetX = parseFloat(x);
  const targetY = parseFloat(y);
  const targetZ = parseFloat(z);

  if (isNaN(targetX) || isNaN(targetY) || isNaN(targetZ)) {
    return { success: false, message: 'إحداثيات غير صحيحة، يرجى كتابة أرقام لـ X, Y, Z' };
  }

  try {
    const defaultMove = new Movements(bot);
    defaultMove.canDig = false;
    defaultMove.allow1by1towers = false;
    defaultMove.canOpenDoors = true;
    bot.pathfinder.setMovements(defaultMove);

    addBotLog(userData, 'bot', `بدء التوجه إلى الإحداثيات: X=${targetX.toFixed(1)}, Y=${targetY.toFixed(1)}, Z=${targetZ.toFixed(1)}...`);
    const goal = new GoalNear(targetX, targetY, targetZ, 0.7);
    bot.pathfinder.setGoal(goal);

    return { success: true, message: `جاري التوجه إلى الموقع (${targetX.toFixed(1)}, ${targetY.toFixed(1)}, ${targetZ.toFixed(1)})` };
  } catch (err) {
    addBotLog(userData, 'error', `خطأ أثناء الملاحة: ${err.message}`);
    return { success: false, message: err.message };
  }
}

// 4. إيقاف الحركة
function stopMovement(userId) {
  const userData = getOrCreateUserBotData(userId);
  const bot = userData.bot;
  if (!bot || !bot.pathfinder) return false;
  try {
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
    addBotLog(userData, 'bot', 'تم إيقاف حركة البوت.');
    return true;
  } catch (e) {
    return false;
  }
}

// 5. نظام Anti-AFK وحماية الموقع
function startAntiAFK(userData) {
  stopAntiAFK(userData);
  addBotLog(userData, 'afk', 'تم تفعيل Anti-AFK الذكي (حركات عشوائية مع تثبيت مكان الوقوف).');

  userData.afkInterval = setInterval(() => {
    const bot = userData.bot;
    if (!bot || userData.botStatus !== 'connected' || !bot.entity) return;

    // فحص تثبيت الموقع (Lock Position)
    if (userData.config.lockPosition && userData.config.targetPos && userData.config.targetPos.x !== null) {
      const pos = bot.entity.position;
      const dx = pos.x - userData.config.targetPos.x;
      const dz = pos.z - userData.config.targetPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 2.0 && bot.pathfinder && !bot.pathfinder.isMoving()) {
        addBotLog(userData, 'warn', `تم دفع البوت بعيداً (${dist.toFixed(1)} بلوك)! جاري العودة للمكان...`);
        goToCoordinates(userData.userId, userData.config.targetPos.x, userData.config.targetPos.y, userData.config.targetPos.z);
        return;
      }
    }

    if (bot.pathfinder && bot.pathfinder.isMoving()) return;

    try {
      bot.swingArm('right');
      const subtleYaw = bot.entity.yaw + (Math.random() * 0.4 - 0.2);
      bot.look(subtleYaw, bot.entity.pitch, true);

      bot.setControlState('sneak', true);
      setTimeout(() => {
        if (bot) bot.setControlState('sneak', false);
      }, 400);
    } catch (err) {}
  }, 20000);
}

function stopAntiAFK(userData) {
  if (userData.afkInterval) {
    clearInterval(userData.afkInterval);
    userData.afkInterval = null;
  }
}

// 6. تنظيف وفصل البوت
function cleanUpBot(userData) {
  stopAntiAFK(userData);
  userData.hasLoggedIn = false;
  if (userData.bot) {
    try {
      if (userData.bot.pathfinder) {
        userData.bot.pathfinder.setGoal(null);
      }
      userData.bot.removeAllListeners();
      userData.bot.end();
    } catch (e) {}
    userData.bot = null;
  }
}

// 7. إيقاف البوت وفصله تماماً
function stopBotForUser(userId) {
  const userData = getOrCreateUserBotData(userId);
  userData.userDisconnected = true;
  if (userData.reconnectTimeout) {
    clearTimeout(userData.reconnectTimeout);
    userData.reconnectTimeout = null;
  }

  cleanUpBot(userData);
  userData.botStatus = 'disconnected';
  addBotLog(userData, 'system', 'تم إيقاف وفصل البوت بنجاح.');
  return { success: true, message: 'تم إيقاف البوت وفصله عن السيرفر' };
}

// 8. جدولة إعادة الاتصال التلقائي
function scheduleReconnect(userData) {
  if (userData.userDisconnected) {
    addBotLog(userData, 'system', 'تم فصل البوت يدوياً، لن تتم إعادة الاتصال تلقائياً.');
    return;
  }

  if (userData.reconnectTimeout || userData.isReconnecting) return;

  userData.isReconnecting = true;
  addBotLog(userData, 'reconnect', 'سيتم محاولة إعادة الاتصال خلال 15 ثانية...');

  userData.reconnectTimeout = setTimeout(() => {
    userData.reconnectTimeout = null;
    userData.isReconnecting = false;
    startBotForUser(userData.userId);
  }, 15000);
}

// 9. إرسال رسالة أو أمر في الشات
function sendBotChat(userId, message) {
  const userData = getOrCreateUserBotData(userId);
  const bot = userData.bot;

  if (!bot || userData.botStatus !== 'connected') {
    return { success: false, message: 'البوت غير متصل بالسيرفر' };
  }
  if (!message || !message.trim()) {
    return { success: false, message: 'الرسالة فارغة' };
  }

  const cleanMsg = message.trim();
  bot.chat(cleanMsg);
  addBotLog(userData, 'chat', `[أمر يدوي] ${cleanMsg}`);
  return { success: true, message: 'تم إرسال الأمر للسيرفر بنجاح' };
}

// 10. جلب حالة البوت اللحظية
function getUserBotStatus(userId) {
  const userData = getOrCreateUserBotData(userId);
  const bot = userData.bot;

  let uptimeSeconds = 0;
  if (userData.botStatus === 'connected' && userData.connectedSince) {
    uptimeSeconds = Math.floor((new Date() - userData.connectedSince) / 1000);
  }

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

  return {
    status: userData.botStatus,
    config: userData.config,
    position: currentPos,
    isMoving,
    uptimeSeconds,
    logs: userData.logs
  };
}

// 11. إحصائيات عامة للأدمن
function getAdminStats() {
  let connectedBots = 0;
  let totalBots = activeBots.size;

  activeBots.forEach((data) => {
    if (data.botStatus === 'connected') {
      connectedBots++;
    }
  });

  return {
    totalBots,
    connectedBots
  };
}

module.exports = {
  startBotForUser,
  stopBotForUser,
  goToCoordinates,
  stopMovement,
  sendBotChat,
  getUserBotStatus,
  getOrCreateUserBotData,
  getAdminStats
};
