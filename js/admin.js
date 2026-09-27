/* ═══════════════════════════════════════════════════════════════
   js/admin.js — لوحة تحكم الإدارة (6 تابات)
   كورسات · دروس · امتحانات (expires_at) · واجبات · إعلانات · طلاب
   + Modal موحّد للإضافة/التعديل + CRUD كامل + قبول/رفض الاشتراكات
   + تنظيف الامتحانات المنتهية كل 5 دقائق
   ═══════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────
   بيانات الإدارة في الذاكرة
   ───────────────────────────────────────────────────────────── */
const ADMIN_DATA = {
  courses: [],
  lessons: [],
  exams: [],
  homeworks: [],
  announcements: [],
  students: [],
  enrollments: [],
  activeTab: 'courses',
  searchTerm: '',
  cleanupTimer: null
};

/* ─────────────────────────────────────────────────────────────
   مخططات الحقول للمودال الموحّد
   ───────────────────────────────────────────────────────────── */
function gradeOptions() {
  return CONFIG.GRADES.map(function (g) { return { value: g, label: g }; });
}
function courseOptions() {
  return ADMIN_DATA.courses.map(function (c) { return { value: c.id, label: c.title + ' — ' + (c.grade || '') }; });
}

const FORM_SCHEMAS = {
  /* ── الكورسات ── */
  courses: {
    title: 'الكورس',
    icon: 'fa-layer-group',
    fields: [
      { key: 'title', label: 'عنوان الكورس', type: 'text', required: true, col: 'full', placeholder: 'مثال: كورس الفيزياء الشامل' },
      { key: 'grade', label: 'الصف الدراسي', type: 'select', options: gradeOptions, required: true, col: 'half' },
      { key: 'teacher', label: 'اسم المعلم', type: 'text', col: 'half', placeholder: CONFIG.TEACHER.name, default: CONFIG.TEACHER.name },
      { key: 'price', label: 'السعر (ج.م)', type: 'number', col: 'half', placeholder: '0 = مجاني', default: 0, min: 0 },
      { key: 'is_free', label: 'كورس مجاني بالكامل', type: 'checkbox', col: 'half', default: false },
      { key: 'thumbnail', label: 'رابط صورة الغلاف', type: 'url', col: 'full', placeholder: 'https://…/cover.jpg', hint: 'اتركه فارغًا لاستخدام غلاف تلقائي' },
      { key: 'description', label: 'وصف الكورس', type: 'textarea', col: 'full', placeholder: 'ماذا يتضمن الكورس؟ عدد المحاضرات، المميزات…' }
    ]
  },

  /* ── الدروس ── */
  lessons: {
    title: 'الدرس',
    icon: 'fa-film',
    fields: [
      { key: 'course_id', label: 'الكورس', type: 'select', options: courseOptions, required: true, col: 'full' },
      { key: 'title', label: 'عنوان الدرس', type: 'text', required: true, col: 'full', placeholder: 'مثال: الفصل الأول — الحركة الخطية' },
      { key: 'video_url', label: 'رابط الفيديو', type: 'url', required: true, col: 'full', placeholder: 'YouTube / Vimeo / Google Drive / MP4', hint: 'يُقبل أي رابط من: youtube.com, youtu.be, vimeo.com, drive.google.com, أو ملف mp4 مباشر' },
      { key: 'duration', label: 'مدة الدرس (دقيقة)', type: 'number', col: 'half', placeholder: '45', min: 0 },
      { key: 'order_index', label: 'ترتيب الدرس', type: 'number', col: 'half', placeholder: '1', min: 0, default: 1 },
      { key: 'is_free', label: 'درس مجاني (معاينة للجميع)', type: 'checkbox', col: 'full', default: false },
      { key: 'notes', label: 'ملاحظات الدرس', type: 'textarea', col: 'full', placeholder: 'ملخص أو تعليمات (اختياري)' }
    ]
  },

  /* ── الامتحانات ── */
  exams: {
    title: 'الامتحان',
    icon: 'fa-file-signature',
    fields: [
      { key: 'course_id', label: 'الكورس', type: 'select', options: courseOptions, required: true, col: 'full' },
      { key: 'title', label: 'عنوان الامتحان', type: 'text', required: true, col: 'full', placeholder: 'مثال: امتحان الفصل الأول' },
      { key: 'description', label: 'تعليمات الامتحان', type: 'textarea', col: 'full', placeholder: 'اقرأ الأسئلة جيدًا…' },
      { key: 'duration_minutes', label: 'المدة (دقيقة)', type: 'number', col: 'half', required: true, default: 30, min: 1 },
      { key: 'total_degree', label: 'الدرجة الكلية', type: 'number', col: 'half', default: 10, min: 1 },
      { key: 'starts_at', label: 'يبدأ في', type: 'datetime', col: 'half' },
      { key: 'expires_at', label: 'ينتهي في (expires_at)', type: 'datetime', col: 'half', required: true, hint: 'بعد هذا التوقيت لن يتمكن الطلاب من الدخول للامتحان' },
      { key: 'questions', label: 'الأسئلة', type: 'questions', col: 'full' }
    ]
  },

  /* ── الواجبات ── */
  homeworks: {
    title: 'الواجب',
    icon: 'fa-pen-to-square',
    fields: [
      { key: 'course_id', label: 'الكورس', type: 'select', options: courseOptions, required: true, col: 'full' },
      { key: 'title', label: 'عنوان الواجب', type: 'text', required: true, col: 'full', placeholder: 'مثال: واجب الفصل الأول' },
      { key: 'description', label: 'تفاصيل الواجب', type: 'textarea', col: 'full', required: true, placeholder: 'المطلوب حلّه…' },
      { key: 'due_date', label: 'آخر موعد للتسليم', type: 'datetime', col: 'half' },
      { key: 'total_degree', label: 'الدرجة', type: 'number', col: 'half', default: 10, min: 0 },
      { key: 'attachment_url', label: 'رابط ملف الواجب', type: 'url', col: 'full', placeholder: 'https://…/homework.pdf' }
    ]
  },

  /* ── الإعلانات ── */
  announcements: {
    title: 'الإعلان',
    icon: 'fa-bullhorn',
    fields: [
      { key: 'title', label: 'عنوان الإعلان', type: 'text', required: true, col: 'full', placeholder: 'مثال: موعد المحاضرة القادمة' },
      { key: 'type', label: 'نوع الإعلان', type: 'select', col: 'half', default: 'general', options: [
        { value: 'general', label: 'عام' }, { value: 'lesson', label: 'درس جديد' },
        { value: 'exam', label: 'امتحان' }, { value: 'offer', label: 'عرض/اشتراك' }
      ]},
      { key: 'grade', label: 'الصف المستهدف', type: 'select', col: 'half', allowEmpty: true, emptyLabel: 'كل الصفوف', options: gradeOptions },
      { key: 'course_id', label: 'مرتبط بكورس', type: 'select', col: 'half', allowEmpty: true, emptyLabel: 'بدون كورس', options: courseOptions },
      { key: 'is_pinned', label: 'إعلان مثبّت', type: 'checkbox', col: 'half', default: false },
      { key: 'body', label: 'نص الإعلان', type: 'textarea', col: 'full', required: true, placeholder: 'اكتب تفاصيل الإعلان…' }
    ]
  }
};

/* ─────────────────────────────────────────────────────────────
   أعمدة الجداول
   ───────────────────────────────────────────────────────────── */
function courseName(id) {
  const c = ADMIN_DATA.courses.find(function (x) { return x.id === id; });
  return c ? c.title : '—';
}
function studentName(id) {
  const s = ADMIN_DATA.students.find(function (x) { return x.id === id; });
  return s ? s.full_name : String(id || '').slice(0, 6);
}

const STATUS_BADGE = {
  pending: ['badge--warn', 'قيد المراجعة'],
  approved: ['badge--ok', 'مُفعّل'],
  rejected: ['badge--err', 'مرفوض'],
  active: ['badge--ok', 'نشط'],
  suspended: ['badge--err', 'موقوف']
};

const TABLE_COLUMNS = {
  courses: [
    { label: 'الغلاف', render: function (r) {
        return r.thumbnail
          ? '<img class="tbl__thumb" src="' + escapeHtml(r.thumbnail) + '" alt="" loading="lazy" />'
          : '<span class="tbl__thumb" style="display:grid;place-items:center;color:var(--gold-deep);font-family:Cairo"><b>' + escapeHtml(initialOf(r.title)) + '</b></span>';
      }},
    { label: 'العنوان', render: function (r) { return '<strong>' + escapeHtml(r.title) + '</strong>'; }},
    { label: 'الصف', render: function (r) { return '<span class="badge badge--gold">' + escapeHtml(r.grade || '—') + '</span>'; }},
    { label: 'السعر', render: function (r) {
        const p = Number(r.price || 0);
        return p > 0 ? '<strong class="mono">' + p + ' ج.م</strong>' : '<span class="badge badge--ok">مجاني</span>';
      }},
    { label: 'الدروس', render: function (r) {
        const n = ADMIN_DATA.lessons.filter(function (l) { return l.course_id === r.id; }).length;
        return '<span class="mono">' + n + '</span>';
      }},
    { label: 'المشتركون', render: function (r) {
        const n = ADMIN_DATA.enrollments.filter(function (e) { return e.course_id === r.id && e.status === 'approved'; }).length;
        return '<span class="mono">' + n + '</span>';
      }},
    { label: 'أُضيف', render: function (r) { return '<span class="muted nowrap">' + formatShortDate(r.created_at) + '</span>'; }}
  ],
  lessons: [
    { label: '#', render: function (r, i) { return '<span class="mono muted">' + (r.order_index != null ? r.order_index : i + 1) + '</span>'; }},
    { label: 'العنوان', render: function (r) { return '<strong>' + escapeHtml(r.title) + '</strong>'; }},
    { label: 'الكورس', render: function (r) { return '<span class="badge badge--gold">' + escapeHtml(courseName(r.course_id)) + '</span>'; }},
    { label: 'المصدر', render: function (r) {
        const t = typeof detectVideoType === 'function' ? detectVideoType(r.video_url) : '—';
        return '<span class="muted nowrap"><i class="' + linkIcon(r.video_url) + '"></i> ' + escapeHtml(t) + '</span>';
      }},
    { label: 'المدة', render: function (r) { return '<span class="mono">' + escapeHtml(humanDuration(r.duration)) + '</span>'; }},
    { label: 'الحالة', render: function (r) {
        return r.is_free ? '<span class="badge badge--ok">مجاني</span>' : '<span class="badge badge--mut">للمشتركين</span>';
      }}
  ],
  exams: [
    { label: 'العنوان', render: function (r) { return '<strong>' + escapeHtml(r.title) + '</strong>'; }},
    { label: 'الكورس', render: function (r) { return '<span class="badge badge--gold">' + escapeHtml(courseName(r.course_id)) + '</span>'; }},
    { label: 'الأسئلة', render: function (r) {
        const n = Array.isArray(r.questions) ? r.questions.length : 0;
        return '<span class="mono">' + n + '</span>';
      }},
    { label: 'المدة', render: function (r) { return '<span class="mono">' + escapeHtml(humanDuration(r.duration_minutes)) + '</span>'; }},
    { label: 'ينتهي في', render: function (r) {
        if (!r.expires_at) return '<span class="muted">بدون انتهاء</span>';
        const expired = new Date(r.expires_at).getTime() < Date.now();
        return '<span class="badge ' + (expired ? 'badge--err' : 'badge--warn') + '">' +
          formatDate(r.expires_at, true) + (expired ? ' (انتهى)' : '') + '</span>';
      }},
    { label: 'متبقٍ', render: function (r) { return '<span class="muted nowrap">' + timeUntil(r.expires_at) + '</span>'; }}
  ],
  homeworks: [
    { label: 'العنوان', render: function (r) { return '<strong>' + escapeHtml(r.title) + '</strong>'; }},
    { label: 'الكورس', render: function (r) { return '<span class="badge badge--gold">' + escapeHtml(courseName(r.course_id)) + '</span>'; }},
    { label: 'الوصف', render: function (r) { return '<span class="muted truncate">' + escapeHtml(truncate(r.description || '', 60)) + '</span>'; }},
    { label: 'آخر تسليم', render: function (r) {
        if (!r.due_date) return '<span class="muted">—</span>';
        const late = new Date(r.due_date).getTime() < Date.now();
        return '<span class="badge ' + (late ? 'badge--err' : 'badge--warn') + '">' + formatDate(r.due_date, true) + '</span>';
      }},
    { label: 'الدرجة', render: function (r) { return '<span class="mono">' + (r.total_degree != null ? r.total_degree : '—') + '</span>'; }}
  ],
  announcements: [
    { label: 'العنوان', render: function (r) {
        return (r.is_pinned ? '<i class="fa-solid fa-thumbtack gold" style="margin-inline-end:6px"></i>' : '') + '<strong>' + escapeHtml(r.title) + '</strong>';
      }},
    { label: 'النوع', render: function (r) { return '<span class="badge badge--gold">' + escapeHtml(ANN_TYPES[r.type] || 'عام') + '</span>'; }},
    { label: 'الصف', render: function (r) { return '<span class="muted">' + escapeHtml(r.grade || 'كل الصفوف') + '</span>'; }},
    { label: 'النص', render: function (r) { return '<span class="muted truncate">' + escapeHtml(truncate(r.body || '', 60)) + '</span>'; }},
    { label: 'التاريخ', render: function (r) { return '<span class="muted nowrap">' + timeAgo(r.created_at) + '</span>'; }}
  ]
};

const ANN_TYPES = { general: 'عام', lesson: 'درس جديد', exam: 'امتحان', offer: 'عرض/اشتراك' };

/* ─────────────────────────────────────────────────────────────
   التبويبات
   ───────────────────────────────────────────────────────────── */
function switchAdminTab(tab, btn) {
  tab = tab || 'courses';
  ADMIN_DATA.activeTab = tab;
  ADMIN_DATA.searchTerm = '';
  const search = document.getElementById('adminSearch');
  if (search) search.value = '';

  document.querySelectorAll('.admin-tabs__btn').forEach(function (b) {
    b.classList.toggle('is-active', b === btn || (!btn && b.dataset.tab === tab));
  });
  document.querySelectorAll('.admin-panel').forEach(function (p) {
    p.classList.toggle('is-active', p.id === 'panel-' + tab);
  });

  renderTab(tab);
}

/** رسم محتوى التبويب الحالي */
function renderTab(tab) {
  tab = tab || ADMIN_DATA.activeTab;
  if (tab === 'students') renderStudentsTab();
  else renderEntityTable(tab);
}

/* ─────────────────────────────────────────────────────────────
   جلب كل البيانات
   ───────────────────────────────────────────────────────────── */
async function loadAdminData(silent) {
  if (!silent) {
    document.querySelectorAll('.admin-panel').forEach(function (p) {
      const box = p.querySelector('.table-wrap,.cards-mobile');
    });
  }
  try {
    const [c, l, e, h, a, s, en] = await Promise.all([
      supabaseClient.from('courses').select('*').order('created_at', { ascending: false }),
      supabaseClient.from('lessons').select('*').order('order_index', { ascending: true }),
      supabaseClient.from('exams').select('*').order('created_at', { ascending: false }),
      supabaseClient.from('homeworks').select('*').order('due_date', { ascending: false }),
      supabaseClient.from('announcements').select('*').order('created_at', { ascending: false }),
      supabaseClient.from('students').select('*').order('created_at', { ascending: false }),
      supabaseClient.from('enrollments').select('*').order('created_at', { ascending: false })
    ]);

    if (c.error) throw c.error;
    ADMIN_DATA.courses = c.data || [];
    ADMIN_DATA.lessons = l.data || [];
    ADMIN_DATA.exams = e.data || [];
    ADMIN_DATA.homeworks = h.data || [];
    ADMIN_DATA.announcements = a.data || [];
    ADMIN_DATA.students = s.data || [];
    ADMIN_DATA.enrollments = en.data || [];

    renderAdminStats();
    renderTab();
    updateTabCounts();
  } catch (err) {
    console.warn('[admin] loadAdminData:', err);
    showToast(translateError(err), 'error', 5000);
  }
}

/** عدّادات التبويبات */
function updateTabCounts() {
  const map = {
    courses: ADMIN_DATA.courses.length,
    lessons: ADMIN_DATA.lessons.length,
    exams: ADMIN_DATA.exams.length,
    homeworks: ADMIN_DATA.homeworks.length,
    announcements: ADMIN_DATA.announcements.length,
    students: ADMIN_DATA.students.length
  };
  Object.keys(map).forEach(function (k) {
    const el = document.querySelector('.admin-tabs__btn[data-tab="' + k + '"] .cnt');
    if (el) el.textContent = String(map[k]);
  });
  const pend = document.getElementById('pendingCount');
  if (pend) {
    const n = ADMIN_DATA.enrollments.filter(function (x) { return x.status === 'pending'; }).length;
    pend.textContent = String(n);
    pend.hidden = n === 0;
  }
}

/** إحصائيات أعلى الصفحة */
function renderAdminStats() {
  const approved = ADMIN_DATA.enrollments.filter(function (e) { return e.status === 'approved'; }).length;
  const pending = ADMIN_DATA.enrollments.filter(function (e) { return e.status === 'pending'; }).length;
  const activeExams = ADMIN_DATA.exams.filter(function (x) {
    return !x.expires_at || new Date(x.expires_at).getTime() > Date.now();
  }).length;

  const items = [
    ['fa-layer-group', ADMIN_DATA.courses.length, 'كورس'],
    ['fa-film', ADMIN_DATA.lessons.length, 'درس'],
    ['fa-file-signature', activeExams, 'امتحان نشط'],
    ['fa-pen-to-square', ADMIN_DATA.homeworks.length, 'واجب'],
    ['fa-user-graduate', ADMIN_DATA.students.length, 'طالب'],
    ['fa-hourglass-half', pending, 'طلب معلّق']
  ];

  const box = document.getElementById('adminStats');
  if (box) {
    box.innerHTML = items.map(function (it) {
      return '<div class="astat"><span class="astat__ic"><i class="fa-solid ' + it[0] + '"></i></span>' +
        '<b>' + it[1] + '</b><span>' + it[2] + '</span></div>';
    }).join('');
  }
  const sub = document.getElementById('adminSubStat');
  if (sub) sub.textContent = approved + ' اشتراك مُفعّل · ' + ADMIN_DATA.announcements.length + ' إعلان منشور';
}

/* ─────────────────────────────────────────────────────────────
   رسم جدول كيان + نسخة الموبايل
   ───────────────────────────────────────────────────────────── */
function renderEntityTable(entity) {
  const rows = filterRows(ADMIN_DATA[entity] || [], entity);
  const cols = TABLE_COLUMNS[entity] || [];
  const panel = document.getElementById('panel-' + entity);
  if (!panel) return;

  const tableBox = panel.querySelector('.table-scroll');
  const mobileBox = panel.querySelector('.cards-mobile');

  if (!rows.length) {
    const emptyHtml = '<div class="empty-state empty-state--sm"><i class="fa-regular fa-folder-open"></i>' +
      '<h4>لا توجد بيانات</h4><p>اضغط «إضافة جديد» لإنشاء أول عنصر.</p></div>';
    if (tableBox) tableBox.innerHTML = emptyHtml;
    if (mobileBox) { mobileBox.innerHTML = emptyHtml; mobileBox.style.display = 'block'; }
    return;
  }
  if (mobileBox) mobileBox.style.display = '';

  // الجدول الكامل
  if (tableBox) {
    tableBox.innerHTML = '<table class="tbl"><thead><tr>' +
      cols.map(function (c) { return '<th>' + escapeHtml(c.label) + '</th>'; }).join('') +
      '<th style="text-align:left">إجراءات</th></tr></thead><tbody>' +
      rows.map(function (r, i) {
        return '<tr>' +
          cols.map(function (c) { return '<td>' + (c.render(r, i) || '') + '</td>'; }).join('') +
          '<td><div class="tbl__actions">' + entityActions(entity, r) + '</div></td>' +
        '</tr>';
      }).join('') + '</tbody></table>';
  }

  // بطاقات الموبايل
  if (mobileBox) {
    mobileBox.innerHTML = rows.map(function (r, i) {
      const head = cols.slice(0, 2).map(function (c) { return c.render(r, i); }).join('');
      const rest = cols.slice(2).map(function (c) {
        return '<div><b>' + escapeHtml(c.label) + ':</b><span>' + (c.render(r, i) || '—') + '</span></div>';
      }).join('');
      return '<div class="mcard"><div class="mcard__top"><h4>' + head + '</h4></div>' +
        '<div class="mcard__rows">' + rest + '</div>' +
        '<div class="mcard__acts">' + entityActions(entity, r) + '</div></div>';
    }).join('');
  }
}

/** أزرار الإجراءات */
function entityActions(entity, row) {
  let html = '';
  if (entity === 'lessons' && row.video_url) {
    html += '<button type="button" class="icon-btn icon-btn--view" title="معاينة" onclick="previewLesson(\'' + row.id + '\')"><i class="fa-solid fa-eye"></i></button>';
  }
  if (entity === 'announcements' && row.body) {
    html += '<button type="button" class="icon-btn icon-btn--view" title="عرض" onclick="viewAnnouncement(\'' + row.id + '\')"><i class="fa-solid fa-expand"></i></button>';
  }
  if (entity === 'exams') {
    html += '<button type="button" class="icon-btn icon-btn--view" title="عرض الأسئلة" onclick="viewExamQuestions(\'' + row.id + '\')"><i class="fa-solid fa-list-check"></i></button>';
  }
  html += '<button type="button" class="icon-btn icon-btn--edit" title="تعديل" onclick="openAdminModal(\'' + entity + '\',\'' + row.id + '\')"><i class="fa-solid fa-pen"></i></button>';
  html += '<button type="button" class="icon-btn icon-btn--del" title="حذف" onclick="deleteEntity(\'' + entity + '\',\'' + row.id + '\')"><i class="fa-solid fa-trash-can"></i></button>';
  return html;
}

/** البحث داخل التبويب */
function filterRows(rows, entity) {
  const term = String(ADMIN_DATA.searchTerm || '').trim().toLowerCase();
  if (!term) return rows;
  return rows.filter(function (r) {
    const hay = [r.title, r.description, r.body, r.grade, r.teacher, r.phone, r.email, r.full_name, r.notes]
      .concat(entity === 'lessons' || entity === 'exams' || entity === 'homeworks' ? [courseName(r.course_id)] : [])
      .join(' ').toLowerCase();
    return hay.indexOf(term) !== -1;
  });
}
function onAdminSearch(value) {
  ADMIN_DATA.searchTerm = value;
  renderTab();
}

/* ─────────────────────────────────────────────────────────────
   تبويب الطلاب + الاشتراكات
   ───────────────────────────────────────────────────────────── */
function renderStudentsTab() {
  const enBox = document.getElementById('enrollmentsList');
  const stBox = document.getElementById('studentsTableWrap');
  const stMobile = document.getElementById('studentsCards');
  const term = String(ADMIN_DATA.searchTerm || '').trim().toLowerCase();

  /* 1) طلبات الاشتراك */
  if (enBox) {
    const enr = ADMIN_DATA.enrollments.filter(function (e) {
      if (!term) return true;
      return (courseName(e.course_id) + ' ' + studentName(e.student_id) + ' ' + e.status).toLowerCase().indexOf(term) !== -1;
    });
    if (!enr.length) {
      enBox.innerHTML = '<div class="empty-state empty-state--sm"><i class="fa-regular fa-bell"></i><h4>لا توجد طلبات اشتراك</h4><p>ستظهر هنا طلبات الطلاب فور إرسالها.</p></div>';
    } else {
      enBox.innerHTML = enr.map(function (e) {
        const st = STATUS_BADGE[e.status] || STATUS_BADGE.pending;
        const s = ADMIN_DATA.students.find(function (x) { return x.id === e.student_id; }) || {};
        return '' +
          '<div class="task-item">' +
            '<span class="task-item__ic"><i class="fa-solid fa-user-graduate"></i></span>' +
            '<div class="task-item__main">' +
              '<h5>' + escapeHtml(s.full_name || studentName(e.student_id)) + ' <span class="badge ' + st[0] + '">' + st[1] + '</span></h5>' +
              '<p>' + escapeHtml(courseName(e.course_id)) + (s.grade ? ' · ' + escapeHtml(s.grade) : '') + (s.phone ? ' · <span dir="ltr">' + escapeHtml(s.phone) + '</span>' : '') + '</p>' +
              '<div class="task-item__meta">' +
                '<span class="pill"><i class="fa-regular fa-calendar"></i> ' + timeAgo(e.created_at) + '</span>' +
                (e.payment_ref ? '<span class="pill pill--gold"><i class="fa-solid fa-receipt"></i> ' + escapeHtml(e.payment_ref) + '</span>' : '') +
                '<span class="pill mono"><i class="fa-solid fa-fingerprint"></i> ' + escapeHtml(String(e.id).slice(0, 8)) + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="tbl__actions" style="flex-direction:column">' +
              (e.status !== 'approved' ? '<button type="button" class="icon-btn icon-btn--ok" title="قبول" onclick="setEnrollmentStatus(\'' + e.id + '\',\'approved\')"><i class="fa-solid fa-check"></i></button>' : '') +
              (e.status !== 'rejected' ? '<button type="button" class="icon-btn icon-btn--del" title="رفض" onclick="setEnrollmentStatus(\'' + e.id + '\',\'rejected\')"><i class="fa-solid fa-xmark"></i></button>' : '') +
              '<button type="button" class="icon-btn icon-btn--del" title="حذف الاشتراك" onclick="deleteEnrollment(\'' + e.id + '\')"><i class="fa-solid fa-trash-can"></i></button>' +
            '</div>' +
          '</div>';
      }).join('');
    }
  }

  /* 2) جدول الطلاب */
  const students = ADMIN_DATA.students.filter(function (s) {
    if (!term) return true;
    return ((s.full_name || '') + ' ' + (s.phone || '') + ' ' + (s.email || '') + ' ' + (s.grade || '')).toLowerCase().indexOf(term) !== -1;
  });

  if (stBox) {
    stBox.innerHTML = students.length ? '<table class="tbl"><thead><tr>' +
      '<th>الطالب</th><th>الصف</th><th>الهاتف</th><th>هاتف ولي الأمر</th><th>البريد</th><th>الكورسات</th><th>الحالة</th><th>التسجيل</th><th style="text-align:left">إجراءات</th>' +
      '</tr></thead><tbody>' +
      students.map(function (s) {
        const count = ADMIN_DATA.enrollments.filter(function (e) { return e.student_id === s.id && e.status === 'approved'; }).length;
        const st = STATUS_BADGE[s.status] || STATUS_BADGE.active;
        return '<tr>' +
          '<td><strong>' + escapeHtml(s.full_name || '—') + '</strong><br><small class="muted">' + (s.gender === 'female' ? 'طالبة' : 'طالب') + '</small></td>' +
          '<td><span class="badge badge--gold">' + escapeHtml(s.grade || '—') + '</span></td>' +
          '<td dir="ltr" class="mono">' + escapeHtml(s.phone || '—') + '</td>' +
          '<td dir="ltr" class="mono">' + escapeHtml(s.parent_phone || '—') + '</td>' +
          '<td dir="ltr" class="truncate">' + escapeHtml(s.email || '—') + '</td>' +
          '<td class="mono">' + count + '</td>' +
          '<td><span class="badge ' + st[0] + '">' + st[1] + '</span></td>' +
          '<td class="muted nowrap">' + formatShortDate(s.created_at) + '</td>' +
          '<td><div class="tbl__actions">' +
            '<button type="button" class="icon-btn icon-btn--view" title="مراسلة" onclick="messageStudent(\'' + s.id + '\')"><i class="fa-regular fa-comment-dots"></i></button>' +
            '<a class="icon-btn icon-btn--edit" title="اتصال" href="tel:' + escapeHtml(s.phone || '') + '"><i class="fa-solid fa-phone"></i></a>' +
            '<button type="button" class="icon-btn icon-btn--edit" title="' + (s.status === 'suspended' ? 'إعادة تفعيل' : 'إيقاف') + '" onclick="toggleStudentStatus(\'' + s.id + '\')"><i class="fa-solid fa-' + (s.status === 'suspended' ? 'unlock' : 'ban') + '"></i></button>' +
            '<button type="button" class="icon-btn icon-btn--del" title="حذف السجل" onclick="deleteStudentRecord(\'' + s.id + '\')"><i class="fa-solid fa-trash-can"></i></button>' +
          '</div></td></tr>';
      }).join('') + '</tbody></table>'
      : '<div class="empty-state empty-state--sm"><i class="fa-regular fa-user"></i><h4>لا يوجد طلاب</h4></div>';
  }

  if (stMobile) {
    stMobile.innerHTML = students.map(function (s) {
      const count = ADMIN_DATA.enrollments.filter(function (e) { return e.student_id === s.id && e.status === 'approved'; }).length;
      const st = STATUS_BADGE[s.status] || STATUS_BADGE.active;
      return '<div class="mcard">' +
        '<div class="mcard__top"><h4>' + escapeHtml(s.full_name || '—') + '</h4><span class="badge ' + st[0] + '">' + st[1] + '</span></div>' +
        '<div class="mcard__rows">' +
          '<div><b>الصف:</b><span>' + escapeHtml(s.grade || '—') + '</span></div>' +
          '<div><b>الهاتف:</b><span dir="ltr">' + escapeHtml(s.phone || '—') + '</span></div>' +
          '<div><b>ولي الأمر:</b><span dir="ltr">' + escapeHtml(s.parent_phone || '—') + '</span></div>' +
          '<div><b>البريد:</b><span dir="ltr">' + escapeHtml(truncate(s.email || '—', 32)) + '</span></div>' +
          '<div><b>كورسات مُفعّلة:</b><span>' + count + '</span></div>' +
          '<div><b>التسجيل:</b><span>' + formatShortDate(s.created_at) + '</span></div>' +
        '</div>' +
        '<div class="mcard__acts">' +
          '<button type="button" class="icon-btn icon-btn--view" onclick="messageStudent(\'' + s.id + '\')"><i class="fa-regular fa-comment-dots"></i></button>' +
          '<a class="icon-btn icon-btn--edit" href="tel:' + escapeHtml(s.phone || '') + '"><i class="fa-solid fa-phone"></i></a>' +
          '<button type="button" class="icon-btn icon-btn--edit" onclick="toggleStudentStatus(\'' + s.id + '\')"><i class="fa-solid fa-ban"></i></button>' +
          '<button type="button" class="icon-btn icon-btn--del" onclick="deleteStudentRecord(\'' + s.id + '\')"><i class="fa-solid fa-trash-can"></i></button>' +
        '</div></div>';
    }).join('') || '<div class="empty-state empty-state--sm"><h4>لا يوجد طلاب</h4></div>';
  }
}

/** قبول / رفض اشتراك */
async function setEnrollmentStatus(enrollmentId, status) {
  try {
    const { error } = await supabaseClient.from('enrollments')
      .update({ status: status, reviewed_at: new Date().toISOString(), reviewed_by: APP.user ? APP.user.id : null })
      .eq('id', enrollmentId);
    if (error) throw error;
    const row = ADMIN_DATA.enrollments.find(function (e) { return e.id === enrollmentId; });
    if (row) row.status = status;
    showToast(status === 'approved' ? 'تم قبول الاشتراك ✅' : 'تم رفض الاشتراك', status === 'approved' ? 'success' : 'warn');
    renderAdminStats(); updateTabCounts(); renderStudentsTab();
  } catch (err) { showToast(translateError(err), 'error'); }
}

/** حذف اشتراك */
async function deleteEnrollment(enrollmentId) {
  if (!window.confirm('حذف هذا الاشتراك نهائيًا؟')) return;
  try {
    const { error } = await supabaseClient.from('enrollments').delete().eq('id', enrollmentId);
    if (error) throw error;
    ADMIN_DATA.enrollments = ADMIN_DATA.enrollments.filter(function (e) { return e.id !== enrollmentId; });
    showToast('تم حذف الاشتراك', 'info');
    renderAdminStats(); updateTabCounts(); renderStudentsTab();
  } catch (err) { showToast(translateError(err), 'error'); }
}

/** إيقاف / تفعيل طالب */
async function toggleStudentStatus(studentId) {
  const s = ADMIN_DATA.students.find(function (x) { return x.id === studentId; });
  if (!s) return;
  const next = s.status === 'suspended' ? 'active' : 'suspended';
  try {
    const { error } = await supabaseClient.from('students').update({ status: next }).eq('id', studentId);
    if (error) throw error;
    s.status = next;
    showToast(next === 'active' ? 'تم تفعيل الطالب' : 'تم إيقاف الطالب', next === 'active' ? 'success' : 'warn');

    // لو أُوقف → إنهاء جلسته
    if (next === 'suspended') {
      try { await supabaseClient.from('user_sessions').update({ is_active: false }).eq('user_id', studentId); } catch (e) {}
    }
    renderStudentsTab();
  } catch (err) { showToast(translateError(err), 'error'); }
}

/** حذف سجل طالب */
async function deleteStudentRecord(studentId) {
  if (!window.confirm('حذف سجل الطالب؟ (لن يُحذف حساب المصادقة نفسه)')) return;
  try {
    const { error } = await supabaseClient.from('students').delete().eq('id', studentId);
    if (error) throw error;
    ADMIN_DATA.students = ADMIN_DATA.students.filter(function (s) { return s.id !== studentId; });
    showToast('تم حذف سجل الطالب', 'info');
    renderAdminStats(); updateTabCounts(); renderStudentsTab();
  } catch (err) { showToast(translateError(err), 'error'); }
}

/** فتح شات مع طالب محدد */
function messageStudent(studentId) {
  openChatModal();
  setTimeout(function () { selectChatThread(studentId, true); }, 350);
}

/* ─────────────────────────────────────────────────────────────
   المودال الموحّد — فتح / إغلاق / بناء النموذج
   ───────────────────────────────────────────────────────────── */
let ADMIN_MODAL_ENTITY = null;
let ADMIN_MODAL_ID = null;

async function openAdminModal(entity, id) {
  const schema = FORM_SCHEMAS[entity];
  if (!schema) return;

  ADMIN_MODAL_ENTITY = entity;
  ADMIN_MODAL_ID = id || null;

  const titleEl = document.getElementById('adminModalTitle');
  const kickerEl = document.getElementById('adminModalKicker');
  const bodyEl = document.getElementById('adminModalBody');
  if (titleEl) titleEl.textContent = (id ? 'تعديل ' : 'إضافة ') + schema.title;
  if (kickerEl) kickerEl.innerHTML = '<i class="fa-solid ' + schema.icon + '"></i> ' + escapeHtml(schema.title);

  // صف موجود؟
  let row = null;
  if (id) row = (ADMIN_DATA[entity] || []).find(function (r) { return r.id === id; }) || null;

  if (bodyEl) bodyEl.innerHTML = buildForm(schema.fields, row, entity);

  // تهيئة محرر الأسئلة
  if (entity === 'exams') initQuestionsEditor(row && Array.isArray(row.questions) ? row.questions : []);

  openModal('adminModal');
}

function closeAdminModal() {
  closeModal('adminModal');
  ADMIN_MODAL_ENTITY = null;
  ADMIN_MODAL_ID = null;
}

/** بناء حقول النموذج */
function buildForm(fields, row, entity) {
  let html = '<form id="adminForm" class="form-grid form-grid--2" onsubmit="saveEntity(event)"><div class="form-section form-grid form-grid--2" style="grid-column:1/-1;display:contents">';

  fields.forEach(function (f) {
    const value = row ? row[f.key] : (f.default !== undefined ? f.default : '');
    const colClass = f.col === 'full' ? 'field field--full' : 'field';
    const req = f.required ? '<span class="req">*</span>' : '';
    let control = '';

    if (f.type === 'textarea') {
      control = '<textarea class="field__input" id="af_' + f.key + '" name="' + f.key + '" placeholder="' + escapeHtml(f.placeholder || '') + '"' + (f.required ? ' required' : '') + '>' + escapeHtml(value == null ? '' : value) + '</textarea>';
    } else if (f.type === 'select') {
      const opts = typeof f.options === 'function' ? f.options() : (f.options || []);
      control = '<select class="field__input" id="af_' + f.key + '" name="' + f.key + '"' + (f.required ? ' required' : '') + '>' +
        '<option value="">' + escapeHtml(f.emptyLabel || f.placeholder || '— اختر —') + '</option>' +
        opts.map(function (o) {
          return '<option value="' + escapeHtml(o.value) + '"' + (String(value) === String(o.value) ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>';
        }).join('') + '</select>';
    } else if (f.type === 'checkbox') {
      control = '<label class="check-row"><input type="checkbox" id="af_' + f.key + '" name="' + f.key + '"' + (value ? ' checked' : '') + ' /><i class="box"><i class="fa-solid fa-check"></i></i><span>' + escapeHtml(f.label) + '</span></label>';
    } else if (f.type === 'datetime') {
      control = '<input class="field__input" type="datetime-local" id="af_' + f.key + '" name="' + f.key + '" value="' + toLocalInput(value) + '"' + (f.required ? ' required' : '') + ' />';
    } else if (f.type === 'questions') {
      control = '<div class="q-editor" id="questionsEditor"></div>' +
        '<button type="button" class="btn btn--line btn--sm" style="margin-top:10px;justify-self:start" onclick="addQuestion()"><i class="fa-solid fa-plus"></i> إضافة سؤال</button>';
    } else {
      control = '<input class="field__input" type="' + (f.type === 'number' ? 'number' : (f.type === 'url' ? 'url' : 'text')) + '"' +
        ' id="af_' + f.key + '" name="' + f.key + '" value="' + escapeHtml(value == null ? '' : value) + '"' +
        ' placeholder="' + escapeHtml(f.placeholder || '') + '"' +
        (f.min !== undefined ? ' min="' + f.min + '"' : '') +
        (f.type === 'number' ? ' step="any"' : '') +
        (f.type === 'url' ? ' dir="ltr"' : '') +
        (f.required ? ' required' : '') + ' />';
    }

    const labelHtml = f.type === 'checkbox' ? '' :
      '<label class="field__label" for="af_' + f.key + '"><i class="fa-solid ' + (iconForType(f.type)) + '"></i> ' + escapeHtml(f.label) + ' ' + req + '</label>';

    html += '<div class="' + colClass + '">' + labelHtml + control +
      (f.hint ? '<span class="field__hint"><i class="fa-regular fa-circle-question"></i> ' + escapeHtml(f.hint) + '</span>' : '') +
      '<span class="field__err"></span></div>';
  });

  html += '</div>' +
    '<div class="field--full" style="grid-column:1/-1;display:flex;gap:9px;justify-content:flex-end;margin-top:8px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn--line" onclick="closeAdminModal()"><i class="fa-solid fa-xmark"></i> إلغاء</button>' +
      '<button type="submit" class="btn btn--gold" id="adminSaveBtn"><i class="fa-solid fa-floppy-disk"></i> ' + (row ? 'حفظ التعديلات' : 'إضافة') + '</button>' +
    '</div></form>';

  return html;
}

function iconForType(t) {
  if (t === 'textarea') return 'fa-align-right';
  if (t === 'select') return 'fa-list';
  if (t === 'number') return 'fa-hashtag';
  if (t === 'url') return 'fa-link';
  if (t === 'datetime') return 'fa-calendar-days';
  if (t === 'questions') return 'fa-circle-question';
  if (t === 'checkbox') return 'fa-check';
  return 'fa-pen';
}

/** تحويل ISO إلى قيمة datetime-local */
function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const pad = function (n) { return n < 10 ? '0' + n : String(n); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
/** تحويل datetime-local إلى ISO */
function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/* ─────────────────────────────────────────────────────────────
   محرر الأسئلة (للإمتحانات)
   ───────────────────────────────────────────────────────────── */
function initQuestionsEditor(questions) {
  const box = document.getElementById('questionsEditor');
  if (!box) return;
  box.innerHTML = '';
  (questions && questions.length ? questions : []).forEach(function (q) { addQuestion(q); });
  if (!questions || !questions.length) addQuestion();
}

function addQuestion(q) {
  const box = document.getElementById('questionsEditor');
  if (!box) return;
  const idx = box.children.length;
  const data = q || { question: '', options: ['', '', '', ''], correct: 0 };
  const opts = Array.isArray(data.options) && data.options.length ? data.options : ['', '', '', ''];
  const letters = ['أ', 'ب', 'ج', 'د'];

  const el = document.createElement('div');
  el.className = 'q-item';
  el.innerHTML = '' +
    '<div class="q-item__head">' +
      '<span class="q-item__num">' + (idx + 1) + '</span>' +
      '<input type="text" class="q-text" placeholder="نص السؤال" value="' + escapeHtml(data.question || '') + '" />' +
    '</div>' +
    '<div class="q-opts">' +
      opts.slice(0, 4).map(function (o, i) {
        return '<div class="q-opt">' +
          '<label><input type="radio" name="q_correct_' + idx + '" class="q-correct" value="' + i + '"' + (Number(data.correct) === i ? ' checked' : '') + ' /> ' + letters[i] + '</label>' +
          '<input type="text" class="q-option" placeholder="الاختيار ' + letters[i] + '" value="' + escapeHtml(o || '') + '" />' +
        '</div>';
      }).join('') +
    '</div>' +
    '<div class="q-item__foot">' +
      '<button type="button" class="icon-btn icon-btn--del" title="حذف السؤال" onclick="removeQuestion(this)"><i class="fa-solid fa-trash-can"></i></button>' +
    '</div>';
  box.appendChild(el);
  renumberQuestions();
}

function removeQuestion(btn) {
  const item = btn.closest('.q-item');
  if (item && item.parentNode) item.parentNode.removeChild(item);
  renumberQuestions();
}

function renumberQuestions() {
  const box = document.getElementById('questionsEditor');
  if (!box) return;
  Array.prototype.forEach.call(box.children, function (item, i) {
    const num = item.querySelector('.q-item__num');
    if (num) num.textContent = String(i + 1);
    // إعادة تسمية الـ radio groups
    item.querySelectorAll('input.q-correct').forEach(function (r) { r.name = 'q_correct_' + i; });
  });
}

/** جمع الأسئلة من المحرر */
function collectQuestions() {
  const box = document.getElementById('questionsEditor');
  if (!box) return [];
  const out = [];
  Array.prototype.forEach.call(box.children, function (item) {
    const text = (item.querySelector('.q-text') || {}).value || '';
    const opts = Array.prototype.map.call(item.querySelectorAll('.q-option'), function (i) { return i.value.trim(); });
    const checked = item.querySelector('.q-correct:checked');
    if (!text.trim()) return;
    out.push({
      question: text.trim(),
      options: opts,
      correct: checked ? Number(checked.value) : 0
    });
  });
  return out;
}

/* ─────────────────────────────────────────────────────────────
   حفظ (إضافة / تعديل)
   ───────────────────────────────────────────────────────────── */
async function saveEntity(e) {
  if (e) e.preventDefault();
  const entity = ADMIN_MODAL_ENTITY;
  const id = ADMIN_MODAL_ID;
  const schema = FORM_SCHEMAS[entity];
  if (!schema) return;

  const btn = document.getElementById('adminSaveBtn');
  const payload = {};
  let valid = true;

  schema.fields.forEach(function (f) {
    const el = document.getElementById('af_' + f.key);
    if (!el) return;
    let v;
    if (f.type === 'checkbox') v = el.checked;
    else if (f.type === 'datetime') v = fromLocalInput(el.value);
    else if (f.type === 'number') v = el.value === '' ? null : Number(el.value);
    else v = String(el.value || '').trim();

    if (f.required && (v === '' || v === null || v === undefined)) {
      valid = false;
      setFieldState(el, false, 'هذا الحقل مطلوب');
    } else if (f.type === 'url' && v && !/^https?:\/\//i.test(v)) {
      valid = false;
      setFieldState(el, false, 'الرابط يجب أن يبدأ بـ http:// أو https://');
    } else {
      setFieldState(el, true);
    }
    if (f.key !== 'questions') payload[f.key] = v === '' ? null : v;
  });

  // الأسئلة
  if (entity === 'exams') {
    const qs = collectQuestions();
    payload.questions = qs;
    if (!qs.length) { valid = false; showToast('أضف سؤالًا واحدًا على الأقل', 'warn'); }
    qs.forEach(function (q, i) {
      if (!q.question || q.options.filter(Boolean).length < 2) {
        valid = false;
        showToast('السؤال رقم ' + (i + 1) + ' غير مكتمل (النص + اختيارين على الأقل)', 'warn');
      }
    });
  }

  if (!valid) { showToast('راجع الحقول المطلوبة', 'error', 3500); return; }

  // تواريخ الامتحان
  if (entity === 'exams' && payload.starts_at && payload.expires_at &&
      new Date(payload.starts_at) >= new Date(payload.expires_at)) {
    showToast('موعد الانتهاء يجب أن يكون بعد موعد البداية', 'error', 4500);
    return;
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جارِ الحفظ…'; }

  try {
    let error;
    if (id) {
      const res = await supabaseClient.from(entity).update(payload).eq('id', id);
      error = res.error;
    } else {
      payload.created_at = new Date().toISOString();
      const res = await supabaseClient.from(entity).insert(payload);
      error = res.error;
    }
    if (error) throw error;

    showToast(id ? 'تم حفظ التعديلات ✅' : 'تمت الإضافة بنجاح ✅', 'success');
    closeAdminModal();

    // مسح الكاش المتأثر
    if (entity === 'lessons' && payload.course_id) APP.lessonsCache = {};
    await loadAdminData(true);
    if (entity === 'courses' || entity === 'lessons' || entity === 'announcements') {
      if (typeof loadCourses === 'function') loadCourses();
      if (typeof loadAnnouncements === 'function') loadAnnouncements();
    }
  } catch (err) {
    showToast(translateError(err), 'error', 5500);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ' + (id ? 'حفظ التعديلات' : 'إضافة'); }
  }
}

/* ─────────────────────────────────────────────────────────────
   حذف
   ───────────────────────────────────────────────────────────── */
const ENTITY_NAMES = {
  courses: 'الكورس', lessons: 'الدرس', exams: 'الامتحان',
  homeworks: 'الواجب', announcements: 'الإعلان'
};

async function deleteEntity(entity, id) {
  const row = (ADMIN_DATA[entity] || []).find(function (r) { return r.id === id; });
  const name = row ? (row.title || ENTITY_NAMES[entity]) : ENTITY_NAMES[entity];
  const warn = entity === 'courses' ? '\n⚠️ سيُحذف أيضًا كل الدروس والامتحانات والواجبات المرتبطة به.' : '';
  if (!window.confirm('تأكيد حذف «' + name + '» نهائيًا؟' + warn)) return;

  try {
    const { error } = await supabaseClient.from(entity).delete().eq('id', id);
    if (error) throw error;
    ADMIN_DATA[entity] = (ADMIN_DATA[entity] || []).filter(function (r) { return r.id !== id; });
    if (entity === 'courses') {
      ADMIN_DATA.lessons = ADMIN_DATA.lessons.filter(function (l) { return l.course_id !== id; });
      ADMIN_DATA.exams = ADMIN_DATA.exams.filter(function (x) { return x.course_id !== id; });
      ADMIN_DATA.homeworks = ADMIN_DATA.homeworks.filter(function (h) { return h.course_id !== id; });
      ADMIN_DATA.enrollments = ADMIN_DATA.enrollments.filter(function (e) { return e.course_id !== id; });
    }
    showToast('تم حذف «' + name + '»', 'info');
    renderAdminStats(); updateTabCounts(); renderTab();
  } catch (err) { showToast(translateError(err), 'error', 5000); }
}

/* ─────────────────────────────────────────────────────────────
   معاينات سريعة
   ───────────────────────────────────────────────────────────── */
function previewLesson(lessonId) {
  const l = ADMIN_DATA.lessons.find(function (x) { return x.id === lessonId; });
  if (!l) return;
  APP.currentCourse = ADMIN_DATA.courses.find(function (c) { return c.id === l.course_id; }) || { title: 'معاينة' };
  APP.currentLessons = [l];
  APP.currentLessonIndex = 0;
  if (typeof openPlayer === 'function') openPlayer(l);
}

function viewAnnouncement(id) {
  const a = ADMIN_DATA.announcements.find(function (x) { return x.id === id; });
  if (!a) return;
  showInfoModal(a.title || 'إعلان',
    '<p style="white-space:pre-wrap;line-height:1.9">' + escapeHtml(a.body || '') + '</p>' +
    '<p class="muted" style="margin-top:14px;font-size:.8rem"><i class="fa-regular fa-calendar"></i> ' +
    formatDate(a.created_at, true) + (a.grade ? ' · ' + escapeHtml(a.grade) : ' · كل الصفوف') + '</p>');
}

function viewExamQuestions(id) {
  const x = ADMIN_DATA.exams.find(function (r) { return r.id === id; });
  if (!x) return;
  const qs = Array.isArray(x.questions) ? x.questions : [];
  const letters = ['أ', 'ب', 'ج', 'د'];
  const body = qs.length ? qs.map(function (q, i) {
    return '<div class="q-item"><div class="q-item__head"><span class="q-item__num">' + (i + 1) + '</span>' +
      '<strong style="font-size:.9rem">' + escapeHtml(q.question || '') + '</strong></div>' +
      '<div class="q-opts">' + (q.options || []).map(function (o, j) {
        const ok = Number(q.correct) === j;
        return '<div class="q-opt" style="' + (ok ? 'color:var(--ok);font-weight:700' : '') + '">' +
          '<span style="min-width:22px">' + letters[j] + '</span><span>' + escapeHtml(o) + '</span>' +
          (ok ? '<i class="fa-solid fa-circle-check" style="margin-inline-start:auto"></i>' : '') + '</div>';
      }).join('') + '</div></div>';
  }).join('') : '<p class="muted">لا توجد أسئلة.</p>';

  showInfoModal(x.title || 'الامتحان',
    '<p class="muted" style="font-size:.82rem;margin-bottom:14px">' + escapeHtml(courseName(x.course_id)) +
    ' · ' + qs.length + ' سؤال · ' + escapeHtml(humanDuration(x.duration_minutes)) +
    ' · ينتهي ' + formatDate(x.expires_at, true) + '</p>' + body);
}

/* ─────────────────────────────────────────────────────────────
   تنظيف الامتحانات المنتهية — كل 5 دقائق
   ───────────────────────────────────────────────────────────── */
async function cleanupExpiredExams(silent) {
  try {
    const cutoff = new Date().toISOString();
    const expired = ADMIN_DATA.exams.filter(function (x) {
      return x.expires_at && new Date(x.expires_at).getTime() < Date.now();
    });
    if (!expired.length) return 0;

    // تعليمها كمنتهية (بدون حذف البيانات) + حذف الصفوف التي انقضت منذ أكثر من 30 يومًا
    const veryOld = expired.filter(function (x) {
      return (Date.now() - new Date(x.expires_at).getTime()) > 30 * 24 * 60 * 60 * 1000;
    });

    for (const x of veryOld) {
      await supabaseClient.from('exams').delete().eq('id', x.id);
      ADMIN_DATA.exams = ADMIN_DATA.exams.filter(function (r) { return r.id !== x.id; });
    }

    if (!silent && veryOld.length) {
      showToast('تم تنظيف ' + veryOld.length + ' امتحان منتهي منذ أكثر من ٣٠ يومًا', 'info');
    }
    renderAdminStats(); updateTabCounts();
    if (ADMIN_DATA.activeTab === 'exams') renderEntityTable('exams');
    return veryOld.length;
  } catch (e) { return 0; }
}

function startExamsCleanup() {
  if (ADMIN_DATA.cleanupTimer) clearInterval(ADMIN_DATA.cleanupTimer);
  ADMIN_DATA.cleanupTimer = setInterval(function () { cleanupExpiredExams(true); }, 5 * 60 * 1000);
}

/* ─────────────────────────────────────────────────────────────
   تهيئة لوحة التحكم
   ───────────────────────────────────────────────────────────── */
async function initAdmin() {
  const admin = await requireAdmin();
  if (!admin) return;

  const nameEl = document.getElementById('adminUserName');
  if (nameEl) nameEl.textContent = admin.full_name || CONFIG.TEACHER.name;
  const roleEl = document.getElementById('adminRole');
  if (roleEl) roleEl.textContent = admin.role === 'super' ? 'مدير عام' : 'إدارة';

  await loadAdminData();
  switchAdminTab('courses');
  startExamsCleanup();

  // تهيئة الشات للأدمن
  if (typeof initChat === 'function') initChat();

  // Realtime للاشتراكات الجديدة
  try {
    supabaseClient.channel('admin_enrollments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'enrollments' }, function () {
        showToast('🔔 طلب اشتراك جديد من طالب', 'gold', 4500);
        loadAdminData(true);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'students' }, function () {
        showToast('🔔 طالب جديد سجّل في المنصة', 'gold', 4500);
        loadAdminData(true);
      })
      .subscribe();
  } catch (e) {}

  showToast('مرحبًا ' + (admin.full_name || '') + ' — لوحة التحكم جاهزة', 'gold', 4000);
}
