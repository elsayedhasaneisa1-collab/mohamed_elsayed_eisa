/* ═══════════════════════════════════════════════════════════════
   js/auth.js — تسجيل الدخول / إنشاء الحساب / الخروج / حالة الجلسة
   الدوال: handleAuth · handleRegister · logout · checkSession · onLogin · onLogoutUI
   ═══════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────
   handleAuth(e) — تسجيل الدخول من login.html
   ───────────────────────────────────────────────────────────── */
async function handleAuth(e) {
  if (e) e.preventDefault();

  const emailEl = document.getElementById('loginEmail');
  const passEl = document.getElementById('loginPassword');
  const form = document.getElementById('loginForm');
  const btn = document.getElementById('loginSubmit');
  const rateBox = document.getElementById('loginRateAlert');

  const email = (emailEl ? emailEl.value : '').trim().toLowerCase();
  const password = passEl ? passEl.value : '';

  /* 1) Rate Limiting — 5 محاولات كل 15 دقيقة */
  const pre = loginRateLimiter.check();
  if (!pre.allowed) {
    const msg = rateLimitMessage(pre);
    renderRateAlert(rateBox, msg);
    showToast(msg, 'error', 6000);
    return false;
  }
  if (rateBox) rateBox.hidden = true;

  /* 2) تحقق من المدخلات */
  let valid = true;
  if (emailEl && !isValidEmail(email)) { setFieldState(emailEl, false, 'أدخل بريدًا إلكترونيًا صحيحًا'); valid = false; }
  else if (emailEl) setFieldState(emailEl, true);
  if (passEl && !password) { setFieldState(passEl, false, 'أدخل كلمة المرور'); valid = false; }
  else if (passEl) setFieldState(passEl, true);
  if (!valid) return false;

  /* 3) حالة التحميل */
  if (btn) { btn.disabled = true; btn.dataset.label = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جارِ التحقق…'; }

  try {
    /* 4) تسجيل الدخول */
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email: email, password: password });

    if (error) {
      loginRateLimiter.record();
      const left = loginRateLimiter.check();
      const ar = translateError(error);
      if (passEl) { setFieldState(passEl, false, ar); passEl.value = ''; passEl.focus(); }
      showToast(ar, 'error', 5200);
      if (left.remaining <= 1 && left.remaining > 0) {
        renderRateAlert(rateBox, 'تنبيه: تبقى لك محاولة واحدة قبل الإيقاف المؤقت لمدة ١٥ دقيقة.');
      }
      return false;
    }

    /* 5) نجاح → تصفير العدّاد وبدء الجلسة الواحدة */
    loginRateLimiter.reset();
    const user = data && data.user;
    APP.user = user;

    await startSession(user.id);
    showToast('أهلًا بعودتك 👋 تم تسجيل الدخول بنجاح', 'success');

    /* 6) التوجيه بعد النجاح */
    await onLogin(true);

    // لو المستخدم أدمن → لوحة التحكم، وإلا → الرئيسية
    if (APP.isAdmin) {
      goTo(CONFIG.PAGES.admin);
    } else {
      if (currentPage() !== 'index.html') goTo(CONFIG.PAGES.home);
      else scrollToSection('#courses');
    }
    return true;
  } catch (err) {
    showToast('تعذّر الاتصال بالخادم، تحقق من الإنترنت وحاول مجددًا', 'error');
    return false;
  } finally {
    if (btn) { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
    if (form) form.classList.remove('is-loading');
  }
}

/** رسم تنبيه حدّ المحاولات داخل صفحة الدخول */
function renderRateAlert(box, message) {
  if (!box) return;
  box.hidden = false;
  box.innerHTML = '<i class="fa-solid fa-shield-halved"></i><div><strong>تم إيقاف المحاولات مؤقتًا</strong><br>' +
    escapeHtml(message) + '</div>';
}

/* ─────────────────────────────────────────────────────────────
   handleRegister(e) — إنشاء حساب من register.html
   ───────────────────────────────────────────────────────────── */
async function handleRegister(e) {
  if (e) e.preventDefault();

  const btn = document.getElementById('registerSubmit');
  const rateBox = document.getElementById('registerRateAlert');

  /* 1) Rate Limiting للتسجيل */
  const pre = registerRateLimiter.check();
  if (!pre.allowed) {
    renderRateAlert(rateBox, rateLimitMessage(pre));
    showToast(rateLimitMessage(pre), 'error', 6000);
    return false;
  }

  /* 2) جمع الحقول */
  const g = function (id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const fullName = g('regName');
  const genderEl = document.querySelector('input[name="regGender"]:checked');
  const gender = genderEl ? genderEl.value : '';
  const email = g('regEmail').toLowerCase();
  const phone = g('regPhone').replace(/[\s-]/g, '');
  const parentPhone = g('regParentPhone').replace(/[\s-]/g, '');
  const grade = g('regGrade');
  const password = g('regPassword');
  const confirm = g('regPassword2');
  const termsEl = document.getElementById('regTerms');
  const termsRow = termsEl ? termsEl.closest('.check-row') : null;

  /* 3) التحقق من كل حقل */
  let ok = true;
  const mark = function (id, valid, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    setFieldState(el, valid, msg);
    if (!valid) ok = false;
  };

  if (fullName.length < 3) mark('regName', false, 'اكتب الاسم كاملًا (٣ أحرف على الأقل)'); else mark('regName', true);
  if (!gender) {
    ok = false;
    const rc = document.querySelector('.radio-cards');
    if (rc) { rc.classList.add('is-invalid'); showToast('اختر النوع (طالب / طالبة)', 'warn'); }
  }
  if (!isValidEmail(email)) mark('regEmail', false, 'صيغة البريد الإلكتروني غير صحيحة'); else mark('regEmail', true);
  if (!isValidPhone(phone)) mark('regPhone', false, 'رقم الهاتف يجب أن يكون ١١ رقمًا ويبدأ بـ 01'); else mark('regPhone', true);
  if (parentPhone && !isValidPhone(parentPhone)) mark('regParentPhone', false, 'رقم ولي الأمر يجب أن يكون ١١ رقمًا ويبدأ بـ 01'); else mark('regParentPhone', true);
  if (!grade) mark('regGrade', false, 'اختر الصف الدراسي'); else mark('regGrade', true);
  if (password.length < 6) mark('regPassword', false, 'كلمة المرور يجب ألا تقل عن ٦ أحرف'); else mark('regPassword', true);
  if (password !== confirm) mark('regPassword2', false, 'كلمتا المرور غير متطابقتين'); else mark('regPassword2', true);

  if (termsEl && !termsEl.checked) {
    ok = false;
    if (termsRow) termsRow.classList.add('is-invalid');
    showToast('يجب الموافقة على الشروط والأحكام', 'warn');
  } else if (termsRow) termsRow.classList.remove('is-invalid');

  if (!ok) {
    showToast('راجع الحقول المميزة باللون الأحمر', 'error', 4200);
    const firstErr = document.querySelector('.field.is-invalid input,.field.is-invalid select');
    if (firstErr) firstErr.focus();
    return false;
  }

  /* 4) حالة التحميل */
  registerRateLimiter.record();
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جارِ إنشاء الحساب…'; }

  try {
    /* 5) signUp في Supabase Auth */
    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: fullName,
          gender: gender,
          phone: phone,
          parent_phone: parentPhone,
          grade: grade
        }
      }
    });

    if (error) {
      const ar = translateError(error);
      showToast(ar, 'error', 6000);
      if (String(ar).indexOf('مسجّل') !== -1) mark('regEmail', false, ar);
      return false;
    }

    /* 6) الإدراج في جدول students */
    const user = data && data.user;
    if (user) {
      const { error: insErr } = await supabaseClient.from('students').upsert({
        id: user.id,
        full_name: fullName,
        gender: gender,
        email: email,
        phone: phone,
        parent_phone: parentPhone || null,
        grade: grade,
        status: 'active',
        created_at: new Date().toISOString()
      }, { onConflict: 'id' });

      if (insErr) console.warn('[register] تعذّر حفظ بيانات الطالب:', insErr.message);
    }

    registerRateLimiter.reset();

    /* 7) عرض لوحة النجاح */
    const needsConfirm = data && data.user && !data.session;
    const panel = document.getElementById('registerPanel');
    const success = document.getElementById('registerSuccess');
    if (panel) panel.hidden = true;
    if (success) {
      success.hidden = false;
      const t = document.getElementById('successTitle');
      const b = document.getElementById('successBody');
      if (needsConfirm) {
        if (t) t.textContent = 'تم إنشاء الحساب — فعّل بريدك';
        if (b) b.innerHTML = 'أرسلنا رابط تفعيل إلى <b class="gold" dir="ltr">' + escapeHtml(email) +
          '</b>. اضغط الرابط ثم سجّل الدخول.<br>لو لم يصلك البريد تواصل مع الدعم الفني.';
      } else {
        if (t) t.textContent = 'أهلًا بك في المنصة 🎉';
        if (b) b.innerHTML = 'تم إنشاء حسابك بنجاح يا <b class="gold">' + escapeHtml(fullName) +
          '</b>. يمكنك الآن تسجيل الدخول والاشتراك في الكورسات.';
      }
      success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    showToast('تم إنشاء الحساب بنجاح', 'success', 5000);
    return true;
  } catch (err) {
    showToast('تعذّر الاتصال بالخادم، تحقق من الإنترنت', 'error');
    return false;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> إنشاء الحساب'; }
  }
}

/* ─────────────────────────────────────────────────────────────
   logout() — تسجيل الخروج
   ───────────────────────────────────────────────────────────── */
async function logout(redirect) {
  const uid = APP.user ? APP.user.id : null;
  try {
    // 1) إيقاف الجلسة الواحدة
    await stopSession(uid);
    // 2) إيقاف اشتراك الشات
    if (typeof stopChatRealtime === 'function') stopChatRealtime();
    // 3) إيقاف المشغل
    if (typeof closePlayer === 'function') { try { closePlayer(); } catch (e) {} }
    // 4) تسجيل الخروج من Supabase
    await supabaseClient.auth.signOut({ scope: 'global' });
  } catch (e) {
    try { await supabaseClient.auth.signOut({ scope: 'local' }); } catch (e2) {}
  }

  APP.user = null;
  APP.profile = null;
  APP.isAdmin = false;
  APP.myEnrollments = [];
  onLogoutUI();
  showToast('تم تسجيل الخروج بنجاح', 'info', 3000);

  if (redirect !== false) {
    const page = currentPage();
    if (page === 'admin.html') goTo(CONFIG.PAGES.home);
    else goTo(CONFIG.PAGES.login);
  }
}

/* ─────────────────────────────────────────────────────────────
   checkSession() — فحص الجلسة عند تحميل الصفحة
   ───────────────────────────────────────────────────────────── */
async function checkSession() {
  try {
    const { data } = await supabaseClient.auth.getSession();
    const session = data && data.session;

    if (!session || !session.user) {
      APP.user = null;
      APP.isAdmin = false;
      onLogoutUI();
      return null;
    }

    APP.user = session.user;
    // بدء نظام الجلسة الواحدة
    await startSession(session.user.id);
    await onLogin(false);
    return session.user;
  } catch (e) {
    console.warn('[auth] checkSession:', e);
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────
   onLogin() — بعد نجاح الدخول: فحص الأدمن + تحديث الأزرار + توجيه
   ───────────────────────────────────────────────────────────── */
async function onLogin(isFreshLogin) {
  const user = APP.user;
  if (!user) return;

  /* 1) فحص جدول admins */
  APP.isAdmin = false;
  try {
    const { data: adminRow, error: adminErr } = await supabaseClient
      .from('admins')
      .select('id,full_name,role')
      .eq('id', user.id)
      .maybeSingle();

    if (!adminErr && adminRow && adminRow.id) {
      APP.isAdmin = true;
      APP.adminRow = adminRow;
    }
  } catch (e) { /* تجاهل */ }

  /* 2) جلب ملف الطالب من جدول students */
  APP.profile = null;
  if (!APP.isAdmin) {
    try {
      const { data: st, error: stErr } = await supabaseClient
        .from('students')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (!stErr && st) APP.profile = st;
      if (!st) {
        // إنشاء سجل تلقائي لو المستخدم مُسجَّل قديمًا بدون صف
        const meta = user.user_metadata || {};
        const { data: created } = await supabaseClient.from('students').insert({
          id: user.id,
          full_name: meta.full_name || user.email.split('@')[0],
          gender: meta.gender || 'male',
          email: user.email,
          phone: meta.phone || null,
          parent_phone: meta.parent_phone || null,
          grade: meta.grade || CONFIG.GRADES[0],
          status: 'active'
        }).select().maybeSingle();
        if (created) APP.profile = created;
      }
    } catch (e) { /* تجاهل */ }
  }

  /* 3) تحديث أزرار الواجهة */
  renderAuthUI();

  /* 4) جلب الاشتراكات */
  if (typeof loadMyEnrollments === 'function') {
    try { await loadMyEnrollments(); } catch (e) {}
  }

  /* 5) إعادة رسم الأقسام الحساسة لتسجيل الدخول */
  if (typeof renderMyCourses === 'function') { try { renderMyCourses(); } catch (e) {} }
  if (typeof renderProfile === 'function') { try { renderProfile(); } catch (e) {} }
  if (typeof loadStudentTasks === 'function') { try { loadStudentTasks(); } catch (e) {} }
  if (typeof loadCourses === 'function') { try { loadCourses(); } catch (e) {} }

  /* 6) تهيئة الشات */
  if (typeof initChat === 'function') { try { initChat(); } catch (e) {} }

  /* 7) توجيه الأدمن إلى لوحة التحكم (بعد الدخول المباشر فقط) */
  if (APP.isAdmin && isFreshLogin && currentPage() !== 'admin.html') {
    goTo(CONFIG.PAGES.admin);
  }

  return user;
}

/* ─────────────────────────────────────────────────────────────
   renderAuthUI() — تحديث عناصر شريط التنقل حسب الحالة
   ───────────────────────────────────────────────────────────── */
function renderAuthUI() {
  const guest = document.getElementById('authGuest');
  const userBox = document.getElementById('authUser');
  const adminBtn = document.getElementById('btnAdminPanel');
  const nameEl = document.getElementById('userName');
  const gradeEl = document.getElementById('userGrade');
  const avatarEl = document.getElementById('userAvatar');
  const chatThreadsBtn = document.getElementById('btnChatThreads');
  const chatTitle = document.getElementById('chatModalTitle');

  if (!APP.user) {
    if (guest) guest.hidden = false;
    if (userBox) userBox.hidden = true;
    if (adminBtn) adminBtn.hidden = true;
    if (chatThreadsBtn) chatThreadsBtn.hidden = true;
    if (chatTitle) chatTitle.textContent = 'الشات مع الأستاذ';
    return;
  }

  if (guest) guest.hidden = true;
  if (userBox) userBox.hidden = false;
  if (adminBtn) adminBtn.hidden = !APP.isAdmin;
  if (chatThreadsBtn) chatThreadsBtn.hidden = !APP.isAdmin;
  if (chatTitle) chatTitle.textContent = APP.isAdmin ? 'شات الطلاب (لوحة الأستاذ)' : 'الشات مع الأستاذ';

  const displayName = APP.isAdmin
    ? (APP.adminRow && APP.adminRow.full_name) || CONFIG.TEACHER.name
    : (APP.profile && APP.profile.full_name) || (APP.user.user_metadata && APP.user.user_metadata.full_name) || 'الطالب';

  if (nameEl) nameEl.textContent = displayName;
  if (gradeEl) gradeEl.textContent = APP.isAdmin ? 'إدارة المنصة' : ((APP.profile && APP.profile.grade) || '—');
  if (avatarEl) avatarEl.textContent = initialOf(displayName);
}

/* ─────────────────────────────────────────────────────────────
   onLogoutUI() — إعادة تعيين الواجهة بعد الخروج
   ───────────────────────────────────────────────────────────── */
function onLogoutUI() {
  APP.user = null;
  APP.profile = null;
  APP.isAdmin = false;
  APP.myEnrollments = [];
  APP.chatUnread = 0;

  renderAuthUI();

  // إخفاء شارات unread
  ['chatDot', 'bbChat', 'bbMyCourses'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });

  // تفريغ الشات
  const stream = document.getElementById('chatStream');
  if (stream) stream.innerHTML = '';
  const chatEmpty = document.getElementById('chatEmpty');
  if (chatEmpty) chatEmpty.hidden = false;

  // إعادة رسم الكورسات بدون حالة الاشتراك
  if (typeof renderMyCourses === 'function') { try { renderMyCourses(); } catch (e) {} }
  if (typeof renderCourses === 'function') { try { renderCourses(); } catch (e) {} }
  if (typeof renderProfile === 'function') { try { renderProfile(); } catch (e) {} }
  if (typeof loadStudentTasks === 'function') { try { loadStudentTasks(); } catch (e) {} }

  // لو في صفحة الأدمن → ارجع للرئيسية
  if (currentPage() === 'admin.html') goTo(CONFIG.PAGES.home);
}

/* ─────────────────────────────────────────────────────────────
   حماية صفحات الأدمن
   ───────────────────────────────────────────────────────────── */
async function requireAdmin() {
  const { data } = await supabaseClient.auth.getSession();
  const user = data && data.session && data.session.user;

  if (!user) {
    showToast('يجب تسجيل الدخول أولًا', 'warn');
    setTimeout(function () { goTo(CONFIG.PAGES.login); }, 900);
    return null;
  }

  APP.user = user;
  const { data: adminRow } = await supabaseClient
    .from('admins').select('id,full_name,role').eq('id', user.id).maybeSingle();

  if (!adminRow) {
    const guard = document.getElementById('adminGuard');
    const shell = document.getElementById('adminShell');
    if (guard) guard.hidden = false;
    if (shell) shell.hidden = true;
    showToast('هذه الصفحة مخصّصة لإدارة المنصة فقط', 'error', 5000);
    return null;
  }

  APP.isAdmin = true;
  APP.adminRow = adminRow;
  await startSession(user.id);
  renderAuthUI();

  // إظهار لوحة التحكم وإخفاء شاشة الحماية
  const guard = document.getElementById('adminGuard');
  const shell = document.getElementById('adminShell');
  if (guard) guard.hidden = true;
  if (shell) shell.hidden = false;

  return adminRow;
}

/** حماية صفحة تتطلب تسجيل دخول (طلاب) */
async function requireAuth() {
  const { data } = await supabaseClient.auth.getSession();
  const user = data && data.session && data.session.user;
  if (!user) {
    showToast('سجّل الدخول للمتابعة', 'warn', 3500);
    setTimeout(function () { goTo(CONFIG.PAGES.login); }, 1000);
    return null;
  }
  return user;
}
