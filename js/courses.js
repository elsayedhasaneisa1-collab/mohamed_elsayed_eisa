/* ═══════════════════════════════════════════════════════════════
   js/courses.js — الكورسات، الإعلانات، الاشتراكات، الملف الشخصي
   الدوال: loadCourses · renderCourseCard · renderCourses · loadAnnouncements
          enroll · switchTab · renderMyCourses · renderProfile
          viewCourseLessons · playLesson · loadStudentTasks
   ═══════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────
   جلب الكورسات
   ───────────────────────────────────────────────────────────── */
async function loadCourses() {
  const grid = document.getElementById('coursesGrid');
  const loader = document.getElementById('coursesLoader');
  const empty = document.getElementById('coursesEmpty');

  if (loader) loader.hidden = false;
  if (empty) empty.hidden = true;

  try {
    const { data, error } = await supabaseClient
      .from('courses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    APP.courses = data || [];

    // عدد الدروس لكل كورس
    if (APP.courses.length) {
      const { data: lessons } = await supabaseClient.from('lessons').select('id,course_id');
      const counts = {};
      (lessons || []).forEach(function (l) { counts[l.course_id] = (counts[l.course_id] || 0) + 1; });
      APP.courses.forEach(function (c) { c._lessonsCount = counts[c.id] || c.lessons_count || 0; });
    }

    renderCourses();
    renderMyCourses();
    updateCoursesCount();
  } catch (err) {
    console.warn('[courses] loadCourses:', err);
    if (grid) grid.innerHTML = '';
    if (empty) {
      empty.hidden = false;
      empty.innerHTML = '<i class="fa-solid fa-plug-circle-exclamation"></i>' +
        '<h4>تعذّر تحميل الكورسات</h4><p>' + escapeHtml(translateError(err)) + '</p>' +
        '<button type="button" class="btn btn--gold btn--sm" onclick="loadCourses()"><i class="fa-solid fa-rotate-right"></i> إعادة المحاولة</button>';
    }
  } finally {
    if (loader) loader.hidden = true;
  }
}

/** رسم شبكة الكورسات حسب الفلتر النشط */
function renderCourses() {
  const grid = document.getElementById('coursesGrid');
  const empty = document.getElementById('coursesEmpty');
  if (!grid) return;

  const grade = APP.activeGrade || 'all';
  const list = APP.courses.filter(function (c) {
    return grade === 'all' || (c.grade || '') === grade;
  });

  if (!list.length) {
    grid.innerHTML = '';
    if (empty) {
      empty.hidden = false;
      if (!empty.dataset.custom) {
        empty.innerHTML = '<i class="fa-regular fa-folder-open"></i>' +
          '<h4>لا توجد كورسات بهذا التصنيف حاليًا</h4>' +
          '<p>تابع قسم الإعلانات لمعرفة مواعيد نزول الكورسات الجديدة.</p>';
      }
    }
    return;
  }
  if (empty) { empty.hidden = true; delete empty.dataset.custom; }

  grid.innerHTML = list.map(function (c, i) {
    return renderCourseCard(c, i);
  }).join('');

  // إعادة تفعيل كشف الظهور للكروت الجديدة
  if (typeof observeReveals === 'function') observeReveals();
}

/* ─────────────────────────────────────────────────────────────
   بطاقة الكورس
   ───────────────────────────────────────────────────────────── */
function renderCourseCard(course, index) {
  const id = course.id;
  const title = escapeHtml(course.title || 'كورس بدون عنوان');
  const desc = escapeHtml(truncate(course.description || 'لا يوجد وصف لهذا الكورس.', 110));
  const grade = escapeHtml(course.grade || '—');
  const lessons = Number(course._lessonsCount || course.lessons_count || 0);
  const price = Number(course.price || 0);
  const priceHtml = price > 0
    ? '<span class="course-card__price">' + price + ' ج.م</span>'
    : '<span class="course-card__price is-free">مجاني</span>';

  const thumb = course.thumbnail
    ? '<img src="' + escapeHtml(course.thumbnail) + '" alt="' + title + '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'" />' +
      '<span class="course-card__thumb-fallback" style="display:none">' + escapeHtml(initialOf(course.title)) + '</span>'
    : '<span class="course-card__thumb-fallback">' + escapeHtml(initialOf(course.title)) + '</span>';

  // حالة الاشتراك
  const enr = findEnrollment(id);
  let statusHtml = '';
  let actionHtml = '';

  if (!APP.user) {
    statusHtml = '<span class="course-status course-status--locked"><i class="fa-solid fa-lock"></i> سجّل الدخول للاشتراك</span>';
    actionHtml = '<a href="login.html" class="btn btn--gold btn--sm" onclick="event.stopPropagation();"><i class="fa-solid fa-right-to-bracket"></i> اشترك الآن</a>';
  } else if (APP.isAdmin) {
    statusHtml = '<span class="course-status course-status--approved"><i class="fa-solid fa-shield-halved"></i> وصول كامل (إدارة)</span>';
    actionHtml = '<button type="button" class="btn btn--gold btn--sm" onclick="event.stopPropagation();viewCourseLessons(\'' + id + '\')"><i class="fa-solid fa-list-ul"></i> الدروس</button>';
  } else if (!enr) {
    statusHtml = '';
    actionHtml = '<button type="button" class="btn btn--gold btn--sm" onclick="event.stopPropagation();enroll(\'' + id + '\')"><i class="fa-solid fa-bolt"></i> اشترك الآن</button>' +
      '<button type="button" class="btn btn--line btn--sm" onclick="event.stopPropagation();viewCourseLessons(\'' + id + '\')"><i class="fa-solid fa-eye"></i> معاينة</button>';
  } else if (enr.status === 'pending') {
    statusHtml = '<span class="course-status course-status--pending"><i class="fa-regular fa-clock"></i> الاشتراك قيد المراجعة</span>';
    actionHtml = '<button type="button" class="btn btn--line btn--sm" onclick="event.stopPropagation();viewCourseLessons(\'' + id + '\')"><i class="fa-solid fa-eye"></i> معاينة الدروس المجانية</button>';
  } else if (enr.status === 'approved') {
    statusHtml = '<span class="course-status course-status--approved"><i class="fa-solid fa-circle-check"></i> مشترك</span>';
    actionHtml = '<button type="button" class="btn btn--gold btn--sm" onclick="event.stopPropagation();viewCourseLessons(\'' + id + '\')"><i class="fa-solid fa-play"></i> ابدأ التعلم</button>';
  } else {
    statusHtml = '<span class="course-status course-status--rejected"><i class="fa-solid fa-circle-xmark"></i> تم رفض الاشتراك</span>';
    actionHtml = '<a href="' + escapeHtml(CONFIG.LINKS.support) + '" target="_blank" rel="noopener noreferrer" class="btn btn--line btn--sm" onclick="event.stopPropagation();"><i class="fa-brands fa-telegram"></i> تواصل مع الدعم</a>';
  }

  return '' +
    '<article class="course-card reveal" style="animation-delay:' + Math.min(index || 0, 8) * 60 + 'ms" data-course-id="' + id + '">' +
      '<div class="course-card__media" data-protect>' +
        thumb +
        '<span class="course-card__grade"><i class="fa-solid fa-graduation-cap"></i> ' + grade + '</span>' +
        priceHtml +
        '<span class="course-card__play"><i class="fa-solid fa-play"></i></span>' +
      '</div>' +
      '<div class="course-card__body">' +
        '<h3 class="course-card__title">' + title + '</h3>' +
        '<p class="course-card__desc">' + desc + '</p>' +
        '<div class="course-card__meta">' +
          '<span><i class="fa-solid fa-film"></i> ' + lessons + ' درس</span>' +
          '<span><i class="fa-solid fa-chalkboard-user"></i> ' + escapeHtml(course.teacher || CONFIG.TEACHER.name) + '</span>' +
          '<span><i class="fa-regular fa-calendar"></i> ' + formatShortDate(course.created_at) + '</span>' +
        '</div>' +
        (statusHtml ? '<div>' + statusHtml + '</div>' : '') +
        '<div class="course-card__foot">' + actionHtml + '</div>' +
      '</div>' +
    '</article>';
}

/** البحث عن اشتراك الطالب في كورس معيّن */
function findEnrollment(courseId) {
  return APP.myEnrollments.find(function (e) { return e.course_id === courseId; }) || null;
}

/** هل الطالب مشترك ومُفعّل؟ */
function isEnrolledApproved(courseId) {
  if (APP.isAdmin) return true;
  const e = findEnrollment(courseId);
  return !!(e && e.status === 'approved');
}

/** تحديث عدّاد كورساتي */
function updateCoursesCount() {
  const approved = APP.myEnrollments.filter(function (e) { return e.status === 'approved'; }).length;
  const badge = document.getElementById('myCoursesCount');
  const bb = document.getElementById('bbMyCourses');
  if (badge) {
    if (approved > 0) { badge.hidden = false; badge.textContent = String(approved); }
    else badge.hidden = true;
  }
  if (bb) bb.hidden = !(approved > 0);
}

/* ─────────────────────────────────────────────────────────────
   الفلترة حسب الصف
   ───────────────────────────────────────────────────────────── */
function buildGradeChips() {
  const wrap = document.getElementById('gradeChips');
  if (!wrap || wrap.dataset.built) return;
  wrap.dataset.built = '1';
  CONFIG.GRADES.forEach(function (g) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.grade = g;
    b.textContent = g;
    b.setAttribute('onclick', "filterByGrade('" + g.replace(/'/g, "\\'") + "', this)");
    wrap.appendChild(b);
  });
}

function filterByGrade(grade, btn) {
  APP.activeGrade = grade || 'all';
  document.querySelectorAll('#gradeChips .chip').forEach(function (c) {
    c.classList.toggle('is-active', c === btn || (!btn && c.dataset.grade === APP.activeGrade));
  });
  renderCourses();
  observeReveals();
}

/* ─────────────────────────────────────────────────────────────
   التبويبات
   ───────────────────────────────────────────────────────────── */
function switchTab(tab, btn, skipScroll) {
  tab = tab || 'allCourses';

  // تحديث الأزرار
  document.querySelectorAll('.tabs__btn').forEach(function (b) {
    b.classList.toggle('is-active', b.dataset.tab === tab);
  });

  // تحديث اللوحات
  ['allCourses', 'myCourses', 'profile'].forEach(function (t) {
    const p = document.getElementById('panel-' + t);
    if (p) p.classList.toggle('is-active', t === tab);
  });

  // فلتر الصفوف يظهر فقط في تبويب "كل الكورسات"
  const chips = document.getElementById('gradeChips');
  if (chips) chips.style.display = tab === 'allCourses' ? '' : 'none';

  storeSet(STORAGE_KEYS.lastTab, tab);

  if (tab === 'myCourses') renderMyCourses();
  if (tab === 'profile') renderProfile();
  if (tab === 'allCourses') renderCourses();

  observeReveals();

  // تحديث أزرار Bottom bar
  document.querySelectorAll('.bottom-bar__btn').forEach(function (b) { b.classList.remove('is-active'); });
  const bb = document.querySelector('.bottom-bar__btn[aria-label="كورسات"],.bottom-bar__btn[aria-label="كورساتي"]');
  if (bb && (tab === 'allCourses' || tab === 'myCourses')) {
    const target = tab === 'myCourses' ? 'كورساتي' : 'كورسات';
    const el = document.querySelector('.bottom-bar__btn[aria-label="' + target + '"]');
    if (el) el.classList.add('is-active');
  }

  if (skipScroll !== true) scrollToSection('#courses');
}

/* ─────────────────────────────────────────────────────────────
   التنقل من شريط الأسفل
   ───────────────────────────────────────────────────────────── */
function bottomNav(target, btn) {
  document.querySelectorAll('.bottom-bar__btn').forEach(function (b) { b.classList.remove('is-active'); });
  if (btn) btn.classList.add('is-active');

  if (target === 'courses') { switchTab('allCourses'); }
  else if (target === 'myCourses') {
    if (!APP.user) { showToast('سجّل الدخول لعرض كورساتك', 'warn'); setTimeout(function () { goTo(CONFIG.PAGES.login); }, 900); return; }
    switchTab('myCourses');
  }
  else if (target === 'chat') { openChatModal(); }
  else if (target === 'about') { scrollToSection('#about'); }
  else if (target === 'support') { scrollToSection('#support'); }
}

/* ─────────────────────────────────────────────────────────────
   الاشتراك في كورس (بانتظار موافقة الأدمن)
   ───────────────────────────────────────────────────────────── */
async function enroll(courseId) {
  if (!APP.user) {
    showToast('سجّل الدخول أولًا للاشتراك في الكورس', 'warn');
    setTimeout(function () { goTo(CONFIG.PAGES.login); }, 900);
    return;
  }
  if (findEnrollment(courseId)) {
    showToast('أنت مشترك بالفعل في هذا الكورس', 'info');
    return;
  }

  const course = APP.courses.find(function (c) { return c.id === courseId; });
  if (!course) return;

  // تأكيد
  const confirmed = window.confirm('تأكيد الاشتراك في «' + (course.title || 'الكورس') + '»؟\nسيُرسل الطلب للأستاذ للموافقة عليه.');
  if (!confirmed) return;

  showToast('جارِ إرسال طلب الاشتراك…', 'info', 2200);

  try {
    const { data, error } = await supabaseClient.from('enrollments').insert({
      student_id: APP.user.id,
      course_id: courseId,
      status: 'pending',
      created_at: new Date().toISOString()
    }).select().maybeSingle();

    if (error) throw error;
    if (data) APP.myEnrollments.push(data);

    showToast('تم إرسال طلب الاشتراك ✅ في انتظار موافقة ' + CONFIG.TEACHER.name, 'success', 6000);
    renderCourses();
    renderMyCourses();
    updateCoursesCount();
  } catch (err) {
    const ar = translateError(err);
    showToast(ar, 'error', 5000);
    if (String(ar).indexOf('صلاحية') !== -1) {
      showInfoModal('تعذّر إرسال الطلب',
        '<p>لم يتمكّن النظام من تسجيل طلبك. تواصل مع الدعم الفني على تيليجرام وسنقوم بالاشتراك لك يدويًا.</p>' +
        '<p style="margin-top:12px"><a class="btn btn--gold btn--sm" href="' + escapeHtml(CONFIG.LINKS.support) +
        '" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-telegram"></i> الدعم الفني</a></p>');
    }
  }
}

/* ─────────────────────────────────────────────────────────────
   جلب اشتراكات الطالب
   ───────────────────────────────────────────────────────────── */
async function loadMyEnrollments() {
  if (!APP.user) { APP.myEnrollments = []; updateCoursesCount(); return; }
  try {
    const { data, error } = await supabaseClient
      .from('enrollments')
      .select('id,course_id,status,created_at,payment_ref')
      .eq('student_id', APP.user.id);
    if (error) throw error;
    APP.myEnrollments = data || [];
    updateCoursesCount();
  } catch (err) {
    console.warn('[courses] loadMyEnrollments:', err);
    APP.myEnrollments = [];
  }
}

/* ─────────────────────────────────────────────────────────────
   كورساتي
   ───────────────────────────────────────────────────────────── */
async function renderMyCourses() {
  const grid = document.getElementById('myCoursesGrid');
  const empty = document.getElementById('myCoursesEmpty');
  const loader = document.getElementById('myCoursesLoader');
  if (!grid) return;

  if (!APP.user) {
    grid.innerHTML = '';
    if (loader) loader.hidden = true;
    if (empty) {
      empty.hidden = false;
      empty.innerHTML = '<i class="fa-solid fa-user-lock"></i><h4>سجّل الدخول لعرض كورساتك</h4>' +
        '<p>بعد تسجيل الدخول ستظهر هنا كل الكورسات التي اشتركت فيها وحالة كل طلب.</p>' +
        '<div style="display:flex;gap:9px;justify-content:center;flex-wrap:wrap;margin-top:16px">' +
        '<a href="login.html" class="btn btn--gold btn--sm"><i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول</a>' +
        '<a href="register.html" class="btn btn--line btn--sm"><i class="fa-solid fa-user-plus"></i> حساب جديد</a></div>';
    }
    return;
  }

  if (loader) loader.hidden = false;
  await loadMyEnrollments();
  if (!APP.courses.length) await loadCourses();
  if (loader) loader.hidden = true;

  const mine = APP.myEnrollments
    .map(function (e) {
      const c = APP.courses.find(function (x) { return x.id === e.course_id; });
      return c ? Object.assign({}, c, { _status: e.status, _enrolledAt: e.created_at, _enrollmentId: e.id }) : null;
    })
    .filter(Boolean);

  if (!mine.length) {
    grid.innerHTML = '';
    if (empty) {
      empty.hidden = false;
      empty.innerHTML = '<i class="fa-regular fa-circle-question"></i><h4>لم تشترك في أي كورس بعد</h4>' +
        '<p>اضغط «اشترك الآن» على أي كورس، وسيُفعّل بعد موافقة الأستاذ.</p>' +
        '<button type="button" class="btn btn--gold btn--sm" onclick="switchTab(\'allCourses\')">تصفّح الكورسات</button>';
    }
    return;
  }
  if (empty) empty.hidden = true;

  grid.innerHTML = mine.map(function (c, i) {
    const statusMap = {
      pending: ['course-status--pending', 'fa-regular fa-clock', 'قيد المراجعة'],
      approved: ['course-status--approved', 'fa-solid fa-circle-check', 'مُفعّل'],
      rejected: ['course-status--rejected', 'fa-solid fa-circle-xmark', 'مرفوض']
    };
    const s = statusMap[c._status] || statusMap.pending;
    const thumb = c.thumbnail
      ? '<img src="' + escapeHtml(c.thumbnail) + '" alt="' + escapeHtml(c.title) + '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'" />' +
        '<span class="course-card__thumb-fallback" style="display:none">' + escapeHtml(initialOf(c.title)) + '</span>'
      : '<span class="course-card__thumb-fallback">' + escapeHtml(initialOf(c.title)) + '</span>';

    const canOpen = c._status === 'approved' || APP.isAdmin;

    return '' +
      '<article class="course-card" style="animation-delay:' + i * 60 + 'ms">' +
        '<div class="course-card__media" data-protect>' + thumb +
          '<span class="course-card__grade"><i class="fa-solid fa-graduation-cap"></i> ' + escapeHtml(c.grade || '—') + '</span>' +
          '<span class="course-status ' + s[0] + '" style="position:absolute;bottom:11px;inset-inline-end:11px;z-index:2;background:rgba(8,8,8,.82);backdrop-filter:blur(8px)">' +
            '<i class="' + s[1] + '"></i> ' + s[2] + '</span>' +
        '</div>' +
        '<div class="course-card__body">' +
          '<h3 class="course-card__title">' + escapeHtml(c.title) + '</h3>' +
          '<div class="course-card__meta">' +
            '<span><i class="fa-solid fa-film"></i> ' + (c._lessonsCount || 0) + ' درس</span>' +
            '<span><i class="fa-regular fa-calendar-check"></i> اشتركت ' + timeAgo(c._enrolledAt) + '</span>' +
          '</div>' +
          '<div><span class="course-status ' + s[0] + '"><i class="' + s[1] + '"></i> ' + s[2] + '</span></div>' +
          '<div class="course-card__foot">' +
            (canOpen
              ? '<button type="button" class="btn btn--gold btn--sm" onclick="viewCourseLessons(\'' + c.id + '\')"><i class="fa-solid fa-play"></i> متابعة الدروس</button>'
              : '<button type="button" class="btn btn--line btn--sm" disabled><i class="fa-solid fa-lock"></i> في انتظار الموافقة</button>') +
            (c._status === 'rejected'
              ? '<a href="' + escapeHtml(CONFIG.LINKS.support) + '" target="_blank" rel="noopener noreferrer" class="btn btn--ghost btn--sm btn--icon" title="تواصل مع الدعم"><i class="fa-brands fa-telegram"></i></a>'
              : '') +
          '</div>' +
        '</div>' +
      '</article>';
  }).join('');

  observeReveals();
}

/* ─────────────────────────────────────────────────────────────
   الملف الشخصي
   ───────────────────────────────────────────────────────────── */
async function renderProfile() {
  const box = document.getElementById('profileCard');
  if (!box) return;

  if (!APP.user) {
    box.innerHTML = '<div class="empty-state"><i class="fa-solid fa-user-lock"></i>' +
      '<h4>سجّل الدخول لعرض ملفك الشخصي</h4>' +
      '<p>ستظهر هنا بياناتك، صفّك الدراسي، حالة اشتراكاتك، ومواعيد الامتحانات.</p>' +
      '<div style="display:flex;gap:9px;justify-content:center;flex-wrap:wrap;margin-top:16px">' +
      '<a href="login.html" class="btn btn--gold btn--sm"><i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول</a>' +
      '<a href="register.html" class="btn btn--line btn--sm"><i class="fa-solid fa-user-plus"></i> إنشاء حساب</a></div></div>';
    return;
  }

  box.innerHTML = '<div class="loader"><span></span><span></span><span></span></div>';

  if (!APP.profile && !APP.isAdmin) {
    try {
      const { data } = await supabaseClient.from('students').select('*').eq('id', APP.user.id).maybeSingle();
      if (data) APP.profile = data;
    } catch (e) {}
  }
  await loadMyEnrollments();

  const p = APP.profile || {};
  const name = APP.isAdmin
    ? ((APP.adminRow && APP.adminRow.full_name) || CONFIG.TEACHER.name)
    : (p.full_name || (APP.user.user_metadata && APP.user.user_metadata.full_name) || 'الطالب');

  const approved = APP.myEnrollments.filter(function (e) { return e.status === 'approved'; }).length;
  const pending = APP.myEnrollments.filter(function (e) { return e.status === 'pending'; }).length;
  const rejected = APP.myEnrollments.filter(function (e) { return e.status === 'rejected'; }).length;
  const uid = String(APP.user.id || '').slice(0, 8).toUpperCase();
  const joined = p.created_at || APP.user.created_at;

  const rows = APP.isAdmin ? [
    ['fa-solid fa-envelope', 'البريد الإلكتروني', APP.user.email || '—', true],
    ['fa-solid fa-shield-halved', 'الصلاحية', (APP.adminRow && APP.adminRow.role) || 'admin', false],
    ['fa-solid fa-fingerprint', 'معرّف الحساب', uid, true],
    ['fa-solid fa-layer-group', 'الكورسات المُدارة', String(APP.courses.length), false],
    ['fa-regular fa-calendar', 'تاريخ الإنشاء', formatDate(joined), false],
    ['fa-solid fa-signal', 'الجلسة', SessionManager.isRunning() ? 'نشطة (جهاز واحد)' : 'غير نشطة', false]
  ] : [
    ['fa-solid fa-venus-mars', 'النوع', p.gender === 'female' ? 'طالبة' : (p.gender === 'male' ? 'طالب' : '—'), false],
    ['fa-solid fa-envelope', 'البريد الإلكتروني', APP.user.email || '—', true],
    ['fa-solid fa-phone', 'رقم الهاتف', p.phone || '—', true],
    ['fa-solid fa-phone-flip', 'هاتف ولي الأمر', p.parent_phone || 'غير مسجّل', true],
    ['fa-solid fa-graduation-cap', 'الصف الدراسي', p.grade || '—', false],
    ['fa-solid fa-fingerprint', 'معرّف الطالب', uid, true],
    ['fa-solid fa-circle-check', 'كورسات مُفعّلة', String(approved), false],
    ['fa-regular fa-clock', 'طلبات قيد المراجعة', String(pending), false],
    ['fa-solid fa-circle-xmark', 'طلبات مرفوضة', String(rejected), false],
    ['fa-regular fa-calendar', 'تاريخ التسجيل', formatDate(joined), false],
    ['fa-solid fa-signal', 'حالة الجلسة', SessionManager.isRunning() ? 'نشطة (جهاز واحد)' : 'غير نشطة', false],
    ['fa-solid fa-mobile-screen', 'الجهاز', truncate(navigator.platform || 'غير معروف', 30), false]
  ];

  box.innerHTML = '' +
    '<div class="profile-card__hero">' +
      '<span class="profile-card__avatar">' + escapeHtml(initialOf(name)) + '</span>' +
      '<div class="profile-card__id">' +
        '<h3>' + escapeHtml(name) + '</h3>' +
        '<small>' + (APP.isAdmin ? '<i class="fa-solid fa-shield-halved"></i> إدارة المنصة' : escapeHtml(p.grade || 'طالب بالمرحلة الثانوية')) + '</small>' +
      '</div>' +
      '<div style="margin-inline-start:auto;display:flex;gap:8px;flex-wrap:wrap">' +
        (APP.isAdmin ? '<a href="admin.html" class="btn btn--gold btn--sm"><i class="fa-solid fa-shield-halved"></i> لوحة التحكم</a>' : '') +
        '<button type="button" class="btn btn--line btn--sm" onclick="logout()"><i class="fa-solid fa-arrow-right-from-bracket"></i> خروج</button>' +
      '</div>' +
    '</div>' +
    '<div class="profile-card__grid">' +
      rows.map(function (r) {
        return '<div class="pf"><small><i class="' + r[0] + '"></i> ' + escapeHtml(r[1]) + '</small>' +
          '<strong' + (r[2] ? ' dir="ltr"' : '') + '>' + escapeHtml(r[2]) + '</strong></div>';
      }).join('') +
    '</div>' +
    '<div class="profile-card__foot">' +
      '<a class="btn btn--line btn--sm" href="' + escapeHtml(CONFIG.LINKS.tel) + '"><i class="fa-solid fa-phone"></i> ' + escapeHtml(CONFIG.TEACHER.phone) + '</a>' +
      '<a class="btn btn--line btn--sm" href="' + escapeHtml(CONFIG.LINKS.whatsapp) + '" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp"></i> واتساب</a>' +
      '<button type="button" class="btn btn--gold btn--sm" onclick="openChatModal()"><i class="fa-regular fa-comments"></i> الشات</button>' +
    '</div>';
}

/* ─────────────────────────────────────────────────────────────
   الإعلانات
   ───────────────────────────────────────────────────────────── */
async function loadAnnouncements() {
  const grid = document.getElementById('announcementsGrid');
  const empty = document.getElementById('announcementsEmpty');
  if (!grid) return;

  grid.innerHTML = '<div class="loader" style="grid-column:1/-1"><span></span><span></span><span></span></div>';

  try {
    const { data, error } = await supabaseClient
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(12);
    if (error) throw error;
    APP.announcements = data || [];

    if (!APP.announcements.length) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      renderHeroAnnouncement(null);
      return;
    }
    if (empty) empty.hidden = true;

    grid.innerHTML = APP.announcements.map(function (a, i) {
      const icon = a.type === 'exam' ? 'fa-file-signature' : (a.type === 'lesson' ? 'fa-film' : (a.type === 'offer' ? 'fa-tags' : 'bullhorn'));
      return '' +
        '<article class="ann-card reveal" style="animation-delay:' + i * 70 + 'ms">' +
          '<div class="ann-card__top">' +
            '<span class="ann-card__icon"><i class="fa-solid ' + icon + '"></i></span>' +
            '<span class="ann-card__date"><i class="fa-regular fa-clock"></i> ' + timeAgo(a.created_at) + '</span>' +
          '</div>' +
          '<h4>' + escapeHtml(a.title || 'إعلان') + '</h4>' +
          '<p>' + escapeHtml(a.body || '') + '</p>' +
          (a.grade ? '<span class="ann-card__badge"><i class="fa-solid fa-graduation-cap"></i> ' + escapeHtml(a.grade) + '</span>' : '') +
        '</article>';
    }).join('');

    renderHeroAnnouncement(APP.announcements[0]);
    observeReveals();
  } catch (err) {
    console.warn('[courses] loadAnnouncements:', err);
    grid.innerHTML = '';
    if (empty) { empty.hidden = false; }
  }
}

/** عرض أحدث إعلان في بطاقة الـ Hero */
function renderHeroAnnouncement(ann) {
  const t = document.getElementById('heroAnnouncementTitle');
  const b = document.getElementById('heroAnnouncementBody');
  if (!t || !b) return;
  if (!ann) {
    t.textContent = 'لا توجد إعلانات';
    b.textContent = 'سيتم نشر مواعيد المحاضرات والأخبار هنا أولًا بأول.';
    return;
  }
  t.textContent = ann.title || 'إعلان جديد';
  b.textContent = truncate(ann.body || '', 90);
}

/* ─────────────────────────────────────────────────────────────
   الامتحانات والواجبات (جانب الطالب)
   ───────────────────────────────────────────────────────────── */
async function loadStudentTasks() {
  const examsBox = document.getElementById('examsList');
  const hwBox = document.getElementById('homeworksList');
  if (!examsBox && !hwBox) return;

  const needLogin = '<div class="empty-state empty-state--sm"><i class="fa-solid fa-user-lock"></i>' +
    '<h4>سجّل الدخول لعرض المهام</h4><p>ستظهر هنا الامتحانات والواجبات الخاصة بكورساتك.</p></div>';

  if (!APP.user) {
    if (examsBox) examsBox.innerHTML = needLogin;
    if (hwBox) hwBox.innerHTML = needLogin;
    return;
  }

  if (examsBox) examsBox.innerHTML = '<div class="loader"><span></span><span></span><span></span></div>';
  if (hwBox) hwBox.innerHTML = '<div class="loader"><span></span><span></span><span></span></div>';

  const myCourseIds = APP.isAdmin
    ? APP.courses.map(function (c) { return c.id; })
    : APP.myEnrollments.filter(function (e) { return e.status === 'approved'; }).map(function (e) { return e.course_id; });

  const courseTitle = function (id) {
    const c = APP.courses.find(function (x) { return x.id === id; });
    return c ? c.title : 'كورس';
  };

  try {
    let exams = [], homeworks = [];

    if (myCourseIds.length) {
      const [ex, hw] = await Promise.all([
        supabaseClient.from('exams').select('*').in('course_id', myCourseIds).order('created_at', { ascending: false }).limit(12),
        supabaseClient.from('homeworks').select('*').in('course_id', myCourseIds).order('due_date', { ascending: true }).limit(12)
      ]);
      exams = ex.data || [];
      homeworks = hw.data || [];
    }

    if (examsBox) {
      examsBox.innerHTML = exams.length ? exams.map(function (x) {
        const expired = x.expires_at && new Date(x.expires_at).getTime() < Date.now();
        const qCount = Array.isArray(x.questions) ? x.questions.length : 0;
        return '' +
          '<div class="task-item">' +
            '<span class="task-item__ic"><i class="fa-solid fa-file-signature"></i></span>' +
            '<div class="task-item__main">' +
              '<h5>' + escapeHtml(x.title || 'امتحان') + '</h5>' +
              '<p>' + escapeHtml(courseTitle(x.course_id)) + (x.description ? ' — ' + escapeHtml(truncate(x.description, 80)) : '') + '</p>' +
              '<div class="task-item__meta">' +
                '<span class="pill"><i class="fa-solid fa-circle-question"></i> ' + qCount + ' سؤال</span>' +
                '<span class="pill"><i class="fa-regular fa-clock"></i> ' + humanDuration(x.duration_minutes) + '</span>' +
                (expired
                  ? '<span class="pill pill--err"><i class="fa-solid fa-ban"></i> انتهى</span>'
                  : '<span class="pill pill--warn"><i class="fa-solid fa-hourglass-half"></i> باقٍ ' + timeUntil(x.expires_at) + '</span>') +
              '</div>' +
            '</div>' +
            (expired ? '' : '<button type="button" class="btn btn--gold btn--sm" onclick="openExam(\'' + x.id + '\')"><i class="fa-solid fa-play"></i> ابدأ</button>') +
          '</div>';
      }).join('') : '<div class="empty-state empty-state--sm"><i class="fa-regular fa-file-lines"></i><h4>لا توجد امتحانات حاليًا</h4><p>سيُعلن الأستاذ عن أي امتحان جديد في لوحة الإعلانات.</p></div>';
    }

    if (hwBox) {
      homeworksBoxRender(hwBox, homeworks, courseTitle);
    }
  } catch (err) {
    console.warn('[courses] loadStudentTasks:', err);
    const msg = '<div class="empty-state empty-state--sm"><i class="fa-solid fa-plug-circle-exclamation"></i><h4>تعذّر التحميل</h4><p>' + escapeHtml(translateError(err)) + '</p></div>';
    if (examsBox) examsBox.innerHTML = msg;
    if (hwBox) hwBox.innerHTML = msg;
  }
}

function homeworksBoxRender(box, homeworks, courseTitle) {
  box.innerHTML = homeworks.length ? homeworks.map(function (h) {
    const late = h.due_date && new Date(h.due_date).getTime() < Date.now();
    return '' +
      '<div class="task-item">' +
        '<span class="task-item__ic"><i class="fa-solid fa-pen-to-square"></i></span>' +
        '<div class="task-item__main">' +
          '<h5>' + escapeHtml(h.title || 'واجب') + '</h5>' +
          '<p>' + escapeHtml(h.description || '') + '</p>' +
          '<div class="task-item__meta">' +
            '<span class="pill pill--gold"><i class="fa-solid fa-book"></i> ' + escapeHtml(courseTitle(h.course_id)) + '</span>' +
            (h.due_date
              ? (late
                ? '<span class="pill pill--err"><i class="fa-solid fa-ban"></i> انتهى التسليم</span>'
                : '<span class="pill pill--warn"><i class="fa-regular fa-calendar"></i> باقٍ ' + timeUntil(h.due_date) + '</span>')
              : '<span class="pill"><i class="fa-regular fa-calendar"></i> بدون موعد محدد</span>') +
          '</div>' +
        '</div>' +
        '<a class="btn btn--line btn--sm" href="' + escapeHtml(CONFIG.LINKS.whatsapp) + '" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp"></i> إرسال الحل</a>' +
      '</div>';
  }).join('') : '<div class="empty-state empty-state--sm"><i class="fa-regular fa-note-sticky"></i><h4>لا توجد واجبات مطلوبة</h4><p>تابع الإعلانات لمعرفة الواجبات الجديدة.</p></div>';
}

/* ─────────────────────────────────────────────────────────────
   فتح امتحان
   ───────────────────────────────────────────────────────────── */
async function openExam(examId) {
  if (!APP.user) { showToast('سجّل الدخول أولًا', 'warn'); return; }
  try {
    const { data: exam, error } = await supabaseClient.from('exams').select('*').eq('id', examId).maybeSingle();
    if (error) throw error;
    if (!exam) { showToast('الامتحان غير موجود', 'error'); return; }
    if (exam.expires_at && new Date(exam.expires_at).getTime() < Date.now()) {
      showToast('انتهى وقت هذا الامتحان', 'warn'); return;
    }

    const qs = Array.isArray(exam.questions) ? exam.questions : [];
    if (!qs.length) { showToast('لا توجد أسئلة في هذا الامتحان بعد', 'warn'); return; }

    const body = qs.map(function (q, i) {
      const opts = Array.isArray(q.options) ? q.options : [];
      return '<div class="q-item" data-q="' + i + '">' +
        '<div class="q-item__head"><span class="q-item__num">' + (i + 1) + '</span>' +
        '<strong style="font-size:.92rem">' + escapeHtml(q.question || q.text || 'سؤال') + '</strong></div>' +
        '<div class="q-opts">' + opts.map(function (o, j) {
          return '<label class="q-opt"><input type="radio" name="ex_' + i + '" value="' + j + '" />' +
            '<span style="font-size:.87rem">' + escapeHtml(o) + '</span></label>';
        }).join('') + '</div></div>';
    }).join('');

    showInfoModal(exam.title || 'امتحان',
      '<p class="muted" style="font-size:.85rem;margin-bottom:14px">' +
      '<i class="fa-regular fa-clock"></i> المدة: ' + escapeHtml(humanDuration(exam.duration_minutes)) + ' — عدد الأسئلة: ' + qs.length + '</p>' +
      '<form id="examForm" onsubmit="submitExam(event,\'' + examId + '\')">' + body +
      '<div style="display:flex;gap:9px;justify-content:center;margin-top:16px">' +
      '<button type="submit" class="btn btn--gold"><i class="fa-solid fa-paper-plane"></i> تسليم الامتحان</button></div></form>');

    openModal('infoModal');
    window._currentExam = exam;
  } catch (err) {
    showToast(translateError(err), 'error');
  }
}

/** تصحيح الامتحان محليًا وعرض النتيجة */
function submitExam(e, examId) {
  if (e) e.preventDefault();
  const exam = window._currentExam;
  if (!exam) return;
  const qs = Array.isArray(exam.questions) ? exam.questions : [];
  let score = 0;

  qs.forEach(function (q, i) {
    const sel = document.querySelector('input[name="ex_' + i + '"]:checked');
    const answer = sel ? Number(sel.value) : -1;
    const correct = Number(q.correct != null ? q.correct : q.answer);
    if (answer === correct) score++;
  });

  const total = qs.length || 1;
  const percent = Math.round((score / total) * 100);
  const grade = percent >= 85 ? 'ممتاز 🏆' : (percent >= 70 ? 'جيد جدًا 👏' : (percent >= 50 ? 'مقبول — تحتاج مراجعة' : 'يحتاج متابعة'));

  showInfoModal('نتيجة الامتحان',
    '<div style="text-align:center">' +
      '<div style="font-family:Cairo,sans-serif;font-size:3.2rem;font-weight:900;color:var(--gold-2);line-height:1">' + percent + '%</div>' +
      '<p style="margin:8px 0 4px;font-size:1rem">أجبت على <b class="gold">' + score + '</b> من <b class="gold">' + total + '</b> أسئلة</p>' +
      '<p class="muted" style="font-size:.88rem">' + escapeHtml(grade) + '</p>' +
      '<div style="display:flex;gap:9px;justify-content:center;flex-wrap:wrap;margin-top:18px">' +
        '<button type="button" class="btn btn--gold btn--sm" onclick="reportExamScore(\'' + examId + '\',' + score + ',' + total + ')"><i class="fa-solid fa-paper-plane"></i> إرسال النتيجة للأستاذ</button>' +
        '<button type="button" class="btn btn--line btn--sm" data-close-modal="infoModal">إغلاق</button>' +
      '</div>' +
    '</div>');
}

/** إرسال النتيجة للأستاذ عبر الشات */
async function reportExamScore(examId, score, total) {
  const exam = window._currentExam;
  const text = '📝 نتيجة امتحان: «' + ((exam && exam.title) || '') + '» — حصلت على ' + score + ' من ' + total + '.';
  try {
    const { error } = await supabaseClient.from('chat_messages').insert({
      student_id: APP.user.id,
      sender_role: 'student',
      message: text,
      created_at: new Date().toISOString()
    });
    if (error) throw error;
    showToast('تم إرسال نتيجتك للأستاذ ✅', 'success');
  } catch (err) {
    showToast(translateError(err), 'error');
  }
  closeModal('infoModal');
}

/* ─────────────────────────────────────────────────────────────
   دروس الكورس
   ───────────────────────────────────────────────────────────── */
async function viewCourseLessons(courseId) {
  const course = APP.courses.find(function (c) { return c.id === courseId; });
  if (!course) { showToast('الكورس غير موجود', 'error'); return; }

  const titleEl = document.getElementById('lessonsModalTitle');
  const gradeEl = document.getElementById('lessonsCourseGrade');
  const listEl = document.getElementById('lessonsList');

  if (titleEl) titleEl.textContent = course.title || 'دروس الكورس';
  if (gradeEl) gradeEl.textContent = (course.grade || '—') + ' · ' + (course.teacher || CONFIG.TEACHER.name);
  if (listEl) listEl.innerHTML = '<div class="loader"><span></span><span></span><span></span></div>';

  openModal('lessonsModal');

  const allowed = isEnrolledApproved(courseId) || (course.is_free === true);

  try {
    let lessons = APP.lessonsCache[courseId];
    if (!lessons) {
      const { data, error } = await supabaseClient
        .from('lessons')
        .select('*')
        .eq('course_id', courseId)
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      lessons = data || [];
      APP.lessonsCache[courseId] = lessons;
    }

    APP.currentCourse = course;
    APP.currentLessons = lessons;

    if (!lessons.length) {
      if (listEl) listEl.innerHTML = '<div class="empty-state empty-state--sm"><i class="fa-regular fa-folder-open"></i>' +
        '<h4>لا توجد دروس منشورة بعد</h4><p>سيتم رفع الدروس قريبًا، تابع لوحة الإعلانات.</p></div>';
      return;
    }

    if (listEl) {
      listEl.innerHTML = lessons.map(function (l, i) {
        const free = l.is_free === true;
        const locked = !allowed && !free;
        const done = APP.doneLessons.indexOf(l.id) !== -1;
        return '' +
          '<div class="lesson-row' + (locked ? ' is-locked' : '') + (done ? ' is-done' : '') + '" ' +
            (locked ? 'onclick="lockedLessonTip()"' : 'onclick="playLesson(\'' + l.id + '\')"') + ' role="button" tabindex="0">' +
            '<span class="lesson-row__idx">' + (done ? '<i class="fa-solid fa-check"></i>' : (i + 1)) + '</span>' +
            '<div class="lesson-row__main">' +
              '<h5>' + escapeHtml(l.title || 'درس ' + (i + 1)) + ' ' + (free ? '<span class="tag-free">مجاني</span>' : '') + '</h5>' +
              '<small>' +
                '<span><i class="' + linkIcon(l.video_url) + '"></i> ' + escapeHtml(l.video_type || detectVideoType(l.video_url)) + '</span>' +
                (l.duration ? '<span><i class="fa-regular fa-clock"></i> ' + humanDuration(l.duration) + '</span>' : '') +
                (locked ? '<span><i class="fa-solid fa-lock"></i> يتطلب اشتراك مُفعّل</span>' : '') +
              '</small>' +
            '</div>' +
            '<span class="lesson-row__act"><i class="fa-solid ' + (locked ? 'fa-lock' : 'fa-play') + '"></i></span>' +
          '</div>';
      }).join('');
    }
  } catch (err) {
    if (listEl) listEl.innerHTML = '<div class="empty-state empty-state--sm"><i class="fa-solid fa-plug-circle-exclamation"></i>' +
      '<h4>تعذّر تحميل الدروس</h4><p>' + escapeHtml(translateError(err)) + '</p></div>';
  }
}

/** رسالة عند الضغط على درس مقفل */
function lockedLessonTip() {
  const enr = APP.currentCourse ? findEnrollment(APP.currentCourse.id) : null;
  if (!APP.user) {
    showInfoModal('مطلوب تسجيل الدخول', '<p>هذا الدرس متاح للمشتركين فقط. سجّل الدخول أو أنشئ حسابًا جديدًا للاشتراك.</p>' +
      '<div style="display:flex;gap:9px;justify-content:center;margin-top:16px;flex-wrap:wrap">' +
      '<a href="login.html" class="btn btn--gold btn--sm">تسجيل الدخول</a>' +
      '<a href="register.html" class="btn btn--line btn--sm">حساب جديد</a></div>');
    return;
  }
  if (!enr) {
    showInfoModal('الدرس مقفل 🔒', '<p>اشترك في الكورس أولًا ثم انتظر موافقة الأستاذ لفتح كل الدروس.</p>' +
      '<div style="display:flex;gap:9px;justify-content:center;margin-top:16px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn--gold btn--sm" onclick="closeModal(\'infoModal\');enroll(\'' + APP.currentCourse.id + '\')">اشترك الآن</button>' +
      '<a href="' + escapeHtml(CONFIG.LINKS.tel) + '" class="btn btn--line btn--sm"><i class="fa-solid fa-phone"></i> ' + escapeHtml(CONFIG.TEACHER.phone) + '</a></div>');
    return;
  }
  if (enr.status === 'pending') {
    showInfoModal('طلبك قيد المراجعة ⏳', '<p>تم استلام طلب اشتراكك وهو في انتظار موافقة ' + escapeHtml(CONFIG.TEACHER.name) + '.<br>للاستعجال تواصل على: <b dir="ltr" class="gold">' + escapeHtml(CONFIG.TEACHER.phone) + '</b></p>');
    return;
  }
  showInfoModal('الاشتراك غير مُفعّل', '<p>حالة اشتراكك: <b class="gold">' + escapeHtml(enr.status) + '</b>. تواصل مع الدعم الفني لتفعيل الاشتراك.</p>');
}

/* ─────────────────────────────────────────────────────────────
   تشغيل درس
   ───────────────────────────────────────────────────────────── */
function playLesson(lessonId) {
  const lessons = APP.currentLessons || [];
  const idx = lessons.findIndex(function (l) { return l.id === lessonId; });
  if (idx === -1) { showToast('الدرس غير موجود', 'error'); return; }

  const lesson = lessons[idx];
  const allowed = isEnrolledApproved(lesson.course_id) || lesson.is_free === true || APP.isAdmin;
  if (!allowed) { lockedLessonTip(); return; }

  APP.currentLessonIndex = idx;
  closeModal('lessonsModal');

  // تفويض التنفيذ لمشغّل الفيديو
  if (typeof openPlayer === 'function') openPlayer(lesson);
  else showToast('تعذّر فتح المشغل', 'error');
}

/* ─────────────────────────────────────────────────────────────
   إحصائيات الـ Hero
   ───────────────────────────────────────────────────────────── */
async function loadHeroStats() {
  try {
    const [c, l, s] = await Promise.all([
      supabaseClient.from('courses').select('id', { count: 'exact', head: true }),
      supabaseClient.from('lessons').select('id', { count: 'exact', head: true }),
      supabaseClient.from('students').select('id', { count: 'exact', head: true })
    ]);
    countUp(document.getElementById('statCourses'), c.count || 0, 1300);
    countUp(document.getElementById('statLessons'), l.count || 0, 1500);
    countUp(document.getElementById('statStudents'), s.count || 0, 1700);
  } catch (e) {
    // قيم تقديرية لو تعذّر العدّ (صلاحيات RLS)
    countUp(document.getElementById('statCourses'), APP.courses.length, 900);
    countUp(document.getElementById('statLessons'), 0, 900);
    countUp(document.getElementById('statStudents'), 0, 900);
  }
}
