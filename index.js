const express = require('express');
const session = require('express-session');
const path = require('path');

const {
  isFirebaseConnected,
  getUser,
  createUser,
  getSubscription,
  createOrUpdateSubscription,
  getAllSubscriptions,
  createLicenseKey,
  redeemLicenseKey,
  getAllLicenseKeys,
  getBotConfig,
  saveBotConfig
} = require('./firebase');

const {
  startBotForUser,
  stopBotForUser,
  goToCoordinates,
  stopMovement,
  sendBotChat,
  getUserBotStatus,
  getOrCreateUserBotData,
  getAdminStats
} = require('./botManager');

const { startExpiryCron } = require('./expiryCron');

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

// التأكد من سريان الاشتراك للزبون (إذا كان أدمن يتجاوز الفحص)
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
    // إيقاف البوت فوراً إذا كان شغالاً
    stopBotForUser(user.username);
    return res.status(403).json({
      error: 'EXPIRED',
      message: 'انتهت مدة اشتراكك الأسبوعي (7 أيام)! يرجى التجديد لتتمكن من تشغيل البوت والتحكم فيه.'
    });
  }

  next();
}

// ==========================================
// 3. مسارات التوثيق والحسابات (Auth Routes)
// ==========================================

// تسجيل الدخول
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
  }

  const cleanUser = username.trim().toLowerCase();
  const cleanPass = password.trim();

  // فحص تسجيل دخول الأدمن الرئيسي
  if (cleanUser === 'admin' && cleanPass === WEB_PASSWORD) {
    req.session.user = { username: 'admin', role: 'admin' };
    return res.json({ success: true, message: 'تم تسجيل الدخول كمسؤول (Admin)', user: req.session.user });
  }

  // فحص الزبون من قاعدة البيانات
  const user = await getUser(cleanUser);
  if (user && user.password === cleanPass) {
    req.session.user = { username: user.username, role: user.role || 'customer' };
    return res.json({ success: true, message: 'تم تسجيل الدخول بنجاح', user: req.session.user });
  }

  return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة!' });
});

// تسجيل حساب زبون جديد (مع إمكانية تفعيل كود فوري)
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

// تسجيل الخروج
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// استعلام بيانات الجلسة والاشتراك الحالية
app.get('/api/auth/me', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.json({ authenticated: false });
  }

  const user = req.session.user;
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

  res.json({
    authenticated: true,
    user,
    subscription,
    timeLeftSeconds,
    isFirebase: isFirebaseConnected()
  });
});

// تفعيل كود اشتراك
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

// جلب حالة البوت الخاص بالزبون الحالي
app.get('/api/bot/status', requireAuth, async (req, res) => {
  const targetUser = (req.session.user.role === 'admin' && req.query.user)
    ? req.query.user
    : req.session.user.username;

  // فحص صلاحية الاشتراك للزبون العادي
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

// تشغيل واتصال البوت
app.post('/api/bot/connect', requireAuth, requireActiveSub, async (req, res) => {
  const targetUser = (req.session.user.role === 'admin' && req.body.targetUser)
    ? req.body.targetUser
    : req.session.user.username;

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

  let rawHost = (host || 'donutsmp.net').trim();
  let rawPort = port ? parseInt(port, 10) : 25565;

  if (rawHost.includes(':')) {
    const parts = rawHost.split(':');
    rawHost = parts[0];
    rawPort = parseInt(parts[1], 10) || 25565;
  }

  const botConfig = {
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

  // حفظ الإعدادات في قاعدة البيانات
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

// توجيه البوت إلى إحداثيات محددة
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

// إرسال شات أو أمر بالسيرفر
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
// 5. مسارات الإدارة والأرباح (Admin Panel Routes)
// ==========================================

// الإحصائيات الشاملة
app.get('/api/admin/overview', requireAdmin, async (req, res) => {
  const subscriptions = await getAllSubscriptions();
  const botStats = getAdminStats();

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
    isFirebase: isFirebaseConnected()
  });
});

// جلب قائمة المشتركين وتواريخ الانتهاء
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

// إنشاء اشتراك مباشر للزبون بعد استلام 40 ألف دينار
app.post('/api/admin/subscriptions/create', requireAdmin, async (req, res) => {
  const { username, password, days, pricePaid } = req.body;

  if (!username) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم' });
  }

  const cleanUser = username.trim().toLowerCase();
  let user = await getUser(cleanUser);

  if (!user) {
    if (!password) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال كلمة مرور للحساب الجديد' });
    }
    user = await createUser(cleanUser, password, 'customer');
  }

  const subscriptionDays = parseInt(days || '7', 10);
  const revenue = parseInt(pricePaid || '40000', 10);

  const sub = await createOrUpdateSubscription(cleanUser, subscriptionDays, revenue);
  res.json({ success: true, message: `تم تفعيل اشتراك المستخدم لمدة ${subscriptionDays} أيام!`, subscription: sub });
});

// تمديد اشتراك مستخدم (+7 أيام مثلاً)
app.post('/api/admin/subscriptions/extend', requireAdmin, async (req, res) => {
  const { username, days, pricePaid } = req.body;

  if (!username) {
    return res.status(400).json({ success: false, message: 'يرجى تحديد المستخدم' });
  }

  const addDays = parseInt(days || '7', 10);
  const revenue = parseInt(pricePaid || '40000', 10);

  const sub = await createOrUpdateSubscription(username.trim().toLowerCase(), addDays, revenue);
  res.json({ success: true, message: `تم تمديد الاشتراك بنجاح (+${addDays} أيام)!`, subscription: sub });
});

// توليد كود اشتراك أسبوعي لبيعه للزبائن (40,000 د.ع)
app.post('/api/admin/keys/create', requireAdmin, async (req, res) => {
  const { days, price } = req.body;
  const numDays = parseInt(days || '7', 10);
  const keyPrice = parseInt(price || '40000', 10);

  const newKey = await createLicenseKey(numDays, keyPrice);
  res.json({ success: true, licenseKey: newKey });
});

// جلب قائمة أكواد الاشتراكات
app.get('/api/admin/keys', requireAdmin, async (req, res) => {
  const keys = await getAllLicenseKeys();
  res.json({ keys });
});

// ==========================================
// 6. حماية العملية وتشغيل الخادم ومحرك الفحص
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

  // تشغيل محرك مراقبة انتهاء الاشتراكات
  startExpiryCron(30);
});
