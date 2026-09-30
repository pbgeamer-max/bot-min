const { getAllSubscriptions, setSubscriptionStatus } = require('./firebase');
const { stopBotForUser } = require('./botManager');

let checkInterval = null;

function startExpiryCron(intervalSeconds = 30) {
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  console.log(`[Expiry Cron] تم تشغيل محرك مراقبة الاشتراكات التلقائي (فحص كل ${intervalSeconds} ثانية)...`);

  checkInterval = setInterval(async () => {
    try {
      const subscriptions = await getAllSubscriptions();
      const now = new Date();

      for (const sub of subscriptions) {
        if (sub.status === 'active' && sub.expiresAt) {
          const expiresDate = new Date(sub.expiresAt);

          if (now >= expiresDate) {
            console.log(`⚠️ [Subscription Expired] انتهت مدة اشتراك المستخدم '${sub.userId}' (${sub.expiresAt})!`);
            
            // 1. تحديث الحالة في قاعدة البيانات إلى expired
            await setSubscriptionStatus(sub.userId, 'expired');

            // 2. إيقاف وفصل البوت فوراً من سيرفر Minecraft
            stopBotForUser(sub.userId);
          }
        }
      }
    } catch (err) {
      console.error('[Expiry Cron Error] خطأ أثناء فحص الاشتراكات:', err.message);
    }
  }, intervalSeconds * 1000);
}

module.exports = {
  startExpiryCron
};
