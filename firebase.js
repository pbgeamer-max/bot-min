const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let db = null;
let isFirebaseConnected = false;

// تهيئة مجلد محلي احتياطي (Fallback Storage) لضمان عمل المشروع فوراً قبل وضع مفاتيح فايربيس
const LOCAL_DB_DIR = path.join(__dirname, 'data');
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, 'local-db.json');

function ensureLocalDb() {
  if (!fs.existsSync(LOCAL_DB_DIR)) {
    fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOCAL_DB_FILE)) {
    const initialData = {
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
    return { users: {}, subscriptions: {}, bots: {}, licenseKeys: {} };
  }
}

function writeLocalDb(data) {
  ensureLocalDb();
  fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(data, null, 2));
}

// 1. محاولة الاتصال بـ Firebase Firestore
function initFirebase() {
  const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

  try {
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      db = admin.firestore();
      isFirebaseConnected = true;
      console.log('[Firebase] تم الاتصال بـ Firebase Firestore بنجاح عبر serviceAccountKey.json!');
      return;
    }

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT.startsWith('{')
          ? process.env.FIREBASE_SERVICE_ACCOUNT
          : Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
      );
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      db = admin.firestore();
      isFirebaseConnected = true;
      console.log('[Firebase] تم الاتصال بـ Firebase Firestore بنجاح عبر FIREBASE_SERVICE_ACCOUNT!');
      return;
    }

    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
      db = admin.firestore();
      isFirebaseConnected = true;
      console.log('[Firebase] تم الاتصال بـ Firebase Firestore بنجاح عبر المتغيرات البيئية!');
      return;
    }

    console.log('[Database] لم يتم العثور على مفاتيح Firebase حالياً. جاري العمل بالنظام المحلي التلقائي (Local Store) دون مشاكل.');
    ensureLocalDb();
  } catch (err) {
    console.error('[Firebase Error] خطأ أثناء تهيئة فايربيس:', err.message);
    console.log('[Database] التبديل إلى التخزين المحلي الآمن لحين ضبط المفاتيح.');
    ensureLocalDb();
  }
}

initFirebase();

// 2. دوال التعامل مع المستخدمين (Users)
async function getUser(username) {
  if (!username) return null;
  const cleanUsername = username.trim().toLowerCase();

  if (isFirebaseConnected) {
    const doc = await db.collection('users').doc(cleanUsername).get();
    return doc.exists ? doc.data() : null;
  } else {
    const data = readLocalDb();
    return data.users[cleanUsername] || null;
  }
}

async function createUser(username, password, role = 'customer') {
  const cleanUsername = username.trim().toLowerCase();
  const userData = {
    username: cleanUsername,
    password: password.trim(),
    role: role,
    createdAt: new Date().toISOString()
  };

  if (isFirebaseConnected) {
    await db.collection('users').doc(cleanUsername).set(userData);
  } else {
    const data = readLocalDb();
    data.users[cleanUsername] = userData;
    writeLocalDb(data);
  }
  return userData;
}

// 3. دوال التعامل مع الاشتراكات (Subscriptions)
async function getSubscription(userId) {
  if (!userId) return null;
  const cleanId = userId.trim().toLowerCase();

  if (isFirebaseConnected) {
    const doc = await db.collection('subscriptions').doc(cleanId).get();
    if (!doc.exists) return null;
    return doc.data();
  } else {
    const data = readLocalDb();
    return data.subscriptions[cleanId] || null;
  }
}

async function createOrUpdateSubscription(userId, days = 7, pricePaid = 40000) {
  const cleanId = userId.trim().toLowerCase();
  const currentSub = await getSubscription(cleanId);

  const now = new Date();
  let baseDate = now;

  // إذا كان اشتراكه الحالي سارياً، نقوم بتمديده فوق المدة المتبقية
  if (currentSub && currentSub.status === 'active' && new Date(currentSub.expiresAt) > now) {
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

  if (isFirebaseConnected) {
    await db.collection('subscriptions').doc(cleanId).set(subData, { merge: true });
  } else {
    const data = readLocalDb();
    data.subscriptions[cleanId] = subData;
    writeLocalDb(data);
  }

  return subData;
}

async function setSubscriptionStatus(userId, status) {
  const cleanId = userId.trim().toLowerCase();
  if (isFirebaseConnected) {
    await db.collection('subscriptions').doc(cleanId).update({ status: status });
  } else {
    const data = readLocalDb();
    if (data.subscriptions[cleanId]) {
      data.subscriptions[cleanId].status = status;
      writeLocalDb(data);
    }
  }
}

async function getAllSubscriptions() {
  if (isFirebaseConnected) {
    const snapshot = await db.collection('subscriptions').get();
    return snapshot.docs.map(doc => doc.data());
  } else {
    const data = readLocalDb();
    return Object.values(data.subscriptions);
  }
}

// 4. دوال التعامل مع أكواد التفعيل (License Keys)
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

  if (isFirebaseConnected) {
    await db.collection('licenseKeys').doc(key).set(keyData);
  } else {
    const data = readLocalDb();
    data.licenseKeys[key] = keyData;
    writeLocalDb(data);
  }

  return keyData;
}

async function redeemLicenseKey(key, userId) {
  const cleanKey = key.trim().toUpperCase();
  const cleanId = userId.trim().toLowerCase();

  let keyData = null;

  if (isFirebaseConnected) {
    const doc = await db.collection('licenseKeys').doc(cleanKey).get();
    if (!doc.exists) return { success: false, message: 'كود الاشتراك غير صحيح أو غير موجود!' };
    keyData = doc.data();
  } else {
    const data = readLocalDb();
    keyData = data.licenseKeys[cleanKey];
    if (!keyData) return { success: false, message: 'كود الاشتراك غير صحيح أو غير موجود!' };
  }

  if (keyData.isUsed) {
    return { success: false, message: `هذا الكود تم استخدامه مسبقاً بواسطة: ${keyData.usedBy}` };
  }

  // تفعيل الاشتراك
  const newSub = await createOrUpdateSubscription(cleanId, keyData.days, keyData.price);

  // تحديث حالة الكود
  const updateData = {
    isUsed: true,
    usedBy: cleanId,
    usedAt: new Date().toISOString()
  };

  if (isFirebaseConnected) {
    await db.collection('licenseKeys').doc(cleanKey).update(updateData);
  } else {
    const data = readLocalDb();
    data.licenseKeys[cleanKey] = { ...keyData, ...updateData };
    writeLocalDb(data);
  }

  return { success: true, message: `تم تفعيل اشتراكك بنجاح لمدة ${keyData.days} أيام!`, subscription: newSub };
}

async function getAllLicenseKeys() {
  if (isFirebaseConnected) {
    const snapshot = await db.collection('licenseKeys').get();
    return snapshot.docs.map(doc => doc.data());
  } else {
    const data = readLocalDb();
    return Object.values(data.licenseKeys);
  }
}

// 5. حفظ إعدادات بوت الزبون (Bot Config)
async function getBotConfig(userId) {
  const cleanId = userId.trim().toLowerCase();
  if (isFirebaseConnected) {
    const doc = await db.collection('bots').doc(cleanId).get();
    return doc.exists ? doc.data() : null;
  } else {
    const data = readLocalDb();
    return data.bots[cleanId] || null;
  }
}

async function saveBotConfig(userId, botData) {
  const cleanId = userId.trim().toLowerCase();
  if (isFirebaseConnected) {
    await db.collection('bots').doc(cleanId).set(botData, { merge: true });
  } else {
    const data = readLocalDb();
    data.bots[cleanId] = { ...(data.bots[cleanId] || {}), ...botData };
    writeLocalDb(data);
  }
}

module.exports = {
  isFirebaseConnected: () => isFirebaseConnected,
  getUser,
  createUser,
  getSubscription,
  createOrUpdateSubscription,
  setSubscriptionStatus,
  getAllSubscriptions,
  createLicenseKey,
  redeemLicenseKey,
  getAllLicenseKeys,
  getBotConfig,
  saveBotConfig
};
