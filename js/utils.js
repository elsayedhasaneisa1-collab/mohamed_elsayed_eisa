/* ═══════════════════════════════════════════════════════════════
   js/utils.js — الدوال المساعدة العامة
   Toast · تنسيق · حماية · كشف أدوات المطور · Rate Limiter
   ═══════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────
   1) Toast — إشعارات منبثقة
   ───────────────────────────────────────────────────────────── */

/** أيقونات أنواع التنبيهات */
const TOAST_ICONS = {
  success: 'fa-solid fa-circle-check',
  error: 'fa-solid fa-circle-xmark',
  warn: 'fa-solid fa-triangle-exclamation',
  info: 'fa-solid fa-circle-info',
  gold: 'fa-solid fa-star'
};

/** ألقاب أنواع التنبيهات */
const TOAST_TITLES = {
  success: 'تم بنجاح',
  error: 'خطأ',
  warn: 'تنبيه',
  info: 'معلومة',
  gold: 'منصة محمد عيسى'
};

/**
 * عرض إشعار Toast
 * @param {string} message نص الرسالة
 * @param {'success'|'error'|'warn'|'info'|'gold'} type النوع
 * @param {number} duration المدة بالمللي ثانية
 */
let _lastToastText = '';
let _lastToastTime = 0;

function showToast(message, type, duration) {
  type = type || 'info';
  duration = duration || 4200;

  // منع تكرار نفس الرسالة خلال 1.2 ثانية (نتيجة أكثر من مستمع حماية)
  const nowTs = Date.now();
  const msgKey = type + '|' + String(message);
  if (msgKey === _lastToastText && nowTs - _lastToastTime < 1200) return null;
  _lastToastText = msgKey;
  _lastToastTime = nowTs;

  let stack = document.getElementById('toastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toastStack';
    stack.className = 'toast-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }

  const el = document.createElement('div');
  el.className = 'toast toast--' + type;
  el.setAttribute('role', 'status');
  el.innerHTML =
    '<span class="toast__ic"><i class="' + (TOAST_ICONS[type] || TOAST_ICONS.info) + '"></i></span>' +
    '<div class="toast__body"><strong>' + escapeHtml(TOAST_TITLES[type] || '') + '</strong>' +
    '<p>' + escapeHtml(String(message == null ? '' : message)) + '</p></div>' +
    '<button type="button" class="toast__x" aria-label="إغلاق"><i class="fa-solid fa-xmark"></i></button>' +
    '<i class="toast__bar" style="animation-duration:' + duration + 'ms"></i>';

  stack.appendChild(el);

  // الحد الأقصى لعدد التنبيهات الظاهرة
  while (stack.children.length > 4) stack.removeChild(stack.firstChild);

  let removed = false;
  function remove() {
    if (removed) return;
    removed = true;
    el.classList.add('is-out');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
  }

  el.querySelector('.toast__x').addEventListener('click', remove);
  setTimeout(remove, duration);
  return el;
}

/* ─────────────────────────────────────────────────────────────
   2) التنقية والنصوص
   ───────────────────────────────────────────────────────────── */

/** تنقية أي نص قبل حقنه في HTML لمنع XSS */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/`/g, '&#96;');
}

/** اختصار نص طويل */
function truncate(str, len) {
  const s = String(str || '');
  len = len || 90;
  return s.length > len ? s.slice(0, len).trim() + '…' : s;
}

/** تنسيق التاريخ بالعربية */
function formatDate(value, withTime) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  try {
    const opts = { year: 'numeric', month: 'long', day: 'numeric' };
    if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
    return new Intl.DateTimeFormat('ar-EG', opts).format(d);
  } catch (e) {
    return d.toLocaleDateString('ar-EG');
  }
}

/** تنسيق تاريخ مختصر */
function formatShortDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('ar-EG', { month: 'short', day: 'numeric' }).format(d);
  } catch (e) { return d.toLocaleDateString('ar-EG'); }
}

/** الوقت فقط */
function formatTime(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' }).format(d);
  } catch (e) { return ''; }
}

/** وقت نسبي (منذ كم) */
function timeAgo(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'الآن';
  if (diff < 3600) return 'منذ ' + Math.floor(diff / 60) + ' دقيقة';
  if (diff < 86400) return 'منذ ' + Math.floor(diff / 3600) + ' ساعة';
  if (diff < 604800) return 'منذ ' + Math.floor(diff / 86400) + ' يوم';
  return formatShortDate(value);
}

/** الوقت المتبقي حتى تاريخ معين */
function timeUntil(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  let diff = Math.floor((d.getTime() - Date.now()) / 1000);
  if (diff <= 0) return 'انتهى';
  const days = Math.floor(diff / 86400); diff -= days * 86400;
  const hours = Math.floor(diff / 3600); diff -= hours * 3600;
  const mins = Math.floor(diff / 60);
  if (days > 0) return days + ' يوم و' + hours + ' ساعة';
  if (hours > 0) return hours + ' ساعة و' + mins + ' دقيقة';
  return mins + ' دقيقة';
}

/** تحويل الثواني/الدقائق لصيغة مقروءة */
function humanDuration(minutes) {
  const m = Number(minutes) || 0;
  if (m <= 0) return 'غير محدد';
  if (m < 60) return m + ' دقيقة';
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return h + ' ساعة' + (rest ? ' و' + rest + ' دقيقة' : '');
}

/** أول حرف من الاسم (للأفاتار) */
function initialOf(name) {
  const s = String(name || '').trim();
  if (!s) return 'ط';
  const clean = s.replace(/^(الأستاذ|الاستاذ|أ|د)\s*/, '');
  return clean.charAt(0) || 'ط';
}

/** رقم عشوائي آمن نسبيًا */
function randomToken(len) {
  len = len || 24;
  let out = '';
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint32Array(len);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  } else {
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────
   3) التنقل
   ───────────────────────────────────────────────────────────── */

/** التمرير الناعم إلى قسم مع مراعاة ارتفاع شريط التنقل */
function scrollToSection(idOrEl) {
  let el = typeof idOrEl === 'string' ? document.querySelector(idOrEl) : idOrEl;
  if (!el) return;
  const nav = document.getElementById('navbar');
  const navH = nav ? nav.offsetHeight : 66;
  const top = el.getBoundingClientRect().top + window.pageYOffset - navH - 14;
  window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
  // تحديث الحالة في شريط التنقل
  document.querySelectorAll('.nav-links__a').forEach(function (a) {
    a.classList.toggle('is-active', a.getAttribute('href') === '#' + (el.id || ''));
  });
  // إغلاق قائمة الموبايل
  const nb = document.getElementById('navbar');
  if (nb) nb.classList.remove('is-open');
}

/* ─────────────────────────────────────────────────────────────
   4) Modals — فتح وإغلاق النوافذ
   ───────────────────────────────────────────────────────────── */

/** فتح نافذة modal بالمعرّف */
function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return null;
  m.hidden = false;
  document.body.classList.add('noscroll');
  // تركيز أول عنصر قابل للتركيز
  setTimeout(function () {
    const f = m.querySelector('input:not([type=hidden]),textarea,select,button[autofocus]');
    if (f) { try { f.focus(); } catch (e) {} }
  }, 120);
  return m;
}

/** إغلاق نافذة modal بالمعرّف */
function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.hidden = true;
  // لو ما فيه نافذة مفتوحة أخرى نرجّع التمرير
  if (!document.querySelector('.modal:not([hidden])')) document.body.classList.remove('noscroll');
}

/** إغلاق كل النوافذ المفتوحة */
function closeAllModals() {
  document.querySelectorAll('.modal:not([hidden])').forEach(function (m) { m.hidden = true; });
  document.body.classList.remove('noscroll');
}

/** نافذة معلومات عامة */
function showInfoModal(title, htmlBody) {
  const t = document.getElementById('infoModalTitle');
  const b = document.getElementById('infoModalBody');
  if (t) t.textContent = title || 'تنبيه';
  if (b) b.innerHTML = htmlBody || '';
  openModal('infoModal');
}

/* ─────────────────────────────────────────────────────────────
   5) التخزين المحلي
   ───────────────────────────────────────────────────────────── */

function storeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (e) { return fallback; }
}
function storeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}
function storeDel(key) {
  try { localStorage.removeItem(key); } catch (e) {}
}

/* ─────────────────────────────────────────────────────────────
   6) بصمة الجهاز
   ───────────────────────────────────────────────────────────── */

/** توليد بصمة تقريبية للجهاز (تُحفظ وتُعاد) */
function getDeviceFingerprint() {
  const cached = storeGet(STORAGE_KEYS.fingerprint, null);
  if (cached) return cached;

  const parts = [
    navigator.userAgent || '',
    navigator.language || '',
    screen.width + 'x' + screen.height,
    screen.colorDepth || '',
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || '',
    navigator.platform || '',
    (window.devicePixelRatio || '').toString()
  ];
  const raw = parts.join('||');

  // hash بسيط (djb2) + عشوائية ثابتة للجهاز
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 = (h1 * 33) ^ c;
    h2 = (h2 * 33) ^ (c + i);
  }
  const stable = (h1 >>> 0).toString(36) + '-' + (h2 >>> 0).toString(36);
  const fp = 'fp_' + stable + '_' + randomToken(8);
  storeSet(STORAGE_KEYS.fingerprint, fp);
  return fp;
}

/* ─────────────────────────────────────────────────────────────
   7) Rate Limiter
   ───────────────────────────────────────────────────────────── */

/**
 * محدّد معدل عام
 * @param {number} maxAttempts أقصى عدد محاولات
 * @param {number} windowMs فترة الزمن بالمللي ثانية
 * @param {string} storageKey مفتاح اختياري للحفظ في localStorage
 */
class RateLimiter {
  constructor(maxAttempts, windowMs, storageKey) {
    this.max = maxAttempts || 5;
    this.window = windowMs || 60000;
    this.key = storageKey || null;
    this.hits = [];
    this._restore();
  }

  /** استرجاع المحاولات المحفوظة */
  _restore() {
    if (!this.key) return;
    const saved = storeGet(this.key, []);
    if (Array.isArray(saved)) {
      const cutoff = Date.now() - this.window;
      this.hits = saved.filter(function (t) { return t > cutoff; });
    }
  }

  /** حفظ المحاولات */
  _persist() {
    if (!this.key) return;
    storeSet(this.key, this.hits);
  }

  /** تنظيف المحاولات المنتهية */
  _prune() {
    const cutoff = Date.now() - this.window;
    this.hits = this.hits.filter(function (t) { return t > cutoff; });
  }

  /**
   * فحص هل مسموح بالتنفيذ الآن
   * @returns {{allowed:boolean, remaining:number, retryAfter:number, blockedUntil:number}}
   */
  check() {
    this._prune();
    this._persist();
    const remaining = Math.max(0, this.max - this.hits.length);
    if (remaining > 0) return { allowed: true, remaining: remaining, retryAfter: 0, blockedUntil: 0 };
    const oldest = this.hits[0] || Date.now();
    const blockedUntil = oldest + this.window;
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000)),
      blockedUntil: blockedUntil
    };
  }

  /** تسجيل محاولة جديدة */
  record() {
    this._prune();
    this.hits.push(Date.now());
    this._persist();
    return this.check();
  }

  /** تصفير العدّاد */
  reset() {
    this.hits = [];
    this._persist();
  }

  /** عدد المحاولات الحالية */
  count() {
    this._prune();
    return this.hits.length;
  }
}

/** محدّد معدل الشات: 5 رسائل كل 10 ثواني */
const chatRateLimiter = new RateLimiter(5, 10000, STORAGE_KEYS.chatAttempts);

/** محدّد معدل تسجيل الدخول: 5 محاولات كل 15 دقيقة */
const loginRateLimiter = new RateLimiter(5, 15 * 60 * 1000, STORAGE_KEYS.loginAttempts);

/** محدّد معدل إنشاء الحساب: 3 محاولات كل 30 دقيقة */
const registerRateLimiter = new RateLimiter(3, 30 * 60 * 1000, STORAGE_KEYS.registerAttempts);

/** صياغة عربية لرسالة التجاوز */
function rateLimitMessage(res) {
  const s = res.retryAfter || 0;
  if (s >= 60) {
    const m = Math.ceil(s / 60);
    return 'تم تجاوز عدد المحاولات المسموح. انتظر ' + m + ' دقيقة ثم أعد المحاولة.';
  }
  return 'تم تجاوز عدد المحاولات المسموح. انتظر ' + s + ' ثانية ثم أعد المحاولة.';
}

/* ─────────────────────────────────────────────────────────────
   8) debounce / throttle
   ───────────────────────────────────────────────────────────── */

/** تأجيل تنفيذ الدالة حتى يتوقف الاستدعاء */
function debounce(fn, wait) {
  let t = null;
  wait = wait || 300;
  return function () {
    const ctx = this, args = arguments;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(ctx, args); }, wait);
  };
}

/** تنفيذ الدالة بحد أقصى مرة كل فترة */
function throttle(fn, limit) {
  let last = 0, timer = null;
  limit = limit || 200;
  return function () {
    const ctx = this, args = arguments;
    const now = Date.now();
    const remaining = limit - (now - last);
    if (remaining <= 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      last = now;
      fn.apply(ctx, args);
    } else if (!timer) {
      timer = setTimeout(function () {
        last = Date.now(); timer = null;
        fn.apply(ctx, args);
      }, remaining);
    }
  };
}

/* ─────────────────────────────────────────────────────────────
   9) الحماية — الاختصارات، لقطة الشاشة، أدوات المطور
   ───────────────────────────────────────────────────────────── */

/** منع الاختصارات: F12 / Ctrl+Shift+I|J|C / Ctrl+S|U|P */
function blockShortcuts() {
  document.addEventListener('keydown', function (e) {
    const k = (e.key || '').toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;

    // F12
    if (e.key === 'F12' || e.keyCode === 123) {
      e.preventDefault();
      showToast('أدوات المطور معطّلة في هذه المنصة', 'warn', 2600);
      return false;
    }
    // Ctrl + Shift + I / J / C / K
    if (ctrl && e.shiftKey && ['i', 'j', 'c', 'k'].indexOf(k) !== -1) {
      e.preventDefault();
      showToast('أدوات المطور معطّلة', 'warn', 2600);
      return false;
    }
    // Ctrl + U (عرض المصدر) / Ctrl + S (حفظ) / Ctrl + P (طباعة)
    if (ctrl && ['u', 's', 'p'].indexOf(k) !== -1) {
      e.preventDefault();
      showToast(k === 'p' ? 'الطباعة غير مسموحة حفاظًا على المحتوى' : 'هذا الإجراء غير مسموح', 'warn', 2600);
      return false;
    }
    return true;
  }, { capture: true });

  // منع الطباعة عبر CSS + حدث الطباعة
  window.addEventListener('beforeprint', function () {
    document.body.style.filter = 'blur(18px)';
  });
  window.addEventListener('afterprint', function () {
    document.body.style.filter = '';
  });
}

/** محاولة منع لقطة الشاشة (تعتيم الصفحة عند فقدان التركيز/الت visibility) */
function blockPrintScreen() {
  // عند استخدام PrintScreen نُخفي المحتوى الحساس
  document.addEventListener('keyup', function (e) {
    if (e.key === 'PrintScreen' || e.keyCode === 44) {
      document.body.style.filter = 'blur(20px) brightness(.4)';
      showToast('تم اكتشاف محاولة لقطة شاشة — المحتوى محمي', 'error', 3500);
      setTimeout(function () { document.body.style.filter = ''; }, 1600);
      // مسح الحافظة إن أمكن
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText('').catch(function () {});
      }
    }
  });

  // إخفاء المحتوى عند مغادرة النافذة (يقلّل فائدة الالتقاط)
  document.addEventListener('visibilitychange', function () {
    const player = document.getElementById('playerStage');
    if (document.hidden && player && !player.closest('.modal[hidden]')) {
      if (typeof pausePlayer === 'function') pausePlayer();
    }
  });
}

/** منع القائمة اليمنى والسحب على العناصر المحمية */
function applyProtection(root) {
  const scope = root || document;

  // منع تركيب الحماية أكثر من مرة على نفس النطاق
  if (scope.__moProtected) return;
  scope.__moProtected = true;

  // منع القائمة اليمنى على الصور والفيديو وكل عنصر عليه data-protect
  scope.addEventListener('contextmenu', function (e) {
    const t = e.target;
    const tag = (t.tagName || '').toUpperCase();
    if (tag === 'IMG' || tag === 'VIDEO' || tag === 'IFRAME' || t.closest('[data-protect]') || t.closest('.player-stage')) {
      e.preventDefault();
      showToast('حفظ المحتوى غير مسموح', 'warn', 2200);
      return false;
    }
    return true;
  });

  // منع سحب الصور
  scope.addEventListener('dragstart', function (e) {
    const tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'IMG' || tag === 'VIDEO' || e.target.closest('.player-stage')) {
      e.preventDefault();
      return false;
    }
    return true;
  });

  // منع التحديد على عناصر المشغل
  scope.querySelectorAll('.player-stage,.wm-layer,.course-card__media').forEach(function (el) {
    el.style.userSelect = 'none';
    el.style.webkitUserSelect = 'none';
  });

  // منع حفظ الصفحة بالسحب والإفلات
  scope.addEventListener('drop', function (e) {
    if (e.target.closest('.player-stage')) e.preventDefault();
  });
}

/**
 * كشف أدوات المطور (بحجم النافذة + debugger)
 * @param {function} onDetect دالة تُستدعى عند الكشف
 */
function detectDevTools(onDetect) {
  let flagged = false;
  const threshold = 170;

  function flag(reason) {
    if (flagged) return;
    flagged = true;
    if (typeof onDetect === 'function') onDetect(reason);
    // إعادة الفحص بعد فترة للسماح بالتعافي
    setTimeout(function () { flagged = false; }, 12000);
  }

  // الطريقة الأولى: فرق أبعاد النافذة
  const sizeCheck = throttle(function () {
    const dw = window.outerWidth - window.innerWidth > threshold;
    const dh = window.outerHeight - window.innerHeight > threshold;
    if (dw || dh) flag('window-size');
  }, 900);
  window.addEventListener('resize', sizeCheck);

  // الطريقة الثانية: debugger — لو تأخر التنفيذ بشكل ملحوظ فالأدوات مفتوحة
  // (تُفعَّل فقط بعد أول تفاعل من المستخدم، وتُعطَّل في بيئات التشغيل الآلي)
  const isBot = !!(navigator.webdriver || window.__nightmare || window.callPhantom || window._phantom);
  if (!isBot) {
    let armed = false;
    const arm = function () { armed = true; };
    ['click', 'scroll', 'keydown', 'touchstart'].forEach(function (ev) {
      window.addEventListener(ev, arm, { once: true, passive: true });
    });
    setInterval(function () {
      if (!armed) return;
      const start = performance.now();
      // eslint-disable-next-line no-debugger
      (function () { try { debugger; } catch (e) {} })();
      const delta = performance.now() - start;
      if (delta > 160) flag('debugger-timing');
    }, 4200);
  }

  // الطريقة الثالثة: طباعة كائن في console (يُكشف في بعض المتصفحات)
  try {
    const probe = new Image();
    Object.defineProperty(probe, 'id', {
      get: function () { flag('console-getter'); return ''; }
    });
    setInterval(function () { try { console.debug(probe); } catch (e) {} }, 5000);
  } catch (e) {}

  return {
    isFlagged: function () { return flagged; },
    reset: function () { flagged = false; }
  };
}

/** حماية شاملة تُفعّل عند بدء التطبيق */
function initProtection() {
  blockShortcuts();
  blockPrintScreen();
  applyProtection(document);
  detectDevTools(function (reason) {
    if (typeof onDevToolsDetected === 'function') onDevToolsDetected(reason);
    else showToast('تم اكتشاف أدوات المطور — تم إيقاف العرض لحماية المحتوى', 'error', 4000);
  });
}

/* ─────────────────────────────────────────────────────────────
   10) التحقق من المدخلات
   ───────────────────────────────────────────────────────────── */

/** بريد إلكتروني صحيح؟ */
function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(String(v || '').trim());
}

/** هاتف مصري 11 رقم يبدأ بـ 01 */
function isValidPhone(v) {
  return /^01[0125][0-9]{8}$/.test(String(v || '').replace(/[\s-]/g, ''));
}

/** كلمة سر 6 أحرف فأكثر */
function isValidPassword(v) {
  return String(v || '').length >= 6;
}

/**
 * حساب قوة كلمة المرور من 0 إلى 4
 */
function passwordStrength(v) {
  const s = String(v || '');
  if (!s.length) return { level: 0, label: '—', tips: 'أدخل كلمة مرور' };
  let score = 0;
  if (s.length >= 6) score++;
  if (s.length >= 10) score++;
  if (/[A-Z\u0621-\u064A]/.test(s) && /[a-z]/.test(s)) score++;
  if (/\d/.test(s)) score++;
  if (/[^A-Za-z0-9]/.test(s)) score++;
  const level = Math.min(4, Math.max(1, Math.ceil(score / 1.4)));
  const labels = ['', 'ضعيفة جدًا', 'ضعيفة', 'جيدة', 'قوية جدًا'];
  const tips = [
    'أدخل كلمة مرور',
    'استخدم ٦ أحرف على الأقل',
    'أضف أرقامًا وحروفًا كبيرة',
    'أضف رمزًا خاصًا مثل @ أو #',
    'ممتاز — كلمة مرور قوية'
  ];
  return { level: level, label: labels[level], tips: tips[level] };
}

/** تحويل الأرقام الإنجليزية إلى عربية للعرض */
function toArabicDigits(input) {
  const map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(input == null ? '' : input).replace(/[0-9]/g, function (d) { return map[+d]; });
}

/** تمييز حالة عنصر الحقل (صحيح/خطأ) */
function setFieldState(input, ok, message) {
  const field = input.closest('.field');
  if (!field) return;
  field.classList.toggle('is-invalid', ok === false);
  field.classList.toggle('is-ok', ok === true);
  const err = field.querySelector('.field__err');
  if (err && message !== undefined) err.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> ' + escapeHtml(message);
}

/* ─────────────────────────────────────────────────────────────
   11) الرسوم المتحركة الصغيرة
   ───────────────────────────────────────────────────────────── */

/** عدّاد رقمي تصاعدي */
function countUp(el, target, duration) {
  if (!el) return;
  const to = Number(target) || 0;
  const dur = duration || 1200;
  const start = performance.now();
  const from = 0;
  function step(now) {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/** انتظار */
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
