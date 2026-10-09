/**
 * ═══════════════════════════════════════════════════════════
 *  السجل اليومي — مدرسة نور السلام القرآنية
 *  الواجهة (GitHub Pages) — تتصل بخادم Apps Script
 *  • رحلة واحدة: الحضور ← الاستظهار ← القرآن ← الدروس ← الإرسال
 *  • يُرسَل اليوم كاملاً مرة واحدة: إما 🟢 مُرسَل أو 🔴 غير مُرسَل
 *  • آخر تقرير وحده قابل للتعديل · المسودات تُحفظ تلقائياً
 * ═══════════════════════════════════════════════════════════
 */
(() => {
  'use strict';

  /* ───────────── الثوابت ───────────── */
  const API_URL = (window.APP_CONFIG || {}).API_URL || '';
  const T = { MAIN: 'معلم قسم', TALQIN: 'تلقين', MUNAFASA: 'منافسة' };
  const STEP = {
    att:     { label: 'الحضور',    icon: 'users' },
    rec:     { label: 'الاستظهار', icon: 'mic' },
    quran:   { label: 'القرآن',    icon: 'book' },
    lessons: { label: 'الدروس',    icon: 'note' },
    review:  { label: 'الإرسال',   icon: 'send' }
  };
  const ORD = ['الأولى', 'الثانية'];
  const MAX_LESSONS = 2;
  const TONES = ['var(--ok)', 'var(--bad)', 'var(--warn)'];
  const ATT_IC = ['check', 'x', 'clock'];
  const WEEK = [6, 0, 1, 2, 3, 4, 5];
  const WD_SHORT = { 0: 'أحد', 1: 'إثنين', 2: 'ثلاثاء', 3: 'أربعاء', 4: 'خميس', 5: 'جمعة', 6: 'سبت' };

  const app = document.getElementById('app');
  const S = { session: null, cls: null, date: null, draft: null, editing: false, recs: {}, calMonth: null, pendingEdit: false, lastIdx: 0 };

  /* ───────────── أدوات ───────────── */
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('ns.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ns.' + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem('ns.' + k); } catch (e) {} },
    keys(prefix) { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('ns.' + prefix) === 0) out.push(k.slice(3)); } } catch (e) {} return out; }
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clone = o => JSON.parse(JSON.stringify(o));
  const cfg = () => S.session.config;
  const isMain = () => !!S.cls && S.cls.role === T.MAIN;
  const dayKey = () => S.cls.id + '|' + S.date;
  const students = () => (S.cls && S.cls.students) || [];
  const str = v => (v == null ? '' : String(v));
  const absentLabel = () => cfg().lists.attendance[1];

  const IC = {
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
    note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    next: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    prev: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    chevL: '<path d="m15 18-6-6 6-6"/>',
    chevR: '<path d="m9 18 6-6-6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M17.9 17.9A10 10 0 0 1 12 19c-6.5 0-10-7-10-7a18 18 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
  };
  const ic = (n, c) => `<svg class="ic ${c || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;
  const logo = kind => `<svg class="logo" aria-hidden="true"><use href="#logo-${kind}"/></svg>`;

  let toastTimer;
  function toast(msg, type) {
    const el = $('#toast');
    const icon = { ok: 'check', bad: 'x', warn: 'info', info: 'info' }[type || 'info'];
    el.className = type || 'info';
    el.innerHTML = `<span class="dot">${ic(icon)}</span><span>${esc(msg)}</span>`;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }
  function setBusy(btn, on) { if (btn) { btn.classList.toggle('loading', on); btn.disabled = on; } }

  /* ───────────── التواريخ ───────────── */
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const WD = new Intl.DateTimeFormat('ar', { weekday: 'long' });
  const MONTH = new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric', numberingSystem: 'latn' });
  function today() { const loc = isoOf(new Date()), srv = (S.session && cfg().today) || ''; return srv > loc ? srv : loc; }
  function dLabel(s) {
    const d = parse(s);
    return { wd: s === today() ? 'اليوم' : WD.format(d), short: d.getDate() + '/' + (d.getMonth() + 1), full: WD.format(d) + ' ' + d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear() };
  }
  const isTeach = s => { const days = (S.cls && S.cls.days) || []; return !days.length || days.indexOf(parse(s).getDay()) > -1; };
  const holiday = s => (cfg().holidays || []).find(h => s >= h.from && s <= h.to);
  function dateOk(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s) || s > today()) return false;
    const ss = cfg().seasonStart; if (ss && s < ss) return false;
    return isTeach(s) && !holiday(s);
  }
  function defaultDate() {
    const d = parse(today());
    for (let i = 0; i < 21; i++) { const s = isoOf(d); if (dateOk(s)) return s; d.setDate(d.getDate() - 1); }
    return today();
  }
  function missFloor() {
    const ss = cfg().seasonStart; if (ss) return ss;
    const d = parse(today()); d.setDate(d.getDate() - 30); return isoOf(d);
  }

  /* حالة اليوم: يحددها التقرير اليومي المرسَل (مرة واحدة لكل الأجزاء) */
  const index = () => (S.cls && S.cls.index && S.cls.index.log) || { dates: [], off: [], last: '' };
  const status = () => { const i = index(); return i.dates.indexOf(S.date) < 0 ? 'new' : (i.last === S.date ? 'last' : 'locked'); };
  const formOpen = () => status() === 'new' || (status() === 'last' && S.editing);

  function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
  function setPath(o, path, v) { const ks = path.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }

  /* ───────────── الوضع النهاري/الليلي ───────────── */
  const theme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  function toggleTheme() {
    const html = document.documentElement, next = theme() === 'dark' ? 'light' : 'dark';
    html.classList.add('theme-anim'); html.dataset.theme = next; LS.set('theme', next); syncChrome();
    setTimeout(() => html.classList.remove('theme-anim'), 450);
  }
  function syncChrome() {
    const dark = theme() === 'dark';
    $$('[data-act="theme"]').forEach(b => { b.innerHTML = ic(dark ? 'sun' : 'moon'); b.title = dark ? 'الوضع النهاري' : 'الوضع الليلي'; });
    const m = $('meta[name="theme-color"]'); if (m) m.content = dark ? '#071A3A' : '#0F3D8C';
    $$('[data-act="install"]').forEach(b => { b.hidden = standalone(); });
  }

  /* ───────────── التثبيت كتطبيق (PWA) ───────────── */
  let installEvt = null;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)/i.test(navigator.userAgent);
  async function install() {
    if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; return; }
    const browser = isIOS ? 'Safari' : 'Chrome';
    openSheet(`
      <div class="sheet-h"><b>تثبيت السجل اليومي</b><button class="icon-btn sm plain" data-act="sheet-close" aria-label="إغلاق">${ic('x')}</button></div>
      <div class="isteps">
        <div><span>1</span><p>${inApp ? `أنت داخل متصفح تطبيق آخر. انسخ الرابط وافتحه في <b>${browser}</b>.` : `تأكد أنك تفتح الرابط في <b>${browser}</b> مباشرة، وليس من داخل واتساب أو فيسبوك.`}</p></div>
        <div><span>2</span><p>${isIOS ? 'اضغط زر المشاركة <b>⬆️</b> أسفل الشاشة.' : 'اضغط زر القائمة <b>⋮</b> أعلى الشاشة.'}</p></div>
        <div><span>3</span><p>اختر <b>${isIOS ? 'إضافة إلى الشاشة الرئيسية' : 'تثبيت التطبيق'}</b>${isIOS ? '' : ' أو «إضافة إلى الشاشة الرئيسية»'}، ثم أكّد.</p></div>
      </div>
      <div class="app-prev"><img src="icons/icon-192.png" alt=""><b>السجل اليومي</b></div>`);
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
  window.addEventListener('appinstalled', () => { installEvt = null; syncChrome(); toast('تم تثبيت السجل اليومي على جهازك', 'ok'); });

  /* ───────────── النافذة السفلية ───────────── */
  function openSheet(html) {
    closeSheet(true);
    const el = document.createElement('div');
    el.className = 'sheet-wrap';
    el.innerHTML = `<div class="sheet-bg" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  }
  function closeSheet(now) {
    const el = $('.sheet-wrap'); if (!el) return;
    if (now) return el.remove();
    el.classList.remove('open'); setTimeout(() => el.remove(), 320);
  }

  /* ───────────── الاتصال بالخادم ───────────── */
  async function call(action, payload, retry) {
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(API_URL)) throw new Error('ضع رابط الخادم في ملف config.js');
    if (!navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت');
    const body = Object.assign({ action, token: S.session && S.session.token }, payload || {});
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 25000);
    let res;
    try {
      const r = await fetch(API_URL, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctrl.signal });
      res = await r.json();
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'انتهت مهلة الاتصال، حاول مجدداً' : 'تعذّر الاتصال بالخادم');
    } finally { clearTimeout(timer); }
    if (res.ok) return res.data;
    if (res.error === 'SESSION' && retry !== false && S.session && S.session.code) {
      await login(S.session.code);
      return call(action, payload, false);
    }
    const err = new Error(res.message || 'حدث خطأ غير متوقع'); err.code = res.error; throw err;
  }

  async function login(code) {
    const d = await call('login', { code }, false);
    S.session = { code, token: d.token, teacher: d.teacher, classes: d.classes, config: d.config, at: Date.now() };
    S.lastIdx = Date.now();
    LS.set('session', S.session);
    if (S.cls) {
      const c = d.classes.find(x => x.id === S.cls.id);
      if (!c) { renderPicker(); return S.session; }
      S.cls = c;
      if (!dateOk(S.date)) { S.date = defaultDate(); saveUI(); loadDay(); }
      else safeRefresh();
    }
    return S.session;
  }

  /* تحديث خفيف للفهرس (يلتقط ما حُذف أو أُضيف في الشيت) */
  async function refreshIndex() {
    try {
      const d = await call('getIndex');
      S.lastIdx = Date.now();
      S.session.classes.forEach(c => { if (d[c.id]) c.index = d[c.id]; });
      LS.set('session', S.session);
      S.recs = {};
      safeRefresh();
    } catch (e) {}
  }
  function safeRefresh() {
    const box = $('#calBox'); if (box) box.innerHTML = calHTML();
    if (!S.cls || !S.draft || S.draft.dirty || S.editing) return;
    S.draft = buildDraft(); renderPanel(false);
  }

  /* ───────────── المسودة: تقرير اليوم كاملاً ───────────── */
  const emptyLesson = () => ({ subject: '', lesson: '', strategies: [], tools: [], tasks: [] });
  const freshOff = () => ({ on: false, reason: '', note: '' });
  const freshLog = () => ({ quran: { type: '', from: '', to: '', notes: '' }, lessons: [emptyLesson()], notes: '', off: freshOff() });
  const freshDay = () => ({ att: {}, rec: {}, log: freshLog(), step: 0, dirty: false });
  function logFrom(l) {
    if (!l) return freshLog();
    const q = l.quran || {}, o = l.off || {};
    return {
      quran: { type: str(q.type), from: str(q.from), to: str(q.to), notes: str(q.notes) },
      lessons: (l.lessons && l.lessons.length ? l.lessons : [{}]).map(x => ({ subject: str(x.subject), lesson: str(x.lesson), strategies: (x.strategies || []).slice(), tools: (x.tools || []).slice(), tasks: (x.tasks || []).slice() })),
      notes: str(l.notes),
      off: { on: !!o.on, reason: str(o.reason), note: str(o.note) }
    };
  }
  const steps = () => (isMain() ? ['att', 'rec', 'quran', 'lessons', 'review'] : ['lessons', 'review']);

  /** تقرير جديد = فارغ دائماً؛ تُسترجع فقط مسودة لم تُرسَل لنفس الحالة */
  function buildDraft() {
    const local = LS.get('draft.' + dayKey(), null);
    S.editing = false;
    const st = status();
    if (local && local.dirty && local.log && ((st === 'new' && !local.editing) || (st === 'last' && local.editing))) {
      S.editing = !!local.editing;
      setTimeout(() => toast('استُرجعت تغييرات لم تُرسَل بعد', 'info'), 300);
      const d = freshDay();
      return Object.assign(d, { att: local.att || {}, rec: local.rec || {}, log: Object.assign(freshLog(), local.log), step: local.step || 0, dirty: true });
    }
    return freshDay();
  }
  let persistTimer;
  function persist(now) {
    clearTimeout(persistTimer);
    const run = () => {
      if (!S.cls || !S.draft) return;
      if (S.draft.dirty) LS.set('draft.' + dayKey(), Object.assign({}, S.draft, { editing: S.editing }));
      else LS.del('draft.' + dayKey());
    };
    now ? run() : (persistTimer = setTimeout(run, 250));
  }
  function markDirty() { S.draft.dirty = true; persist(); }
  function cleanupDrafts() { const t = today(); LS.keys('draft.').forEach(k => { const d = k.split('|')[1]; if (!d || d > t) LS.del(k); }); }
  function saveUI() { LS.set('ui', { classId: S.cls && S.cls.id, date: S.date }); }

  async function fetchRecord(date) {
    const key = S.cls.id + '|' + date;
    if (S.recs[key]) return S.recs[key];
    const r = await call('getRecord', { classId: S.cls.id, date });
    S.recs[key] = { att: r.att || {}, rec: r.rec || {}, log: logFrom(r.log) };
    return S.recs[key];
  }
  const recOf = () => S.recs[dayKey()];

  /* ═════════════ الشاشات ═════════════ */

  /* ① الدخول */
  function renderLogin() {
    S.cls = null;
    app.innerHTML = `
      <section class="screen login">
        <div class="top">
          <span class="brand-sm">${ic('pen')} السجل اليومي</span>
          <button class="icon-btn plain" data-act="install" title="تثبيت التطبيق">${ic('download')}</button>
          <button class="icon-btn plain" data-act="theme"></button>
        </div>
        <div class="login-art"><span class="orbit spin"></span><span class="orbit o2"></span>${logo('full')}</div>
        <h1>سجل <em>المعلم</em> الرقمي</h1>
        <p class="sub deco">مدرسة نور السلام القرآنية</p>
        <div class="feat anim">
          <div style="--i:1"><i>${ic('users')}</i>الحضور</div>
          <div style="--i:2"><i>${ic('mic')}</i>الاستظهار</div>
          <div style="--i:3"><i>${ic('note')}</i>السجل اليومي</div>
        </div>
        <form id="loginForm" autocomplete="on" novalidate>
          <div class="code-wrap">
            <input id="code" class="inp" type="password" inputmode="numeric" autocomplete="current-password" placeholder="رمز الدخول" aria-label="رمز الدخول" required>
            <button type="button" class="eye" data-act="eye" aria-label="إظهار الرمز">${ic('eye')}</button>
          </div>
          <button class="btn btn-primary btn-cta" type="submit"><span>دخول</span><span class="cta-ic">${ic('next')}</span></button>
          <p class="form-err" id="loginErr"></p>
        </form>
        <p class="foot">يبقى دخولك محفوظاً على هذا الجهاز</p>
      </section>`;
    syncChrome();
    $('#loginForm').addEventListener('submit', onLogin);
  }
  async function onLogin(e) {
    e.preventDefault();
    const inp = $('#code'), code = inp.value.trim(), btn = $('.btn-cta'), err = $('#loginErr');
    err.textContent = '';
    if (!code) { inp.focus(); return; }
    setBusy(btn, true);
    try {
      await login(code);
      cleanupDrafts();
      const cs = S.session.classes;
      cs.length === 1 ? openClass(cs[0].id) : renderPicker();
    } catch (x) {
      setBusy(btn, false);
      err.textContent = x.message;
      const f = $('#loginForm'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
    }
  }

  const topButtons = () => `
    <button class="icon-btn glass" data-act="install" title="تثبيت التطبيق">${ic('download')}</button>
    <button class="icon-btn glass" data-act="theme"></button>
    <button class="icon-btn glass" data-act="logout" title="خروج">${ic('logout')}</button>`;

  /* ② اختيار القسم */
  function renderPicker() {
    S.cls = null; S.draft = null; saveUI();
    app.innerHTML = `
      <section class="screen">
        <header class="bar">
          <div class="bar-top">
            <div class="bar-id on-hero">${logo('mark')}<div><b class="deco">نور السلام</b><small>السجل اليومي</small></div></div>
            ${topButtons()}
          </div>
          <div class="greet"><p class="deco">السلام عليكم</p><h2>${esc(S.session.teacher.name)}</h2></div>
        </header>
        <main class="panel anim">
          <div class="toolbar" style="--i:0"><h3>اختر القسم الذي تدرّسه</h3></div>
          ${S.session.classes.map((c, i) => `
            <button class="ccard" style="--i:${i + 1}" data-act="pick" data-id="${esc(c.id)}">
              <span class="badge">${ic(c.role === T.MAIN ? 'book' : 'note')}</span>
              <span class="t"><b>${esc(c.name)}</b><small>${esc(c.level)} · ${esc(c.type)}</small></span>
              <span class="role">${esc(c.role)}</span>
              <span class="go">${ic('next')}</span>
            </button>`).join('')}
        </main>
      </section>`;
    syncChrome();
  }

  /* ③ الشاشة الرئيسية */
  function openClass(id, date) {
    const c = S.session.classes.find(x => x.id === id);
    if (!c) return renderPicker();
    S.cls = c;
    S.date = dateOk(date) ? date : defaultDate();
    saveUI(); renderMain(); loadDay();
  }
  function renderMain() {
    const c = S.cls, many = S.session.classes.length > 1;
    app.innerHTML = `
      <section class="screen" id="mainScreen">
        <header class="bar">
          <div class="bar-top">
            ${many ? `<button class="icon-btn glass" data-act="picker" title="تغيير القسم">${ic('grid')}</button>` : ''}
            <div class="bar-id on-hero">${logo('mark')}<div><b>${esc(c.name)}</b><small>${esc(c.level)} · ${esc(c.type)}</small></div></div>
            ${topButtons()}
          </div>
          <div class="bar-bottom">
            <span class="who"><span class="nm">${esc(S.session.teacher.name)}</span> <em>${esc(c.role)}</em></span>
            <button class="datebtn" data-act="cal" id="datebtn" aria-label="تغيير تاريخ الحصة"></button>
          </div>
        </header>
        <main class="panel" id="panel"></main>
        <div id="navSlot"></div>
      </section>`;
    syncChrome(); renderDateBtn();
  }
  function renderDateBtn() {
    const b = $('#datebtn'); if (!b) return;
    const l = dLabel(S.date);
    b.innerHTML = `<small>تاريخ الحصة</small><span>${ic('cal')}<b>${l.wd}</b> ${l.short}</span>`;
  }

  /* ───────── التقويم: 🟢 مُرسَل · 🔴 غير مُرسَل ───────── */
  function openCal() {
    const d = parse(S.date); S.calMonth = [d.getFullYear(), d.getMonth()];
    openSheet(`<div id="calBox">${calHTML()}</div>`);
    refreshIndex();
  }
  function calHTML() {
    if (!S.calMonth || !S.cls) return '';
    const [y, m] = S.calMonth, t = today(), ss = cfg().seasonStart, floor = missFloor();
    const first = new Date(y, m, 1), nDays = new Date(y, m + 1, 0).getDate();
    const offset = WEEK.indexOf(first.getDay());
    const done = new Set(index().dates);
    const tm = parse(t), canNext = y < tm.getFullYear() || (y === tm.getFullYear() && m < tm.getMonth());
    const limit = ss ? parse(ss) : new Date(tm.getFullYear() - 1, tm.getMonth(), 1);
    const canPrev = y > limit.getFullYear() || (y === limit.getFullYear() && m > limit.getMonth());
    let cells = WEEK.map(w => `<span class="wd">${WD_SHORT[w]}</span>`).join('');
    for (let i = 0; i < offset; i++) cells += '<span></span>';
    for (let day = 1; day <= nDays; day++) {
      const s = y + '-' + pad(m + 1) + '-' + pad(day), ok = dateOk(s), h = isTeach(s) && holiday(s);
      const mark = ok ? (done.has(s) ? 'rec' : (s < t && s >= floor ? 'miss' : '')) : '';
      const cls = ['cd', isTeach(s) && !h ? 'teach' : '', h ? 'hol' : '', ok ? '' : 'off', s === S.date ? 'sel' : '', s === t ? 'today' : '', mark].join(' ');
      cells += `<button class="${cls}" data-act="cal-pick" data-d="${s}" ${ok ? '' : 'tabindex="-1"'}${h ? ` title="${esc(h.reason)}"` : ''}>${day}</button>`;
    }
    return `
      <div class="sheet-h"><b>اختر تاريخ الحصة</b><button class="icon-btn sm plain" data-act="sheet-close" aria-label="إغلاق">${ic('x')}</button></div>
      <p class="cal-hint">اختر اليوم الذي دُرِّست فيه الحصة التي تكتب تقريرها</p>
      <div class="cal">
        <div class="cal-nav">
          <button class="icon-btn sm plain" data-act="cal-month" data-dir="-1" ${canPrev ? '' : 'disabled'} aria-label="الشهر السابق">${ic('chevR')}</button>
          <b>${MONTH.format(first)}</b>
          <button class="icon-btn sm plain" data-act="cal-month" data-dir="1" ${canNext ? '' : 'disabled'} aria-label="الشهر التالي">${ic('chevL')}</button>
        </div>
        <div class="cal-grid">${cells}</div>
        <div class="cal-legend"><span><i class="l2"></i>مُرسَل</span><span><i class="l4"></i>غير مُرسَل</span><span><i class="l5"></i>عطلة</span><span><i class="l3"></i>اليوم</span></div>
      </div>`;
  }

  /* تغيير التاريخ فوري: لا اتصال بالخادم */
  function loadDay() {
    S.draft = buildDraft();
    renderDateBtn();
    renderPanel(true);
    if (S.pendingEdit) { S.pendingEdit = false; if (status() === 'last') startEdit(); }
  }

  function renderPanel(animate) {
    const p = $('#panel'); if (!p || !S.draft) return;
    p.classList.toggle('anim', !!animate);
    const st = status();
    let body;
    if (st === 'locked') body = lockedCard();
    else if (!formOpen()) body = dayCard();
    else body = journey();
    p.innerHTML = head() + (S.editing ? editBanner() : '') + body;
    renderNav();
    if (st === 'last' && !formOpen() && !recOf()) loadDayCard();
  }

  function head() {
    const last = index().last;
    const btn = last && last !== S.date ? `<button class="lastchip" data-act="go-last">${ic('pen')} تعديل آخر تقرير</button>` : '';
    return `<div class="parthead" style="--i:0"><h3>تقرير اليوم</h3><div class="ph-acts">${btn}</div></div>`;
  }
  const editBanner = () => `<div class="editbanner" style="--i:0">${ic('pen')}<span>تعديل تقرير ${esc(dLabel(S.date).full)}</span><button data-act="cancel-edit">إلغاء</button></div>`;

  function lockedCard() {
    return `
      <div class="card state lock" style="--i:1">
        <div class="big">${ic('lock')}</div>
        <b>تقرير هذا اليوم مُرسَل ومقفل</b>
        <p>يمكن تعديل آخر تقرير فقط</p>
        <div class="acts">
          <button class="btn btn-soft" data-act="go-last">${ic('pen')} تعديل آخر تقرير</button>
          <button class="btn btn-ghost" data-act="cal">${ic('cal')} تاريخ آخر</button>
        </div>
      </div>`;
  }

  /* بطاقة تقرير اليوم المرسَل: ملخص الحضور والاستظهار والسجل + قلم للتعديل */
  function dayCard() {
    const r = recOf();
    return `
      <div class="report" style="--i:1">
        <div class="report-h">
          <span class="badge">${ic('note')}</span>
          <div><b>تقرير اليوم</b><small>${esc(dLabel(S.date).full)} · مُرسَل</small></div>
          <button class="icon-btn pen" data-act="edit" aria-label="تعديل التقرير" title="تعديل التقرير">${ic('pen')}</button>
        </div>
        <div class="report-b" id="reportBody">${r ? daySummary(r) : '<div class="sk line"></div><div class="sk line short"></div><div class="sk line"></div>'}</div>
      </div>`;
  }
  async function loadDayCard() {
    const date = S.date, cid = S.cls.id;
    try {
      const r = await fetchRecord(date);
      if (S.cls && S.cls.id === cid && S.date === date && !formOpen()) { const b = $('#reportBody'); if (b) b.innerHTML = daySummary(r); }
    } catch (x) {
      const b = $('#reportBody'); if (b) b.innerHTML = `<p class="muted">${esc(x.message)}</p>`;
      if (x.code === 'NOT_FOUND') refreshIndex();
    }
  }
  const namesBy = (map, pred) => students().filter(s => pred(map[s.id])).map(s => s.name);
  const sec = (title, inner) => `<div class="rsec"><h4>${title}</h4>${inner}</div>`;
  function daySummary(r) {
    if (r.log.off && r.log.off.on) return logRows(r.log);
    let out = '';
    if (isMain()) {
      const list = cfg().lists.attendance, c = attCounts(r.att);
      const names = list.slice(1).map(st => { const n = namesBy(r.att, v => v === st); return n.length ? `<li><b>${esc(st)}</b><span>${esc(n.join('، '))}</span></li>` : ''; }).join('');
      out += sec('الحضور', `<div class="tally">${list.map((s, i) => `<span style="--tone:${TONES[i] || 'var(--p)'}"><i></i>${esc(s)} <b>${c.by[s] || 0}</b></span>`).join('')}</div>${names ? `<ul class="sum">${names}</ul>` : ''}`);
      const y = namesBy(r.rec, v => v === true).length, nList = namesBy(r.rec, v => v === false);
      out += sec('الاستظهار', `<div class="tally"><span style="--tone:var(--ok)"><i></i>استظهر <b>${y}</b></span><span style="--tone:var(--bad)"><i></i>لم يستظهر <b>${nList.length}</b></span></div>
        ${nList.length ? `<ul class="sum"><li><b>لم يستظهر</b><span>${esc(nList.join('، '))}</span></li></ul>` : ''}`);
    }
    out += sec('السجل اليومي', logRows(r.log));
    return out;
  }

  /* ───────── الرحلة ───────── */
  function journey() {
    const d = S.draft;
    if (d.log.off && d.log.off.on) return formOff();
    const ss = steps(), i = Math.min(d.step || 0, ss.length - 1), cur = ss[i];
    const body = { att: stepAtt, rec: stepRec, quran: stepQuran, lessons: stepLessons, review: stepReview }[cur]();
    return `
      <div class="stepper j" style="--i:1">${ss.map((s, k) => `<button class="stp ${k < i ? 'done' : k === i ? 'on' : ''}" data-act="step-go" data-s="${k}" ${k > i ? 'disabled' : ''}><div class="b"><i></i></div><span>${STEP[s].label}</span></button>`).join('')}</div>
      ${body}
      ${i === 0 ? `<button class="offlink" data-act="off-on" style="--i:7">${ic('info')} لم تُقدَّم أي حصة في هذا اليوم</button>` : ''}`;
  }

  /* شريط ثابت أسفل الشاشة: السابق / التالي / إرسال */
  function renderNav() {
    const slot = $('#navSlot'); if (!slot) return;
    if (!S.draft || !formOpen()) { slot.innerHTML = ''; return; }
    const d = S.draft, editing = S.editing;
    if (d.log.off && d.log.off.on) {
      slot.innerHTML = `<nav class="jbar"><button class="btn btn-ghost" data-act="off-off">${ic('prev')} رجوع</button>
        <button class="btn btn-primary" data-act="send"><span>${ic(editing ? 'check' : 'send')}</span><span>${editing ? 'حفظ التعديل' : 'إرسال'}</span></button></nav>`;
      return;
    }
    const ss = steps(), i = Math.min(d.step || 0, ss.length - 1), last = i === ss.length - 1;
    slot.innerHTML = `<nav class="jbar">
      ${i > 0 ? `<button class="btn btn-ghost" data-act="step-prev" aria-label="السابق">${ic('prev')}</button>` : ''}
      ${last ? `<button class="btn btn-primary" data-act="send"><span>${ic(editing ? 'check' : 'send')}</span><span>${editing ? 'حفظ التعديل' : 'إرسال تقرير اليوم'}</span></button>`
             : `<button class="btn btn-primary" data-act="step-next"><span>التالي: ${STEP[ss[i + 1]].label}</span>${ic('next')}</button>`}
      <span class="jcount">${i + 1}/${ss.length}</span>
    </nav>`;
  }

  /* المؤشرات المدمجة */
  function attCounts(map) {
    const list = cfg().lists.attendance, by = {};
    list.forEach(s => { by[s] = 0; });
    let marked = 0; students().forEach(s => { if (map[s.id]) { marked++; if (by[map[s.id]] != null) by[map[s.id]]++; } });
    return { total: students().length, marked, by };
  }
  function miniCard(title, done, total, items) {
    const pct = total ? Math.round(done * 100 / total) : 0;
    return `<div class="mini"><div class="ring" style="--v:${pct}"><b>${pct}%</b></div>
      <div class="mini-b"><div class="mini-t"><span>${title}</span><b>${done}<small>/${total}</small></b></div>
      <div class="tally">${items.map(it => `<span style="--tone:${it.tone}"><i></i>${esc(it.label)} <b>${it.n}</b></span>`).join('')}</div></div></div>`;
  }
  const recPresent = () => students().filter(s => S.draft.att[s.id] !== absentLabel());
  function attStats() {
    const c = attCounts(S.draft.att), list = cfg().lists.attendance;
    return miniCard('تسجيل الحضور', c.marked, c.total, list.slice(0, 3).map((s, i) => ({ label: s, n: c.by[s] || 0, tone: TONES[i] })));
  }
  function recStats() {
    const r = S.draft.rec, pres = recPresent(); let y = 0, n = 0;
    pres.forEach(s => { if (r[s.id] === true) y++; else if (r[s.id] === false) n++; });
    return miniCard('الاستظهار', y + n, pres.length, [{ label: 'استظهر', n: y, tone: 'var(--ok)' }, { label: 'لم يستظهر', n, tone: 'var(--bad)' }, { label: 'لم يُحدَّد', n: pres.length - y - n, tone: 'var(--muted)' }]);
  }
  function refreshStats() { const b = $('#stats'); if (b) b.innerHTML = (stepNow() === 'att' ? attStats() : recStats()); }
  const stepNow = () => steps()[Math.min(S.draft.step || 0, steps().length - 1)];

  function stepAtt() {
    const st = students(), list = cfg().lists.attendance, a = S.draft.att;
    if (!st.length) return emptyState('لا يوجد تلاميذ نشطون في هذا القسم');
    return `
      <div id="stats" style="--i:2">${attStats()}</div>
      <div class="toolbar" style="--i:3"><h3>من حضر اليوم؟</h3><button class="btn btn-soft btn-sm" data-act="att-all">${ic('check')} الكل ${esc(list[0] || '')}</button></div>
      <div class="list">${st.map((s, n) => `
        <div class="srow" style="--i:${Math.min(n + 4, 14)}">
          <span class="av">${esc(initial(s.name))}</span><span class="sname">${esc(s.name)}</span>
          <div class="opts" data-id="${esc(s.id)}">${list.map((v, i) => `<button data-act="att" data-v="${esc(v)}" class="${a[s.id] === v ? 'on' : ''}" style="--tone:${TONES[i] || 'var(--p)'}" title="${esc(v)}" aria-label="${esc(v)}">${ATT_IC[i] ? ic(ATT_IC[i]) : esc(v[0])}</button>`).join('')}</div>
        </div>`).join('')}</div>`;
  }
  function stepRec() {
    const st = students(), r = S.draft.rec, a = S.draft.att, absent = absentLabel();
    return `
      <div id="stats" style="--i:2">${recStats()}</div>
      <div class="toolbar" style="--i:3"><h3>من استظهر؟</h3><button class="btn btn-soft btn-sm" data-act="rec-all">${ic('check')} الكل استظهر</button></div>
      <div class="list">${st.map((s, n) => {
        const abs = a[s.id] === absent;
        return `
        <div class="srow ${abs ? 'dim' : ''}" style="--i:${Math.min(n + 4, 14)}">
          <span class="av">${esc(initial(s.name))}</span><span class="sname">${esc(s.name)}${abs ? ` <span class="tag">${esc(absent)}</span>` : ''}</span>
          <div class="opts" data-id="${esc(s.id)}">
            <button data-act="rec" data-v="1" class="${r[s.id] === true ? 'on' : ''}" style="--tone:var(--ok)" ${abs ? 'disabled' : ''} aria-label="استظهر">${ic('check')}</button>
            <button data-act="rec" data-v="0" class="${r[s.id] === false ? 'on' : ''}" style="--tone:var(--bad)" ${abs ? 'disabled' : ''} aria-label="لم يستظهر">${ic('x')}</button>
          </div>
        </div>`; }).join('')}</div>`;
  }
  function stepQuran() {
    const q = S.draft.log.quran;
    if (S.cls.type === T.MUNAFASA) {
      return `<div class="card" style="--i:2">
        <div class="sec-h"><span class="badge">${ic('book')}</span><div><b>حصة الاستظهار</b><small>قسم منافسة — يحفظ التلاميذ بأنفسهم</small></div></div>
        <label class="field"><span>ملاحظات الحصة أثناء الاستظهار</span><textarea class="inp" data-bind="log.quran.notes" placeholder="اكتب ملاحظاتك عن الحصة...">${esc(q.notes)}</textarea></label>
      </div>`;
    }
    let extra = '';
    if (q.type === T.TALQIN) {
      extra = `<div class="two">
        <label class="field"><span>من</span><input class="inp" data-bind="log.quran.from" value="${esc(q.from)}" placeholder="السورة / الآية"></label>
        <label class="field"><span>إلى</span><input class="inp" data-bind="log.quran.to" value="${esc(q.to)}" placeholder="السورة / الآية"></label></div>`;
    } else if (q.type) {
      extra = `<label class="field"><span>ملاحظات حصة ${esc(q.type)}</span><textarea class="inp" data-bind="log.quran.notes" placeholder="اكتب ملاحظاتك...">${esc(q.notes)}</textarea></label>`;
    }
    return `<div class="card" style="--i:2">
      <div class="sec-h"><span class="badge">${ic('book')}</span><div><b>حصة القرآن</b><small>قسم تلقين</small></div></div>
      <div class="field"><span>نوع الحصة</span><div class="chips">${cfg().lists.talqin.map(t => chip('log.quran.type', t, q.type === t, false, true)).join('')}</div></div>
      ${extra}</div>`;
  }
  function stepLessons() {
    const L = S.draft.log, subs = cfg().curriculum[S.cls.level] || [], li = cfg().lists;
    const multi = (label, path, opts, sel) => opts.length ? `<div class="field"><span>${label}</span><div class="chips">${opts.map(o => chip(path, o, sel.indexOf(o) > -1, true)).join('')}</div></div>` : '';
    return L.lessons.map((l, i) => `
      <div class="card" style="--i:${i + 2}">
        <div class="sec-h"><span class="num">${i + 1}</span><div><b>الحصة ${ORD[i]}</b><small>${esc(l.subject || (isMain() ? 'اختيارية — اترُكها إن لم تُدرَّس مادة' : 'اختر المادة'))}</small></div>
          ${i > 0 ? `<button class="icon-btn sm plain" data-act="del-lesson" data-i="${i}" aria-label="حذف الحصة">${ic('trash')}</button>` : ''}</div>
        <div class="field"><span>المادة</span><div class="chips">${subs.map(s => chip(`log.lessons.${i}.subject`, s, l.subject === s)).join('') || '<small class="muted">لا توجد مواد لهذا المستوى في صفحة المنهاج</small>'}</div></div>
        <label class="field"><span>الدرس</span><input class="inp" data-bind="log.lessons.${i}.lesson" value="${esc(l.lesson)}" placeholder="عنوان الدرس"></label>
        ${multi('استراتيجية التدريس', `log.lessons.${i}.strategies`, li.strategies, l.strategies)}
        ${multi('الوسائل التعليمية', `log.lessons.${i}.tools`, li.tools, l.tools)}
        ${multi('المهام المنجزة', `log.lessons.${i}.tasks`, li.tasks, l.tasks)}
      </div>`).join('') +
      (L.lessons.length < MAX_LESSONS ? `<button class="btn btn-dashed" style="--i:4;margin-bottom:14px" data-act="add-lesson">${ic('plus')} إضافة الحصة الثانية</button>` : '');
  }
  function logRows(L) {
    if (L.off && L.off.on) {
      const r = [['الحصة', 'لم تُقدَّم'], ['السبب', L.off.reason || '—']];
      if (L.off.note) r.push(['ملاحظة', L.off.note]);
      return `<ul class="sum">${r.map(x => `<li><b>${x[0]}</b><span>${esc(x[1])}</span></li>`).join('')}</ul>`;
    }
    const q = L.quran || {}, rows = [];
    if (isMain()) {
      const qt = S.cls.type === T.MUNAFASA ? T.MUNAFASA : q.type;
      rows.push(['القرآن', qt ? (qt === T.TALQIN && (q.from || q.to) ? `${qt}: من ${q.from || '…'} إلى ${q.to || '…'}` : qt) : '—']);
      if (q.notes) rows.push(['ملاحظات الحصة', q.notes]);
    }
    (L.lessons || []).forEach((l, i) => l.subject && rows.push(['الحصة ' + ORD[i], l.subject + (l.lesson ? ' — ' + l.lesson : '')]));
    if (L.notes) rows.push(['ملاحظات', L.notes]);
    return `<ul class="sum">${rows.map(r => `<li><b>${r[0]}</b><span>${esc(r[1])}</span></li>`).join('')}</ul>`;
  }
  function stepReview() {
    const d = S.draft;
    return `
      <div class="card" style="--i:2">
        <div class="sec-h"><span class="badge">${ic('note')}</span><div><b>ملاحظات اليوم</b><small>اختيارية</small></div></div>
        <label class="field"><textarea class="inp" data-bind="log.notes" placeholder="أي ملاحظة عن الحصة أو التلاميذ...">${esc(d.log.notes)}</textarea></label>
      </div>
      <div class="report" style="--i:3">
        <div class="report-h"><span class="badge">${ic('check')}</span><div><b>مراجعة قبل الإرسال</b><small>${esc(dLabel(S.date).full)}</small></div></div>
        <div class="report-b">${daySummary({ att: d.att, rec: d.rec, log: d.log })}</div>
      </div>`;
  }
  function formOff() {
    const o = S.draft.log.off;
    return `
      <div class="card offcard" style="--i:1">
        <div class="sec-h"><span class="badge">${ic('info')}</span><div><b>لم تُقدَّم أي حصة في هذا اليوم</b><small>${esc(dLabel(S.date).full)}</small></div></div>
        <div class="field"><span>السبب</span><div class="chips">${(cfg().lists.off || []).map(r => chip('log.off.reason', r, o.reason === r)).join('')}</div></div>
        <label class="field"><span>ملاحظة</span><textarea class="inp" data-bind="log.off.note" placeholder="اختيارية">${esc(o.note)}</textarea></label>
      </div>`;
  }

  /* ───────── عناصر مشتركة ───────── */
  const initial = n => (String(n || '؟').trim()[0] || '؟');
  const emptyState = msg => `<div class="card empty">${ic('users')}<p>${esc(msg)}</p></div>`;
  function chip(path, v, on, multi, rerender) {
    return `<button class="chip ${on ? 'on' : ''}" data-act="chip" data-path="${path}" data-v="${esc(v)}"${multi ? ' data-multi="1"' : ''}${rerender ? ' data-rr="1"' : ''}>${esc(v)}</button>`;
  }

  /* ───────────── التحقق من كل خطوة قبل الانتقال ───────────── */
  function checkStep(step) {
    const d = S.draft;
    if (step === 'att') {
      const left = students().filter(s => !d.att[s.id]).length;
      if (left) { toast(`حدّد حضور كل التلاميذ (بقي ${left})`, 'warn'); return false; }
    }
    if (step === 'rec') {
      students().forEach(s => { if (d.att[s.id] === absentLabel()) delete d.rec[s.id]; });
      const left = recPresent().filter(s => typeof d.rec[s.id] !== 'boolean').length;
      if (left) { toast(`حدّد الاستظهار لكل الحاضرين (بقي ${left})`, 'warn'); return false; }
    }
    if (step === 'quran' && S.cls.type !== T.MUNAFASA && !d.log.quran.type) { toast('اختر نوع حصة القرآن', 'warn'); return false; }
    if (step === 'lessons') {
      const bad = d.log.lessons.findIndex(l => l.subject && !l.lesson.trim());
      if (bad > -1) {
        toast(`اكتب عنوان درس الحصة ${ORD[bad]}`, 'warn');
        const inp = $(`[data-bind="log.lessons.${bad}.lesson"]`); if (inp) inp.focus();
        return false;
      }
      if (!isMain() && !d.log.lessons.some(l => l.subject)) { toast('اختر المادة واكتب الدرس', 'warn'); return false; }
    }
    return true;
  }
  function goStep(i) {
    S.draft.step = Math.max(0, Math.min(i, steps().length - 1));
    persist(); renderPanel(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ───────────── الإرسال (عملية واحدة) ───────────── */
  async function send(btn) {
    const d = S.draft, editing = S.editing, off = d.log.off && d.log.off.on;
    let payload;
    if (off) {
      if (!d.log.off.reason) return toast('اختر سبب عدم تقديم الحصة', 'warn');
      payload = { noSession: { reason: d.log.off.reason, note: d.log.off.note } };
    } else {
      for (const s of steps()) if (s !== 'review' && !checkStep(s)) { goStep(steps().indexOf(s)); return; }
      const q = Object.assign({}, d.log.quran);
      if (S.cls.type === T.MUNAFASA) { q.type = T.MUNAFASA; q.from = q.to = ''; }
      else if (q.type === T.TALQIN) q.notes = ''; else { q.from = q.to = ''; }
      payload = {
        log: { quran: isMain() ? q : null, lessons: d.log.lessons.filter(l => l.subject || l.lesson), notes: d.log.notes },
        att: isMain() ? students().map(s => ({ id: s.id, status: d.att[s.id] })) : [],
        rec: isMain() ? recPresent().map(s => ({ id: s.id, done: d.rec[s.id] })) : []
      };
    }
    setBusy(btn, true);
    try {
      const res = await call('saveDay', Object.assign({ classId: S.cls.id, date: S.date }, payload));
      if (res && res.index) S.cls.index.log = res.index;
      LS.set('session', S.session);
      S.recs[dayKey()] = off ? { att: {}, rec: {}, log: logFrom({ off: Object.assign({ on: true }, payload.noSession) }) }
                             : { att: clone(d.att), rec: clone(payload.rec.reduce((o, x) => (o[x.id] = x.done, o), {})), log: logFrom(clone(payload.log)) };
      S.editing = false;
      S.draft = freshDay();
      persist(true);
      renderPanel(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast(editing ? 'تم حفظ التعديل' : (off ? 'تم تسجيل أن الحصة لم تُقدَّم' : 'تم إرسال تقرير اليوم'), 'ok');
    } catch (x) { setBusy(btn, false); toast(x.message, 'bad'); if (x.code === 'LOCKED') refreshIndex(); }
  }

  /* فتح آخر تقرير للتعديل */
  async function startEdit(btn) {
    let r = recOf();
    if (!r) {
      setBusy(btn, true);
      try { r = await fetchRecord(S.date); }
      catch (x) { setBusy(btn, false); toast(x.message, 'bad'); if (x.code === 'NOT_FOUND') refreshIndex(); return; }
    }
    S.editing = true;
    S.draft = Object.assign(freshDay(), { att: clone(r.att), rec: clone(r.rec), log: clone(r.log) });
    renderPanel(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function changeDate(d, edit) {
    closeSheet(); persist(true);
    S.pendingEdit = !!edit;
    S.date = d; saveUI(); loadDay();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function logout(silent, msg) {
    if (!silent && !confirm('تسجيل الخروج من هذا الجهاز؟')) return;
    LS.keys('draft.').forEach(k => LS.del(k));
    LS.del('session'); LS.del('ui');
    Object.assign(S, { session: null, cls: null, draft: null, editing: false, recs: {} });
    renderLogin();
    if (msg) toast(msg, 'warn');
  }

  /* ───────────── الأحداث ───────────── */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.dataset.act;
    switch (act) {
      case 'theme': return toggleTheme();
      case 'install': return install();
      case 'sheet-close': return closeSheet();
      case 'logout': return logout(false);
      case 'picker': return renderPicker();
      case 'pick': return openClass(b.dataset.id);
      case 'cal': return openCal();
      case 'cal-month': {
        const [y, m] = S.calMonth, d = new Date(y, m + Number(b.dataset.dir), 1);
        S.calMonth = [d.getFullYear(), d.getMonth()];
        const box = $('#calBox'); if (box) box.innerHTML = calHTML();
        return;
      }
      case 'cal-pick': return changeDate(b.dataset.d);
      case 'eye': {
        const inp = $('#code'), show = inp.type === 'password';
        inp.type = show ? 'text' : 'password'; b.innerHTML = ic(show ? 'eyeOff' : 'eye'); return;
      }
    }
    if (!S.draft) return;
    const d = S.draft;
    switch (act) {
      case 'go-last': return changeDate(index().last, true);
      case 'edit': return startEdit(b);
      case 'cancel-edit': {
        if (d.dirty && !confirm('إلغاء التعديلات غير المحفوظة؟')) return;
        S.editing = false; S.draft = freshDay(); persist(true);
        return renderPanel(true);
      }
      case 'step-next': {
        const ss = steps(), i = Math.min(d.step || 0, ss.length - 1);
        if (!checkStep(ss[i])) return;
        return goStep(i + 1);
      }
      case 'step-prev': return goStep((d.step || 0) - 1);
      case 'step-go': return goStep(+b.dataset.s);
      case 'send': return send(b);
      case 'off-on': case 'off-off': {
        d.log.off = d.log.off || freshOff();
        d.log.off.on = act === 'off-on';
        markDirty(); renderPanel(true);
        return window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      case 'att': {
        const id = b.parentElement.dataset.id, v = b.dataset.v;
        if (d.att[id] === v) delete d.att[id]; else d.att[id] = v;
        $$('button', b.parentElement).forEach(x => x.classList.toggle('on', x === b && !!d.att[id]));
        b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
        markDirty(); return refreshStats();
      }
      case 'att-all': {
        const v = cfg().lists.attendance[0];
        students().forEach(s => { if (!d.att[s.id]) d.att[s.id] = v; });
        markDirty(); return renderPanel(false);
      }
      case 'rec': {
        const id = b.parentElement.dataset.id, v = b.dataset.v === '1';
        if (d.rec[id] === v) delete d.rec[id]; else d.rec[id] = v;
        $$('button', b.parentElement).forEach(x => x.classList.toggle('on', d.rec[id] === (x.dataset.v === '1')));
        b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
        markDirty(); return refreshStats();
      }
      case 'rec-all': {
        recPresent().forEach(s => { if (typeof d.rec[s.id] !== 'boolean') d.rec[s.id] = true; });
        markDirty(); return renderPanel(false);
      }
      case 'chip': {
        const path = b.dataset.path, v = b.dataset.v;
        if (b.dataset.multi) {
          const arr = getPath(d, path) || [], i = arr.indexOf(v);
          i < 0 ? arr.push(v) : arr.splice(i, 1);
          setPath(d, path, arr); b.classList.toggle('on', i < 0);
        } else {
          const nv = getPath(d, path) === v ? '' : v;
          setPath(d, path, nv);
          if (b.dataset.rr) { markDirty(); return renderPanel(false); }
          $$('.chip', b.parentElement).forEach(x => x.classList.toggle('on', x === b && !!nv));
          const card = b.closest('.card'), sub = card && $('.sec-h small', card);
          if (sub && /subject$/.test(path)) sub.textContent = nv || 'اختر المادة';
        }
        return markDirty();
      }
      case 'add-lesson': {
        if (d.log.lessons.length < MAX_LESSONS) d.log.lessons.push(emptyLesson());
        markDirty(); renderPanel(false);
        const cards = $$('#panel .card'), lastCard = cards[cards.length - 1];
        if (lastCard) window.scrollTo({ top: window.scrollY + lastCard.getBoundingClientRect().top - 12, behavior: 'smooth' });
        return;
      }
      case 'del-lesson': {
        if (!confirm('حذف هذه الحصة؟')) return;
        d.log.lessons.splice(+b.dataset.i, 1);
        markDirty(); return renderPanel(false);
      }
    }
  });

  app.addEventListener('input', e => {
    const el = e.target.closest('[data-bind]'); if (!el || !S.draft) return;
    setPath(S.draft, el.dataset.bind, el.value);
    markDirty();
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return persist(true);
    if (S.session && S.session.token && Date.now() - S.lastIdx > 60000) refreshIndex();
  });
  window.addEventListener('pagehide', () => persist(true));
  window.addEventListener('offline', () => toast('انقطع الاتصال — تغييراتك محفوظة على الجهاز', 'warn'));
  window.addEventListener('online', () => toast('عاد الاتصال', 'ok'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncChrome);

  /* ───────────── الإقلاع ───────────── */
  function boot() {
    const s = LS.get('session', null);
    const fresh = s && s.code && s.config && ('today' in s.config) && s.classes && s.classes.every(c => c.index && c.index.log && !c.index.att);
    if (!fresh) { if (s && s.code) return relogin(s.code); return renderLogin(); }
    S.session = s;
    const ui = LS.get('ui', {});
    const only = s.classes.length === 1 ? s.classes[0].id : null;
    const target = s.classes.some(c => c.id === ui.classId) ? ui.classId : only;
    target ? openClass(target, ui.date) : renderPicker();
    login(s.code).then(cleanupDrafts).catch(x => { if (x.code === 'BAD_CODE') logout(true, 'تغيّر رمز الدخول، أعد الدخول'); });
  }
  /* جلسة من إصدار سابق: دخول صامت بالرمز المحفوظ (مع مسح مسودات الإصدار السابق) */
  function relogin(code) {
    renderLogin();
    LS.keys('draft.').forEach(k => LS.del(k));
    S.session = { code, config: {} };
    login(code).then(() => { const cs = S.session.classes; cs.length === 1 ? openClass(cs[0].id) : renderPicker(); })
      .catch(() => { S.session = null; LS.del('session'); });
  }

  boot();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
