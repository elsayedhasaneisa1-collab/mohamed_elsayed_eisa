/* ═══════════════════════════════════════════════════════════════
   js/config.js — الإعدادات العامة للمنصة + عميل Supabase
   يُحمّل أولًا قبل أي ملف آخر.
   ═══════════════════════════════════════════════════════════════ */

/* ─────────── الإعدادات المركزية ─────────── */
const CONFIG = {
  /* بيانات اتصال Supabase */
  SUPABASE_URL: 'https://brawrhpvtnzvvrzkguic.supabase.co',
  SUPABASE_KEY: 'sb_publishable_Q8fBS3nVZqgvfd6diaul8A_cMvHUFtN',

  /* بيانات المعلم */
  TEACHER: {
    name: 'الأستاذ محمد عيسى',
    phone: '01555814414',
    telegram: 'sayoda_elgadar'
  },

  /* الصفوف الدراسية */
  GRADES: ['الأول الثانوي', 'الثاني الثانوي', 'الثالث الثانوي'],

  /* إعدادات نظام الجلسة الواحدة */
  SESSION: {
    heartbeatInterval: 15000, // إرسال نبضة كل 15 ثانية
    checkInterval: 8000       // فحص تغيّر session_id كل 8 ثواني
  },

  /* إعدادات العلامة المائية على الفيديو */
  WATERMARK: {
    interval: 4000,   // تغيير موضع العلامة كل 4 ثواني
    opacity: 0.35,    // الشفافية الأساسية
    fontSize: '16px'  // حجم الخط
  },

  /* حدود المعدل (Rate Limiting) */
  LIMITS: {
    login: { max: 5, window: 15 * 60 * 1000 },  // 5 محاولات / 15 دقيقة
    chat: { max: 5, window: 10 * 1000 },        // 5 رسائل / 10 ثواني
    register: { max: 3, window: 30 * 60 * 1000 }
  },

  /* روابط ثابتة */
  LINKS: {
    support: 'https://t.me/sayoda_elgadar',
    whatsapp: 'https://wa.me/201555814414',
    tel: 'tel:01555814414'
  },

  /* أسماء الصفحات */
  PAGES: {
    home: 'index.html',
    login: 'login.html',
    register: 'register.html',
    admin: 'admin.html'
  }
};

/* ─────────── إنشاء عميل Supabase (JS v2) ─────────── */
const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: {
    persistSession: true,      // حفظ الجلسة في localStorage
    autoRefreshToken: true,    // تجديد التوكن تلقائيًا
    detectSessionInUrl: true   // التقاط الجلسة من الرابط (روابط التأكيد)
  }
});

/* ─────────── حالة التطبيق العامة في الذاكرة ─────────── */
const APP = {
  user: null,            // مستخدم Supabase الحالي
  profile: null,         // صف الطالب من جدول students
  isAdmin: false,        // هل المستخدم أدمن؟
  courses: [],           // كل الكورسات
  lessonsCache: {},      // دروس كل كورس (course_id -> lessons[])
  myEnrollments: [],     // اشتراكات الطالب الحالي
  announcements: [],     // الإعلانات
  activeGrade: 'all',    // الفلتر النشط
  currentCourse: null,   // الكورس المفتوح حاليًا
  currentLessons: [],    // دروس الكورس المفتوح
  currentLessonIndex: -1,// index الدرس المشغّل
  doneLessons: [],       // ids الدروس المنتهية
  chatUnread: 0
};

/* ─────────── مفاتيح التخزين المحلي ─────────── */
const STORAGE_KEYS = {
  sessionId: 'mo_session_id',
  fingerprint: 'mo_device_fp',
  lastTab: 'mo_last_tab',
  loginAttempts: 'mo_login_attempts',
  registerAttempts: 'mo_register_attempts',
  chatAttempts: 'mo_chat_attempts',
  devtoolsWarned: 'mo_devtools_warned',
  theme: 'mo_theme'
};

/* ─────────── رسائل الأخطاء العربية لأخطاء Supabase ─────────── */
const AR_ERRORS = {
  'Invalid login credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  'Email not confirmed': 'لم يتم تأكيد البريد الإلكتروني بعد، راجع بريدك',
  'User already registered': 'هذا البريد مسجّل بالفعل، سجّل الدخول بدلًا من إنشاء حساب',
  'Password should be at least 6 characters': 'كلمة المرور يجب ألا تقل عن ٦ أحرف',
  'Unable to validate email address: invalid format': 'صيغة البريد الإلكتروني غير صحيحة',
  'Email rate limit exceeded': 'تم تجاوز عدد المحاولات المسموح، حاول بعد قليل',
  'User not found': 'لا يوجد حساب بهذا البريد الإلكتروني',
  'For security purposes, you can only request this after 30 seconds.': 'انتظر ٣٠ ثانية قبل إعادة المحاولة',
  'New password should be different from the old password.': 'كلمة المرور الجديدة يجب أن تختلف عن القديمة',
  'Auth session missing': 'انتهت الجلسة، سجّل الدخول مرة أخرى',
  'Auth session expired': 'انتهت صلاحية الجلسة، سجّل الدخول مرة أخرى',
  'Token expired': 'انتهت صلاحية الرمز، أعد المحاولة',
  'Database error saving new user': 'تعذّر حفظ بيانات المستخدم، تواصل مع الدعم الفني',
  'failed to send magic link email': 'تعذّر إرسال رابط التفعيل، تواصل مع الدعم الفني',
  'Insufficient privileges': 'ليست لديك صلاحية لتنفيذ هذا الإجراء',
  'new row violates row-level security policy': 'ليست لديك صلاحية لتنفيذ هذا الإجراء (RLS)',
  'FetchError': 'تعذّر الاتصال بالخادم، تحقق من الإنترنت'
};

/* ─────────── أدوات مساعدة عامة على مستوى المشروع ─────────── */

/** ترجمة رسالة خطأ قادمة من Supabase إلى العربية */
function translateError(err) {
  const raw = (err && (err.message || err.error_description || err.error)) || '';
  if (!raw) return 'حدث خطأ غير متوقع، حاول مرة أخرى';
  if (AR_ERRORS[raw]) return AR_ERRORS[raw];
  const key = Object.keys(AR_ERRORS).find(function (k) { return raw.toLowerCase().indexOf(k.toLowerCase()) !== -1; });
  return key ? AR_ERRORS[key] : raw;
}

/** اسم الصفحة الحالية (بدون مسار) */
function currentPage() {
  const p = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  return p === '' ? 'index.html' : p;
}

/** المسار الأساسي للتطبيق (يدعم النشر داخل مجلد فرعي مثل /madrasa/) */
function basePath() {
  const path = window.location.pathname;
  return path.substring(0, path.lastIndexOf('/') + 1);
}

/** التنقّل إلى صفحة داخل التطبيق مع احترام المسار الفرعي */
function goTo(page) {
  window.location.href = basePath() + page;
}

/** أيقونة FontAwesome حسب نوع الرابط */
function linkIcon(url) {
  const u = String(url || '').toLowerCase();
  if (u.indexOf('youtube.com') !== -1 || u.indexOf('youtu.be') !== -1) return 'fa-brands fa-youtube';
  if (u.indexOf('vimeo.com') !== -1) return 'fa-brands fa-vimeo';
  if (u.indexOf('drive.google') !== -1) return 'fa-brands fa-google-drive';
  if (u.indexOf('telegram') !== -1 || u.indexOf('t.me') !== -1) return 'fa-brands fa-telegram';
  return 'fa-solid fa-video';
}
