/* ═══════════════════════════════════════════════════════════════
   js/session.js — نظام "الجلسة الواحدة" لكل طالب
   • startSession(userId)  : حذف الجلسات القديمة + إنشاء session_id جديد + heartbeat
   • فحص دوري كل 8 ثواني للتأكد أن session_id لم يتغير
   • اشتراك Realtime على جدول user_sessions
   • عند الدخول من جهاز آخر: Modal "تم تسجيل خروجك" + signOut
   • stopSession(userId)   : إيقاف كل المؤقتات والاشتراكات
   ═══════════════════════════════════════════════════════════════ */

const SessionManager = (function () {

  /* ─────── الحالة الداخلية ─────── */
  let currentUserId = null;       // معرّف المستخدم صاحب الجلسة
  let currentSessionId = null;    // معرّف الجلسة الحالي (فريد لكل جهاز/تسجيل دخول)
  let heartbeatTimer = null;      // مؤقت النبضة (كل 15 ثانية)
  let checkTimer = null;          // مؤقت الفحص (كل 8 ثواني)
  let channel = null;             // قناة Realtime
  let running = false;            // هل النظام يعمل؟
  let kicked = false;             // هل تم طرد هذه الجلسة؟
  let deviceFp = '';              // بصمة الجهاز

  /* ─────────────────────────────────────────────────────────
     توليد معرّف جلسة فريد
     ───────────────────────────────────────────────────────── */
  function generateSessionId(userId) {
    const raw = (userId || 'anon') + '|' + getDeviceFingerprint() + '|' + Date.now() + '|' + randomToken(12);
    let h1 = 5381, h2 = 52711;
    for (let i = 0; i < raw.length; i++) {
      const c = raw.charCodeAt(i);
      h1 = (h1 * 33) ^ c;
      h2 = (h2 * 33) ^ (c + i * 7);
    }
    const sid = 's_' + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + randomToken(10);
    storeSet(STORAGE_KEYS.sessionId, sid);
    return sid;
  }

  /** إرجاع معرّف الجلسة الحالي */
  function getCurrentSessionId() {
    return currentSessionId || storeGet(STORAGE_KEYS.sessionId, null);
  }

  /* ─────────────────────────────────────────────────────────
     إرسال نبضة (Heartbeat) — كل 15 ثانية
     ───────────────────────────────────────────────────────── */
  async function heartbeat() {
    if (!running || !currentUserId || kicked) return;
    try {
      // تحديث آخر نبضة للصف الخاص بهذه الجلسة فقط
      const { error } = await supabaseClient
        .from('user_sessions')
        .update({ last_heartbeat: new Date().toISOString(), is_active: true })
        .eq('user_id', currentUserId)
        .eq('session_id', currentSessionId);

      // لو لم يُحدَّث أي صف (ربما حُذف) → أعد إنشاءه
      if (error) {
        console.warn('[session] heartbeat error:', error.message);
      }
    } catch (e) { /* تجاهل أخطاء الشبكة المؤقتة */ }
  }

  /* ─────────────────────────────────────────────────────────
     طرد هذه الجلسة (دخول جهاز آخر)
     ───────────────────────────────────────────────────────── */
  async function kickOut(reason) {
    if (kicked) return;
    kicked = true;
    stopTimers();
    unsubscribe();

    // تنظيف الجلسة المحلية
    storeDel(STORAGE_KEYS.sessionId);
    currentSessionId = null;

    // عرض نافذة "تم تسجيل خروجك"
    const body = document.getElementById('kickedBody');
    if (body) {
      body.textContent = reason ||
        'تم فتح حسابك من جهاز آخر، ولذلك أُنهيت هذه الجلسة لحماية حسابك.';
    }
    openModal('kickedModal');
    showToast('تم تسجيل خروجك — الحساب فُتح من جهاز آخر', 'error', 6000);

    // إيقاف أي فيديو شغّال
    if (typeof pausePlayer === 'function') { try { pausePlayer(); } catch (e) {} }

    // تسجيل الخروج فعليًا
    try { await supabaseClient.auth.signOut({ scope: 'local' }); } catch (e) {}

    // تحديث الواجهة
    if (typeof onLogoutUI === 'function') { try { onLogoutUI(); } catch (e) {} }

    // إيقاف أي اشتراكات realtime أخرى
    if (typeof stopChatRealtime === 'function') { try { stopChatRealtime(); } catch (e) {} }
  }

  /* ─────────────────────────────────────────────────────────
     الفحص الدوري — كل 8 ثواني: هل تغيّر session_id؟
     ───────────────────────────────────────────────────────── */
  async function checkIntegrity() {
    if (!running || !currentUserId || kicked) return;
    try {
      const { data, error } = await supabaseClient
        .from('user_sessions')
        .select('session_id,last_heartbeat,is_active,device_fingerprint')
        .eq('user_id', currentUserId)
        .maybeSingle();

      if (error) {
        // خطأ صلاحية = الجلسة حُذفت أو policy منع القراءة
        if (String(error.message).toLowerCase().indexOf('row-level') !== -1) kickOut();
        return;
      }

      // لا يوجد صف إطلاقًا → تم حذف جلستي يدويًا
      if (!data) { kickOut('تم إنهاء جلستك بواسطة إدارة المنصة.'); return; }

      // الصف يخص جلسة أخرى → جهاز آخر سجّل الدخول
      if (data.session_id && data.session_id !== currentSessionId) {
        kickOut();
        return;
      }

      // الجلسة مُعطّلة من الأدمن
      if (data.is_active === false) {
        kickOut('تم إيقاف حسابك مؤقتًا بواسطة إدارة المنصة.');
      }
    } catch (e) { /* تجاهل */ }
  }

  /* ─────────────────────────────────────────────────────────
     Realtime على user_sessions
     ───────────────────────────────────────────────────────── */
  function subscribe(userId) {
    unsubscribe();
    try {
      channel = supabaseClient.channel('user_sessions_' + userId);
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_sessions',
        filter: 'user_id=eq.' + userId
      }, function (payload) {
        const row = payload.new || payload.old || {};

        // حذف الصف بالكامل
        if (payload.eventType === 'DELETE' && !kicked) {
          kickOut('تم إنهاء جلستك بواسطة إدارة المنصة.');
          return;
        }

        // إدراج/تحديث بمعرّف جلسة مختلف → جهاز آخر دخل
        if (row.session_id && row.session_id !== currentSessionId) {
          kickOut();
          return;
        }

        // تعطيل الجلسة
        if (row.is_active === false) {
          kickOut('تم إيقاف حسابك مؤقتًا بواسطة إدارة المنصة.');
        }
      }).subscribe(function (status) {
        if (status === 'SUBSCRIBED') {
          // تأكيد الملكية فور الاشتراك
          checkIntegrity();
        }
      });
    } catch (e) {
      console.warn('[session] realtime غير متاح:', e);
    }
  }

  function unsubscribe() {
    if (channel) {
      try { supabaseClient.removeChannel(channel); } catch (e) {}
      channel = null;
    }
  }

  /* ─────────────────────────────────────────────────────────
     إدارة المؤقتات
     ───────────────────────────────────────────────────────── */
  function stopTimers() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
  }

  function startTimers() {
    stopTimers();
    heartbeatTimer = setInterval(heartbeat, CONFIG.SESSION.heartbeatInterval);
    checkTimer = setInterval(checkIntegrity, CONFIG.SESSION.checkInterval);
  }

  /* ─────────────────────────────────────────────────────────
     startSession(userId)
     ───────────────────────────────────────────────────────── */
  async function startSession(userId) {
    if (!userId) return null;

    // لو نفس المستخدم والجلسة شغّالة → لا تفعل شيئًا
    if (running && currentUserId === userId && currentSessionId) return currentSessionId;

    currentUserId = userId;
    kicked = false;
    deviceFp = getDeviceFingerprint();
    running = true;

    // 1) إنشاء معرّف جلسة جديد لهذا الجهاز
    currentSessionId = generateSessionId(userId);

    // 2) حذف أي جلسات قديمة لنفس المستخدم
    try {
      await supabaseClient.from('user_sessions').delete().eq('user_id', userId);
    } catch (e) { /* RLS قد تمنع الحذف — نتجاهل لأن upsert سيستبدل الصف */ }

    // 3) إنشاء صف الجلسة الجديد
    const payload = {
      user_id: userId,
      session_id: currentSessionId,
      device_fingerprint: deviceFp,
      user_agent: (navigator.userAgent || '').slice(0, 400),
      last_heartbeat: new Date().toISOString(),
      is_active: true
    };
    const { error } = await supabaseClient
      .from('user_sessions')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      console.warn('[session] تعذّر إنشاء الجلسة:', error.message);
      // محاولة بديلة بدون upsert
      try {
        await supabaseClient.from('user_sessions').insert(payload);
      } catch (e2) {}
    }

    // 4) بدء النبضة والفحص الدوري
    startTimers();

    // 5) الاشتراك في Realtime
    subscribe(userId);

    return currentSessionId;
  }

  /* ─────────────────────────────────────────────────────────
     stopSession(userId)
     ───────────────────────────────────────────────────────── */
  async function stopSession(userId) {
    const uid = userId || currentUserId;
    stopTimers();
    unsubscribe();
    running = false;

    if (uid) {
      try {
        // تعطيل الصف ثم حذفه
        await supabaseClient.from('user_sessions')
          .update({ is_active: false }).eq('user_id', uid).eq('session_id', currentSessionId);
        await supabaseClient.from('user_sessions').delete().eq('user_id', uid);
      } catch (e) { /* تجاهل */ }
    }

    currentSessionId = null;
    currentUserId = null;
    storeDel(STORAGE_KEYS.sessionId);
  }

  /* ─────────────────────────────────────────────────────────
     أحداث المتصفح
     ───────────────────────────────────────────────────────── */
  window.addEventListener('beforeunload', function () {
    // نبضة أخيرة سريعة (best-effort)
    if (running && currentUserId && currentSessionId && navigator.sendBeacon) {
      try { heartbeat(); } catch (e) {}
    }
  });

  // عند العودة للتبويب نفحص فورًا
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && running) checkIntegrity();
  });

  /* ─────────────────────────────────────────────────────────
     واجهة عامة
     ───────────────────────────────────────────────────────── */
  return {
    startSession: startSession,
    stopSession: stopSession,
    getCurrentSessionId: getCurrentSessionId,
    checkIntegrity: checkIntegrity,
    kickOut: kickOut,
    heartbeat: heartbeat,
    isRunning: function () { return running; },
    isKicked: function () { return kicked; },
    getUserId: function () { return currentUserId; },
    getFingerprint: function () { return deviceFp; }
  };
})();

/* ─────── اختصارات عامة للاستخدام من بقية الملفات ─────── */
function startSession(userId) { return SessionManager.startSession(userId); }
function stopSession(userId) { return SessionManager.stopSession(userId); }
function checkSessionIntegrity() { return SessionManager.checkIntegrity(); }
function getCurrentSessionId() { return SessionManager.getCurrentSessionId(); }
