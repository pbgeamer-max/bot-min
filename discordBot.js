const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ActivityType,
  Events
} = require('discord.js');

const {
  getUserByDiscordId,
  createUser,
  getSubscription,
  redeemLicenseKey,
  getActiveSubscriptionsCount,
  getPlatformSettings
} = require('./firebase');

const {
  startBotForUser,
  stopBotForUser,
  goToCoordinates,
  getUserBotStatus
} = require('./botManager');

let client = null;
let isDiscordReady = false;

// تعريف أوامر ديسكورد (Slash Commands)
const commands = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('دليل استخدام بوت DonutSMP والأسعار والأوامر المتاحة'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('عرض حالة بوتك في DonutSMP ومكانه ومتبقي اشتراكك'),

  new SlashCommandBuilder()
    .setName('redeem')
    .setDescription('تفعيل كود اشتراك أسبوعي (40,000 د.ع / 7 أيام)')
    .addStringOption(option =>
      option.setName('code')
        .setDescription('كود الاشتراك (مثال: F1-7D-XXXX-YYYY)')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('start')
    .setDescription('بدء تشغيل واتصال بوتك بسيرفر DonutSMP'),

  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('إيقاف وفصل بوتك عن سيرفر DonutSMP'),

  new SlashCommandBuilder()
    .setName('coords')
    .setDescription('توجيه البوت نحو إحداثيات محددة في سيرفر DonutSMP')
    .addNumberOption(opt => opt.setName('x').setDescription('الإحداثي X').setRequired(true))
    .addNumberOption(opt => opt.setName('y').setDescription('الإحداثي Y').setRequired(true))
    .addNumberOption(opt => opt.setName('z').setDescription('الإحداثي Z').setRequired(true)),

  new SlashCommandBuilder()
    .setName('slots')
    .setDescription('عرض عدد مقاعد المشتركين المتاحة حالياً')
];

async function initDiscordBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token) {
    console.log('[Discord Bot] لم يتم تحديد DISCORD_BOT_TOKEN. بوت ديسكورد في وضع الانتظار.');
    return;
  }

  client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  client.once(Events.ClientReady, async () => {
    isDiscordReady = true;
    console.log(`[Discord Bot] تم تسجيل الدخول بنجاح باسم البوت: ${client.user.tag}!`);

    // تسجيل أوامر الـ Slash Commands تلقائياً
    if (clientId) {
      try {
        const rest = new REST({ version: '10' }).setToken(token);
        console.log('[Discord Bot] جاري تسجيل أوامر Slash Commands...');
        await rest.put(
          Routes.applicationCommands(clientId),
          { body: commands.map(c => c.toJSON()) }
        );
        console.log('[Discord Bot] تم تسجيل جميع أوامر Slash Commands بنجاح!');
      } catch (err) {
        console.error('[Discord Bot Error] خطأ في تسجيل الأوامر:', err.message);
      }
    }

    // تحديث الحالة التفاعلية للبوت كل دقيقة
    updateDiscordActivity();
    setInterval(updateDiscordActivity, 60000);
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const discordUser = interaction.user;

    // البحث عن حساب المشترك المرتبط بهذا الـ Discord ID
    let user = await getUserByDiscordId(discordUser.id);

    try {
      // 1. أمر المساعدة والأسعار (/help)
      if (commandName === 'help') {
        const settings = await getPlatformSettings();
        const activeCount = await getActiveSubscriptionsCount();
        const maxSlots = settings.maxSlots || 10;

        const embed = new EmbedBuilder()
          .setColor('#6366f1')
          .setTitle('🤖 منصة تأجير بوتات DonutSMP (AFK Bot 24/7)')
          .setDescription('أهلاً بك! يمكنك هنا استئجار بوت ماينكرافت أصلي للبقاء في مزرعتك بسيرفر DonutSMP لجمع الموارد والنقود 24 ساعة يومياً!')
          .addFields(
            { name: '💰 سعر الاشتراك الأسبوعي', value: '`40,000 دينار عراقي` (لمدة 7 أيام كاملة)', inline: true },
            { name: '📊 المقاعد والمشتركين', value: `\`${activeCount} / ${maxSlots}\` مقعد محجوز`, inline: true },
            { name: '💳 طرق الدفع المقبولة', value: 'زين كاش (Zain Cash)، كي كارد، أو رصيد آسيا/زين' },
            { name: '⚡ الأوامر المتاحة', value: '• `/redeem <code>` لتفعيل كود الاشتراك\n• `/status` لرؤية حالة ومكان بوتك\n• `/start` لبدء تشغيل البوت\n• `/stop` لإيقاف البوت\n• `/coords <x> <y> <z>` لتحريك البوت لمزرعتك\n• `/slots` لمعرفة المقاعد المتاحة' }
          )
          .setFooter({ text: 'f1 Minecraft AFK Bot Platform' });

        return interaction.reply({ embeds: [embed] });
      }

      // 2. أمر عرض المقاعد المتاحة (/slots)
      if (commandName === 'slots') {
        const settings = await getPlatformSettings();
        const activeCount = await getActiveSubscriptionsCount();
        const maxSlots = settings.maxSlots || 10;
        const available = Math.max(0, maxSlots - activeCount);

        const embed = new EmbedBuilder()
          .setColor(available > 0 ? '#10b981' : '#ef4444')
          .setTitle('📊 المقاعد وسعة البوتات المتاحة')
          .setDescription(`• عدد المشتركين النشطين حالياً: **${activeCount}**\n• الحد الأقصى للمقاعد: **${maxSlots}**\n• المقاعد الشاغرة المتبقية: **${available}** ${available === 0 ? '⚠️ (مكتمل بالكامل)' : '🟢 (متاح للاشتراك)'}`);

        return interaction.reply({ embeds: [embed] });
      }

      // 3. أمر تفعيل كود الاشتراك (/redeem)
      if (commandName === 'redeem') {
        const code = interaction.options.getString('code');
        await interaction.deferReply({ ephemeral: true });

        // إنشاء حساب تلقائي للزبون إذا لم يكن لديه حساب مرتبط
        if (!user) {
          const username = discordUser.username.toLowerCase().replace(/[^a-z0-9_]/g, '') || `dc_${discordUser.id.substring(0, 6)}`;
          user = await createUser(username, 'dc_oauth_' + Math.random(), 'customer', {
            id: discordUser.id,
            avatar: discordUser.avatar
          });
        }

        const redeemResult = await redeemLicenseKey(code, user.username);
        if (!redeemResult.success) {
          return interaction.editReply({ content: `❌ **فشل التفعيل:** ${redeemResult.message}` });
        }

        const embed = new EmbedBuilder()
          .setColor('#10b981')
          .setTitle('🎉 تم تفعيل اشتراكك بنجاح!')
          .setDescription(`مبروك! تم تفعيل اشتراكك الأسبوعي بنجاح.\n• **اسم حسابك:** \`${user.username}\`\n• **المدة:** 7 أيام كاملة\n• **تاريخ الانتهاء:** ${new Date(redeemResult.subscription.expiresAt).toLocaleDateString('ar-EG')}\n\nيمكنك الآن كتابة \`/start\` لتشغيل البوت في DonutSMP والتحكم به!`);

        return interaction.editReply({ embeds: [embed] });
      }

      // فحص وجود الحساب للاوامر القادمة
      if (!user) {
        return interaction.reply({
          content: '⚠️ ليس لديك حساب مرتبط بعد! يرجى استخدام أمر `/redeem <code>` وتفعيل كود اشتراك أولاً أو تسجيل الدخول عبر الموقع.',
          ephemeral: true
        });
      }

      const adminDiscordIds = [
        '684580786858623132',
        process.env.ADMIN_DISCORD_ID
      ].filter(Boolean).map(id => String(id).trim());

      const isAdmin = adminDiscordIds.includes(String(discordUser.id)) || (user && user.role === 'admin');

      // فحص سريان الاشتراك (يتم تخطيه تلقائياً للأدمن)
      const sub = await getSubscription(user.username);
      const now = new Date();
      const isSubActive = isAdmin || (sub && sub.status === 'active' && new Date(sub.expiresAt) > now);

      if (!isSubActive) {
        return interaction.reply({
          content: '❌ **انتهت مدة اشتراكك الأسبوعي!** يرجى تجديد الاشتراك بـ 40,000 د.ع واستخدام أمر `/redeem <code>` لتفعيل كود جديد.',
          ephemeral: true
        });
      }

      // 4. أمر جلب حالة البوت ومكانه (/status)
      if (commandName === 'status') {
        const botStatus = getUserBotStatus(user.username);
        const expDate = new Date(sub.expiresAt);
        const secondsLeft = Math.max(0, Math.floor((expDate - now) / 1000));
        const daysLeft = (secondsLeft / 86400).toFixed(1);

        const embed = new EmbedBuilder()
          .setColor(botStatus.status === 'connected' ? '#10b981' : '#f59e0b')
          .setTitle(`🤖 حالة بوت المشترك: ${user.username}`)
          .addFields(
            { name: 'حالة الاتصال', value: botStatus.status === 'connected' ? '🟢 متصل (Online)' : '🔴 غير متصل', inline: true },
            { name: 'السيرفر المستهدف', value: `\`${botStatus.config.host || 'donutsmp.net'}\``, inline: true },
            { name: 'متبقي الاشتراك', value: `⏳ \`${daysLeft} يوم\``, inline: true },
            { name: 'الإحداثيات الحالية', value: botStatus.position ? `X: \`${botStatus.position.x}\` | Y: \`${botStatus.position.y}\` | Z: \`${botStatus.position.z}\`` : 'غير محدد' }
          );

        return interaction.reply({ embeds: [embed] });
      }

      // 5. أمر تشغيل البوت (/start)
      if (commandName === 'start') {
        await interaction.deferReply({ ephemeral: true });
        const result = await startBotForUser(user.username);
        return interaction.editReply({ content: `🚀 ${result.message}` });
      }

      // 6. أمر إيقاف البوت (/stop)
      if (commandName === 'stop') {
        const result = stopBotForUser(user.username);
        return interaction.reply({ content: `🛑 ${result.message}`, ephemeral: true });
      }

      // 7. أمر التوجيه للإحداثيات (/coords)
      if (commandName === 'coords') {
        const x = interaction.options.getNumber('x');
        const y = interaction.options.getNumber('y');
        const z = interaction.options.getNumber('z');

        const result = goToCoordinates(user.username, x, y, z);
        return interaction.reply({ content: result.message, ephemeral: true });
      }

    } catch (err) {
      console.error('[Discord Command Error]:', err);
      if (interaction.deferred) {
        interaction.editReply({ content: 'حدث خطأ أثناء تنفيذ الأمر!' });
      } else {
        interaction.reply({ content: 'حدث خطأ أثناء تنفيذ الأمر!', ephemeral: true });
      }
    }
  });

  client.login(token).catch(err => {
    console.error('[Discord Bot Login Error]:', err.message);
  });
}

// تحديث حالة البوت في ديسكورد (Activity)
async function updateDiscordActivity() {
  if (!client || !isDiscordReady || !client.user) return;
  try {
    const activeCount = await getActiveSubscriptionsCount();
    const settings = await getPlatformSettings();
    const maxSlots = settings.maxSlots || 10;
    client.user.setActivity(`${activeCount}/${maxSlots} مشتركين | DonutSMP 24/7`, {
      type: ActivityType.Watching
    });
  } catch (e) {}
}

module.exports = {
  initDiscordBot,
  isDiscordReady: () => isDiscordReady
};
