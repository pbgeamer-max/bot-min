const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

let db = null;
let isFirebaseConnected = false;

// تهيئة مجلد محلي احتياطي (Fallback Storage) في حال عدم توفر الاتصال
const LOCAL_DB_DIR = path.join(__dirname, 'data');
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, 'local-db.json');

function ensureLocalDb() {
  if (!fs.existsSync(LOCAL_DB_DIR)) {
    fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOCAL_DB_FILE)) {
    const initialData = {
      settings: {
        maxSlots: 10,
        weeklyPriceIQD: 40000
      },
      users: {
        admin: {
          username: 'admin',
          password: process.env.WEB_PASSWORD || 'f1bot123',
          role: 'admin',
          createdAt: new Date().toISOString()
        }
      },
      subscriptions: {},
      bots: {},
      licenseKeys: {}
    };
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(initialData, null, 2));
  }
}

function readLocalDb() {
  ensureLocalDb();
  try {
    return JSON.parse(fs.readFileSync(LOCAL_DB_FILE, 'utf8'));
  } catch (e) {
    return { settings: { maxSlots: 10 }, users: {}, subscriptions: {}, bots: {}, licenseKeys: {} };
  }
}

function writeLocalDb(data) {
  ensureLocalDb();
  fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(data, null, 2));
}

// 1. الاتصال بـ Firebase Firestore
function initFirebase() {
  const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

  try {
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = require(serviceAccountPath);
      initializeApp({
        credential: cert(serviceAccount)
      });
      db = getFirestore();
      isFirebaseConnected = true;
      console.log('[Firebase] تم الاتصال بقاعدة بيانات Firebase Firestore بنجاح (المشروع: ' + (serviceAccount.project_id || 'متصل') + ')!');
      return;
    }

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT.startsWith('{')
          ? process.env.FIREBASE_SERVICE_ACCOUNT
          : Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
      );
      initializeApp({
        credential: cert(serviceAccount)
      });
      db = getFirestore();
      isFirebaseConnected = true;
      console.log('[Firebase] تم الاتصال بقاعدة بيانات Firebase Firestore بنجاح عبر المتغير البيئي!');
      return;
    }

    console.log('[Database] لم يتم العثور على مفاتيح Firebase حالياً. جاري العمل بالنظام المحلي التلقائي.');
    ensureLocalDb();
  } catch (err) {
    console.error('[Firebase Error] خطأ أثناء تهيئة فايربيس:', err.message);
    console.log('[Database] التبديل إلى التخزين المحلي الاحتياطي.');
    ensureLocalDb();
  }
}

initFirebase();

// 2. إعدادات المنصة وأقصى عدد للمشتركين (Settings & Max Slots)
async function getPlatformSettings() {
  if (isFirebaseConnected && db) {
    const doc = await db.collection('settings').doc('config').get();
    if (doc.exists) return doc.data();
    const defaults = { maxSlots: 10, weeklyPriceIQD: 40000 };
    await db.collection('settings').doc('config').set(defaults);
    return defaults;
  } else {
    const data = readLocalDb();
    if (!data.settings) data.settings = { maxSlots: 10, weeklyPriceIQD: 40000 };
    return data.settings;
  }
}

async function updatePlatformSettings(newSettings) {
  if (isFirebaseConnected && db) {
    await db.collection('settings').doc('config').set(newSettings, { merge: true });
  } else {
    const data = readLocalDb();
    data.settings = { ...(data.settings || {}), ...newSettings };
    writeLocalDb(data);
  }
}

// 3. دوال المستخدمين (Users)
async function getUser(username) {
  if (!username) return null;
  const cleanUsername = username.trim().toLowerCase();

  if (isFirebaseConnected && db) {
    const doc = await db.collection('users').doc(cleanUsername).get();
    return doc.exists ? doc.data() : null;
  } else {
    const data = readLocalDb();
    return data.users[cleanUsername] || null;
  }
}

async function getUserByDiscordId(discordId) {
  if (!discordId) return null;
  if (isFirebaseConnected && db) {
    const snapshot = await db.collection('users').where('discordId', '==', discordId).limit(1).get();
    if (snapshot.empty) return null;
    return snapshot.docs[0].data();
  } else {
    const data = readLocalDb();
    return Object.values(data.users).find(u => u.discordId === discordId) || null;
  }
}

async function createUser(username, password, role = 'customer', discordData = null) {
  const cleanUsername = username.trim().toLowerCase();
  const userData = {
    username: cleanUsername,
    password: password ? password.trim() : null,
    role: role,
    discordId: discordData ? discordData.id : null,
    discordAvatar: discordData ? discordData.avatar : null,
    createdAt: new Date().toISOString()
  };

  if (isFirebaseConnected && db) {
    await db.collection('users').doc(cleanUsername).set(userData, { merge: true });
  } else {
    const data = readLocalDb();
    data.users[cleanUsername] = userData;
    writeLocalDb(data);
  }
  return userData;
}

async function updateUserRole(username, newRole) {
  if (!username) return;
  const cleanUsername = username.trim().toLowerCase();
  if (isFirebaseConnected && db) {
    await db.collection('users').doc(cleanUsername).set({ role: newRole }, { merge: true });
  } else {
    const data = readLocalDb();
    if (data.users[cleanUsername]) {
      data.users[cleanUsername].role = newRole;
      writeLocalDb(data);
    }
  }
}

// 4. دوال الاشتراكات وفحص الطاقة الاستيعابية (Subscriptions & Capacity Check)
async function getSubscription(userId) {
  if (!userId) return null;
  const cleanId = userId.trim().toLowerCase();

  if (isFirebaseConnected && db) {
    const doc = await db.collection('subscriptions').doc(cleanId).get();
    if (!doc.exists) return null;
    return doc.data();
  } else {
    const data = readLocalDb();
    return data.subscriptions[cleanId] || null;
  }
}

async function getActiveSubscriptionsCount() {
  const allSubs = await getAllSubscriptions();
  const now = new Date();
  let count = 0;
  allSubs.forEach(s => {
    if (s.status === 'active' && new Date(s.expiresAt) > now) {
      count++;
    }
  });
  return count;
}

async function createOrUpdateSubscription(userId, days = 7, pricePaid = 40000) {
  const cleanId = userId.trim().toLowerCase();
  const currentSub = await getSubscription(cleanId);
  const now = new Date();

  // فحص سعة البوتات المتاحة إذا كان هذا اشتراكاً جديداً وليس تمديداً
  const isCurrentlyActive = currentSub && currentSub.status === 'active' && new Date(currentSub.expiresAt) > now;
  if (!isCurrentlyActive) {
    const settings = await getPlatformSettings();
    const activeCount = await getActiveSubscriptionsCount();
    const maxSlots = settings.maxSlots || 10;

    if (activeCount >= maxSlots) {
      return {
        success: false,
        isCapacityFull: true,
        message: `عذراً! جميع مقاعد البوتات محجوزة حالياً (${activeCount}/${maxSlots}). يرجى الانتظار لحين انتهاء أحد المشتركين أو زيادة المقاعد من قبل الأدمن.`
      };
    }
  }

  let baseDate = now;
  if (isCurrentlyActive) {
    baseDate = new Date(currentSub.expiresAt);
  }

  const expiresAt = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const subData = {
    userId: cleanId,
    startDate: currentSub ? currentSub.startDate : now.toISOString(),
    expiresAt: expiresAt,
    status: 'active',
    days: days,
    pricePaid: (currentSub && currentSub.pricePaid ? currentSub.pricePaid : 0) + pricePaid,
    lastRenewedAt: now.toISOString()
  };

  if (isFirebaseConnected && db) {
    await db.collection('subscriptions').doc(cleanId).set(subData, { merge: true });
  } else {
    const data = readLocalDb();
    data.subscriptions[cleanId] = subData;
    writeLocalDb(data);
  }

  return { success: true, subscription: subData };
}

async function setSubscriptionStatus(userId, status) {
  const cleanId = userId.trim().toLowerCase();
  if (isFirebaseConnected && db) {
    await db.collection('subscriptions').doc(cleanId).set({ status: status }, { merge: true });
  } else {
    const data = readLocalDb();
    if (data.subscriptions[cleanId]) {
      data.subscriptions[cleanId].status = status;
      writeLocalDb(data);
    }
  }
}

async function getAllSubscriptions() {
  if (isFirebaseConnected && db) {
    const snapshot = await db.collection('subscriptions').get();
    return snapshot.docs.map(doc => doc.data());
  } else {
    const data = readLocalDb();
    return Object.values(data.subscriptions);
  }
}

// 5. دوال أكواد التفعيل الفردية الدقيقة (Single-Use License Keys)
async function createLicenseKey(days = 7, price = 40000) {
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  const randomPart2 = Math.random().toString(36).substring(2, 6).toUpperCase();
  const key = `F1-${days}D-${randomPart}-${randomPart2}`;

  const keyData = {
    key: key,
    days: days,
    price: price,
    isUsed: false,
    usedBy: null,
    usedAt: null,
    createdAt: new Date().toISOString()
  };

  if (isFirebaseConnected && db) {
    await db.collection('licenseKeys').doc(key).set(keyData, { merge: true });
  } else {
    const data = readLocalDb();
    data.licenseKeys[key] = keyData;
    writeLocalDb(data);
  }

  return keyData;
}

// توليد دفعة أكواد (Bulk Generation)
async function createBulkLicenseKeys(count = 5, days = 7, price = 40000) {
  const keys = [];
  for (let i = 0; i < count; i++) {
    const k = await createLicenseKey(days, price);
    keys.push(k);
  }
  return keys;
}

// استخدام الكود لمرة واحدة فقط لشخص واحد
async function redeemLicenseKey(key, userId) {
  if (!key) return { success: false, message: 'يرجى إدخال كود التفعيل' };

  const cleanKey = key.trim().toUpperCase();
  const cleanId = userId.trim().toLowerCase();

  let keyData = null;

  if (isFirebaseConnected && db) {
    const doc = await db.collection('licenseKeys').doc(cleanKey).get();
    if (!doc.exists) return { success: false, message: 'كود الاشتراك غير صحيح أو غير موجود!' };
    keyData = doc.data();
  } else {
    const data = readLocalDb();
    keyData = data.licenseKeys[cleanKey];
    if (!keyData) return { success: false, message: 'كود الاشتراك غير صحيح أو غير موجود!' };
  }

  // كود واحد يستخدمه شخص واحد فقط
  if (keyData.isUsed) {
    return {
      success: false,
      message: `عذراً، هذا الكود مستخدم مسبقاً بواسطة (${keyData.usedBy}) في تاريخ ${new Date(keyData.usedAt).toLocaleDateString('ar-EG')} ولا يمكن استخدامه مرة أخرى!`
    };
  }

  // تفعيل الاشتراك مع التحقق من سعة المقاعد المتاحة
  const subResult = await createOrUpdateSubscription(cleanId, keyData.days, keyData.price);
  if (!subResult.success) {
    return subResult; // يرجع رسالة اكتمال الطاقة الاستيعابية
  }

  // وضع علامة مستخدم على الكود فوراً
  const updateData = {
    isUsed: true,
    usedBy: cleanId,
    usedAt: new Date().toISOString()
  };

  if (isFirebaseConnected && db) {
    await db.collection('licenseKeys').doc(cleanKey).set(updateData, { merge: true });
  } else {
    const data = readLocalDb();
    data.licenseKeys[cleanKey] = { ...keyData, ...updateData };
    writeLocalDb(data);
  }

  return {
    success: true,
    message: `تم تفعيل اشتراكك بنجاح لمدة ${keyData.days} أيام!`,
    subscription: subResult.subscription
  };
}

async function getAllLicenseKeys() {
  if (isFirebaseConnected && db) {
    const snapshot = await db.collection('licenseKeys').get();
    return snapshot.docs.map(doc => doc.data());
  } else {
    const data = readLocalDb();
    return Object.values(data.licenseKeys);
  }
}

async function deleteLicenseKey(key) {
  const cleanKey = key.trim().toUpperCase();
  if (isFirebaseConnected && db) {
    await db.collection('licenseKeys').doc(cleanKey).delete();
  } else {
    const data = readLocalDb();
    delete data.licenseKeys[cleanKey];
    writeLocalDb(data);
  }
}

// 6. حفظ إعدادات البوت لكل زبون (Bot Config)
async function getBotConfig(userId) {
  const cleanId = userId.trim().toLowerCase();
  if (isFirebaseConnected && db) {
    const doc = await db.collection('bots').doc(cleanId).get();
    return doc.exists ? doc.data() : null;
  } else {
    const data = readLocalDb();
    return data.bots[cleanId] || null;
  }
}

async function saveBotConfig(userId, botData) {
  const cleanId = userId.trim().toLowerCase();
  if (isFirebaseConnected && db) {
    await db.collection('bots').doc(cleanId).set(botData, { merge: true });
  } else {
    const data = readLocalDb();
    data.bots[cleanId] = { ...(data.bots[cleanId] || {}), ...botData };
    writeLocalDb(data);
  }
}

module.exports = {
  isFirebaseConnected: () => isFirebaseConnected,
  getPlatformSettings,
  updatePlatformSettings,
  getUser,
  getUserByDiscordId,
  createUser,
  updateUserRole,
  getSubscription,
  getActiveSubscriptionsCount,
  createOrUpdateSubscription,
  setSubscriptionStatus,
  getAllSubscriptions,
  createLicenseKey,
  createBulkLicenseKeys,
  redeemLicenseKey,
  getAllLicenseKeys,
  deleteLicenseKey,
  getBotConfig,
  saveBotConfig
};
