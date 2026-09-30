const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalNear } = goals;
const path = require('path');
const fs = require('fs');

let bedrock = null;
try {
  bedrock = require('bedrock-protocol');
} catch (e) {
  console.warn('[BotManager] bedrock-protocol could not be loaded:', e.message);
}

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
      msaCode: null,
      logs: [],
      config: {
        edition: 'bedrock', // 'bedrock' (Free Xbox - DonutSMP 19132) | 'java' (Official Minecraft Java 25565)
        host: 'donutsmp.net',
        port: 19132,
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
  userData.msaCode = null;
  userData.botStatus = 'connecting';

  const isBedrock = userData.config.edition === 'bedrock';

  // ----------------------------------------
  // A. تشغيل بوت نسخة البيدروك (Bedrock 19132 - حساب إكسبوكس مجاني 100%)
  // ----------------------------------------
  if (isBedrock) {
    if (!bedrock) {
      userData.botStatus = 'disconnected';
      addBotLog(userData, 'error', 'حزمة bedrock-protocol غير متوفرة في النظام!');
      return { success: false, message: 'حزمة bedrock-protocol غير متوفرة' };
    }

    const host = userData.config.host || 'donutsmp.net';
    const port = parseInt(userData.config.port || 19132, 10);
    userData.config.port = port;

    addBotLog(userData, 'bot', `🚀 جاري الاتصال بسيرفر DonutSMP (Bedrock) ${host}:${port} باسم '${userData.config.username}' (حساب إكسبوكس مجاني بدون شراء اللعبة)...`);

    const bedrockAuthFolder = path.join(__dirname, 'auth-cache', `bedrock-${userData.userId}`);
    if (!fs.existsSync(bedrockAuthFolder)) {
      fs.mkdirSync(bedrockAuthFolder, { recursive: true });
    }

    try {
      const client = bedrock.createClient({
        host: host,
        port: port,
        username: userData.config.username,
        offline: false, // Xbox Live Auth
        profilesFolder: bedrockAuthFolder,
        onMsaCode: (data) => {
          const code = data.user_code || data.userCode;
          const url = data.verification_uri || data.verificationUri || 'https://microsoft.com/link';
          userData.msaCode = {
            code,
            url,
            link: url,
            expiresAt: Date.now() + ((data.expires_in || 900) * 1000)
          };
          addBotLog(userData, 'auth', `🔐 [حساب إكسبوكس مجاني] مطلوب تأكيد الكود لمرة واحدة:`);
          addBotLog(userData, 'auth', `1️⃣ افتح الرابط: ${url}`);
          addBotLog(userData, 'auth', `2️⃣ أدخل الكود: ${code}`);
          addBotLog(userData, 'auth', `🔗 رابط مباشر: https://microsoft.com/link?otc=${code}`);
        }
      });

      userData.bot = client;
      setupBedrockBotEvents(userData, client);
      return { success: true, message: 'جاري بدء اتصال بوت البيدروك بالحساب المجاني...' };
    } catch (err) {
      userData.botStatus = 'disconnected';
      addBotLog(userData, 'error', `خطأ أثناء إنشاء بوت البيدروك: ${err.message || err}`);
      scheduleReconnect(userData);
      return { success: false, message: err.message };
    }
  }

  // ----------------------------------------
  // B. تشغيل بوت نسخة الجافا (Java 25565 - حساب مايكروسوفت أصلي)
  // ----------------------------------------
  const host = userData.config.host || 'donutsmp.net';
  const port = parseInt(userData.config.port || 25565, 10);
  userData.config.port = port;

  addBotLog(userData, 'bot', `جاري الاتصال بسيرفر Java ${host}:${port} باسم '${userData.config.username}' (${userData.config.auth === 'microsoft' ? 'Microsoft رسمي' : 'مكرك'})...`);

  // مجلد كاش مخصص لكل مستخدم لتسجيلات الدخول
  const userAuthFolder = path.join(__dirname, 'auth-cache', `java-${userData.userId}`);
  if (!fs.existsSync(userAuthFolder)) {
    fs.mkdirSync(userAuthFolder, { recursive: true });
  }

  try {
    const botOptions = {
      host: host,
      port: port,
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
        const code = data.user_code || data.userCode;
        const url = data.verification_uri || data.verificationUri || 'https://microsoft.com/link';
        userData.msaCode = {
          code,
          url,
          link: url,
          expiresAt: Date.now() + ((data.expires_in || 900) * 1000)
        };
        addBotLog(userData, 'auth', `🔐 [تسجيل مايكروسوفت رسمي] مطلوب المصادقة لمرة واحدة:`);
        addBotLog(userData, 'auth', `1️⃣ افتح: ${url}`);
        addBotLog(userData, 'auth', `2️⃣ أدخل الكود: ${code}`);
        addBotLog(userData, 'auth', `🔗 رابط مباشر: https://microsoft.com/link?otc=${code}`);
      };
    }

    const bot = mineflayer.createBot(botOptions);
    userData.bot = bot;
    setupBotEvents(userData, bot);
    return { success: true, message: 'جاري بدء اتصال بوت الجافا...' };
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

// أحداث بوت البيدروك (Bedrock Edition Events)
function setupBedrockBotEvents(userData, client) {
  client.on('join', () => {
    userData.botStatus = 'connected';
    userData.connectedSince = new Date();
    userData.hasLoggedIn = true;
    userData.msaCode = null;
    addBotLog(userData, 'success', `🟢 تم الاتصال ودخول سيرفر DonutSMP (Bedrock Edition) بنجاح بحساب إكسبوكس المجاني!`);

    // تنفيذ الأمر التلقائي (مثل /smp)
    const conf = userData.config;
    if (conf.autoCommand && conf.autoCommand.trim()) {
      const delayMs = (conf.autoCommandDelay || 7) * 1000;
      addBotLog(userData, 'system', `سيتم إرسال أمر الدخول (${conf.autoCommand}) بعد ${conf.autoCommandDelay || 7} ثوانٍ...`);
      setTimeout(() => {
        if (userData.bot && userData.botStatus === 'connected') {
          try {
            client.queue('text', {
              type: 'chat',
              needs_translation: false,
              source_name: client.username || userData.config.username,
              xuid: '',
              platform_chat_id: '',
              filtered_message: '',
              message: conf.autoCommand.trim()
            });
            addBotLog(userData, 'chat', `[أمر تلقائي] تم إرسال: ${conf.autoCommand}`);
          } catch (e) {}
        }
      }, delayMs);
    }

    startBedrockAntiAfk(userData, client);
  });

  client.on('text', (packet) => {
    try {
      if (packet.message) {
        addBotLog(userData, 'chat', packet.message);
      }
    } catch (e) {}
  });

  client.on('kick', (packet) => {
    const reason = packet.message || 'تم الطرد من السيرفر';
    userData.botStatus = 'disconnected';
    userData.msaCode = null;
    addBotLog(userData, 'warn', `⚠️ تم طرد البوت من سيرفر البيدروك. السبب: ${reason}`);
    cleanUpBot(userData);
    scheduleReconnect(userData);
  });

  client.on('close', () => {
    userData.botStatus = 'disconnected';
    userData.msaCode = null;
    addBotLog(userData, 'warn', 'انقطع الاتصال بسيرفر البيدروك.');
    cleanUpBot(userData);
    scheduleReconnect(userData);
  });

  client.on('error', (err) => {
    userData.botStatus = 'disconnected';
    userData.msaCode = null;
    addBotLog(userData, 'error', `خطأ في اتصال البيدروك: ${err.message || err}`);
    cleanUpBot(userData);
    scheduleReconnect(userData);
  });
}

function startBedrockAntiAfk(userData, client) {
  if (userData.afkInterval) clearInterval(userData.afkInterval);
  userData.afkInterval = setInterval(() => {
    if (!userData.bot || userData.botStatus !== 'connected') return;
    try {
      client.queue('player_action', {
        runtime_entity_id: client.entityId || 0,
        action: 'start_sneak',
        position: { x: 0, y: 0, z: 0 },
        result_position: { x: 0, y: 0, z: 0 },
        face: 0
      });
      setTimeout(() => {
        if (userData.bot && userData.botStatus === 'connected') {
          client.queue('player_action', {
            runtime_entity_id: client.entityId || 0,
            action: 'stop_sneak',
            position: { x: 0, y: 0, z: 0 },
            result_position: { x: 0, y: 0, z: 0 },
            face: 0
          });
        }
      }, 500);
    } catch (e) {}
  }, 25000);
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
      if (typeof userData.bot.close === 'function') {
        userData.bot.close();
      } else if (typeof userData.bot.quit === 'function') {
        userData.bot.quit();
      } else if (typeof userData.bot.end === 'function') {
        userData.bot.end();
      } else if (typeof userData.bot.disconnect === 'function') {
        userData.bot.disconnect();
      }
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
  userData.msaCode = null;
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
  if (userData.config.edition === 'bedrock') {
    try {
      bot.queue('text', {
        type: 'chat',
        needs_translation: false,
        source_name: bot.username || userData.config.username,
        xuid: '',
        platform_chat_id: '',
        filtered_message: '',
        message: cleanMsg
      });
      addBotLog(userData, 'chat', `[أنت]: ${cleanMsg}`);
      return { success: true, message: 'تم إرسال الأمر لسيرفر البيدروك بنجاح' };
    } catch (e) {
      return { success: false, message: 'فشل إرسال الأمر في البيدروك' };
    }
  } else {
    bot.chat(cleanMsg);
    addBotLog(userData, 'chat', `[أمر يدوي] ${cleanMsg}`);
    return { success: true, message: 'تم إرسال الأمر للسيرفر بنجاح' };
  }
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
    msaCode: userData.msaCode || null,
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

// 12. إيقاف جميع البوتات لجميع المستخدمين دفعة واحدة (Admin Kill-Switch)
function stopAllBots() {
  let count = 0;
  for (const [userId, userData] of activeBots.entries()) {
    if (userData.bot || userData.botStatus !== 'disconnected') {
      userData.userDisconnected = true;
      cleanUpBot(userData);
      userData.botStatus = 'disconnected';
      userData.msaCode = null;
      addBotLog(userData, 'warn', '⚠️ تم إيقاف البوت بواسطة الأدمن (إيقاف شامل لجميع البوتات).');
      count++;
    }
  }
  return { success: true, count, message: `تم إيقاف ${count} بوت/بوتات شغالة بنجاح.` };
}

module.exports = {
  startBotForUser,
  stopBotForUser,
  stopAllBots,
  goToCoordinates,
  stopMovement,
  sendBotChat,
  getUserBotStatus,
  getOrCreateUserBotData,
  getAdminStats
};

