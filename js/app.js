/* ═══════════════════════════════════════════════════════════════
   js/app.js — نقطة التشغيل العامة للصفحة الرئيسية
   • IntersectionObserver لكشف العناصر (reveal)
   • onAuthStateChange لمراقبة حالة تسجيل الدخول
   • حماية contextmenu على IMG / VIDEO
   • init(): جلب الكورسات والإعلانات + فحص الجلسة
   ═══════════════════════════════════════════════════════════════ */

let revealObserver = null;

/* ─────────────────────────────────────────────────────────────
   IntersectionObserver — ظهور العناصر عند التمرير
   ───────────────────────────────────────────────────────────── */
function observeReveals() {
  const els = document.querySelectorAll('.reveal:not(.is-visible)');
  if (!els.length) return;

  if (!('IntersectionObserver' in window)) {
    els.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  }
  els.forEach(function (el) { revealObserver.observe(el); });
}

/* ─────────────────────────────────────────────────────────────
   شريط التنقل: التمرير + القائمة + مؤشر التقدم
   ───────────────────────────────────────────────────────────── */
function initNavbar() {
  const nav = document.getElementById('navbar');
  const bar = document.getElementById('scrollProgress');
  const burger = document.getElementById('navBurger');

  if (burger && nav) {
    burger.addEventListener('click', function () {
      const open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  const onScroll = throttle(function () {
    if (!nav) return;
    const y = window.pageYOffset;
    nav.classList.toggle('is-scrolled', y > 24);

    if (bar) {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + '%';
    }

    // تمييز القسم النشط في القائمة
    const links = document.querySelectorAll('.nav-links__a');
    let currentId = '';
    links.forEach(function (a) {
      const id = (a.getAttribute('href') || '').replace('#', '');
      const sec = document.getElementById(id);
      if (sec && sec.getBoundingClientRect().top <= 140) currentId = id;
    });
    links.forEach(function (a) {
      a.classList.toggle('is-active', (a.getAttribute('href') || '').replace('#', '') === currentId);
    });
  }, 120);

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // روابط التمرير الناعم
  document.addEventListener('click', function (e) {
    const a = e.target.closest('[data-scroll], .nav-links__a[href^="#"], .brand[href^="#"], .footer__nav a[href^="#"]');
    if (!a) return;
    const href = a.getAttribute('href') || a.dataset.target || '';
    if (!href || href.charAt(0) !== '#') return;
    e.preventDefault();
    scrollToSection(href);
  });
}

/* ─────────────────────────────────────────────────────────────
   Modals — إغلاق بالنقر على الخلفية / أزرار الإغلاق / Esc
   ───────────────────────────────────────────────────────────── */
function initModals() {
  document.addEventListener('click', function (e) {
    const closer = e.target.closest('[data-close-modal]');
    if (!closer) return;
    const id = closer.getAttribute('data-close-modal');
    // المشغل يحتاج تنظيفًا خاصًا
    if (id === 'playerModal' && typeof closePlayer === 'function') closePlayer();
    else closeModal(id);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    const open = document.querySelectorAll('.modal:not([hidden])');
    if (!open.length) return;
    const top = open[open.length - 1];
    if (top.id === 'kickedModal') return; // لا يُغلق
    if (top.id === 'playerModal' && typeof closePlayer === 'function') closePlayer();
    else closeModal(top.id);
  });
}

/* ─────────────────────────────────────────────────────────────
   ربط أزرار الشات
   ───────────────────────────────────────────────────────────── */
function initChatButtons() {
  ['btnOpenChatTop', 'btnOpenChatAbout', 'btnOpenChatSupport'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', function (e) { e.preventDefault(); openChatModal(); });
  });

  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', function () {
    if (window.confirm('تأكيد تسجيل الخروج من المنصة؟')) logout();
  });

  // زر التشغيل في بطاقة الـ Hero
  const heroPlay = document.getElementById('heroPlayBtn');
  if (heroPlay) {
    heroPlay.addEventListener('click', function () {
      const first = (APP.courses || []).find(function (c) { return c.is_free === true; }) || (APP.courses || [])[0];
      if (!first) { showToast('لا توجد دروس معروضة حاليًا — تصفّح الكورسات أولًا', 'info'); scrollToSection('#courses'); return; }
      viewCourseLessons(first.id);
    });
  }
}

/* ─────────────────────────────────────────────────────────────
   حماية الصور والفيديو من القائمة اليمنى
   ───────────────────────────────────────────────────────────── */
function initMediaProtection() {
  if (typeof applyProtection === 'function') applyProtection(document);

  // حماية إضافية على IMG / VIDEO
  document.addEventListener('contextmenu', function (e) {
    const tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'IMG' || tag === 'VIDEO') {
      e.preventDefault();
      showToast('حفظ الصور والفيديوهات غير مسموح — المحتوى محمي', 'warn', 2400);
      return false;
    }
    return true;
  });

  document.addEventListener('dragstart', function (e) {
    const tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'IMG' || tag === 'VIDEO') { e.preventDefault(); return false; }
    return true;
  });

  // تشديد الحماية على منطقة المشغل
  if (typeof Player !== 'undefined' && Player.harden) Player.harden();
}

/* ─────────────────────────────────────────────────────────────
   مراقبة تغيّر حالة المصادقة
   ───────────────────────────────────────────────────────────── */
function initAuthListener() {
  supabaseClient.auth.onAuthStateChange(async function (event, session) {
    const user = session && session.user;

    if (event === 'SIGNED_OUT' || !user) {
      APP.user = null;
      APP.isAdmin = false;
      APP.profile = null;
      APP.myEnrollments = [];
      if (typeof stopChatRealtime === 'function') stopChatRealtime();
      onLogoutUI();
      return;
    }

    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      const sameUser = APP.user && APP.user.id === user.id;
      APP.user = user;
      if (!sameUser) {
        await startSession(user.id);
        await onLogin(false);
      }
    }

    if (event === 'INITIAL_SESSION' && user && !APP.user) {
      APP.user = user;
      await onLogin(false);
    }
  });
}

/* ─────────────────────────────────────────────────────────────
   تسجيل Service Worker (PWA)
   ───────────────────────────────────────────────────────────── */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  window.addEventListener('load', function () {
    const swUrl = basePath() + 'sw.js';
    navigator.serviceWorker.register(swUrl, { scope: basePath() })
      .then(function (reg) {
        console.info('[PWA] تم تسجيل Service Worker بنطاق:', reg.scope);
      })
      .catch(function (err) {
        console.warn('[PWA] تعذّر تسجيل Service Worker:', err);
      });
  });
}

/* ─────────────────────────────────────────────────────────────
   لمسات واجهة صغيرة
   ───────────────────────────────────────────────────────────── */
function initUIBits() {
  const year = document.getElementById('yearNow');
  if (year) year.textContent = String(new Date().getFullYear());

  // بناء شرائح الصفوف
  if (typeof buildGradeChips === 'function') buildGradeChips();

  // استرجاع آخر تبويب (بدون تمرير تلقائي للصفحة)
  const last = storeGet(STORAGE_KEYS.lastTab, null);
  if (last && last !== 'allCourses') {
    setTimeout(function () {
      const btn = document.querySelector('.tabs__btn[data-tab="' + last + '"]');
      if (btn && APP.user) switchTab(last, btn, true);
    }, 700);
  }

  // اختصارات التطبيق (PWA shortcuts) + الروابط العميقة
  try {
    const params = new URLSearchParams(window.location.search);
    const openWhat = params.get('open');
    const tabParam = params.get('tab');
    const gradeParam = params.get('grade');

    if (tabParam) {
      setTimeout(function () {
        const b = document.querySelector('.tabs__btn[data-tab="' + tabParam + '"]');
        if (b) switchTab(tabParam, b, true);
      }, 900);
    }
    if (gradeParam) {
      setTimeout(function () {
        const c = document.querySelector('#gradeChips .chip[data-grade="' + gradeParam + '"]');
        filterByGrade(gradeParam, c);
      }, 950);
    }
    if (openWhat === 'chat') {
      setTimeout(function () { openChatModal(); }, 1100);
    }
    if (window.location.hash) {
      setTimeout(function () { scrollToSection(window.location.hash); }, 420);
    }
  } catch (e) { /* المتصفح لا يدعم URLSearchParams */ }

  // تحميل الدروس المنتهية
  if (typeof Player !== 'undefined' && Player.loadDone) Player.loadDone();
}

/* ─────────────────────────────────────────────────────────────
   init() — التشغيل الرئيسي
   ───────────────────────────────────────────────────────────── */
async function init() {
  initNavbar();
  initModals();
  initChatButtons();
  initMediaProtection();
  initUIBits();
  initAuthListener();
  registerServiceWorker();

  // الحماية الشاملة (اختصارات + لقطة شاشة + أدوات مطور)
  if (typeof initProtection === 'function') initProtection();

  // كشف العناصر
  observeReveals();

  // 1) فحص الجلسة وتسجيل الدخول
  await checkSession();

  // 2) جلب الكورسات والإعلانات
  await Promise.all([
    loadCourses(),
    loadAnnouncements(),
    loadHeroStats()
  ]);

  // 3) المهام (امتحانات + واجبات)
  if (typeof loadStudentTasks === 'function') await loadStudentTasks();

  // 4) رسم الملف الشخصي إن كان التبويب مفتوحًا
  if (typeof renderProfile === 'function') renderProfile();

  // إعادة كشف العناصر المرسومة ديناميكيًا
  observeReveals();

  console.info('%c منصة ' + CONFIG.TEACHER.name + ' التعليمية ', 'background:#e6b800;color:#0a0a0a;font-weight:900;padding:4px 10px;border-radius:6px');
  console.info('%c المحتوى محمي بنظام الجلسة الواحدة والعلامة المائية. ', 'color:#e6b800');
}

/* ─────────────────────────────────────────────────────────────
   التشغيل عند اكتمال DOM
   ───────────────────────────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { init(); });
} else {
  init();
}
