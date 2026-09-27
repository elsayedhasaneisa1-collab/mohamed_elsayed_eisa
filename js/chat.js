/* ═══════════════════════════════════════════════════════════════
   js/chat.js — الشات المباشر بين الطالب والأستاذ
   • الطالب: عرض رسائله + إرسال (مع Rate Limit: 5 رسائل / 10 ثواني)
   • الأستاذ: قائمة محادثات + بحث + رد
   • Realtime على جدول chat_messages
   ═══════════════════════════════════════════════════════════════ */

const Chat = (function () {

  let channel = null;          // قناة Realtime
  let messages = [];           // رسائل المحادثة المعروضة
  let threads = [];            // (للأدمن) قائمة المحادثات
  let studentsMap = {};        // (للأدمن) خريطة id -> بيانات الطالب
  let activeThreadId = null;   // (للأدمن) الطالب المحدد
  let initialized = false;
  let lastDay = '';

  /* ─────────────────────────────────────────────────────────
     التهيئة
     ───────────────────────────────────────────────────────── */
  async function init() {
    if (!APP.user) { initialized = false; return; }
    initialized = true;

    if (APP.isAdmin) {
      await loadThreads();
    } else {
      activeThreadId = APP.user.id;
      await loadMessages(APP.user.id);
    }
    subscribe();
    refreshUnread();
  }

  /* ─────────────────────────────────────────────────────────
     تحميل رسائل طالب معيّن
     ───────────────────────────────────────────────────────── */
  async function loadMessages(studentId) {
    const stream = document.getElementById('chatStream');
    const empty = document.getElementById('chatEmpty');
    if (!studentId) return;

    activeThreadId = studentId;
    if (stream) stream.innerHTML = '<div class="loader"><span></span><span></span><span></span></div>';

    try {
      const { data, error } = await supabaseClient
        .from('chat_messages')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      messages = data || [];
      render();
      // تعليم رسائل الطالب كمقروءة (للأدمن)
      if (APP.isAdmin) markRead(studentId);
    } catch (err) {
      if (stream) stream.innerHTML = '';
      if (empty) { empty.hidden = false; empty.querySelector('h4').textContent = 'تعذّر تحميل المحادثة'; empty.querySelector('p').textContent = translateError(err); }
      showToast(translateError(err), 'error');
    }
  }

  /* ─────────────────────────────────────────────────────────
     رسم الرسائل
     ───────────────────────────────────────────────────────── */
  function render() {
    const stream = document.getElementById('chatStream');
    const empty = document.getElementById('chatEmpty');
    if (!stream) return;

    if (!messages.length) {
      stream.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    lastDay = '';
    stream.innerHTML = messages.map(function (m) { return renderMessage(m); }).join('');
    scrollToBottom(false);
  }

  /** رسم رسالة واحدة — رسائل الأدمن/الأستاذ بلون ذهبي */
  function renderMessage(m) {
    const isAdminMsg = m.sender_role === 'admin';
    const mineForStudent = !APP.isAdmin && !isAdminMsg;   // الطالب يرى رسائله على اليمين
    const mineForAdmin = APP.isAdmin && isAdminMsg;      // الأدمن يرى ردوده على اليسار

    // فاصل اليوم
    let daySep = '';
    const day = new Date(m.created_at).toDateString();
    if (day !== lastDay) {
      lastDay = day;
      daySep = '<div class="msg__day">' + formatDate(m.created_at) + '</div>';
    }

    const who = isAdminMsg
      ? '<span class="msg__who"><i class="fa-solid fa-headset"></i> ' + escapeHtml(CONFIG.TEACHER.name) + '</span>'
      : (APP.isAdmin && m.student_id
          ? '<span class="msg__who"><i class="fa-regular fa-user"></i> ' + escapeHtml(threadName(m.student_id)) + '</span>'
          : '');

    // للأدمن: رسالته هو تظهر بلون ذهبي، ورسائل الطالب تظهر محايدة
    const cls = APP.isAdmin
      ? (isAdminMsg ? 'msg msg--admin' : 'msg msg--me')
      : (isAdminMsg ? 'msg msg--admin' : 'msg msg--me');

    return daySep +
      '<div class="' + cls + '" data-msg-id="' + escapeHtml(m.id) + '">' +
        who +
        '<span class="msg__text">' + escapeHtml(m.message || '') + '</span>' +
        '<span class="msg__time">' + formatTime(m.created_at) + '</span>' +
      '</div>';
  }

  function scrollToBottom(smooth) {
    const stream = document.getElementById('chatStream');
    if (!stream) return;
    stream.scrollTo({ top: stream.scrollHeight, behavior: smooth === false ? 'auto' : 'smooth' });
  }

  /* ─────────────────────────────────────────────────────────
     إرسال رسالة
     ───────────────────────────────────────────────────────── */
  async function send(e) {
    if (e) e.preventDefault();

    if (!APP.user) {
      showToast('سجّل الدخول أولًا للتواصل مع الأستاذ', 'warn');
      setTimeout(function () { goTo(CONFIG.PAGES.login); }, 1000);
      return false;
    }

    const input = document.getElementById('chatInput');
    const btn = document.getElementById('chatSendBtn');
    const text = (input ? input.value : '').trim();
    if (!text) { showToast('اكتب رسالتك أولًا', 'warn', 2200); if (input) input.focus(); return false; }
    if (text.length > 800) { showToast('الرسالة طويلة جدًا (الحد ٨٠٠ حرف)', 'warn'); return false; }

    /* Rate Limiting: 5 رسائل / 10 ثواني */
    const chk = chatRateLimiter.check();
    if (!chk.allowed) {
      showToast(rateLimitMessage(chk), 'warn', 5000);
      if (btn) btn.disabled = true;
      setTimeout(function () { if (btn) btn.disabled = false; }, Math.min(chk.retryAfter * 1000, 10000));
      return false;
    }
    chatRateLimiter.record();
    const left = chatRateLimiter.check();
    updateChatHint(left.remaining);

    // للأدمن يجب تحديد محادثة
    const targetStudent = APP.isAdmin ? activeThreadId : APP.user.id;
    if (!targetStudent) {
      showToast('اختر محادثة طالب أولًا من قائمة المحادثات', 'warn');
      toggleThreads(true);
      return false;
    }

    if (btn) btn.disabled = true;
    if (input) input.value = '';

    // عرض فوري (متفائل)
    const temp = {
      id: 'tmp_' + randomToken(8),
      student_id: targetStudent,
      sender_role: APP.isAdmin ? 'admin' : 'student',
      message: text,
      created_at: new Date().toISOString(),
      _pending: true
    };
    messages.push(temp);
    appendSingle(temp, true);

    try {
      const { data, error } = await supabaseClient.from('chat_messages').insert({
        student_id: targetStudent,
        sender_role: APP.isAdmin ? 'admin' : 'student',
        message: text,
        is_read: APP.isAdmin ? true : false,
        created_at: new Date().toISOString()
      }).select().maybeSingle();

      if (error) throw error;

      // استبدال الرسالة المؤقتة بالحقيقية
      const i = messages.findIndex(function (m) { return m.id === temp.id; });
      if (i !== -1 && data) messages[i] = data;
      const node = document.querySelector('[data-msg-id="' + temp.id + '"]');
      if (node && data) {
        node.classList.remove('msg--pending');
        node.setAttribute('data-msg-id', data.id);
      }
      if (APP.isAdmin) loadThreads(true);
      return true;
    } catch (err) {
      const i = messages.findIndex(function (m) { return m.id === temp.id; });
      if (i !== -1) messages.splice(i, 1);
      const node = document.querySelector('[data-msg-id="' + temp.id + '"]');
      if (node && node.parentNode) node.parentNode.removeChild(node);
      if (input) input.value = text;
      showToast(translateError(err), 'error', 5000);
      chatRateLimiter.reset();
      return false;
    } finally {
      if (btn) btn.disabled = false;
      if (input) input.focus();
    }
  }

  function appendSingle(m, pending) {
    const stream = document.getElementById('chatStream');
    const empty = document.getElementById('chatEmpty');
    if (!stream) return;
    if (empty) empty.hidden = true;
    const wrap = document.createElement('div');
    wrap.innerHTML = renderMessage(m);
    while (wrap.firstChild) {
      const el = wrap.firstChild;
      if (pending && el.classList && el.classList.contains('msg')) el.classList.add('msg--pending');
      stream.appendChild(el);
    }
    scrollToBottom(true);
  }

  function updateChatHint(remaining) {
    const hint = document.getElementById('chatHint');
    if (!hint) return;
    hint.textContent = remaining >= 5
      ? 'يمكنك إرسال ٥ رسائل كل ١٠ ثوانٍ.'
      : 'متبقٍ لك ' + remaining + ' رسالة قبل الانتظار قليلًا.';
    hint.style.color = remaining === 0 ? 'var(--warn)' : '';
  }

  /* ─────────────────────────────────────────────────────────
     Realtime
     ───────────────────────────────────────────────────────── */
  function subscribe() {
    unsubscribe();
    if (!APP.user) return;
    try {
      channel = supabaseClient.channel('chat_' + APP.user.id);
      const conf = { event: '*', schema: 'public', table: 'chat_messages' };
      if (!APP.isAdmin) conf.filter = 'student_id=eq.' + APP.user.id;

      channel.on('postgres_changes', conf, function (payload) {
        const row = payload.new;
        if (!row || !row.id) { if (APP.isAdmin) loadThreads(true); return; }

        if (payload.eventType === 'DELETE') {
          messages = messages.filter(function (m) { return m.id !== row.id; });
          render();
          if (APP.isAdmin) loadThreads(true);
          return;
        }

        // للطلاب: تجاهل أي صف لا يخصّهم
        if (!APP.isAdmin && row.student_id !== APP.user.id) return;
        // للأدمن: لو المحادثة المفتوحة مختلفة → حدّث القائمة فقط
        if (APP.isAdmin && activeThreadId && row.student_id !== activeThreadId) {
          loadThreads(true);
          notifyNew(row);
          return;
        }

        const exists = messages.some(function (m) { return m.id === row.id; });
        if (!exists) {
          messages.push(row);
          appendSingle(row, false);
          notifyNew(row);
          if (APP.isAdmin) { loadThreads(true); markRead(row.student_id); }
        }
      }).subscribe();
    } catch (e) {
      console.warn('[chat] realtime غير متاح:', e);
    }
  }

  function unsubscribe() {
    if (channel) { try { supabaseClient.removeChannel(channel); } catch (e) {} channel = null; }
  }

  /** إشعار بوصول رسالة جديدة */
  function notifyNew(row) {
    const modal = document.getElementById('chatModal');
    const isOpen = modal && !modal.hidden;
    const fromAdmin = row.sender_role === 'admin';

    if (!APP.isAdmin && fromAdmin) {
      APP.chatUnread = isOpen ? 0 : (APP.chatUnread + 1);
      showToast('رد جديد من ' + CONFIG.TEACHER.name, 'gold', 4000);
      refreshUnread();
    } else if (APP.isAdmin && !fromAdmin) {
      if (!isOpen) { APP.chatUnread++; refreshUnread(); }
      showToast('رسالة جديدة من ' + threadName(row.student_id), 'info', 3500);
    }
  }

  function refreshUnread() {
    ['chatDot', 'bbChat'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.hidden = APP.chatUnread <= 0;
    });
  }

  /* ─────────────────────────────────────────────────────────
     قائمة المحادثات (للأستاذ/الأدمن)
     ───────────────────────────────────────────────────────── */
  async function loadThreads(silent) {
    if (!APP.isAdmin) return;
    const list = document.getElementById('chatThreadsList');
    if (!silent && list) list.innerHTML = '<div class="loader"><span></span><span></span><span></span></div>';

    try {
      const [msgsRes, studentsRes] = await Promise.all([
        supabaseClient.from('chat_messages').select('id,student_id,sender_role,message,created_at,is_read').order('created_at', { ascending: false }).limit(600),
        supabaseClient.from('students').select('id,full_name,phone,grade,email').order('full_name', { ascending: true })
      ]);
      if (msgsRes.error) throw msgsRes.error;

      (studentsRes.data || []).forEach(function (s) { studentsMap[s.id] = s; });

      const grouped = {};
      (msgsRes.data || []).forEach(function (m) {
        if (!grouped[m.student_id]) {
          grouped[m.student_id] = { student_id: m.student_id, last: m, count: 0, unread: 0 };
        }
        grouped[m.student_id].count++;
        if (m.sender_role === 'student' && !m.is_read) grouped[m.student_id].unread++;
      });

      threads = Object.values(grouped).sort(function (a, b) {
        return new Date(b.last.created_at) - new Date(a.last.created_at);
      });

      renderThreads(threads);

      // تحديث شارة unread العامة
      APP.chatUnread = threads.reduce(function (s, t) { return s + t.unread; }, 0);
      refreshUnread();

      // لو لم تُحدَّد محادثة بعد، افتح الأولى
      if (!activeThreadId && threads.length) {
        selectThread(threads[0].student_id, true);
      } else if (activeThreadId) {
        const head = document.getElementById('chatStatusText');
        if (head) head.innerHTML = '<i class="pulse-dot pulse-dot--gold"></i> المحادثة الحالية: ' + escapeHtml(threadName(activeThreadId));
      }
    } catch (err) {
      if (list) list.innerHTML = '<div class="empty-state empty-state--sm"><i class="fa-solid fa-plug-circle-exclamation"></i><h4>تعذّر تحميل المحادثات</h4><p>' + escapeHtml(translateError(err)) + '</p></div>';
    }
  }

  function renderThreads(listToRender) {
    const box = document.getElementById('chatThreadsList');
    if (!box) return;
    if (!listToRender.length) {
      box.innerHTML = '<div class="empty-state empty-state--sm"><i class="fa-regular fa-comments"></i><h4>لا توجد محادثات بعد</h4><p>ستظهر هنا رسائل الطلاب فور وصولها.</p></div>';
      return;
    }
    box.innerHTML = listToRender.map(function (t) {
      const s = studentsMap[t.student_id] || {};
      const name = s.full_name || threadName(t.student_id);
      return '' +
        '<button type="button" class="thread' + (t.student_id === activeThreadId ? ' is-active' : '') + '" onclick="selectChatThread(\'' + t.student_id + '\')">' +
          '<span class="thread__av">' + escapeHtml(initialOf(name)) + '</span>' +
          '<span class="thread__main">' +
            '<h6>' + escapeHtml(name) + '</h6>' +
            '<p>' + escapeHtml(truncate(t.last.message || '', 46)) + '</p>' +
          '</span>' +
          '<span class="thread__meta">' +
            '<time>' + timeAgo(t.last.created_at) + '</time>' +
            (t.unread ? '<span class="thread__unread">' + t.unread + '</span>' : '') +
          '</span>' +
        '</button>';
    }).join('');
  }

  function threadName(studentId) {
    const s = studentsMap[studentId];
    if (s && s.full_name) return s.full_name;
    return 'طالب ' + String(studentId || '').slice(0, 6).toUpperCase();
  }

  function selectThread(studentId, keepOpen) {
    if (!studentId) return;
    activeThreadId = studentId;
    renderThreads(threads);
    loadMessages(studentId);
    const head = document.getElementById('chatStatusText');
    if (head) head.innerHTML = '<i class="pulse-dot pulse-dot--gold"></i> المحادثة الحالية: ' + escapeHtml(threadName(studentId));
    const title = document.getElementById('chatModalTitle');
    if (title) title.textContent = 'رد على: ' + threadName(studentId);
    if (!keepOpen) toggleThreads(false);
    const input = document.getElementById('chatInput');
    if (input) input.focus();
  }

  async function markRead(studentId) {
    try {
      await supabaseClient.from('chat_messages')
        .update({ is_read: true })
        .eq('student_id', studentId)
        .eq('sender_role', 'student')
        .eq('is_read', false);
    } catch (e) {}
  }

  function toggleThreads(force) {
    const box = document.getElementById('chatThreads');
    if (!box) return;
    const show = typeof force === 'boolean' ? force : box.hidden;
    box.hidden = !show;
    if (show) loadThreads();
  }

  function filterThreads(q) {
    const term = String(q || '').trim().toLowerCase();
    if (!term) { renderThreads(threads); return; }
    renderThreads(threads.filter(function (t) {
      const s = studentsMap[t.student_id] || {};
      return String(s.full_name || '').toLowerCase().indexOf(term) !== -1 ||
             String(s.phone || '').indexOf(term) !== -1 ||
             String(s.email || '').toLowerCase().indexOf(term) !== -1;
    }));
  }

  /* ─────────────────────────────────────────────────────────
     فتح النافذة
     ───────────────────────────────────────────────────────── */
  async function openModalChat() {
    if (!APP.user) {
      showToast('سجّل الدخول لفتح الشات', 'warn', 3000);
      setTimeout(function () { goTo(CONFIG.PAGES.login); }, 900);
      return;
    }
    openModal('chatModal');
    APP.chatUnread = 0;
    refreshUnread();

    if (!initialized) await init();
    else if (APP.isAdmin) await loadThreads(true);

    const box = document.getElementById('chatThreads');
    if (box) box.hidden = !APP.isAdmin;

    scrollToBottom(false);
    setTimeout(function () {
      const input = document.getElementById('chatInput');
      if (input) input.focus();
    }, 260);
  }

  function insertQuick(text) {
    const input = document.getElementById('chatInput');
    if (!input) return;
    input.value = text + input.value;
    input.focus();
  }

  return {
    init: init,
    open: openModalChat,
    send: send,
    loadThreads: loadThreads,
    selectThread: selectThread,
    toggleThreads: toggleThreads,
    filterThreads: filterThreads,
    unsubscribe: unsubscribe,
    getMessages: function () { return messages; },
    getActiveThread: function () { return activeThreadId; }
  };
})();

/* ─────── دوال عامة تُستدعى من HTML ─────── */
function initChat() { return Chat.init(); }
function openChatModal() { return Chat.open(); }
function sendChatMessage(e) { return Chat.send(e); }
function toggleChatThreads() { return Chat.toggleThreads(); }
function selectChatThread(id) { return Chat.selectThread(id); }
function filterChatThreads(q) { return Chat.filterThreads(q); }
function stopChatRealtime() { return Chat.unsubscribe(); }
function insertQuickText(t) { return Chat.insertQuick(t); }
