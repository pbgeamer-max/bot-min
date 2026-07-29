# Minecraft AFK Bot

بوت Minecraft للبقاء متصلًا (AFK) باستخدام [mineflayer](https://github.com/PrismarineJS/mineflayer).

## المميزات

- اتصال تلقائي بالسيرفر
- حركة عشوائية Anti-AFK (قفز، مشي، تحريك الذراع، النظر)
- إعادة اتصال تلقائية عند الانقطاع
- دعم متغيرات البيئة للإعدادات
- دعم Microsoft Auth

## التشغيل

### 1. تثبيت الاعتماديات

```bash
npm install
```

### 2. إعداد ملف `.env`

```bash
cp .env.example .env
```

ثم عدّل القيم في `.env`:

| المتغير | الوصف | القيمة الافتراضية |
|---|---|---|
| `BOT_HOST` | عنوان السيرفر | `localhost` |
| `BOT_PORT` | بورت السيرفر | `25565` |
| `BOT_VERSION` | إصدار ماينكرافت | `1.20.1` |
| `BOT_USERNAME` | اسم البوت | `AFK_Bot` |
| `BOT_PASSWORD` | كلمة مرور Microsoft (اختياري) | فارغ |
| `RECONNECT_DELAY` | تأخير إعادة الاتصال (مللي ثانية) | `10000` |
| `AFK_MIN_INTERVAL` | أقل فترة للحركة (مللي ثانية) | `30000` |
| `AFK_MAX_INTERVAL` | أقصى فترة للحركة (مللي ثانية) | `60000` |

### 3. تشغيل البوت

```bash
npm start
```

## الرفع على GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

> **مهم:** لا ترفع ملف `.env` أبدًا. ملف `.gitignore` يمنع ذلك تلقائيًا.

## الاستضافة السحابية

### Railway

1. ارفع الكود على GitHub
2. اذهب إلى [Railway](https://railway.app) وأنشئ مشروع جديد
3. اربط المستودع
4. أضف المتغيرات من `Settings > Environment Variables`
5. سيعمل البوت تلقائيًا

### Docker

```bash
docker build -t minecraft-afk-bot .
docker run -d --env-file .env minecraft-afk-bot
```

## الترخيص

MIT
