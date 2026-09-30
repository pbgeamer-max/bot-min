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
  const generateKeyBtn = document.getElementById('generateKeyBtn');
  const generatedKeyBox = document.getElementById('generatedKeyBox');
  const newKeyDisplay = document.getElementById('newKeyDisplay');
  const adminSubsTableBody = document.getElementById('adminSubsTableBody');

  // Microsoft Auth Banner Elements
  const msaBanner = document.getElementById('msaBanner');
  const msaCodeValue = document.getElementById('msaCodeValue');
  const msaDirectLink = document.getElementById('msaDirectLink');
  const copyMsaCodeBtn = document.getElementById('copyMsaCodeBtn');

  // Dashboard Controls & Form
  const botConnectForm = document.getElementById('botConnectForm');
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

  // 2. فحص التوثيق الحالي
  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
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

  // 8. لوحة تحكم المسؤول (Admin Modal)
  openAdminBtn.addEventListener('click', () => {
    adminModal.classList.remove('hidden');
    loadAdminData();
  });

  closeAdminBtn.addEventListener('click', () => {
    adminModal.classList.add('hidden');
  });

  async function loadAdminData() {
    try {
      const [resOverview, resSubs] = await Promise.all([
        fetch('/api/admin/overview'),
        fetch('/api/admin/subscriptions')
      ]);

      const overview = await resOverview.json();
      const subsData = await resSubs.json();

      adminTotalRevenue.textContent = `${overview.totalRevenueIQD.toLocaleString('en-US')} د.ع`;
      adminActiveSubs.textContent = overview.activeSubscriptions;
      adminConnectedBots.textContent = overview.connectedBots;
      adminDbStatus.textContent = overview.isFirebase ? 'Firebase Firestore 🟢' : 'Local JSON Fallback 🟡';

      renderAdminSubscriptions(subsData.subscriptions);
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
          <td><strong>${sub.userId}</strong></td>
          <td>${statusBadgeHtml}</td>
          <td>${sub.isActive ? `${sub.daysLeft} يوم` : '0'}</td>
          <td>${expDate}</td>
          <td>
            <button class="btn btn-sm btn-success extend-btn" data-user="${sub.userId}">
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

  // توليد كود اشتراك أسبوعي
  generateKeyBtn.addEventListener('click', async () => {
    generateKeyBtn.disabled = true;
    try {
      const res = await fetch('/api/admin/keys/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 7, price: 40000 })
      });
      const data = await res.json();
      if (data.success) {
        newKeyDisplay.textContent = data.licenseKey.key;
        generatedKeyBox.classList.remove('hidden');
        loadAdminData();
      }
    } catch (e) {
      alert('خطأ أثناء توليد الكود!');
    } finally {
      generateKeyBtn.disabled = false;
    }
  });

  // 9. السيرفرات السريعة (Presets)
  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      if (preset === 'donutsmp') {
        serverHostInput.value = 'donutsmp.net';
        serverPortInput.value = '25565';
        authModeSelect.value = 'microsoft';
        mcVersionSelect.value = 'auto';
        autoCommandInput.value = '/smp';
        autoCommandDelayInput.value = '7';
      } else if (preset === 'donutsmp-eu') {
        serverHostInput.value = 'EU.donutsmp.net';
        serverPortInput.value = '25565';
        authModeSelect.value = 'microsoft';
        mcVersionSelect.value = 'auto';
        autoCommandInput.value = '/smp';
        autoCommandDelayInput.value = '7';
      } else if (preset === 'aternos') {
        serverHostInput.value = 'myserver.aternos.me';
        serverPortInput.value = '25565';
        authModeSelect.value = 'offline';
        mcVersionSelect.value = 'auto';
        autoCommandInput.value = '';
        autoCommandDelayInput.value = '7';
      }
    });
  });

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
      targetServerSpan.textContent = `${config.host}:${config.port}`;
    } else {
      targetServerSpan.textContent = 'لم يحدد بعد';
    }

    activeUsernameSpan.textContent = config.username || '--';
    activeAuthSpan.textContent = config.auth === 'microsoft' ? 'Microsoft رسمي' : 'Cracked مكرك';

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
    checkMsaBanner(logs);
    renderLogs(logs);
  }

  function checkMsaBanner(logs) {
    if (!logs || !logs.length) return;

    let foundCode = null;
    let foundLink = 'https://microsoft.com/link';

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
