/* ═══════════════════════════════════════════════════════════════
   js/player.js — مشغل الفيديو المحمي
   يدعم: YouTube · Vimeo · Google Drive · MP4/روابط مباشرة
   الحماية: علامة مائية متحركة (اسم الطالب + ID) كل 4 ثواني،
           منع القائمة اليمنى والسحب، كشف أدوات المطور → إيقاف الفيديو،
           شفافية متغيرة للعلامة المائية.
   ═══════════════════════════════════════════════════════════════ */

const Player = (function () {

  let wmTimer = null;         // مؤقّت تحريك العلامة المائية
  let opacityTimer = null;    // مؤقّت تغيير الشفافية
  let devtoolsChecker = null; // مؤقّت كشف الأدوات داخل المشغل
  let currentLesson = null;   // الدرس الحالي
  let tilesEl = null;         // طبقة العلامات المكرّرة
  let guardActive = false;    // هل الدرع ظاهر؟

  /* ─────────────────────────────────────────────────────────
     التعرف على نوع الرابط
     ───────────────────────────────────────────────────────── */
  function detectType(url) {
    const u = String(url || '').trim().toLowerCase();
    if (!u) return 'empty';
    if (u.indexOf('youtube.com') !== -1 || u.indexOf('youtu.be') !== -1) return 'YouTube';
    if (u.indexOf('vimeo.com') !== -1) return 'Vimeo';
    if (u.indexOf('drive.google') !== -1) return 'Google Drive';
    if (/\.(mp4|webm|ogg|m4v|mov)(\?|$)/.test(u)) return 'MP4';
    if (u.indexOf('.m3u8') !== -1) return 'HLS';
    return 'رابط خارجي';
  }

  /* ─────────────────────────────────────────────────────────
     استخراج معرّف الفيديو
     ───────────────────────────────────────────────────────── */
  function youtubeId(url) {
    const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : null;
  }
  function vimeoId(url) {
    const m = String(url).match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return m ? m[1] : null;
  }
  function driveId(url) {
    const m = String(url).match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([A-Za-z0-9_-]{10,})/);
    return m ? m[1] : null;
  }

  /* ─────────────────────────────────────────────────────────
     بناء كود العرض
     ───────────────────────────────────────────────────────── */
  function buildEmbed(url) {
    const type = detectType(url);

    if (type === 'YouTube') {
      const id = youtubeId(url);
      if (!id) return { kind: 'raw', src: url };
      return {
        kind: 'iframe',
        src: 'https://www.youtube-nocookie.com/embed/' + id +
             '?rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&autoplay=1'
      };
    }

    if (type === 'Vimeo') {
      const id = vimeoId(url);
      if (!id) return { kind: 'raw', src: url };
      return {
        kind: 'iframe',
        src: 'https://player.vimeo.com/video/' + id + '?autoplay=1&title=0&byline=0&portrait=0'
      };
    }

    if (type === 'Google Drive') {
      const id = driveId(url);
      if (!id) return { kind: 'raw', src: url };
      return { kind: 'iframe', src: 'https://drive.google.com/file/d/' + id + '/preview' };
    }

    if (type === 'MP4' || type === 'HLS') {
      return { kind: 'video', src: url };
    }

    // رابط مباشر غير معروف
    return { kind: 'iframe', src: url };
  }

  /* ─────────────────────────────────────────────────────────
     نص العلامة المائية: اسم الطالب + ID
     ───────────────────────────────────────────────────────── */
  function watermarkText() {
    const name = (APP.profile && APP.profile.full_name) ||
      (APP.user && APP.user.user_metadata && APP.user.user_metadata.full_name) ||
      (APP.isAdmin ? CONFIG.TEACHER.name : 'زائر');
    const id = APP.user ? String(APP.user.id).slice(0, 8).toUpperCase() : '00000000';
    return name + ' • ' + id;
  }

  /* ─────────────────────────────────────────────────────────
     تحريك العلامة المائية كل CONFIG.WATERMARK.interval
     ───────────────────────────────────────────────────────── */
  function startWatermark() {
    stopWatermark();
    const layer = document.getElementById('wmLayer');
    const text = document.getElementById('wmText');
    if (!layer || !text) return;

    const label = watermarkText();
    text.textContent = label;
    text.style.fontSize = CONFIG.WATERMARK.fontSize;

    // بناء شبكة العلامات المكرّرة
    tilesEl = document.createElement('div');
    tilesEl.className = 'wm-layer__tiles';
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('span');
      s.textContent = label;
      s.style.fontSize = '12px';
      s.style.opacity = String(Math.max(0.06, CONFIG.WATERMARK.opacity * 0.35));
      tilesEl.appendChild(s);
    }
    layer.appendChild(tilesEl);

    function move() {
      const stage = document.getElementById('playerStage');
      if (!stage) return;
      const w = stage.clientWidth, h = stage.clientHeight;
      const tw = text.offsetWidth || 180, th = text.offsetHeight || 20;
      const maxX = Math.max(4, w - tw - 12);
      const maxY = Math.max(4, h - th - 12);
      text.style.left = (8 + Math.random() * maxX) + 'px';
      text.style.top = (8 + Math.random() * maxY) + 'px';
      text.style.right = 'auto';
      text.style.bottom = 'auto';
      text.style.opacity = String(CONFIG.WATERMARK.opacity);
    }

    move();
    wmTimer = setInterval(move, CONFIG.WATERMARK.interval);

    // شفافية متغيرة
    opacityTimer = setInterval(function () {
      const o = CONFIG.WATERMARK.opacity * (0.55 + Math.random() * 0.75);
      text.style.opacity = String(Math.min(0.85, o).toFixed(2));
      if (tilesEl) {
        const t = Math.max(0.04, o * 0.3);
        Array.prototype.forEach.call(tilesEl.children, function (s) {
          s.style.opacity = (t * (0.7 + Math.random() * 0.6)).toFixed(2);
        });
      }
    }, 1700);
  }

  function stopWatermark() {
    if (wmTimer) { clearInterval(wmTimer); wmTimer = null; }
    if (opacityTimer) { clearInterval(opacityTimer); opacityTimer = null; }
    if (tilesEl && tilesEl.parentNode) tilesEl.parentNode.removeChild(tilesEl);
    tilesEl = null;
  }

  /* ─────────────────────────────────────────────────────────
     إيقاف / استئناف
     ───────────────────────────────────────────────────────── */
  function pause() {
    const frame = document.getElementById('playerFrame');
    if (!frame) return;
    // إيقاف فيديو HTML5
    frame.querySelectorAll('video').forEach(function (v) { try { v.pause(); } catch (e) {} });
    // إيقاف iframes بإعادة تحميلها بدون autoplay
    frame.querySelectorAll('iframe').forEach(function (f) {
      const src = f.src || '';
      f.src = src.replace(/([?&])autoplay=1/, '$1autoplay=0');
      if (f.src === src) f.src = 'about:blank';
    });
  }

  function showGuard(message) {
    guardActive = true;
    pause();
    const g = document.getElementById('playerGuard');
    if (g) {
      if (message) g.querySelector('p').textContent = message;
      g.hidden = false;
    }
    const frame = document.getElementById('playerFrame');
    if (frame) frame.classList.add('noclick');
  }

  function hideGuard() {
    guardActive = false;
    const g = document.getElementById('playerGuard');
    if (g) g.hidden = true;
    const frame = document.getElementById('playerFrame');
    if (frame) frame.classList.remove('noclick');
  }

  /* ─────────────────────────────────────────────────────────
     مراقبة أدوات المطور أثناء التشغيل
     ───────────────────────────────────────────────────────── */
  function startDevtoolsWatch() {
    stopDevtoolsWatch();
    let warned = false;
    devtoolsChecker = setInterval(function () {
      const dw = window.outerWidth - window.innerWidth > 170;
      const dh = window.outerHeight - window.innerHeight > 170;
      if (dw || dh) {
        if (!guardActive) {
          showGuard('تم اكتشاف فتح أدوات المطور. أغلقها ثم اضغط «استئناف» لمتابعة الدرس.');
          if (!warned) {
            warned = true;
            showToast('تم إيقاف الفيديو: أدوات المطور مفتوحة', 'error', 5000);
          }
        }
      } else if (guardActive && warned) {
        warned = false;
      }
    }, 1400);
  }
  function stopDevtoolsWatch() {
    if (devtoolsChecker) { clearInterval(devtoolsChecker); devtoolsChecker = null; }
  }

  /* ─────────────────────────────────────────────────────────
     فتح المشغل
     ───────────────────────────────────────────────────────── */
  function open(lesson) {
    if (!lesson) return;
    currentLesson = lesson;

    const frame = document.getElementById('playerFrame');
    const titleEl = document.getElementById('playerModalTitle');
    const courseEl = document.getElementById('playerCourseName');
    const idxEl = document.getElementById('playerLessonIndex');
    const prevBtn = document.getElementById('btnPrevLesson');
    const nextBtn = document.getElementById('btnNextLesson');

    if (titleEl) titleEl.textContent = lesson.title || 'درس';
    if (courseEl) courseEl.textContent = ((APP.currentCourse && APP.currentCourse.title) || 'الكورس') +
      ' · ' + detectType(lesson.video_url);

    const idx = APP.currentLessons.findIndex(function (l) { return l.id === lesson.id; });
    APP.currentLessonIndex = idx;
    if (idxEl) idxEl.textContent = (idx + 1) + ' / ' + APP.currentLessons.length;
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx === -1 || idx >= APP.currentLessons.length - 1;

    if (!frame) return;
    hideGuard();

    if (!lesson.video_url) {
      frame.innerHTML = '<div style="display:grid;place-items:center;height:100%;text-align:center;padding:20px;color:#8b8779">' +
        '<div><i class="fa-solid fa-video-slash" style="font-size:2rem;color:#8a6a00"></i>' +
        '<p style="margin-top:10px">لم يُرفع رابط الفيديو لهذا الدرس بعد</p></div></div>';
    } else {
      const media = buildEmbed(lesson.video_url);
      if (media.kind === 'video') {
        frame.innerHTML = '<video controls controlslist="nodownload noremoteplayback" disablepictureinpicture ' +
          'playsinline preload="metadata" src="' + escapeHtml(media.src) + '"></video>';
        const v = frame.querySelector('video');
        if (v) {
          v.addEventListener('contextmenu', function (e) { e.preventDefault(); });
          v.addEventListener('play', function () { markStarted(lesson.id); });
        }
      } else if (media.kind === 'iframe') {
        frame.innerHTML = '<iframe src="' + escapeHtml(media.src) + '" title="' + escapeHtml(lesson.title || 'درس') +
          '" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen ' +
          'referrerpolicy="strict-origin-when-cross-origin" loading="eager" data-protect></iframe>';
      } else {
        frame.innerHTML = '<iframe src="' + escapeHtml(media.src) + '" allowfullscreen data-protect></iframe>';
      }
    }

    openModal('playerModal');
    startWatermark();
    startDevtoolsWatch();
    updateDoneButton();
    markStarted(lesson.id);

    showToast('جارِ تشغيل: ' + (lesson.title || 'الدرس'), 'gold', 2800);
  }

  /* ─────────────────────────────────────────────────────────
     إغلاق المشغل
     ───────────────────────────────────────────────────────── */
  function close() {
    pause();
    stopWatermark();
    stopDevtoolsWatch();
    closeModal('playerModal');
    const frame = document.getElementById('playerFrame');
    // تفريغ المحتوى بعد الإغلاق لإيقاف أي تحميل
    setTimeout(function () { if (frame && document.getElementById('playerModal').hidden) frame.innerHTML = ''; }, 320);
    currentLesson = null;
  }

  /* ─────────────────────────────────────────────────────────
     الدروس المنتهية (محليًا لكل مستخدم)
     ───────────────────────────────────────────────────────── */
  function doneKey() {
    return 'mo_done_' + ((APP.user && APP.user.id) || 'guest');
  }
  function loadDone() {
    APP.doneLessons = storeGet(doneKey(), []);
    if (!Array.isArray(APP.doneLessons)) APP.doneLessons = [];
  }
  function markStarted(id) {
    // تسجيل المشاهدة تلقائيًا بعد بدء التشغيل
    loadDone();
    if (APP.doneLessons.indexOf(id) === -1 && APP.user) {
      APP.doneLessons.push(id);
      storeSet(doneKey(), APP.doneLessons);
    }
  }
  function toggleDone(id) {
    loadDone();
    const i = APP.doneLessons.indexOf(id);
    if (i === -1) { APP.doneLessons.push(id); storeSet(doneKey(), APP.doneLessons); showToast('تم تعليم الدرس كمُشاهَد ✅', 'success', 2600); }
    else { APP.doneLessons.splice(i, 1); storeSet(doneKey(), APP.doneLessons); showToast('تم إلغاء تعليم الدرس', 'info', 2600); }
    updateDoneButton();
  }
  function updateDoneButton() {
    const btn = document.getElementById('btnMarkDone');
    if (!btn || !currentLesson) return;
    loadDone();
    const done = APP.doneLessons.indexOf(currentLesson.id) !== -1;
    btn.innerHTML = done
      ? '<i class="fa-solid fa-circle-check" style="color:var(--ok)"></i> <span>تمّت المشاهدة</span>'
      : '<i class="fa-regular fa-circle-check"></i> <span>تمّت المشاهدة</span>';
  }

  /* ─────────────────────────────────────────────────────────
     حماية إضافية على منطقة المشغل
     ───────────────────────────────────────────────────────── */
  function harden() {
    const stage = document.getElementById('playerStage');
    if (!stage || stage.dataset.hardened) return;
    stage.dataset.hardened = '1';

    stage.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      showToast('القائمة اليمنى معطّلة داخل المشغل', 'warn', 2200);
      return false;
    });
    stage.addEventListener('dragstart', function (e) { e.preventDefault(); return false; });
    stage.addEventListener('selectstart', function (e) {
      if (!/INPUT|TEXTAREA/.test(e.target.tagName)) e.preventDefault();
    });
    stage.addEventListener('copy', function (e) { e.preventDefault(); });

    // منع سحب iframe خارج الصفحة
    stage.addEventListener('drop', function (e) { e.preventDefault(); });
  }

  return {
    open: open,
    close: close,
    pause: pause,
    resume: function () {
      hideGuard();
      if (currentLesson) {
        const l = currentLesson;
        currentLesson = null;
        open(l);
      }
      showToast('تم استئناف التشغيل', 'success', 2400);
    },
    detectType: detectType,
    buildEmbed: buildEmbed,
    watermarkText: watermarkText,
    showGuard: showGuard,
    hideGuard: hideGuard,
    harden: harden,
    loadDone: loadDone,
    toggleDone: toggleDone,
    getCurrent: function () { return currentLesson; },
    isGuardActive: function () { return guardActive; }
  };
})();

/* ─────── دوال عامة تُستدعى من HTML ─────── */

/** نوع الفيديو (يُستخدم في قوائم الدروس) */
function detectVideoType(url) { return Player.detectType(url); }

/** فتح المشغل */
function openPlayer(lesson) { Player.open(lesson); }

/** إغلاق المشغل */
function closePlayer() { Player.close(); }

/** إيقاف مؤقت */
function pausePlayer() { Player.pause(); }

/** استئناف بعد إخفاء الدرع */
function resumePlayer() { Player.resume(); }

/** الدرس السابق */
function prevLesson() {
  const i = APP.currentLessonIndex;
  if (i <= 0) return;
  const l = APP.currentLessons[i - 1];
  if (l) Player.open(l);
}

/** الدرس التالي */
function nextLesson() {
  const i = APP.currentLessonIndex;
  if (i === -1 || i >= APP.currentLessons.length - 1) return;
  const l = APP.currentLessons[i + 1];
  if (l) Player.open(l);
}

/** تعليم الدرس كمُشاهَد */
function toggleLessonDone() {
  const l = Player.getCurrent();
  if (!l) { showToast('لا يوجد درس مفتوح', 'warn'); return; }
  Player.toggleDone(l.id);
}

/** استدعاء عام عند كشف أدوات المطور (يُستدعى من utils.detectDevTools) */
function onDevToolsDetected(reason) {
  const modal = document.getElementById('playerModal');
  const isOpen = modal && !modal.hidden;
  if (isOpen) {
    Player.showGuard('تم اكتشاف أدوات المطور (سبب: ' + reason + '). أغلقها ثم اضغط «استئناف» لمتابعة الدرس.');
    showToast('تم إيقاف الفيديو لحماية المحتوى', 'error', 5000);
  } else {
    showToast('تم اكتشاف أدوات المطور — بعض الوظائف معطّلة', 'warn', 3500);
  }
}

/* ─────── اختصارات لوحة المفاتيح داخل المشغل ─────── */
document.addEventListener('keydown', function (e) {
  const modal = document.getElementById('playerModal');
  if (!modal || modal.hidden) return;

  if (e.key === 'Escape') { Player.close(); return; }
  // تنقّل بين الدروس بالأسهم
  if (e.altKey && e.key === 'ArrowLeft') { nextLesson(); e.preventDefault(); }
  if (e.altKey && e.key === 'ArrowRight') { prevLesson(); e.preventDefault(); }
});
