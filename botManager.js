const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalNear } = goals;
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { saveAuthCache, loadAuthCache } = require('./firebase');

let bedrock = null;
try {
  bedrock = require('bedrock-protocol');
} catch (e) {
  console.warn('[BotManager] bedrock-protocol could not be loaded:', e.message);
}

let Authflow = null;
let Titles = null;
try {
  const pAuth = require('prismarine-auth');
  Authflow = pAuth.Authflow;
  Titles = pAuth.Titles;
} catch (e) {
  console.warn('[BotManager] prismarine-auth could not be loaded:', e.message);
}


// دوال مساعدة لنسخ واسترجاع جلسات التوثيق الدائمة لحسابات إكسبوكس
async function backupAuthCache(userId, authType, folderPath) {
  try {
    if (!fs.existsSync(folderPath)) return;
    const fileNames = fs.readdirSync(folderPath);
    if (!fileNames || fileNames.length === 0) return;
    const filesObj = {};
    for (const file of fileNames) {
      const fullPath = path.join(folderPath, file);
      if (fs.statSync(fullPath).isFile()) {
        filesObj[file] = fs.readFileSync(fullPath, 'utf8');
      }
    }
    if (Object.keys(filesObj).length > 0) {
      await saveAuthCache(userId, authType, filesObj);
    }
  } catch (e) {
    console.warn(`[Auth Cache] تعذر حفظ ملفات التوثيق في فايربيس لـ ${userId}:`, e.message);
  }
}

async function restoreAuthCache(userId, authType, folderPath) {
  try {
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    const currentFiles = fs.readdirSync(folderPath);
    if (currentFiles && currentFiles.length > 0) return;
    const cachedFiles = await loadAuthCache(userId, authType);
    if (cachedFiles && typeof cachedFiles === 'object') {
      for (const [fileName, content] of Object.entries(cachedFiles)) {
        fs.writeFileSync(path.join(folderPath, fileName), content, 'utf8');
      }
      console.log(`[Auth Cache] تم استرجاع ملفات توثيق Xbox السحابية بنجاح لـ ${userId}!`);
    }
  } catch (e) {
    console.warn(`[Auth Cache] تعذر استرجاع ملفات التوثيق من فايربيس لـ ${userId}:`, e.message);
  }
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
      heartbeatInterval: null,
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
        autoCommand: '',
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
async function startBotForUser(userId, newConfig = {}) {
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

    // استرجاع ملفات التوثيق السحابية إن وجدت لتسجيل الدخول التلقائي بدون طلب كود
    await restoreAuthCache(userData.userId, 'bedrock', bedrockAuthFolder);

    try {
      // إعداد نظام Authflow موحد بنفس المعرف لكل مستخدم
      let authflow = null;
      if (Authflow && Titles) {
        authflow = new Authflow(userData.userId, bedrockAuthFolder, {
          authTitle: Titles.MinecraftNintendoSwitch,
          deviceType: 'Nintendo',
          flow: 'live'
        }, (data) => {
          const code = data.user_code || data.userCode;
          const directLink = `https://microsoft.com/link?otc=${code}`;
          userData.msaCode = {
            code,
            url: directLink,
            link: directLink,
            expiresAt: Date.now() + ((data.expires_in || 900) * 1000)
          };
          addBotLog(userData, 'auth', `🔐 [حساب إكسبوكس] مطلوب تأكيد الدخول لمرة واحدة فقط:`);
          addBotLog(userData, 'auth', `🔗 اضغط هنا لتأكيد حساب إكسبوكس مباشرة بنقرة واحدة: ${directLink}`);
          addBotLog(userData, 'auth', `✨ يتم إدخال الكود تلقائياً بمجرد فتح الرابط، فقط اضغط على "متابعة" في مايكروسوفت.`);
        });

        // حفظ كاش التوثيق فور استلام توكن Xbox بنجاح في الخلفية
        authflow.getXboxToken().then(async (xsts) => {
          if (xsts && xsts.DisplayClaims && xsts.DisplayClaims.xui && xsts.DisplayClaims.xui[0]) {
            const gtg = xsts.DisplayClaims.xui[0].gtg;
            addBotLog(userData, 'auth', `✅ تم تأكيد حساب Xbox بنجاح باسم: ${gtg}`);
          }
          await backupAuthCache(userData.userId, 'bedrock', bedrockAuthFolder);
        }).catch((e) => {
          console.warn(`[Xbox Authflow] xsts catch for ${userData.userId}:`, e.message);
        });

        // توفير Fallback لحسابات إكسبوكس المجانية: إذا تعذر جلب multiplayerToken المخصص لـ Realms/Franchise
        // بسبب عدم شراء اللعبة أو انقطاع الاتصال (terminated)، نعتمد على Chain الأساسية التي يحتاجها سيرفر DonutSMP
        const originalGetMinecraftBedrockToken = authflow.getMinecraftBedrockToken.bind(authflow);
        authflow.getMinecraftBedrockToken = async function (publicKey, options = {}) {
          try {
            return await originalGetMinecraftBedrockToken(publicKey, options);
          } catch (tokenErr) {
            console.warn(`[Xbox Auth] تعذر جلب multiplayerToken (${tokenErr.message}). جاري تجربة Chain الأساسية لسيرفر DonutSMP...`);
            const chain = await authflow.getMinecraftBedrockChain(publicKey);
            return { chain, token: '' };
          }
        };
      }

      const clientOptions = {
        host: host,
        port: port,
        username: userData.userId,
        offline: false, // Xbox Live Auth
        profilesFolder: bedrockAuthFolder
      };

      if (authflow) {
        clientOptions.authflow = authflow;
      } else {
        clientOptions.onMsaCode = (data) => {
          const code = data.user_code || data.userCode;
          const directLink = `https://microsoft.com/link?otc=${code}`;
          userData.msaCode = {
            code,
            url: directLink,
            link: directLink,
            expiresAt: Date.now() + ((data.expires_in || 900) * 1000)
          };
          addBotLog(userData, 'auth', `🔐 [حساب إكسبوكس] مطلوب تأكيد الدخول لمرة واحدة فقط:`);
          addBotLog(userData, 'auth', `🔗 اضغط هنا لتأكيد حساب إكسبوكس مباشرة بنقرة واحدة: ${directLink}`);
          addBotLog(userData, 'auth', `✨ يتم إدخال الكود تلقائياً بمجرد فتح الرابط، فقط اضغط على "متابعة" في مايكروسوفت.`);
        };
      }

      const client = bedrock.createClient(clientOptions);

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

// دالة إرسال الأوامر والرسائل في نسخة البيدروك
function sendBedrockCommandOrChat(client, message) {
  const clean = (message || '').trim();
  if (!clean) return false;
  try {
    if (clean.startsWith('/')) {
      try {
        client.queue('command_request', {
          command: clean,
          origin: {
            type: 'player',
            uuid: crypto.randomUUID(),
            request_id: '',
            player_entity_id: 0n
          },
          internal: false,
          version: 'latest'
        });
      } catch (cmdErr) {
        client.queue('text', {
          type: 'chat',
          needs_translation: false,
          source_name: client.username || 'Player',
          xuid: '',
          platform_chat_id: '',
          filtered_message: '',
          message: clean
        });
      }
    } else {
      client.queue('text', {
        type: 'chat',
        needs_translation: false,
        source_name: client.username || 'Player',
        xuid: '',
        platform_chat_id: '',
        filtered_message: '',
        message: clean
      });
    }
    return true;
  } catch (err) {
    console.error('[Bedrock Send Error]:', err.message);
    return false;
  }
}

// أحداث بوت البيدروك (Bedrock Edition Events)
function setupBedrockBotEvents(userData, client) {
  client.on('join', () => {
    userData.botStatus = 'connected';
    userData.connectedSince = new Date();
    userData.hasLoggedIn = true;
    userData.msaCode = null;

    const rawGamertag = client.username || (client.profile && client.profile.name) || 'Tokyo k7il9l';
    const javaName = `.${rawGamertag.replace(/\s+/g, '_')}`;
    userData.inGameName = javaName;

    addBotLog(userData, 'success', `🟢 تم الاتصال ودخول سيرفر DonutSMP (Bedrock Edition) بنجاح بحساب إكسبوكس!`);
    addBotLog(userData, 'bot', `🎮 اسم البوت الفعلي داخل السيرفر: [ ${javaName} ]`);
    addBotLog(userData, 'bot', `💡 لإرسال طلب انتقال للبوت من ماينكرافت الجافا، اكتب: /tpahere ${javaName}`);

    // حفظ كاش التوثيق سحابياً في فايربيس لكي لا يطلب تسجيل الدخول مرة ثانية أبداً
    const bedrockAuthFolder = path.join(__dirname, 'auth-cache', `bedrock-${userData.userId}`);
    setTimeout(() => {
      backupAuthCache(userData.userId, 'bedrock', bedrockAuthFolder);
    }, 2000);

    // تنفيذ الأمر التلقائي إن وُجد
    const conf = userData.config;
    if (conf.autoCommand && conf.autoCommand.trim()) {
      const delayMs = (conf.autoCommandDelay || 7) * 1000;
      addBotLog(userData, 'system', `سيتم إرسال أمر الدخول (${conf.autoCommand}) بعد ${conf.autoCommandDelay || 7} ثوانٍ...`);
      setTimeout(() => {
        if (userData.bot && userData.botStatus === 'connected') {
          sendBedrockCommandOrChat(client, conf.autoCommand.trim());
          addBotLog(userData, 'chat', `[أمر تلقائي] تم إرسال: ${conf.autoCommand}`);
        }
      }, delayMs);
    }

    startBedrockAntiAfk(userData, client);
  });

  client.on('start_game', (packet) => {
    try {
      if (packet && packet.player_position) {
        client.currentPosition = packet.player_position;
        client.currentRotation = packet.rotation || { pitch: 0, yaw: 0 };
      }
    } catch (e) {}
  });

  client.on('move_player', (packet) => {
    try {
      if (packet && (packet.runtime_entity_id === client.entityId || !client.currentPosition)) {
        client.currentPosition = packet.position;
        client.currentRotation = { pitch: packet.pitch, yaw: packet.yaw };
      }
    } catch (e) {}
  });

  client.on('text', (packet) => {
    try {
      if (packet.message) {
        addBotLog(userData, 'chat', packet.message);

        // قبول طلبات الانتقال TPA تلقائياً من اللاعبين أو صاحب البوت
        const lowerMsg = packet.message.toLowerCase();
        if (lowerMsg.includes('/tpaccept') || lowerMsg.includes('requested that you teleport') || lowerMsg.includes('requested to teleport')) {
          setTimeout(() => {
            if (userData.bot && userData.botStatus === 'connected') {
              sendBedrockCommandOrChat(client, '/tpaccept');
              addBotLog(userData, 'success', '⚡ تم استلام طلب انتقال وقبوله تلقائياً (/tpaccept)!');
            }
          }, 1200);
        }
      }
    } catch (e) {}
  });

  client.on('tick_sync', (packet) => {
    if (packet && packet.response_time != null) {
      client.tick = packet.response_time;
    }
  });

  client.on('kick', (packet) => {
    const reason = packet.message || 'تم الطرد من السيرفر';
    userData.botStatus = 'disconnected';
    userData.msaCode = null;
    addBotLog(userData, 'warn', `⚠️ تم طرد البوت من سيرفر البيدروك. السبب: ${reason}`);
    const shouldReconnect = userData.hasLoggedIn && !userData.userDisconnected;
    cleanUpBot(userData);
    if (shouldReconnect) {
      scheduleReconnect(userData);
    }
  });

  client.on('close', () => {
    userData.botStatus = 'disconnected';
    userData.msaCode = null;
    addBotLog(userData, 'warn', 'انقطع الاتصال بسيرفر البيدروك.');
    const shouldReconnect = userData.hasLoggedIn && !userData.userDisconnected;
    cleanUpBot(userData);
    if (shouldReconnect) {
      scheduleReconnect(userData);
    }
  });

  client.on('error', (err) => {
    userData.botStatus = 'disconnected';
    userData.msaCode = null;
    const errStr = (err && (err.message || err.toString())) || 'خطأ غير معروف';
    const errCause = err && err.cause ? ` (${err.cause.message || err.cause})` : '';
    console.error(`[Bedrock Bot Error] [${userData.userId}]:`, err);
    addBotLog(userData, 'error', `خطأ في اتصال البيدروك: ${errStr}${errCause}`);

    if (errStr.includes('Xbox Live error') || errStr.includes('2148916233') || errStr.includes('2148916234')) {
      addBotLog(userData, 'warn', '⚠️ حساب مايكروسوفت هذا جديد أو لم يتم تعيين اسم لاعب (Gamertag) له في إكسبوكس بعد. يرجى الدخول إلى موقع xbox.com مرة واحدة وتعيين اسم للاعب ثم إعادة المحاولة.');
    } else if (errStr.includes('terminated')) {
      addBotLog(userData, 'warn', '⚠️ تعذر إتمام مصادقة مايكروسوفت (انقطاع في الشبكة أو ضغط بالسيرفر). جاري تنظيف الجلسة وإعادة المحاولة...');
      const bedrockAuthFolder = path.join(__dirname, 'auth-cache', `bedrock-${userData.userId}`);
      try {
        if (fs.existsSync(bedrockAuthFolder)) {
          const files = fs.readdirSync(bedrockAuthFolder);
          for (const f of files) {
            if (f.includes('bed-cache.json') || f.includes('mcs-cache.json') || f.includes('pfb-cache.json')) {
              try { fs.unlinkSync(path.join(bedrockAuthFolder, f)); } catch(e){}
            }
          }
        }
      } catch (e) {}
    }

    const shouldReconnect = userData.hasLoggedIn && !userData.userDisconnected;
    cleanUpBot(userData);
    if (shouldReconnect) {
      scheduleReconnect(userData);
    }
  });
}

function startBedrockAntiAfk(userData, client) {
  if (userData.afkInterval) clearInterval(userData.afkInterval);
  if (userData.heartbeatInterval) clearInterval(userData.heartbeatInterval);

  if (client.tick == null) client.tick = 0n;

  // 1. نبضات الحفاظ على الاتصال (Keepalive & Tick Sync) كل 500ms تماماً كمواصفات ماينكرافت الرسمية
  userData.heartbeatInterval = setInterval(() => {
    if (!userData.bot || userData.botStatus !== 'connected') return;
    try {
      client.queue('tick_sync', {
        request_time: client.tick,
        response_time: 0n
      });
      client.tick = (client.tick || 0n) + 10n;
    } catch (e) {}
  }, 500);

  // 2. حركة تفاعلية دورية كل 5 ثوانٍ لإثبات أن البوت متفاعل وحي داخل السيرفر
  let sneakState = false;
  userData.afkInterval = setInterval(() => {
    if (!userData.bot || userData.botStatus !== 'connected') return;
    try {
      sneakState = !sneakState;
      client.queue('player_action', {
        runtime_entity_id: client.entityId || 0,
        action: sneakState ? 'start_sneak' : 'stop_sneak',
        position: { x: 0, y: 0, z: 0 },
        result_position: { x: 0, y: 0, z: 0 },
        face: 0
      });
    } catch (e) {}
  }, 5000);

  // 3. التفاتة تفاعلية للرأس كل 10 ثوانٍ لمنع الطرد بعد فترات الـ AFK الطويلة
  let yawOffset = 0;
  userData.lookInterval = setInterval(() => {
    if (!userData.bot || userData.botStatus !== 'connected' || !client.currentPosition) return;
    try {
      yawOffset = (yawOffset === 0) ? 10 : 0;
      const basePitch = (client.currentRotation && client.currentRotation.pitch) || 0;
      const baseYaw = (client.currentRotation && client.currentRotation.yaw) || 0;
      const newYaw = baseYaw + yawOffset;
      client.queue('move_player', {
        runtime_entity_id: client.entityId || 1n,
        position: client.currentPosition,
        pitch: basePitch,
        yaw: newYaw,
        head_yaw: newYaw,
        mode: 'head_rotation',
        on_ground: true,
        ridden_runtime_entity_id: 0n,
        teleport_cause: 'unknown',
        teleport_source_entity_type: 0,
        tick: client.tick || 0n
      });
    } catch (e) {}
  }, 10000);
}

// 6. تنظيف وفصل البوت
function cleanUpBot(userData) {
  stopAntiAFK(userData);
  if (userData.heartbeatInterval) {
    clearInterval(userData.heartbeatInterval);
    userData.heartbeatInterval = null;
  }
  if (userData.lookInterval) {
    clearInterval(userData.lookInterval);
    userData.lookInterval = null;
  }
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
    const ok = sendBedrockCommandOrChat(bot, cleanMsg);
    if (ok) {
      addBotLog(userData, 'chat', `[أنت]: ${cleanMsg}`);
      return { success: true, message: 'تم إرسال الأمر لسيرفر البيدروك بنجاح' };
    } else {
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

// 13. إدارة جلسات تسجيل الدخول الرسمي بحساب Xbox
const pendingXboxAuths = new Map();

async function startXboxAuthFlow(userId) {
  const cleanId = userId.trim().toLowerCase();
  const bedrockAuthFolder = path.join(__dirname, 'auth-cache', `bedrock-${cleanId}`);
  if (!fs.existsSync(bedrockAuthFolder)) {
    fs.mkdirSync(bedrockAuthFolder, { recursive: true });
  }

  if (pendingXboxAuths.has(cleanId)) {
    const existing = pendingXboxAuths.get(cleanId);
    if (existing.status === 'pending' && existing.expiresAt > Date.now()) {
      return { success: true, ...existing };
    }
  }

  const authData = {
    userId: cleanId,
    code: null,
    directUrl: null,
    expiresAt: null,
    status: 'pending',
    gamertag: null
  };
  pendingXboxAuths.set(cleanId, authData);

  if (!Authflow || !Titles) {
    throw new Error('حزمة التوثيق prismarine-auth غير متوفرة في النظام');
  }

  const flow = new Authflow(cleanId, bedrockAuthFolder, {
    authTitle: Titles.MinecraftNintendoSwitch,
    deviceType: 'Nintendo',
    flow: 'live'
  }, (data) => {
    const code = data.user_code || data.userCode;
    const directUrl = `https://microsoft.com/link?otc=${code}`;
    authData.code = code;
    authData.directUrl = directUrl;
    authData.expiresAt = Date.now() + ((data.expires_in || 900) * 1000);
  });

  // تشغيل طلب التوكن في الخلفية
  flow.getXboxToken().then(async (xsts) => {
    authData.status = 'success';
    try {
      if (xsts && xsts.DisplayClaims && xsts.DisplayClaims.xui && xsts.DisplayClaims.xui[0]) {
        authData.gamertag = xsts.DisplayClaims.xui[0].gtg || null;
      }
    } catch (e) {}
    await backupAuthCache(cleanId, 'bedrock', bedrockAuthFolder);
  }).catch((err) => {
    authData.status = 'error';
    authData.error = err.message || String(err);
    console.error(`[Xbox Auth Flow Error] [${cleanId}]:`, err);
  });

  // انتظار توليد الرابط والكود من مايكروسوفت
  for (let i = 0; i < 25; i++) {
    if (authData.code) break;
    await new Promise(r => setTimeout(r, 200));
  }

  return {
    success: true,
    code: authData.code,
    directUrl: authData.directUrl,
    expiresAt: authData.expiresAt
  };
}

async function getXboxAuthStatus(userId) {
  const cleanId = userId.trim().toLowerCase();
  const bedrockAuthFolder = path.join(__dirname, 'auth-cache', `bedrock-${cleanId}`);
  await restoreAuthCache(cleanId, 'bedrock', bedrockAuthFolder);

  let isLinked = false;
  let gamertag = null;

  if (fs.existsSync(bedrockAuthFolder)) {
    const files = fs.readdirSync(bedrockAuthFolder);
    const hasLive = files.some(f => f.includes('live-cache.json'));
    const hasXbl = files.some(f => f.includes('xbl-cache.json'));
    if (hasLive && hasXbl) {
      isLinked = true;
      try {
        const xblFile = files.find(f => f.includes('xbl-cache.json'));
        if (xblFile) {
          const content = JSON.parse(fs.readFileSync(path.join(bedrockAuthFolder, xblFile), 'utf8'));
          if (content && content.data && content.data.DisplayClaims && content.data.DisplayClaims.xui && content.data.DisplayClaims.xui[0]) {
            gamertag = content.data.DisplayClaims.xui[0].gtg;
          }
        }
      } catch (e) {}
    }
  }

  const pending = pendingXboxAuths.get(cleanId);
  const isPending = pending && pending.status === 'pending' && pending.expiresAt > Date.now();

  return {
    isLinked,
    gamertag: gamertag || (pending && pending.gamertag ? pending.gamertag : null),
    pending: isPending ? { code: pending.code, directUrl: pending.directUrl } : null
  };
}

async function unlinkXboxAuth(userId) {
  const cleanId = userId.trim().toLowerCase();
  const bedrockAuthFolder = path.join(__dirname, 'auth-cache', `bedrock-${cleanId}`);
  if (fs.existsSync(bedrockAuthFolder)) {
    try {
      fs.rmSync(bedrockAuthFolder, { recursive: true, force: true });
    } catch (e) {}
  }
  await saveAuthCache(cleanId, 'bedrock', {});
  pendingXboxAuths.delete(cleanId);
  return { success: true, message: 'تم إلغاء ربط حساب Xbox بنجاح.' };
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
  getAdminStats,
  startXboxAuthFlow,
  getXboxAuthStatus,
  unlinkXboxAuth
};

