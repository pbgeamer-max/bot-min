document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const loginGate = document.getElementById('loginGate');
  const loginForm = document.getElementById('loginForm');
  const loginPasswordInput = document.getElementById('loginPassword');
  const loginErrorAlert = document.getElementById('loginError');
  const loginErrorMsg = document.getElementById('loginErrorMsg');
  const mainDashboard = document.getElementById('mainDashboard');
  const logoutBtn = document.getElementById('logoutBtn');

  // Microsoft Auth Banner Elements
  const msaBanner = document.getElementById('msaBanner');
  const msaCodeValue = document.getElementById('msaCodeValue');
  const msaDirectLink = document.getElementById('msaDirectLink');
  const copyMsaCodeBtn = document.getElementById('copyMsaCodeBtn');

  // Dashboard Controls & Connection Form
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

  let pollInterval = null;
  let uptimeInterval = null;
  let currentUptimeSeconds = 0;
  let autoScrollTerminal = true;
  let lastLivePosition = null;

  // فحص المصادقة فور فتح الصفحة
  checkAuth();

  // 1. فحص التوثيق الحالي
  async function checkAuth() {
    try {
      const res = await fetch('/api/check-auth');
      const data = await res.json();
      if (data.authenticated) {
        showDashboard();
      } else {
        showLoginGate();
      }
    } catch (err) {
      showLoginGate();
    }
  }

  // 2. تسجيل الدخول
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = loginPasswordInput.value;
    loginErrorAlert.classList.add('hidden');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showDashboard();
      } else {
        loginErrorMsg.textContent = data.message || 'كلمة المرور غير صحيحة!';
        loginErrorAlert.classList.remove('hidden');
      }
    } catch (err) {
      loginErrorMsg.textContent = 'حدث خطأ في الاتصال بالخادم!';
      loginErrorAlert.classList.remove('hidden');
    }
  });

  // 3. تسجيل الخروج
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (e) {}
    showLoginGate();
  });

  function showLoginGate() {
    loginGate.classList.remove('hidden');
    mainDashboard.classList.add('hidden');
    if (pollInterval) clearInterval(pollInterval);
    if (uptimeInterval) clearInterval(uptimeInterval);
  }

  function showDashboard() {
    loginGate.classList.add('hidden');
    mainDashboard.classList.remove('hidden');
    fetchStatus();
    if (!pollInterval) {
      pollInterval = setInterval(fetchStatus, 2000);
    }
    if (!uptimeInterval) {
      uptimeInterval = setInterval(updateUptimeDisplay, 1000);
    }
  }

  // 4. السيرفرات السريعة (Presets)
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

  // 5. جلب حالة البوت الحالية والسجلات
  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      if (res.status === 401) {
        showLoginGate();
        return;
      }
      const data = await res.json();
      updateUIStatus(data);
    } catch (err) {
      console.error('Error fetching status:', err);
    }
  }

  // 6. تحديث الواجهة بناءً على البيانات القادمة من الـ API
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

    // تحديث الإحصائيات
    if (config.host) {
      targetServerSpan.textContent = `${config.host}:${config.port}`;
    } else {
      targetServerSpan.textContent = 'لم يحدد بعد';
    }

    activeUsernameSpan.textContent = config.username || '--';
    activeAuthSpan.textContent = config.auth === 'microsoft' ? 'Microsoft رسمي' : 'Cracked مكرك';

    // تحديث الإحداثيات اللحظية
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

    // تحديث حقول النموذج بالقيم الحالية إن لم يكن المستخدم يعدلها
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

    // إعدادات إحداثيات الهدف
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

    // تحديث مدة الاتصال
    currentUptimeSeconds = uptimeSeconds || 0;

    // فحص رسائل Microsoft Auth لإظهار البانر الخاص بها
    checkMsaBanner(logs);

    // تحديث السجلات الحية
    renderLogs(logs);
  }

  // فحص إذا كان هناك كود تسجيل حساب مايكروسوفت مطلوب
  function checkMsaBanner(logs) {
    if (!logs || !logs.length) return;

    let foundCode = null;
    let foundLink = 'https://microsoft.com/link';

    // البحث في آخر 15 رسالة
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

  // نسخ كود مايكروسوفت
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

  // 7. تنسيق وعرض مدة التشغيل
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

  // 8. عرض السجلات الحية في الـ Terminal
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

  // 9. التحكم بالإحداثيات ومكان الوقوف
  // زر تحديد الموقع الحالي كهدف
  setCurrentPosBtn.addEventListener('click', () => {
    if (!lastLivePosition) {
      alert('البوت غير متصل حالياً لجلب موقعه الحالي!');
      return;
    }
    targetXInput.value = lastLivePosition.x;
    targetYInput.value = lastLivePosition.y;
    targetZInput.value = lastLivePosition.z;
  });

  // زر الانتقال إلى الإحداثيات الآن
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
      fetchStatus();
    } catch (err) {
      alert('خطأ أثناء إرسال أمر الحركة!');
    } finally {
      goToCoordsBtn.disabled = false;
    }
  });

  // زر إيقاف الحركة
  stopMoveBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/bot/stop-move', { method: 'POST' });
      fetchStatus();
    } catch (err) {
      console.error(err);
    }
  });

  // زر حفظ إعدادات الموقع
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

  // 10. إرسال أوامر الشات المباشرة (/smp, /home, etc.)
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
      fetchStatus();
    } catch (err) {
      console.error(err);
    }
  });

  // 11. إرسال طلب اتصال بالبوت
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
      fetchStatus();
    } catch (err) {
      alert('خطأ في إرسال طلب الاتصال!');
    } finally {
      connectBtn.disabled = false;
      connectBtn.innerHTML = '<i class="fa-solid fa-play"></i> <span>بدء الاتصال (Connect)</span>';
    }
  });

  // 12. إرسال طلب فصل البوت
  disconnectBtn.addEventListener('click', async () => {
    if (!confirm('هل أنت متأكد من رغبتك في إيقاف وفصل البوت عن السيرفر؟')) return;

    disconnectBtn.disabled = true;
    try {
      await fetch('/api/bot/disconnect', { method: 'POST' });
      fetchStatus();
    } catch (err) {
      alert('خطأ أثناء فصل البوت!');
    } finally {
      disconnectBtn.disabled = false;
    }
  });

  // 13. مسح السجل
  clearLogsBtn.addEventListener('click', () => {
    terminalBody.innerHTML = `
      <div class="log-entry system">
        <span class="log-time">[${new Date().toLocaleTimeString('ar-EG')}]</span>
        <span class="log-type">[SYSTEM]</span>
        <span class="log-msg">تم مسح السجل من الشاشة المحليّة.</span>
      </div>`;
  });
});
