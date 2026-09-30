const express = require('express');
const session = require('express-session');
const path = require('path');

const {
  isFirebaseConnected,
  getPlatformSettings,
  updatePlatformSettings,
  getUser,
  getUserByDiscordId,
  createUser,
  updateUserRole,
  getSubscription,
  getActiveSubscriptionsCount,
  createOrUpdateSubscription,
  getAllSubscriptions,
  createLicenseKey,
  createBulkLicenseKeys,
  redeemLicenseKey,
  getAllLicenseKeys,
  deleteLicenseKey,
  getBotConfig,
  saveBotConfig
} = require('./firebase');

const {
  startBotForUser,
  stopBotForUser,
  stopAllBots,
  goToCoordinates,
  stopMovement,
  sendBotChat,
  getUserBotStatus,
  getOrCreateUserBotData,
  getAdminStats
} = require('./botManager');

const { startExpiryCron } = require('./expiryCron');
const { initDiscordBot } = require('./discordBot');

// ==========================================
// 1. إعدادات خادم الويب (Express Web Server)
// ==========================================
const app = express();
const WEB_PORT = process.env.WEB_PORT || process.env.PORT || 3000;
const WEB_PASSWORD = process.env.WEB_PASSWORD || 'f1bot123';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'f1-minecraft-bot-saas-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));

// إتاحة الملفات الإستاتيكية
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 2. التحقق من المصادقة والصلاحيات (Auth Middlewares)
// ==========================================
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized', message: 'يرجى تسجيل الدخول أولاً' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'Forbidden', message: 'صلاحيات الأدمن فقط مطلوبة لهذه العملية' });
}

async function requireActiveSub(req, res, next) {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (user.role === 'admin') {
    return next();
  }

  const sub = await getSubscription(user.username);
  if (!sub) {
    return res.status(403).json({
      error: 'NO_SUBSCRIPTION',
      message: 'ليس لديك اشتراك نشط حالياً! يرجى شراء كود اشتراك أسبوعي أو التواصل مع الإدارة.'
    });
  }

  const now = new Date();
  const expiresAt = new Date(sub.expiresAt);

  if (sub.status !== 'active' || now >= expiresAt) {
    stopBotForUser(user.username);
    return res.status(403).json({
      error: 'EXPIRED',
      message: 'انتهت مدة اشتراكك الأسبوعي (7 أيام)! يرجى التجديد لتتمكن من تشغيل البوت والتحكم فيه.'
    });
  }

  next();
}

// ==========================================
// 3. مسارات التوثيق (Auth & Discord OAuth2 Routes)
// ==========================================

// تسجيل الدخول العادي
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
  }

  const cleanUser = username.trim().toLowerCase();
  const cleanPass = password.trim();

  if (cleanUser === 'admin' && cleanPass === WEB_PASSWORD) {
    req.session.user = { username: 'admin', role: 'admin' };
    return res.json({ success: true, message: 'تم تسجيل الدخول كمسؤول (Admin)', user: req.session.user });
  }

  const user = await getUser(cleanUser);
  if (user && user.password === cleanPass) {
    req.session.user = { username: user.username, role: user.role || 'customer' };
    return res.json({ success: true, message: 'تم تسجيل الدخول بنجاح', user: req.session.user });
  }

  return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة!' });
});

// تسجيل حساب جديد
app.post('/api/auth/register', async (req, res) => {
  const { username, password, licenseKey } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
  }

  const cleanUser = username.trim().toLowerCase();
  if (cleanUser.length < 3) {
    return res.status(400).json({ success: false, message: 'يجب أن يكون اسم المستخدم 3 أحرف على الأقل' });
  }

  const existing = await getUser(cleanUser);
  if (existing) {
    return res.status(400).json({ success: false, message: 'اسم المستخدم هذا مستخدم مسبقاً، يرجى اختيار اسم آخر' });
  }

  const newUser = await createUser(cleanUser, password, 'customer');
  req.session.user = { username: newUser.username, role: 'customer' };

  let redeemResult = null;
  if (licenseKey && licenseKey.trim()) {
    redeemResult = await redeemLicenseKey(licenseKey.trim(), cleanUser);
  }

  res.json({
    success: true,
    message: 'تم إنشاء الحساب بنجاح!',
    user: req.session.user,
    redeemResult
  });
});

// تسجيل الدخول عبر Discord OAuth2
app.get('/api/auth/discord', (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return res.status(400).send('لم يتم ضبط متغير DISCORD_CLIENT_ID في إعدادات السيرفر.');
  }

  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const redirectUri = encodeURIComponent(`${protocol}://${host}/api/auth/discord/callback`);

  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify`;
  res.redirect(discordAuthUrl);
});

// استقبال رد Discord OAuth2 Callback
app.get('/api/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  if (!code || !clientId || !clientSecret) {
    return res.redirect('/?error=discord_config_missing');
  }

  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const redirectUri = `${protocol}://${host}/api/auth/discord/callback`;

  try {
    // تبديل الكود بـ Access Token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      return res.redirect('/?error=discord_auth_failed');
    }

    // جلب بيانات مستخدم ديسكورد
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        authorization: `Bearer ${tokenData.access_token}`
      }
    });
    const discordUser = await userResponse.json();

    const adminDiscordIds = [
      '684580786858623132',
      process.env.ADMIN_DISCORD_ID
    ].filter(Boolean).map(id => String(id).trim());

    const isAdmin = adminDiscordIds.includes(String(discordUser.id));
    const targetRole = isAdmin ? 'admin' : 'customer';

    // البحث عن مستخدم بنفس الـ Discord ID
    let user = await getUserByDiscordId(discordUser.id);
    if (!user) {
      const cleanUsername = discordUser.username.toLowerCase().replace(/[^a-z0-9_]/g, '') || `dc_${discordUser.id.substring(0, 6)}`;
      user = await createUser(cleanUsername, 'dc_oauth_' + Math.random(), targetRole, {
        id: discordUser.id,
        avatar: discordUser.avatar
      });
    } else if (isAdmin && user.role !== 'admin') {
      user.role = 'admin';
      await updateUserRole(user.username, 'admin');
    }

    req.session.user = {
      username: user.username,
      role: isAdmin ? 'admin' : (user.role || 'customer'),
      discordId: discordUser.id
    };
    res.redirect('/');
  } catch (err) {
    console.error('[Discord OAuth Error]:', err);
    res.redirect('/?error=discord_error');
  }
});

// تسجيل الخروج
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// استعلام بيانات الجلسة الحالية
app.get('/api/auth/me', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.json({ authenticated: false });
  }

  const user = req.session.user;

  // التأكد من صلاحية الأدمن عبر Discord ID
  const adminDiscordIds = [
    '684580786858623132',
    process.env.ADMIN_DISCORD_ID
  ].filter(Boolean).map(id => String(id).trim());

  if (user.discordId && adminDiscordIds.includes(String(user.discordId))) {
    user.role = 'admin';
  }
  let subscription = null;
  let timeLeftSeconds = 0;

  if (user.role === 'customer') {
    subscription = await getSubscription(user.username);
    if (subscription && subscription.expiresAt) {
      const now = new Date();
      const exp = new Date(subscription.expiresAt);
      timeLeftSeconds = Math.max(0, Math.floor((exp - now) / 1000));
    }
  }

  const settings = await getPlatformSettings();
  const activeCount = await getActiveSubscriptionsCount();

  res.json({
    authenticated: true,
    user,
    subscription,
    timeLeftSeconds,
    isFirebase: isFirebaseConnected(),
    maxSlots: settings.maxSlots || 10,
    activeSlots: activeCount,
    discordEnabled: !!(process.env.DISCORD_CLIENT_ID)
  });
});

// تفعيل كود اشتراك فردي (Single-Use Code)
app.post('/api/subscription/redeem', requireAuth, async (req, res) => {
  const { key } = req.body;
  if (!key || !key.trim()) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال كود التفعيل' });
  }

  const result = await redeemLicenseKey(key.trim(), req.session.user.username);
  res.json(result);
});

// ==========================================
// 4. مسارات التحكم بالبوت (Bot Control Routes)
// ==========================================

// جلب حالة البوت
app.get('/api/bot/status', requireAuth, async (req, res) => {
  const targetUser = (req.session.user.role === 'admin' && req.query.user)
    ? req.query.user
    : req.session.user.username;

  let isExpired = false;
  let subscription = null;
  let timeLeftSeconds = 0;

  if (req.session.user.role === 'customer') {
    subscription = await getSubscription(targetUser);
    if (!subscription || subscription.status !== 'active') {
      isExpired = true;
    } else if (subscription.expiresAt) {
      const now = new Date();
      const exp = new Date(subscription.expiresAt);
      timeLeftSeconds = Math.max(0, Math.floor((exp - now) / 1000));
      if (timeLeftSeconds <= 0) isExpired = true;
    }
  }

  const botStatus = getUserBotStatus(targetUser);

  res.json({
    ...botStatus,
    targetUser,
    isExpired,
    subscription,
    timeLeftSeconds
  });
});

// تشغيل البوت
app.post('/api/bot/connect', requireAuth, requireActiveSub, async (req, res) => {
  const targetUser = (req.session.user.role === 'admin' && req.body.targetUser)
    ? req.body.targetUser
    : req.session.user.username;

  const {
    edition,
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

  const botEdition = 'bedrock';
  const rawPort = 19132;

  let rawHost = (host || 'donutsmp.net').trim();
  if (rawHost.toLowerCase() === 'eu' || rawHost.toLowerCase() === 'eu.donutsmp.net') {
    rawHost = 'EU.donutsmp.net';
  } else {
    rawHost = 'donutsmp.net';
  }

  const botConfig = {
    edition: botEdition,
    host: rawHost,
    port: rawPort,
    username: (username && username.trim()) ? username.trim() : `AFK_${targetUser}`,
    version: (version && version !== 'auto') ? version : false,
    auth: auth || 'microsoft',
    password: password ? password.trim() : null,
    targetPos: {
      x: targetX !== undefined && targetX !== null && targetX !== '' ? parseFloat(targetX) : null,
      y: targetY !== undefined && targetY !== null && targetY !== '' ? parseFloat(targetY) : null,
      z: targetZ !== undefined && targetZ !== null && targetZ !== '' ? parseFloat(targetZ) : null
    },
    autoWalkToPos: !!autoWalkToPos,
    lockPosition: !!lockPosition,
    autoCommand: autoCommand ? autoCommand.trim() : '/smp',
    autoCommandDelay: parseInt(autoCommandDelay || '7', 10)
  };

  await saveBotConfig(targetUser, botConfig);
  const result = startBotForUser(targetUser, botConfig);
  res.json(result);
});

// فصل البوت
app.post('/api/bot/disconnect', requireAuth, (req, res) => {
  const targetUser = (req.session.user.role === 'admin' && req.body.targetUser)
    ? req.body.targetUser
    : req.session.user.username;

  const result = stopBotForUser(targetUser);
  res.json(result);
});

// تحريك البوت
app.post('/api/bot/move', requireAuth, requireActiveSub, (req, res) => {
  const targetUser = (req.session.user.role === 'admin' && req.body.targetUser)
    ? req.body.targetUser
    : req.session.user.username;

  const { x, y, z } = req.body;
  const result = goToCoordinates(targetUser, x, y, z);
  res.json(result);
});

// إيقاف الحركة
app.post('/api/bot/stop-move', requireAuth, requireActiveSub, (req, res) => {
  const targetUser = (req.session.user.role === 'admin' && req.body.targetUser)
    ? req.body.targetUser
    : req.session.user.username;

  const stopped = stopMovement(targetUser);
  res.json({ success: stopped });
});

// إرسال شات
app.post('/api/bot/chat', requireAuth, requireActiveSub, (req, res) => {
  const targetUser = (req.session.user.role === 'admin' && req.body.targetUser)
    ? req.body.targetUser
    : req.session.user.username;

  const { message } = req.body;
  const result = sendBotChat(targetUser, message);
  res.json(result);
});

// حفظ إعدادات إحداثيات الهدف
app.post('/api/bot/set-target', requireAuth, requireActiveSub, async (req, res) => {
  const targetUser = (req.session.user.role === 'admin' && req.body.targetUser)
    ? req.body.targetUser
    : req.session.user.username;

  const userData = getOrCreateUserBotData(targetUser);
  const { x, y, z, autoWalkToPos, lockPosition, autoCommand, autoCommandDelay } = req.body;

  if (x !== undefined && y !== undefined && z !== undefined) {
    userData.config.targetPos = {
      x: x !== null && x !== '' ? parseFloat(x) : null,
      y: y !== null && y !== '' ? parseFloat(y) : null,
      z: z !== null && z !== '' ? parseFloat(z) : null
    };
  }

  if (autoWalkToPos !== undefined) userData.config.autoWalkToPos = !!autoWalkToPos;
  if (lockPosition !== undefined) userData.config.lockPosition = !!lockPosition;
  if (autoCommand !== undefined) userData.config.autoCommand = autoCommand.trim();
  if (autoCommandDelay !== undefined) userData.config.autoCommandDelay = parseInt(autoCommandDelay, 10) || 7;

  await saveBotConfig(targetUser, userData.config);

  res.json({
    success: true,
    message: 'تم حفظ وتحديث إعدادات الموقع.',
    targetPos: userData.config.targetPos
  });
});

// ==========================================
// 5. مسارات الإدارة وسعة المشتركين (Admin Panel Routes)
// ==========================================

// الإحصائيات الشاملة
app.get('/api/admin/overview', requireAdmin, async (req, res) => {
  const subscriptions = await getAllSubscriptions();
  const botStats = getAdminStats();
  const settings = await getPlatformSettings();

  let activeCount = 0;
  let expiredCount = 0;
  let totalRevenueIQD = 0;

  const now = new Date();
  subscriptions.forEach(sub => {
    if (sub.status === 'active' && new Date(sub.expiresAt) > now) {
      activeCount++;
    } else {
      expiredCount++;
    }
    if (sub.pricePaid) {
      totalRevenueIQD += sub.pricePaid;
    }
  });

  res.json({
    totalCustomers: subscriptions.length,
    activeSubscriptions: activeCount,
    expiredSubscriptions: expiredCount,
    totalRevenueIQD,
    connectedBots: botStats.connectedBots,
    maxSlots: settings.maxSlots || 10,
    isFirebase: isFirebaseConnected()
  });
});

// تحديث سعة البوتات المتاحة
app.post('/api/admin/settings', requireAdmin, async (req, res) => {
  const { maxSlots, weeklyPriceIQD } = req.body;
  const updates = {};
  if (maxSlots !== undefined) updates.maxSlots = parseInt(maxSlots, 10) || 10;
  if (weeklyPriceIQD !== undefined) updates.weeklyPriceIQD = parseInt(weeklyPriceIQD, 10) || 40000;

  await updatePlatformSettings(updates);
  res.json({ success: true, message: 'تم تحديث إعدادات الطاقة الاستيعابية وسعر الاشتراك بنجاح' });
});

// جلب قائمة المشتركين
app.get('/api/admin/subscriptions', requireAdmin, async (req, res) => {
  const subscriptions = await getAllSubscriptions();
  const now = new Date();

  const formatted = subscriptions.map(sub => {
    const exp = new Date(sub.expiresAt);
    const secondsLeft = Math.max(0, Math.floor((exp - now) / 1000));
    const daysLeft = (secondsLeft / 86400).toFixed(1);
    const isActive = sub.status === 'active' && secondsLeft > 0;

    return {
      ...sub,
      isActive,
      secondsLeft,
      daysLeft
    };
  });

  res.json({ subscriptions: formatted });
});

// إيقاف جميع البوتات الشغالة لجميع المستخدمين دفعة واحدة (Admin Kill-Switch)
app.post('/api/admin/bots/stop-all', requireAdmin, (req, res) => {
  const result = stopAllBots();
  res.json(result);
});

// تمديد اشتراك مستخدم (+7 أيام)
app.post('/api/admin/subscriptions/extend', requireAdmin, async (req, res) => {
  const { username, days, pricePaid } = req.body;
  if (!username) return res.status(400).json({ success: false, message: 'يرجى تحديد المستخدم' });

  const addDays = parseInt(days || '7', 10);
  const revenue = parseInt(pricePaid || '40000', 10);

  const sub = await createOrUpdateSubscription(username.trim().toLowerCase(), addDays, revenue);
  res.json({ success: true, message: `تم تتمديد الاشتراك بنجاح (+${addDays} أيام)!`, subscription: sub });
});

// توليد أكواد اشتراك أحادية الاستخدام (Single-Use Keys - مفردة أو دفعة)
app.post('/api/admin/keys/create', requireAdmin, async (req, res) => {
  const { count, days, price } = req.body;
  const numCount = parseInt(count || '1', 10);
  const numDays = parseInt(days || '7', 10);
  const keyPrice = parseInt(price || '40000', 10);

  if (numCount > 1) {
    const keys = await createBulkLicenseKeys(numCount, numDays, keyPrice);
    return res.json({ success: true, licenseKeys: keys });
  } else {
    const newKey = await createLicenseKey(numDays, keyPrice);
    return res.json({ success: true, licenseKey: newKey });
  }
});

// جلب قائمة أكواد الاشتراكات
app.get('/api/admin/keys', requireAdmin, async (req, res) => {
  const keys = await getAllLicenseKeys();
  res.json({ keys });
});

// حذف كود اشتراك
app.delete('/api/admin/keys/:key', requireAdmin, async (req, res) => {
  const { key } = req.params;
  await deleteLicenseKey(key);
  res.json({ success: true, message: 'تم حذف كود الاشتراك' });
});

// ==========================================
// 6. تشغيل الخادم والخدمات المساندة
// ==========================================
process.on('uncaughtException', (err) => {
  console.error(`[Process Error] Uncaught Exception:`, err.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[Process Error] Unhandled Rejection:`, reason);
});

app.listen(WEB_PORT, () => {
  console.log(`==================================================`);
  console.log(`[HTTP] Minecraft AFK SaaS Dashboard running at: http://localhost:${WEB_PORT}`);
  console.log(`[HTTP] Database: ${isFirebaseConnected() ? 'Firebase Firestore (Cloud)' : 'Local JSON Fallback'}`);
  console.log(`[HTTP] Admin user: 'admin' (password: '${WEB_PASSWORD}')`);
  console.log(`==================================================`);

  // تشغيل مراقبة انتهاء الاشتراكات
  startExpiryCron(30);

  // تشغيل بوت ديسكورد إن وُجد التوكن
  initDiscordBot();
});
