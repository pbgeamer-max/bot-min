document.addEventListener('DOMContentLoaded', () => {
  // Elements - Auth & Gate
  const loginGate = document.getElementById('loginGate');
  const tabLoginBtn = document.getElementById('tabLoginBtn');
  const tabRegisterBtn = document.getElementById('tabRegisterBtn');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginUsernameInput = document.getElementById('loginUsername');
  const loginPasswordInput = document.getElementById('loginPassword');
  const loginErrorAlert = document.getElementById('loginError');
  const loginErrorMsg = document.getElementById('loginErrorMsg');
  const regUsernameInput = document.getElementById('regUsername');
  const regPasswordInput = document.getElementById('regPassword');
  const regLicenseKeyInput = document.getElementById('regLicenseKey');
  const regErrorAlert = document.getElementById('regError');
  const regErrorMsg = document.getElementById('regErrorMsg');
  const mainDashboard = document.getElementById('mainDashboard');
  const logoutBtn = document.getElementById('logoutBtn');
  const userNameSpan = document.getElementById('userNameSpan');

  // Gate & Discord Elements
  const gateCapacityBox = document.getElementById('gateCapacityBox');
  const gateActiveSlots = document.getElementById('gateActiveSlots');
  const gateMaxSlots = document.getElementById('gateMaxSlots');
  const gateSlotsStatus = document.getElementById('gateSlotsStatus');
  const discordErrorAlert = document.getElementById('discordErrorAlert');
  const discordErrorMsg = document.getElementById('discordErrorMsg');

  // Top Navbar Capacity & User Redeem Elements
  const navSlotsPill = document.getElementById('navSlotsPill');
  const navActiveSlots = document.getElementById('navActiveSlots');
  const navMaxSlots = document.getElementById('navMaxSlots');
  const openRedeemModalBtn = document.getElementById('openRedeemModalBtn');
  const userRedeemModal = document.getElementById('userRedeemModal');
  const closeUserRedeemBtn = document.getElementById('closeUserRedeemBtn');
  const userRedeemKeyInput = document.getElementById('userRedeemKeyInput');
  const userRedeemSubmitBtn = document.getElementById('userRedeemSubmitBtn');
  const userRedeemResult = document.getElementById('userRedeemResult');

  // Subscription & Expiry Elements
  const subCountdownBadge = document.getElementById('subCountdownBadge');
  const subCountdownText = document.getElementById('subCountdownText');
  const expiredOverlay = document.getElementById('expiredOverlay');
  const renewKeyInput = document.getElementById('renewKeyInput');
  const renewKeyBtn = document.getElementById('renewKeyBtn');

  // Admin Modal Elements
  const openAdminBtn = document.getElementById('openAdminBtn');
  const closeAdminBtn = document.getElementById('closeAdminBtn');
  const adminModal = document.getElementById('adminModal');
  const adminTotalRevenue = document.getElementById('adminTotalRevenue');
  const adminActiveSubs = document.getElementById('adminActiveSubs');
  const adminConnectedBots = document.getElementById('adminConnectedBots');
  const adminDbStatus = document.getElementById('adminDbStatus');
  const adminSubsTableBody = document.getElementById('adminSubsTableBody');
  const refreshSubsBtn = document.getElementById('refreshSubsBtn');

  // Admin Tabs
  const adminTabSubs = document.getElementById('adminTabSubs');
  const adminTabKeys = document.getElementById('adminTabKeys');
  const adminTabSettings = document.getElementById('adminTabSettings');
  const adminSubsView = document.getElementById('adminSubsView');
  const adminKeysView = document.getElementById('adminKeysView');
  const adminSettingsView = document.getElementById('adminSettingsView');

  // Admin Keys Generator & List
  const keyCountSelect = document.getElementById('keyCountSelect');
  const keyDaysInput = document.getElementById('keyDaysInput');
  const keyPriceInput = document.getElementById('keyPriceInput');
  const generateBatchKeysBtn = document.getElementById('generateBatchKeysBtn');
  const generatedKeyBox = document.getElementById('generatedKeyBox');
  const generatedKeysContainer = document.getElementById('generatedKeysContainer');
  const refreshKeysBtn = document.getElementById('refreshKeysBtn');
  const adminKeysTableBody = document.getElementById('adminKeysTableBody');

  // Admin Platform Settings
  const adminSettingsForm = document.getElementById('adminSettingsForm');
  const adminMaxSlotsInput = document.getElementById('adminMaxSlotsInput');
  const adminPriceInput = document.getElementById('adminPriceInput');
  const adminSettingsAlert = document.getElementById('adminSettingsAlert');
  const saveAdminSettingsBtn = document.getElementById('saveAdminSettingsBtn');

  // Microsoft Auth Banner Elements
  const msaBanner = document.getElementById('msaBanner');
  const msaCodeValue = document.getElementById('msaCodeValue');
  const msaDirectLink = document.getElementById('msaDirectLink');
  const copyMsaCodeBtn = document.getElementById('copyMsaCodeBtn');

  // Dashboard Controls & Form
  const botConnectForm = document.getElementById('botConnectForm');
  const botEditionSelect = document.getElementById('botEdition');
  const serverHostInput = document.getElementById('serverHost');
  const serverPortInput = document.getElementById('serverPort');
  const botUsernameInput = document.getElementById('botUsername');
  const authPasswordInput = document.getElementById('authPassword');
  const mcVersionSelect = document.getElementById('mcVersion');
  const authModeSelect = document.getElementById('authMode');
  const autoCommandInput = document.getElementById('autoCommandInput');
  const autoCommandDelayInput = document.getElementById('autoCommandDelayInput');
  const connectBtn = document.getElementById('connectBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');

  // Presets
  const presetButtons = document.querySelectorAll('.preset-btn');

  // Position & Pathfinding Controls
  const targetXInput = document.getElementById('targetX');
  const targetYInput = document.getElementById('targetY');
  const targetZInput = document.getElementById('targetZ');
  const autoWalkCheck = document.getElementById('autoWalkCheck');
  const lockPositionCheck = document.getElementById('lockPositionCheck');
  const goToCoordsBtn = document.getElementById('goToCoordsBtn');
  const setCurrentPosBtn = document.getElementById('setCurrentPosBtn');
  const stopMoveBtn = document.getElementById('stopMoveBtn');
  const savePosConfigBtn = document.getElementById('savePosConfigBtn');

  // Status Metrics & Coordinates Display
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const targetServerSpan = document.getElementById('targetServer');
  const activeEditionSpan = document.getElementById('activeEdition');
  const activeUsernameSpan = document.getElementById('activeUsername');
  const activeAuthSpan = document.getElementById('activeAuth');
  const activeUptimeSpan = document.getElementById('activeUptime');
  const currentCoordX = document.getElementById('currentCoordX');
  const currentCoordY = document.getElementById('currentCoordY');
  const currentCoordZ = document.getElementById('currentCoordZ');
  const movingIndicator = document.getElementById('movingIndicator');

  // Terminal & Chat Bar
  const terminalBody = document.getElementById('terminalBody');
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  const chatCommandForm = document.getElementById('chatCommandForm');
  const chatInput = document.getElementById('chatInput');

  let currentUser = null;
  let currentSubscription = null;
  let currentTimeLeftSeconds = 0;
  let pollInterval = null;
  let uptimeInterval = null;
  let subTimerInterval = null;
  let currentUptimeSeconds = 0;
  let autoScrollTerminal = true;
  let lastLivePosition = null;

  // فحص المصادقة فور فتح الصفحة
  checkAuth();

  // 1. التبديل بين تسجيل الدخول وإنشاء حساب
  tabLoginBtn.addEventListener('click', () => {
    tabLoginBtn.classList.add('active');
    tabRegisterBtn.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    loginErrorAlert.classList.add('hidden');
  });

  tabRegisterBtn.addEventListener('click', () => {
    tabRegisterBtn.classList.add('active');
    tabLoginBtn.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    regErrorAlert.classList.add('hidden');
  });

  // فحص معاملات رابط الـ Discord OAuth للتحقق من وجود أي خطأ
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('error')) {
    const err = urlParams.get('error');
    let msg = 'حدث خطأ أثناء محاولة تسجيل الدخول عبر ديسكورد.';
    if (err === 'discord_config_missing') msg = 'لم يتم ضبط متغيرات ديسكورد (DISCORD_CLIENT_ID / SECRET) في السيرفر بعد.';
    if (err === 'discord_auth_failed') msg = 'فشلت عملية المصادقة مع ديسكورد أو تم إلغاء الإذن.';
    if (err === 'discord_error') msg = 'حدث خطأ داخلي أثناء استرجاع حساب ديسكورد.';
    if (discordErrorMsg && discordErrorAlert) {
      discordErrorMsg.textContent = msg;
      discordErrorAlert.classList.remove('hidden');
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  function updateSlotsDisplay(active, max) {
    if (gateActiveSlots) gateActiveSlots.textContent = active;
    if (gateMaxSlots) gateMaxSlots.textContent = max;
    if (navActiveSlots) navActiveSlots.textContent = active;
    if (navMaxSlots) navMaxSlots.textContent = max;

    const isFull = active >= max;
    if (gateSlotsStatus) {
      if (isFull) {
        gateSlotsStatus.className = 'slots-tag full';
        gateSlotsStatus.textContent = '⚠️ المقاعد ممتلئة';
      } else {
        gateSlotsStatus.className = 'slots-tag available';
        gateSlotsStatus.textContent = `🟢 متاح (${max - active} متبقي)`;
      }
    }
    if (navSlotsPill) {
      navSlotsPill.classList.toggle('full', isFull);
    }
  }

  // 2. فحص التوثيق الحالي
  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();

      // تحديث حالة السعة والمقاعد
      if (data.maxSlots !== undefined) {
        updateSlotsDisplay(data.activeSlots || 0, data.maxSlots);
      }

      if (data.authenticated) {
        currentUser = data.user;
        currentSubscription = data.subscription;
        currentTimeLeftSeconds = data.timeLeftSeconds || 0;
        showDashboard();
      } else {
        showLoginGate();
      }
    } catch (err) {
      showLoginGate();
    }
  }

  // 3. تسجيل الدخول
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value.trim();
    loginErrorAlert.classList.add('hidden');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        currentUser = data.user;
        checkAuth();
      } else {
        loginErrorMsg.textContent = data.message || 'اسم المستخدم أو كلمة المرور غير صحيحة!';
        loginErrorAlert.classList.remove('hidden');
      }
    } catch (err) {
      loginErrorMsg.textContent = 'حدث خطأ في الاتصال بالخادم!';
      loginErrorAlert.classList.remove('hidden');
    }
  });

  // 4. إنشاء حساب زبون جديد مع كود اشتراك
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = regUsernameInput.value.trim();
    const password = regPasswordInput.value.trim();
    const licenseKey = regLicenseKeyInput.value.trim();
    regErrorAlert.classList.add('hidden');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, licenseKey })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        currentUser = data.user;
        checkAuth();
      } else {
        regErrorMsg.textContent = data.message || 'خطأ في إنشاء الحساب!';
        regErrorAlert.classList.remove('hidden');
      }
    } catch (err) {
      regErrorMsg.textContent = 'حدث خطأ في الاتصال بالخادم!';
      regErrorAlert.classList.remove('hidden');
    }
  });

  // 5. تسجيل الخروج
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    showLoginGate();
  });

  function showLoginGate() {
    loginGate.classList.remove('hidden');
    mainDashboard.classList.add('hidden');
    if (pollInterval) clearInterval(pollInterval);
    if (uptimeInterval) clearInterval(uptimeInterval);
    if (subTimerInterval) clearInterval(subTimerInterval);
  }

  function showDashboard() {
    loginGate.classList.add('hidden');
    mainDashboard.classList.remove('hidden');

    userNameSpan.textContent = currentUser.username;

    // تمييز الأدمن
    if (currentUser.role === 'admin') {
      openAdminBtn.classList.remove('hidden');
      subCountdownBadge.className = 'sub-badge active';
      subCountdownText.textContent = '👑 حساب المسؤول (Admin)';
      expiredOverlay.classList.add('hidden');
    } else {
      openAdminBtn.classList.add('hidden');
      updateSubscriptionCountdown();
      if (!subTimerInterval) {
        subTimerInterval = setInterval(updateSubscriptionCountdown, 1000);
      }
    }

    fetchBotStatus();
    if (!pollInterval) {
      pollInterval = setInterval(fetchBotStatus, 2000);
    }
    if (!uptimeInterval) {
      uptimeInterval = setInterval(updateUptimeDisplay, 1000);
    }
  }

  // 6. تحديث مؤقت الاشتراك للزبون
  function updateSubscriptionCountdown() {
    if (!currentUser || currentUser.role === 'admin') return;

    if (currentTimeLeftSeconds <= 0) {
      subCountdownBadge.className = 'sub-badge expired';
      subCountdownText.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> انتهى الاشتراك!';
      expiredOverlay.classList.remove('hidden');
      connectBtn.disabled = true;
      goToCoordsBtn.disabled = true;
    } else {
      currentTimeLeftSeconds--;
      expiredOverlay.classList.add('hidden');
      connectBtn.disabled = false;
      goToCoordsBtn.disabled = false;
      subCountdownBadge.className = 'sub-badge active';

      const days = Math.floor(currentTimeLeftSeconds / 86400);
      const hours = Math.floor((currentTimeLeftSeconds % 86400) / 3600);
      const mins = Math.floor((currentTimeLeftSeconds % 3600) / 60);
      const secs = currentTimeLeftSeconds % 60;

      if (days > 0) {
        subCountdownText.textContent = `متبقي على اشتراكك: ${days} أيام و ${hours} ساعة`;
      } else {
        subCountdownText.textContent = `متبقي: ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
      }
    }
  }

  // 7. تفعيل كود الاشتراك من شاشة القفل
  renewKeyBtn.addEventListener('click', async () => {
    const key = renewKeyInput.value.trim();
    if (!key) {
      alert('يرجى إدخال كود التفعيل أولاً!');
      return;
    }

    renewKeyBtn.disabled = true;
    try {
      const res = await fetch('/api/subscription/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      const data = await res.json();

      if (data.success) {
        alert(data.message);
        renewKeyInput.value = '';
        checkAuth();
      } else {
        alert(data.message || 'تعذر تفعيل الكود');
      }
    } catch (err) {
      alert('خطأ في الاتصال بالخادم!');
    } finally {
      renewKeyBtn.disabled = false;
    }
  });

  // 8. مودال تفعيل كود الاشتراك للزبون (User Redeem Modal)
  if (openRedeemModalBtn) {
    openRedeemModalBtn.addEventListener('click', () => {
      userRedeemModal.classList.remove('hidden');
      userRedeemKeyInput.value = '';
      userRedeemResult.classList.add('hidden');
    });
  }

  if (closeUserRedeemBtn) {
    closeUserRedeemBtn.addEventListener('click', () => {
      userRedeemModal.classList.add('hidden');
    });
  }

  if (userRedeemSubmitBtn) {
    userRedeemSubmitBtn.addEventListener('click', async () => {
      const key = userRedeemKeyInput.value.trim();
      if (!key) {
        userRedeemResult.className = 'alert-box error';
        userRedeemResult.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> يرجى إدخال الكود أولاً!';
        userRedeemResult.classList.remove('hidden');
        return;
      }

      userRedeemSubmitBtn.disabled = true;
      try {
        const res = await fetch('/api/subscription/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key })
        });
        const data = await res.json();

        if (data.success) {
          userRedeemResult.className = 'alert-box success';
          userRedeemResult.innerHTML = `<i class="fa-solid fa-check"></i> ${data.message}`;
          userRedeemResult.classList.remove('hidden');
          setTimeout(() => {
            userRedeemModal.classList.add('hidden');
            checkAuth();
          }, 1500);
        } else {
          userRedeemResult.className = 'alert-box error';
          userRedeemResult.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${data.message || 'فشل تفعيل الكود'}`;
          userRedeemResult.classList.remove('hidden');
        }
      } catch (e) {
        userRedeemResult.className = 'alert-box error';
        userRedeemResult.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> خطأ في الاتصال بالخادم!';
        userRedeemResult.classList.remove('hidden');
      } finally {
        userRedeemSubmitBtn.disabled = false;
      }
    });
  }

  // 9. لوحة تحكم المسؤول الشاملة (Admin Super-Panel)
  openAdminBtn.addEventListener('click', () => {
    adminModal.classList.remove('hidden');
    loadAdminData();
  });

  closeAdminBtn.addEventListener('click', () => {
    adminModal.classList.add('hidden');
  });

  // التنقل بين تبويبات لوحة الأدمن
  function switchAdminTab(viewName) {
    adminTabSubs.classList.toggle('active', viewName === 'subs');
    adminTabKeys.classList.toggle('active', viewName === 'keys');
    adminTabSettings.classList.toggle('active', viewName === 'settings');

    adminSubsView.classList.toggle('hidden', viewName !== 'subs');
    adminKeysView.classList.toggle('hidden', viewName !== 'keys');
    adminSettingsView.classList.toggle('hidden', viewName !== 'settings');
  }

  if (adminTabSubs) adminTabSubs.addEventListener('click', () => switchAdminTab('subs'));
  if (adminTabKeys) adminTabKeys.addEventListener('click', () => {
    switchAdminTab('keys');
    loadAdminKeys();
  });
  if (adminTabSettings) adminTabSettings.addEventListener('click', () => switchAdminTab('settings'));

  if (refreshSubsBtn) refreshSubsBtn.addEventListener('click', loadAdminData);
  if (refreshKeysBtn) refreshKeysBtn.addEventListener('click', loadAdminKeys);

  const adminStopAllBotsBtn = document.getElementById('adminStopAllBotsBtn');
  if (adminStopAllBotsBtn) {
    adminStopAllBotsBtn.addEventListener('click', async () => {
      if (!confirm('⚠️ تحذير طوارئ: هل أنت متأكد من رغبتك في فصل وإيقاف جميع البوتات الشغالة حالياً لجميع المستخدمين؟')) {
        return;
      }

      adminStopAllBotsBtn.disabled = true;
      adminStopAllBotsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري إيقاف البوتات...';

      try {
        const res = await fetch('/api/admin/bots/stop-all', { method: 'POST' });
        const data = await res.json();
        alert(data.message || 'تم إيقاف جميع البوتات بنجاح!');
        loadAdminData();
        fetchBotStatus();
      } catch (err) {
        alert('خطأ أثناء إرسال طلب إيقاف البوتات!');
      } finally {
        adminStopAllBotsBtn.disabled = false;
        adminStopAllBotsBtn.innerHTML = '<i class="fa-solid fa-power-off"></i> إيقاف جميع البوتات الآن';
      }
    });
  }

  async function loadAdminData() {
    try {
      const [resOverview, resSubs] = await Promise.all([
        fetch('/api/admin/overview'),
        fetch('/api/admin/subscriptions')
      ]);

      const overview = await resOverview.json();
      const subsData = await resSubs.json();

      adminTotalRevenue.textContent = `${overview.totalRevenueIQD.toLocaleString('en-US')} د.ع`;
      adminActiveSubs.textContent = `${overview.activeSubscriptions} / ${overview.maxSlots || 10}`;
      adminConnectedBots.textContent = overview.connectedBots;
      adminDbStatus.textContent = overview.isFirebase ? 'Firebase Firestore 🟢' : 'Local JSON Fallback 🟡';

      if (adminMaxSlotsInput) adminMaxSlotsInput.value = overview.maxSlots || 10;

      renderAdminSubscriptions(subsData.subscriptions);
      loadAdminKeys();
    } catch (err) {
      console.error('Error loading admin data:', err);
    }
  }

  function renderAdminSubscriptions(subs) {
    if (!subs || !subs.length) {
      adminSubsTableBody.innerHTML = `<tr><td colspan="5" class="text-center">لا يوجد مشتركون حالياً</td></tr>`;
      return;
    }

    adminSubsTableBody.innerHTML = subs.map(sub => {
      const expDate = new Date(sub.expiresAt).toLocaleDateString('ar-EG', { dateStyle: 'medium' });
      const statusBadgeHtml = sub.isActive
        ? '<span class="status-badge connected">نشط</span>'
        : '<span class="status-badge disconnected">منتهي</span>';

      return `
        <tr>
          <td><strong>${escapeHtml(sub.userId)}</strong></td>
          <td>${statusBadgeHtml}</td>
          <td>${sub.isActive ? `${sub.daysLeft} يوم` : '0'}</td>
          <td>${expDate}</td>
          <td>
            <button class="btn btn-sm btn-success extend-btn" data-user="${escapeHtml(sub.userId)}">
              <i class="fa-solid fa-plus"></i> +7 أيام
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // أزرار تمديد الاشتراك
    document.querySelectorAll('.extend-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const username = btn.dataset.user;
        if (!confirm(`هل تريد تمديد اشتراك ${username} لمدة 7 أيام إضافية؟`)) return;

        btn.disabled = true;
        try {
          const res = await fetch('/api/admin/subscriptions/extend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, days: 7, pricePaid: 40000 })
          });
          const data = await res.json();
          if (data.success) {
            alert(data.message);
            loadAdminData();
          }
        } catch (e) {
          alert('خطأ في تمديد الاشتراك!');
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  // جلب وعرض قائمة أكواد الاشتراكات
  async function loadAdminKeys() {
    try {
      const res = await fetch('/api/admin/keys');
      const data = await res.json();
      renderAdminKeys(data.keys || []);
    } catch (e) {
      console.error('Error fetching admin keys:', e);
    }
  }

  function renderAdminKeys(keys) {
    if (!adminKeysTableBody) return;
    if (!keys || !keys.length) {
      adminKeysTableBody.innerHTML = `<tr><td colspan="6" class="text-center">لا توجد أكواد اشتراكات مولدة حالياً. اضغط "توليد الآن" لإنشاء كود.</td></tr>`;
      return;
    }

    // ترتيب الأحدث أولاً
    keys.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    adminKeysTableBody.innerHTML = keys.map(k => {
      const statusBadge = k.isUsed
        ? `<span class="key-used-badge"><i class="fa-solid fa-lock"></i> مستخدم</span>`
        : `<span class="key-available-badge"><i class="fa-solid fa-circle-check"></i> متاح للبيع</span>`;

      const usageInfo = k.isUsed
        ? `بواسطة: <strong>${escapeHtml(k.usedBy || '--')}</strong><br><small style="color:var(--text-muted);">${new Date(k.usedAt).toLocaleDateString('ar-EG')}</small>`
        : `<span style="color:var(--text-muted); font-size:12px;">جاهز للاستخدام لمرة واحدة</span>`;

      return `
        <tr>
          <td>
            <strong class="font-mono">${k.key}</strong>
            <button class="copy-key-btn" data-key="${k.key}" title="نسخ الكود">
              <i class="fa-solid fa-copy"></i> نسخ
            </button>
          </td>
          <td>${k.days} أيام</td>
          <td>${(k.price || 40000).toLocaleString('en-US')} د.ع</td>
          <td>${statusBadge}</td>
          <td>${usageInfo}</td>
          <td>
            ${!k.isUsed ? `
              <button class="delete-key-btn" data-key="${k.key}" title="حذف الكود">
                <i class="fa-solid fa-trash"></i>
              </button>
            ` : '<span style="color:var(--text-muted); font-size:11px;">مستهلك</span>'}
          </td>
        </tr>
      `;
    }).join('');

    // تفعيل أزرار النسخ الفوري
    adminKeysTableBody.querySelectorAll('.copy-key-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.key;
        navigator.clipboard.writeText(code).then(() => {
          btn.innerHTML = '<i class="fa-solid fa-check"></i> تم النسخ!';
          setTimeout(() => {
            btn.innerHTML = '<i class="fa-solid fa-copy"></i> نسخ';
          }, 1500);
        });
      });
    });

    // تفعيل أزرار الحذف
    adminKeysTableBody.querySelectorAll('.delete-key-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const code = btn.dataset.key;
        if (!confirm(`هل تريد بالتأكيد حذف كود الاشتراك (${code})؟`)) return;

        btn.disabled = true;
        try {
          await fetch(`/api/admin/keys/${code}`, { method: 'DELETE' });
          loadAdminKeys();
        } catch (e) {
          alert('خطأ أثناء حذف الكود!');
        }
      });
    });
  }

  // توليد أكواد اشتراكات (مفردة أو دفعة 5 / 10)
  if (generateBatchKeysBtn) {
    generateBatchKeysBtn.addEventListener('click', async () => {
      const count = parseInt(keyCountSelect.value, 10) || 1;
      const days = parseInt(keyDaysInput.value, 10) || 7;
      const price = parseInt(keyPriceInput.value, 10) || 40000;

      generateBatchKeysBtn.disabled = true;
      generateBatchKeysBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التوليد...';

      try {
        const res = await fetch('/api/admin/keys/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count, days, price })
        });
        const data = await res.json();

        if (data.success) {
          if (data.licenseKeys) {
            const listHtml = data.licenseKeys.map(k => `
              <div style="margin: 6px 0; display:flex; align-items:center; justify-content:space-between; background:rgba(0,0,0,0.2); padding:6px 10px; border-radius:6px;">
                <span class="font-mono">${k.key}</span>
                <button class="copy-key-btn" data-key="${k.key}"><i class="fa-solid fa-copy"></i> نسخ الكود</button>
              </div>
            `).join('');
            generatedKeysContainer.innerHTML = `<span>تم توليد <strong>${data.licenseKeys.length}</strong> أكواد بنجاح (كل كود يستخدمه شخص واحد فقط):</span>` + listHtml;
          } else if (data.licenseKey) {
            generatedKeysContainer.innerHTML = `
              <span>تم توليد كود اشتراك بنجاح:</span>
              <strong class="font-mono">${data.licenseKey.key}</strong>
              <button class="copy-key-btn" data-key="${data.licenseKey.key}"><i class="fa-solid fa-copy"></i> نسخ</button>
            `;
          }
          generatedKeyBox.classList.remove('hidden');
          loadAdminKeys();

          // ربط النسخ للأكواد المتولدة للتو
          generatedKeysContainer.querySelectorAll('.copy-key-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              navigator.clipboard.writeText(btn.dataset.key).then(() => {
                btn.innerHTML = '<i class="fa-solid fa-check"></i> تم!';
                setTimeout(() => btn.innerHTML = '<i class="fa-solid fa-copy"></i> نسخ', 1500);
              });
            });
          });
        } else {
          alert(data.message || 'تعذر توليد الأكواد');
        }
      } catch (e) {
        alert('خطأ في توليد الأكواد!');
      } finally {
        generateBatchKeysBtn.disabled = false;
        generateBatchKeysBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> توليد الآن';
      }
    });
  }

  // حفظ إعدادات المنصة والسعة القصوى
  if (adminSettingsForm) {
    adminSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const maxSlots = parseInt(adminMaxSlotsInput.value, 10);
      const weeklyPriceIQD = parseInt(adminPriceInput.value, 10);

      saveAdminSettingsBtn.disabled = true;
      try {
        const res = await fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ maxSlots, weeklyPriceIQD })
        });
        const data = await res.json();
        if (data.success) {
          adminSettingsAlert.classList.remove('hidden');
          setTimeout(() => adminSettingsAlert.classList.add('hidden'), 3500);
          loadAdminData();
          checkAuth();
        }
      } catch (e) {
        alert('خطأ أثناء حفظ الإعدادات!');
      } finally {
        saveAdminSettingsBtn.disabled = false;
      }
    });
  }

  // 9. اختيار موقع سيرفر DonutSMP (Fixed IP - Region Selector)
  const serverLocButtons = document.querySelectorAll('.server-loc-btn');

  function setServerLocation(host) {
    const cleanHost = (host || 'donutsmp.net').trim();
    if (serverHostInput) serverHostInput.value = cleanHost;
    if (serverPortInput) serverPortInput.value = '19132';

    serverLocButtons.forEach(b => {
      const match = b.dataset.host.toLowerCase() === cleanHost.toLowerCase();
      b.classList.toggle('active', match);
    });

    presetButtons.forEach(b => {
      const match = b.dataset.host && b.dataset.host.toLowerCase() === cleanHost.toLowerCase();
      b.classList.toggle('active-preset', match);
    });
  }

  serverLocButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      setServerLocation(btn.dataset.host);
    });
  });

  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      setServerLocation(btn.dataset.host || 'donutsmp.net');
    });
  });

  if (botEditionSelect) {
    botEditionSelect.addEventListener('change', () => {
      if (botEditionSelect.value === 'bedrock') {
        serverPortInput.value = '19132';
      } else if (botEditionSelect.value === 'java') {
        serverPortInput.value = '25565';
      }
    });
  }

  // 10. جلب حالة البوت الحالية
  async function fetchBotStatus() {
    try {
      const res = await fetch('/api/bot/status');
      if (res.status === 401) {
        showLoginGate();
        return;
      }
      const data = await res.json();

      if (data.isExpired) {
        currentTimeLeftSeconds = 0;
        updateSubscriptionCountdown();
      } else if (data.timeLeftSeconds !== undefined) {
        currentTimeLeftSeconds = data.timeLeftSeconds;
      }

      updateUIStatus(data);
    } catch (err) {
      console.error('Error fetching bot status:', err);
    }
  }

  // 11. تحديث الواجهة
  function updateUIStatus(data) {
    const { status, config, position, isMoving, uptimeSeconds, logs } = data;

    // تحديث الشارة
    statusBadge.className = 'status-badge ' + status;
    if (status === 'connected') {
      statusText.textContent = 'متصل (Online)';
    } else if (status === 'connecting') {
      statusText.textContent = 'جاري الاتصال...';
    } else {
      statusText.textContent = 'غير متصل (Offline)';
    }

    if (config.host) {
      const isEu = config.host.toLowerCase().includes('eu');
      targetServerSpan.textContent = isEu ? 'DonutSMP الأوروبي (EU)' : 'DonutSMP الرئيسي (US)';
      setServerLocation(config.host);
    } else {
      targetServerSpan.textContent = 'DonutSMP الرئيسي (US)';
    }

    if (activeEditionSpan) {
      activeEditionSpan.textContent = 'بيدروك (Bedrock 19132) 🟢';
      activeEditionSpan.style.color = '#4ade80';
    }

    activeUsernameSpan.textContent = config.username || '--';
    activeAuthSpan.textContent = 'حساب إكسبوكس مجاني';

    if (position) {
      lastLivePosition = position;
      currentCoordX.textContent = position.x;
      currentCoordY.textContent = position.y;
      currentCoordZ.textContent = position.z;

      if (isMoving) {
        movingIndicator.className = 'moving-indicator walking';
        movingIndicator.innerHTML = '<i class="fa-solid fa-person-walking fa-bounce"></i> <span>يتحرك</span>';
      } else {
        movingIndicator.className = 'moving-indicator static';
        movingIndicator.innerHTML = '<i class="fa-solid fa-person"></i> <span>واقف</span>';
      }
    } else {
      currentCoordX.textContent = '--';
      currentCoordY.textContent = '--';
      currentCoordZ.textContent = '--';
      movingIndicator.className = 'moving-indicator static';
      movingIndicator.innerHTML = '<i class="fa-solid fa-person"></i> <span>غير متصل</span>';
    }

    if (botEditionSelect && document.activeElement !== botEditionSelect && config.edition) {
      botEditionSelect.value = config.edition;
    }
    if (document.activeElement !== serverHostInput && config.host) {
      serverHostInput.value = config.host;
    }
    if (document.activeElement !== serverPortInput && config.port) {
      serverPortInput.value = config.port;
    }
    if (document.activeElement !== botUsernameInput && config.username) {
      botUsernameInput.value = config.username;
    }
    if (document.activeElement !== mcVersionSelect && config.version) {
      mcVersionSelect.value = config.version;
    }
    if (document.activeElement !== authModeSelect && config.auth) {
      authModeSelect.value = config.auth;
    }
    if (document.activeElement !== autoCommandInput && config.autoCommand !== undefined) {
      autoCommandInput.value = config.autoCommand;
    }
    if (document.activeElement !== autoCommandDelayInput && config.autoCommandDelay !== undefined) {
      autoCommandDelayInput.value = config.autoCommandDelay;
    }

    if (config.targetPos) {
      if (document.activeElement !== targetXInput && config.targetPos.x !== null) {
        targetXInput.value = config.targetPos.x;
      }
      if (document.activeElement !== targetYInput && config.targetPos.y !== null) {
        targetYInput.value = config.targetPos.y;
      }
      if (document.activeElement !== targetZInput && config.targetPos.z !== null) {
        targetZInput.value = config.targetPos.z;
      }
    }
    if (document.activeElement !== autoWalkCheck) {
      autoWalkCheck.checked = !!config.autoWalkToPos;
    }
    if (document.activeElement !== lockPositionCheck) {
      lockPositionCheck.checked = !!config.lockPosition;
    }

    currentUptimeSeconds = uptimeSeconds || 0;
    checkMsaBanner(data, logs);
    renderLogs(logs);
  }

  function checkMsaBanner(data, logs) {
    let foundCode = null;
    let foundLink = 'https://microsoft.com/link';

    if (data && data.msaCode && data.msaCode.code) {
      foundCode = data.msaCode.code;
      foundLink = data.msaCode.link || `https://microsoft.com/link?otc=${foundCode}`;
    }

    if (!foundCode && logs && logs.length) {
      const recentLogs = logs.slice(-15);
      for (const log of recentLogs) {
        if (log.message.includes('otc=')) {
          const match = log.message.match(/otc=([A-Z0-9]+)/i);
          if (match && match[1]) {
            foundCode = match[1];
            foundLink = `https://microsoft.com/link?otc=${foundCode}`;
            break;
          }
        } else if (log.message.includes('أدخل الكود:')) {
          const match = log.message.match(/أدخل الكود:\s*([A-Z0-9]+)/i);
          if (match && match[1]) {
            foundCode = match[1];
            foundLink = `https://microsoft.com/link?otc=${foundCode}`;
            break;
          }
        }
      }
    }

    if (foundCode) {
      msaCodeValue.textContent = foundCode;
      msaDirectLink.href = foundLink;
      msaBanner.classList.remove('hidden');
    } else {
      msaBanner.classList.add('hidden');
    }
  }

  copyMsaCodeBtn.addEventListener('click', () => {
    const code = msaCodeValue.textContent;
    if (code && code !== '----') {
      navigator.clipboard.writeText(code).then(() => {
        const originalHtml = copyMsaCodeBtn.innerHTML;
        copyMsaCodeBtn.innerHTML = '<i class="fa-solid fa-check"></i> تم النسخ!';
        setTimeout(() => {
          copyMsaCodeBtn.innerHTML = originalHtml;
        }, 2000);
      });
    }
  });

  function updateUptimeDisplay() {
    if (statusText.textContent.includes('متصل (Online)')) {
      currentUptimeSeconds++;
      const hrs = Math.floor(currentUptimeSeconds / 3600);
      const mins = Math.floor((currentUptimeSeconds % 3600) / 60);
      const secs = currentUptimeSeconds % 60;
      activeUptimeSpan.textContent = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    } else {
      activeUptimeSpan.textContent = '00:00:00';
    }
  }

  function pad(num) {
    return num.toString().padStart(2, '0');
  }

  function renderLogs(logs) {
    if (!logs || !logs.length) {
      terminalBody.innerHTML = `
        <div class="log-entry system">
          <span class="log-time">[${new Date().toLocaleTimeString('ar-EG')}]</span>
          <span class="log-type">[SYSTEM]</span>
          <span class="log-msg">لا توجد سجلات حالياً...</span>
        </div>`;
      return;
    }

    terminalBody.innerHTML = logs.map(item => `
      <div class="log-entry ${item.type}">
        <span class="log-time">[${item.timestamp}]</span>
        <span class="log-type">[${item.type.toUpperCase()}]</span>
        <span class="log-msg">${escapeHtml(item.message)}</span>
      </div>
    `).join('');

    if (autoScrollTerminal) {
      terminalBody.scrollTop = terminalBody.scrollHeight;
    }
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, function(m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[m];
    });
  }

  // 12. التحكم بالإحداثيات
  setCurrentPosBtn.addEventListener('click', () => {
    if (!lastLivePosition) {
      alert('البوت غير متصل حالياً لجلب موقعه الحالي!');
      return;
    }
    targetXInput.value = lastLivePosition.x;
    targetYInput.value = lastLivePosition.y;
    targetZInput.value = lastLivePosition.z;
  });

  goToCoordsBtn.addEventListener('click', async () => {
    const x = targetXInput.value;
    const y = targetYInput.value;
    const z = targetZInput.value;

    if (x === '' || y === '' || z === '') {
      alert('يرجى كتابة أرقام صحيحة لـ X, Y, Z أولاً!');
      return;
    }

    goToCoordsBtn.disabled = true;
    try {
      const res = await fetch('/api/bot/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y, z })
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.message || 'تعذر بدء التحرك');
      }
      fetchBotStatus();
    } catch (err) {
      alert('خطأ أثناء إرسال أمر الحركة!');
    } finally {
      goToCoordsBtn.disabled = false;
    }
  });

  stopMoveBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/bot/stop-move', { method: 'POST' });
      fetchBotStatus();
    } catch (err) {
      console.error(err);
    }
  });

  savePosConfigBtn.addEventListener('click', async () => {
    const x = targetXInput.value;
    const y = targetYInput.value;
    const z = targetZInput.value;
    const autoWalkToPos = autoWalkCheck.checked;
    const lockPosition = lockPositionCheck.checked;
    const autoCommand = autoCommandInput.value;
    const autoCommandDelay = autoCommandDelayInput.value;

    savePosConfigBtn.disabled = true;
    try {
      const res = await fetch('/api/bot/set-target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x: x !== '' ? parseFloat(x) : null,
          y: y !== '' ? parseFloat(y) : null,
          z: z !== '' ? parseFloat(z) : null,
          autoWalkToPos,
          lockPosition,
          autoCommand,
          autoCommandDelay
        })
      });
      const data = await res.json();
      if (data.success) {
        savePosConfigBtn.innerHTML = '<i class="fa-solid fa-check"></i> تم الحفظ!';
        setTimeout(() => {
          savePosConfigBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span>حفظ الإعدادات</span>';
        }, 2000);
      }
    } catch (err) {
      alert('خطأ في حفظ الإعدادات!');
    } finally {
      savePosConfigBtn.disabled = false;
    }
  });

  // 13. إرسال أوامر الشات
  chatCommandForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;

    chatInput.value = '';
    try {
      const res = await fetch('/api/bot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.message || 'تعذر إرسال الرسالة');
      }
      fetchBotStatus();
    } catch (err) {
      console.error(err);
    }
  });

  // 14. بدء تشغيل البوت
  botConnectForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const edition = botEditionSelect ? botEditionSelect.value : 'bedrock';
    const host = serverHostInput.value.trim();
    const port = serverPortInput.value.trim();
    const username = botUsernameInput.value.trim();
    const password = authPasswordInput.value.trim();
    const version = mcVersionSelect.value;
    const auth = authModeSelect.value;
    const autoCommand = autoCommandInput.value.trim();
    const autoCommandDelay = autoCommandDelayInput.value.trim();

    const targetX = targetXInput.value !== '' ? targetXInput.value : null;
    const targetY = targetYInput.value !== '' ? targetYInput.value : null;
    const targetZ = targetZInput.value !== '' ? targetZInput.value : null;
    const autoWalkToPos = autoWalkCheck.checked;
    const lockPosition = lockPositionCheck.checked;

    if (!host) {
      alert('يرجى إدخال عنوان IP الخاص بالسيرفر!');
      return;
    }

    connectBtn.disabled = true;
    connectBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الاتصال...';

    try {
      const res = await fetch('/api/bot/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        })
      });
      const data = await res.json();
      fetchBotStatus();
    } catch (err) {
      alert('خطأ في إرسال طلب الاتصال!');
    } finally {
      connectBtn.disabled = false;
      connectBtn.innerHTML = '<i class="fa-solid fa-play"></i> <span>بدء تشغيل البوت (Connect)</span>';
    }
  });

  // 15. فصل البوت
  disconnectBtn.addEventListener('click', async () => {
    if (!confirm('هل أنت متأكد من رغبتك في إيقاف وفصل البوت؟')) return;

    disconnectBtn.disabled = true;
    try {
      await fetch('/api/bot/disconnect', { method: 'POST' });
      fetchBotStatus();
    } catch (err) {
      alert('خطأ أثناء فصل البوت!');
    } finally {
      disconnectBtn.disabled = false;
    }
  });

  // 16. مسح السجل
  clearLogsBtn.addEventListener('click', () => {
    terminalBody.innerHTML = `
      <div class="log-entry system">
        <span class="log-time">[${new Date().toLocaleTimeString('ar-EG')}]</span>
        <span class="log-type">[SYSTEM]</span>
        <span class="log-msg">تم مسح السجل من الشاشة المحليّة.</span>
      </div>`;
  });
});
