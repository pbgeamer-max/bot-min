document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const loginGate = document.getElementById('loginGate');
  const loginForm = document.getElementById('loginForm');
  const loginPasswordInput = document.getElementById('loginPassword');
  const loginErrorAlert = document.getElementById('loginError');
  const loginErrorMsg = document.getElementById('loginErrorMsg');
  const mainDashboard = document.getElementById('mainDashboard');
  const logoutBtn = document.getElementById('logoutBtn');

  // Dashboard Controls & Form
  const botConnectForm = document.getElementById('botConnectForm');
  const serverHostInput = document.getElementById('serverHost');
  const serverPortInput = document.getElementById('serverPort');
  const botUsernameInput = document.getElementById('botUsername');
  const authPasswordInput = document.getElementById('authPassword');
  const mcVersionSelect = document.getElementById('mcVersion');
  const authModeSelect = document.getElementById('authMode');
  const connectBtn = document.getElementById('connectBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');

  // Dashboard Metrics & Indicators
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const targetServerSpan = document.getElementById('targetServer');
  const activeUsernameSpan = document.getElementById('activeUsername');
  const activeUptimeSpan = document.getElementById('activeUptime');

  // Terminal Logs
  const terminalBody = document.getElementById('terminalBody');
  const clearLogsBtn = document.getElementById('clearLogsBtn');

  let pollInterval = null;
  let uptimeInterval = null;
  let currentUptimeSeconds = 0;
  let autoScrollTerminal = true;

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

  // 4. جلب حالة البوت الحالية والسجلات
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

  // 5. تحديث الواجهة بناءً على البيانات القادمة من الـ API
  function updateUIStatus(data) {
    const { status, config, uptimeSeconds, logs } = data;

    // تحديث الشارة
    statusBadge.className = 'status-badge ' + status;
    if (status === 'connected') {
      statusText.textContent = 'متصل بالفور (Online)';
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

    // تحديث حقول النموذج بالقيم الحالية إن لم يقم المستخدم بتعديلها حالياً
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

    // تحديث مدة الاتصال الحية
    currentUptimeSeconds = uptimeSeconds || 0;

    // تحديث السجلات الحية
    renderLogs(logs);
  }

  // 6. تنسيق وعرض مدة التشغيل
  function updateUptimeDisplay() {
    if (statusText.textContent.includes('متصل بالفور')) {
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

  // 7. عرض السجلات الحية في الـ Terminal
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

  // 8. إرسال طلب اتصال بالبوت
  botConnectForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const host = serverHostInput.value.trim();
    const port = serverPortInput.value.trim();
    const username = botUsernameInput.value.trim();
    const password = authPasswordInput.value.trim();
    const version = mcVersionSelect.value;
    const auth = authModeSelect.value;

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
        body: JSON.stringify({ host, port, username, password, version, auth })
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

  // 9. إرسال طلب فصل البوت
  disconnectBtn.addEventListener('click', async () => {
    if (!confirm('هل أنت تأكد من رغبتك في إيقاف وفصل البوت عن السيرفر؟')) return;

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

  // 10. مسح السجل
  clearLogsBtn.addEventListener('click', () => {
    terminalBody.innerHTML = `
      <div class="log-entry system">
        <span class="log-time">[${new Date().toLocaleTimeString('ar-EG')}]</span>
        <span class="log-type">[SYSTEM]</span>
        <span class="log-msg">تم مسح السجل من الشاشة المحليّة.</span>
      </div>`;
  });
});
