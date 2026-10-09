/**
 * ═══════════════════════════════════════════════════════════
 *  السجل اليومي — مدرسة نور السلام القرآنية
 *  الواجهة (GitHub Pages) — تتصل بخادم Apps Script
 *  • التلاميذ وفهرس التقارير يصلان عند الدخول ← تغيير التاريخ فوري
 *  • تقرير جديد = خانات فارغة دائماً · آخر تقرير وحده قابل للتعديل
 *  • حفظ المسودات والجلسة · نهاري/ليلي · تطبيق قابل للتثبيت
 * ═══════════════════════════════════════════════════════════
 */
(() => {
  'use strict';

  /* ───────────── الثوابت ───────────── */
  const API_URL = (window.APP_CONFIG || {}).API_URL || '';
  const T = { MAIN: 'معلم قسم', TALQIN: 'تلقين', MUNAFASA: 'منافسة' };
  const TABS = [
    { id: 'att', label: 'الحضور', icon: 'users' },
    { id: 'rec', label: 'الاستظهار', icon: 'mic' },
    { id: 'log', label: 'السجل اليومي', icon: 'note' }
  ];
  const PART = { att: 'الحضور', rec: 'الاستظهار', log: 'السجل اليومي' };
  const PART_IC = { att: 'users', rec: 'mic', log: 'note' };
  const STEP_LABEL = { quran: 'حصة القرآن', lessons: 'الدروس', notes: 'الإرسال' };
  const ORD = ['الأولى', 'الثانية'];
  const MAX_LESSONS = 2;
  const TONES = ['var(--ok)', 'var(--bad)', 'var(--warn)'];
  const ATT_IC = ['check', 'x', 'clock'];                    // أيقونة كل حالة حضور حسب ترتيبها في الشيت
  const WEEK = [6, 0, 1, 2, 3, 4, 5];                        // أعمدة التقويم: السبت ← الجمعة
  const WD_SHORT = { 0: 'أحد', 1: 'إثنين', 2: 'ثلاثاء', 3: 'أربعاء', 4: 'خميس', 5: 'جمعة', 6: 'سبت' };

  const app = document.getElementById('app');
  const S = { session: null, cls: null, date: null, tab: 'att', draft: null, edit: {}, recs: {}, calMonth: null, pendingEdit: null, lastIdx: 0 };

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
  const parts = () => (isMain() ? ['att', 'rec', 'log'] : ['log']);
  const dayKey = () => S.cls.id + '|' + S.date;
  const students = () => (S.cls && S.cls.students) || [];
  const str = v => (v == null ? '' : String(v));

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
  /* حصص مرّت دون تقرير (لجزء معيّن): يوم دراسة سابق، ليس عطلة، وليس "لم تُقدَّم" */
  function missingDates(part) {
    const done = new Set(idx(part).dates), off = new Set(idx('log').off || []);
    const t = today(), ss = cfg().seasonStart, out = [];
    const d = parse(t); d.setDate(d.getDate() - 1);
    const floor = ss || isoOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 30));
    for (let s = isoOf(d); s >= floor; d.setDate(d.getDate() - 1), s = isoOf(d)) {
      if (dateOk(s) && !done.has(s) && !off.has(s)) out.push(s);
    }
    return out;
  }
  function defaultDate() {
    const d = parse(today());
    for (let i = 0; i < 21; i++) { const s = isoOf(d); if (dateOk(s)) return s; d.setDate(d.getDate() - 1); }
    return today();
  }

  /* حالة كل جزء لتاريخ معيّن — تُحسب محلياً من الفهرس (بدون اتصال) */
  const idx = p => (S.cls && S.cls.index && S.cls.index[p]) || { dates: [], last: '' };
  const status = p => { const i = idx(p); return i.dates.indexOf(S.date) < 0 ? 'new' : (i.last === S.date ? 'last' : 'locked'); };
  const formOpen = p => status(p) === 'new' || (status(p) === 'last' && !!S.edit[p]);

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

  /* تحديث خفيف لفهرس التقارير (يلتقط ما حُذف من الشيت) */
  async function refreshIndex() {
    try {
      const d = await call('getIndex');
      S.lastIdx = Date.now();
      S.session.classes.forEach(c => { if (d[c.id]) c.index = d[c.id]; });
      LS.set('session', S.session);
      safeRefresh();
    } catch (e) {}
  }
  /* إعادة رسم بعد تحديث الفهرس، دون إزعاج معلم يكتب */
  function safeRefresh() {
    const box = $('#calBox'); if (box) box.innerHTML = calHTML();
    if (!S.cls || !S.draft) return;
    if (parts().some(p => S.draft.dirty[p] || S.edit[p])) return;
    S.draft = buildDraft(); renderPanel(false);
  }

  /* ───────────── المسودات والتقارير ───────────── */
  const emptyLesson = () => ({ subject: '', lesson: '', strategies: [], tools: [], tasks: [] });
  const freshOff = () => ({ on: false, reason: '', note: '' });
  const freshLog = () => ({ quran: { type: '', from: '', to: '', notes: '' }, lessons: [emptyLesson()], notes: '', step: 0, off: freshOff() });
  function logFrom(l) {
    if (!l) return freshLog();
    const q = l.quran || {}, o = l.off || {};
    return {
      quran: { type: str(q.type), from: str(q.from), to: str(q.to), notes: str(q.notes) },
      lessons: (l.lessons && l.lessons.length ? l.lessons : [{}]).map(x => ({ subject: str(x.subject), lesson: str(x.lesson), strategies: (x.strategies || []).slice(), tools: (x.tools || []).slice(), tasks: (x.tasks || []).slice() })),
      notes: str(l.notes), step: 0,
      off: { on: !!o.on, reason: str(o.reason), note: str(o.note) }
    };
  }
  const emptyOf = p => (p === 'log' ? freshLog() : {});

  /** نقطة البداية دائماً فارغة؛ تُسترجع فقط مسودة لم تُحفظ تخص نفس الحالة */
  function buildDraft() {
    const local = LS.get('draft.' + dayKey(), null);
    const d = { att: {}, rec: {}, log: freshLog(), dirty: { att: false, rec: false, log: false } };
    S.edit = {};
    let restored = false;
    if (local && local.dirty) {
      const le = local.edit || {};
      parts().forEach(p => {
        const st = status(p);
        const fits = (st === 'new' && !le[p]) || (st === 'last' && le[p]);
        if (local.dirty[p] && local[p] && fits) { d[p] = local[p]; d.dirty[p] = true; if (le[p]) S.edit[p] = true; restored = true; }
      });
    }
    if (local && local.log && !d.dirty.log && status('log') === 'new') d.log.step = local.log.step || 0;
    if (restored) setTimeout(() => toast('استُرجعت تغييرات لم تُحفظ بعد', 'info'), 300);
    return d;
  }
  let persistTimer;
  function persist(now) {
    clearTimeout(persistTimer);
    const run = () => {
      if (!S.cls || !S.draft) return;
      const d = S.draft.dirty;
      if (d.att || d.rec || d.log || S.draft.log.step) LS.set('draft.' + dayKey(), Object.assign({}, S.draft, { edit: S.edit }));
      else LS.del('draft.' + dayKey());
    };
    now ? run() : (persistTimer = setTimeout(run, 250));
  }
  function markDirty(part) { S.draft.dirty[part] = true; persist(); renderSaveFab(); }
  function cleanupDrafts() { const t = today(); LS.keys('draft.').forEach(k => { const d = k.split('|')[1]; if (!d || d > t) LS.del(k); }); }
  function saveUI() { LS.set('ui', { classId: S.cls && S.cls.id, date: S.date, tab: S.tab }); }

  /** جلب تقرير مسجَّل (للعرض أو التعديل) مع ذاكرة محلية */
  async function fetchRecord(part, date) {
    const key = S.cls.id + '|' + part + '|' + date;
    if (S.recs[key]) return S.recs[key];
    const r = await call('getRecord', { classId: S.cls.id, date, part });
    S.recs[key] = { data: part === 'log' ? logFrom(r.data) : (r.data || {}) };
    return S.recs[key];
  }
  const recOf = part => S.recs[S.cls.id + '|' + part + '|' + S.date];

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
  function openClass(id, date, tab) {
    const c = S.session.classes.find(x => x.id === id);
    if (!c) return renderPicker();
    S.cls = c;
    S.date = dateOk(date) ? date : defaultDate();
    S.tab = isMain() ? (TABS.some(t => t.id === tab) ? tab : 'att') : 'log';
    saveUI(); renderMain(); loadDay();
  }

  function renderMain() {
    const c = S.cls, many = S.session.classes.length > 1, main = isMain();
    app.innerHTML = `
      <section class="screen ${main ? '' : 'no-tabs'}" id="mainScreen">
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
        <div id="saveSlot"></div>
        ${main ? `
        <nav class="tabbar" id="tabbar">
          <span class="ind"></span>
          ${TABS.map(t => `<button class="tab" data-act="tab" data-t="${t.id}">${ic(t.icon)}<span>${t.label}</span></button>`).join('')}
        </nav>` : ''}
      </section>`;
    syncChrome(); renderDateBtn(); syncTabs();
  }

  function renderDateBtn() {
    const b = $('#datebtn'); if (!b) return;
    const l = dLabel(S.date);
    b.innerHTML = `<small>تاريخ الحصة</small><span>${ic('cal')}<b>${l.wd}</b> ${l.short}</span>`;
  }
  function syncTabs() {
    const bar = $('#tabbar'); if (!bar) return;
    const i = TABS.findIndex(t => t.id === S.tab);
    $('.ind', bar).style.transform = `translateX(${-100 * i}%)`;
    $$('.tab', bar).forEach(b => b.classList.toggle('on', b.dataset.t === S.tab));
  }

  /* ───────── التقويم ───────── */
  function openCal() {
    const d = parse(S.date); S.calMonth = [d.getFullYear(), d.getMonth()];
    openSheet(`<div id="calBox">${calHTML()}</div>`);
    refreshIndex();                                           // تحديث النقاط في الخلفية
  }
  function calHTML() {
    if (!S.calMonth || !S.cls) return '';
    const [y, m] = S.calMonth, t = today(), ss = cfg().seasonStart;
    const first = new Date(y, m, 1), nDays = new Date(y, m + 1, 0).getDate();
    const offset = WEEK.indexOf(first.getDay());
    const rec = new Set(idx(S.tab).dates), miss = new Set(missingDates(S.tab));
    const tm = parse(t), canNext = y < tm.getFullYear() || (y === tm.getFullYear() && m < tm.getMonth());
    const limit = ss ? parse(ss) : new Date(tm.getFullYear() - 1, tm.getMonth(), 1);
    const canPrev = y > limit.getFullYear() || (y === limit.getFullYear() && m > limit.getMonth());
    let cells = WEEK.map(w => `<span class="wd">${WD_SHORT[w]}</span>`).join('');
    for (let i = 0; i < offset; i++) cells += '<span></span>';
    for (let day = 1; day <= nDays; day++) {
      const s = y + '-' + pad(m + 1) + '-' + pad(day), ok = dateOk(s), h = isTeach(s) && holiday(s);
      const cls = ['cd', isTeach(s) && !h ? 'teach' : '', h ? 'hol' : '', ok ? '' : 'off', s === S.date ? 'sel' : '', s === t ? 'today' : '',
        rec.has(s) ? 'rec' : '', miss.has(s) ? 'miss' : ''].join(' ');
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
        <div class="cal-legend"><span><i class="l1"></i>يوم دراسة</span><span><i class="l2"></i>مُسجَّل</span><span><i class="l4"></i>بدون تقرير</span><span><i class="l5"></i>عطلة</span><span><i class="l3"></i>اليوم</span></div>
      </div>`;
  }

  /* تغيير التاريخ فوري: لا اتصال بالخادم */
  function loadDay() {
    S.draft = buildDraft();
    renderDateBtn();
    renderPanel(true);
    if (S.pendingEdit) {
      const p = S.pendingEdit; S.pendingEdit = null;
      if (status(p) === 'last') startEdit(p);
    }
  }

  function renderPanel(animate) {
    const p = $('#panel'); if (!p || !S.draft) return;
    p.classList.toggle('anim', !!animate);
    const part = S.tab, st = status(part);
    let body;
    if (st === 'locked') body = stateLocked(part);
    else if (!formOpen(part)) body = reportCard(part);
    else body = part === 'att' ? formAtt() : part === 'rec' ? formRec() : formLog();
    p.innerHTML = partHead(part) + (S.edit[part] ? editBanner(part) : '') + body;
    renderSaveFab();
    if (st === 'last' && !formOpen(part) && !recOf(part)) loadReportBody(part);
  }

  /* زر "تعديل آخر تقرير" في البداية — بدون تاريخ */
  function partHead(part) {
    const last = idx(part).last, miss = missingDates(part).length;
    const btn = last && last !== S.date ? `<button class="lastchip" data-act="go-last" data-p="${part}">${ic('pen')} تعديل آخر تقرير</button>` : '';
    const warn = miss ? `<button class="misschip" data-act="cal" title="افتح التقويم لرؤيتها">${miss} ${miss === 1 ? 'حصة' : 'حصص'} بدون تقرير</button>` : '';
    return `<div class="parthead" style="--i:0"><h3>${PART[part]}</h3><div class="ph-acts">${warn}${btn}</div></div>`;
  }
  const editBanner = part => `<div class="editbanner" style="--i:0">${ic('pen')}<span>تعديل تقرير ${PART[part]} — ${esc(dLabel(S.date).full)}</span><button data-act="cancel-edit" data-p="${part}">إلغاء</button></div>`;

  /* بطاقة التقرير المسجَّل: مستطيلة + قلم للتعديل */
  function reportCard(part) {
    const r = recOf(part);
    return `
      <div class="report" style="--i:1">
        <div class="report-h">
          <span class="badge">${ic(PART_IC[part])}</span>
          <div><b>تقرير ${PART[part]}</b><small>${esc(dLabel(S.date).full)} · مُرسَل</small></div>
          <button class="icon-btn pen" data-act="edit" data-p="${part}" aria-label="تعديل التقرير" title="تعديل التقرير">${ic('pen')}</button>
        </div>
        <div class="report-b" id="reportBody">${r ? reportSummary(part, r.data) : '<div class="sk line"></div><div class="sk line short"></div>'}</div>
      </div>`;
  }
  async function loadReportBody(part) {
    const date = S.date, cid = S.cls.id;
    try {
      const r = await fetchRecord(part, date);
      if (S.cls && S.cls.id === cid && S.date === date && S.tab === part && !formOpen(part)) {
        const b = $('#reportBody'); if (b) b.innerHTML = reportSummary(part, r.data);
      }
    } catch (x) {
      const b = $('#reportBody'); if (b) b.innerHTML = `<p class="muted">${esc(x.message)}</p>`;
      if (x.code === 'NOT_FOUND') refreshIndex();
    }
  }
  function namesBy(map, pred) { return students().filter(s => pred(map[s.id])).map(s => s.name); }
  function reportSummary(part, data) {
    if (part === 'log') return logRows(data);
    if (part === 'att') {
      const list = cfg().lists.attendance, c = attCounts(data);
      const rows = list.slice(1).map(st => { const n = namesBy(data, v => v === st); return n.length ? `<li><b>${esc(st)}</b><span>${esc(n.join('، '))}</span></li>` : ''; }).join('');
      return `<div class="tally">${list.map((s, i) => `<span style="--tone:${TONES[i] || 'var(--p)'}"><i></i>${esc(s)} <b>${c.by[s] || 0}</b></span>`).join('')}</div>${rows ? `<ul class="sum">${rows}</ul>` : ''}`;
    }
    const y = namesBy(data, v => v === true).length, nList = namesBy(data, v => v === false);
    return `<div class="tally"><span style="--tone:var(--ok)"><i></i>استظهر <b>${y}</b></span><span style="--tone:var(--bad)"><i></i>لم يستظهر <b>${nList.length}</b></span></div>
      ${nList.length ? `<ul class="sum"><li><b>لم يستظهر</b><span>${esc(nList.join('، '))}</span></li></ul>` : ''}`;
  }

  /* حالة: مقفل */
  function stateLocked(part) {
    return `
      <div class="card state lock" style="--i:1">
        <div class="big">${ic('lock')}</div>
        <b>تقرير هذا التاريخ مُرسَل ومقفل</b>
        <p>يمكن تعديل آخر تقرير فقط</p>
        <div class="acts">
          <button class="btn btn-soft" data-act="go-last" data-p="${part}">${ic('pen')} تعديل آخر تقرير</button>
          <button class="btn btn-ghost" data-act="cal">${ic('cal')} تاريخ آخر</button>
        </div>
      </div>`;
  }

  /* ───────── المؤشرات المدمجة (للعرض فقط) ───────── */
  function attCounts(map) {
    const list = cfg().lists.attendance, by = {};
    list.forEach(s => { by[s] = 0; });
    let marked = 0; students().forEach(s => { if (map[s.id]) { marked++; if (by[map[s.id]] != null) by[map[s.id]]++; } });
    return { total: students().length, marked, by };
  }
  function miniCard(title, done, total, items) {
    const pct = total ? Math.round(done * 100 / total) : 0;
    return `
      <div class="mini">
        <div class="ring" style="--v:${pct}"><b>${pct}%</b></div>
        <div class="mini-b">
          <div class="mini-t"><span>${title}</span><b>${done}<small>/${total}</small></b></div>
          <div class="tally">${items.map(it => `<span style="--tone:${it.tone}"><i></i>${esc(it.label)} <b>${it.n}</b></span>`).join('')}</div>
        </div>
      </div>`;
  }
  function attStats() {
    const c = attCounts(S.draft.att), list = cfg().lists.attendance;
    return miniCard('تسجيل الحضور', c.marked, c.total, list.slice(0, 3).map((s, i) => ({ label: s, n: c.by[s] || 0, tone: TONES[i] })));
  }
  function recStats() {
    const r = S.draft.rec; let y = 0, n = 0;
    students().forEach(s => { if (r[s.id] === true) y++; else if (r[s.id] === false) n++; });
    return miniCard('الاستظهار', y + n, students().length, [
      { label: 'استظهر', n: y, tone: 'var(--ok)' }, { label: 'لم يستظهر', n, tone: 'var(--bad)' },
      { label: 'لم يُحدَّد', n: students().length - y - n, tone: 'var(--muted)' }]);
  }
  function refreshStats() { const b = $('#stats'); if (b) b.innerHTML = S.tab === 'att' ? attStats() : recStats(); }

  /* ───────── الحضور ───────── */
  function formAtt() {
    const st = students(), list = cfg().lists.attendance, a = S.draft.att;
    if (!st.length) return emptyState('لا يوجد تلاميذ نشطون في هذا القسم');
    return `
      <div id="stats" style="--i:1">${attStats()}</div>
      <div class="toolbar" style="--i:2"><h3>التلاميذ</h3><button class="btn btn-soft btn-sm" data-act="att-all">${ic('check')} الكل ${esc(list[0] || '')}</button></div>
      <div class="list">${st.map((s, n) => `
        <div class="srow" style="--i:${Math.min(n + 3, 14)}">
          <span class="av">${esc(initial(s.name))}</span><span class="sname">${esc(s.name)}</span>
          <div class="opts" data-id="${esc(s.id)}">${list.map((v, i) => `<button data-act="att" data-v="${esc(v)}" class="${a[s.id] === v ? 'on' : ''}" style="--tone:${TONES[i] || 'var(--p)'}" title="${esc(v)}" aria-label="${esc(v)}">${ATT_IC[i] ? ic(ATT_IC[i]) : esc(v[0])}</button>`).join('')}</div>
        </div>`).join('')}</div>`;
  }

  /* ───────── الاستظهار ───────── */
  function formRec() {
    const st = students(), r = S.draft.rec;
    if (!st.length) return emptyState('لا يوجد تلاميذ نشطون في هذا القسم');
    return `
      <div id="stats" style="--i:1">${recStats()}</div>
      <div class="toolbar" style="--i:2"><h3>من استظهر؟</h3><button class="btn btn-soft btn-sm" data-act="rec-all">${ic('check')} الكل استظهر</button></div>
      <div class="list">${st.map((s, n) => `
        <div class="srow" style="--i:${Math.min(n + 3, 14)}">
          <span class="av">${esc(initial(s.name))}</span><span class="sname">${esc(s.name)}</span>
          <div class="opts" data-id="${esc(s.id)}">
            <button data-act="rec" data-v="1" class="${r[s.id] === true ? 'on' : ''}" style="--tone:var(--ok)" title="استظهر" aria-label="استظهر">${ic('check')}</button>
            <button data-act="rec" data-v="0" class="${r[s.id] === false ? 'on' : ''}" style="--tone:var(--bad)" title="لم يستظهر" aria-label="لم يستظهر">${ic('x')}</button>
          </div>
        </div>`).join('')}</div>`;
  }

  /* ───────── السجل اليومي ───────── */
  const logSteps = () => (isMain() ? ['quran', 'lessons', 'notes'] : ['lessons', 'notes']);
  /* حصة لم تُقدَّم: السبب فقط (لا يبقى اليوم فارغاً) */
  function formOff() {
    const o = S.draft.log.off, editing = !!S.edit.log;
    return `
      <div class="card offcard" style="--i:1">
        <div class="sec-h"><span class="badge">${ic('info')}</span><div><b>لم تُقدَّم الحصة</b><small>${esc(dLabel(S.date).full)}</small></div></div>
        <div class="field"><span>السبب</span><div class="chips">${(cfg().lists.off || []).map(r => chip('log.off.reason', r, o.reason === r)).join('')}</div></div>
        <label class="field"><span>ملاحظة</span><textarea class="inp" data-bind="log.off.note" placeholder="اختيارية">${esc(o.note)}</textarea></label>
      </div>
      <div class="stepnav" style="--i:3">
        <button class="btn btn-ghost" data-act="off-off">${ic('prev')} رجوع</button>
        <button class="btn btn-primary" data-act="save-log"><span>${ic(editing ? 'check' : 'send')}</span><span>${editing ? 'حفظ التعديل' : 'إرسال'}</span></button>
      </div>`;
  }

  function formLog() {
    const L = S.draft.log;
    if (L.off && L.off.on) return formOff();
    return formLogSteps() + `<button class="offlink" data-act="off-on" style="--i:7">${ic('info')} لم أقدّم حصة في هذا اليوم</button>`;
  }
  function formLogSteps() {
    const steps = logSteps(), L = S.draft.log;
    const st = Math.min(L.step || 0, steps.length - 1), last = st === steps.length - 1, editing = !!S.edit.log;
    const body = { quran: stepQuran, lessons: stepLessons, notes: stepNotes }[steps[st]]();
    return `
      <div class="stepper" style="--i:1">${steps.map((s, i) => `<button class="stp ${i < st ? 'done' : i === st ? 'on' : ''}" data-act="step-go" data-s="${i}"><div class="b"><i></i></div><span>${i + 1}. ${STEP_LABEL[s]}</span></button>`).join('')}</div>
      ${body}
      <div class="stepnav" style="--i:6">
        ${st > 0 ? `<button class="btn btn-ghost" data-act="step-prev">${ic('prev')} السابق</button>` : ''}
        ${last ? `<button class="btn btn-primary" data-act="save-log"><span>${ic(editing ? 'check' : 'send')}</span><span>${editing ? 'حفظ التعديل' : 'إرسال التقرير'}</span></button>`
               : `<button class="btn btn-primary" data-act="step-next"><span>التالي</span>${ic('next')}</button>`}
      </div>`;
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
        <div class="sec-h"><span class="num">${i + 1}</span><div><b>الحصة ${ORD[i]}</b><small>${esc(l.subject || 'اختر المادة')}</small></div>
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
    (L.lessons || []).forEach((l, i) => (i === 0 || l.subject) && rows.push(['الحصة ' + ORD[i], l.subject ? l.subject + (l.lesson ? ' — ' + l.lesson : '') : '—']));
    if (L.notes) rows.push(['ملاحظات', L.notes]);
    return `<ul class="sum">${rows.map(r => `<li><b>${r[0]}</b><span>${esc(r[1])}</span></li>`).join('')}</ul>`;
  }
  function stepNotes() {
    const L = S.draft.log;
    return `
      <div class="card" style="--i:2">
        <div class="sec-h"><span class="badge">${ic('note')}</span><div><b>ملاحظات اليوم</b><small>اختيارية</small></div></div>
        <label class="field"><textarea class="inp" data-bind="log.notes" placeholder="أي ملاحظة عن الحصة أو التلاميذ...">${esc(L.notes)}</textarea></label>
      </div>
      <div class="card" style="--i:3">
        <div class="sec-h"><span class="badge">${ic('check')}</span><div><b>ملخص التقرير</b><small>${esc(dLabel(S.date).full)}</small></div></div>
        ${logRows(L)}
      </div>`;
  }

  /* ───────── عناصر مشتركة ───────── */
  const initial = n => (String(n || '؟').trim()[0] || '؟');
  const emptyState = msg => `<div class="card empty">${ic('users')}<p>${esc(msg)}</p></div>`;
  /* الشريحة: تلوين فقط عند الاختيار (بدون علامة، فلا يتغير حجمها) */
  function chip(path, v, on, multi, rerender) {
    return `<button class="chip ${on ? 'on' : ''}" data-act="chip" data-path="${path}" data-v="${esc(v)}"${multi ? ' data-multi="1"' : ''}${rerender ? ' data-rr="1"' : ''}>${esc(v)}</button>`;
  }

  /* زر حفظ صغير عائم: يظهر فقط عند وجود تغييرات (الحضور والاستظهار) */
  function renderSaveFab() {
    const slot = $('#saveSlot'); if (!slot) return;
    const part = S.tab, show = !!S.draft && part !== 'log' && formOpen(part) && S.draft.dirty[part];
    if (!show) { slot.innerHTML = ''; return; }
    if ($('.savefab', slot)) return;
    slot.innerHTML = `<button class="savefab" data-act="save-${part}"><span>${ic('check')}</span><span>${S.edit[part] ? 'حفظ التعديل' : 'حفظ ' + PART[part]}</span></button>`;
  }

  /* ───────────── الحفظ ───────────── */
  function afterSave(part, res, copy) {
    if (res && res.index) S.cls.index[part] = res.index;
    LS.set('session', S.session);
    S.recs[S.cls.id + '|' + part + '|' + S.date] = { data: copy };
    S.edit[part] = false;
    S.draft[part] = emptyOf(part);                       // الخانات تعود فارغة دائماً
    S.draft.dirty[part] = false;
    persist(true);
    renderPanel(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function savePart(part, btn) {
    const st = students(), editing = !!S.edit[part];
    let action, items, copy;
    if (part === 'att') {
      const a = S.draft.att;
      items = st.filter(s => a[s.id]).map(s => ({ id: s.id, status: a[s.id] }));
      if (!items.length) return toast('لم تحدد حالة أي تلميذ', 'warn');
      const left = st.length - items.length;
      if (left && !confirm(`بقي ${left} تلميذ دون تحديد. حفظ الحضور هكذا؟`)) return;
      action = 'saveAttendance'; copy = clone(a);
    } else {
      const r = S.draft.rec;
      items = st.filter(s => typeof r[s.id] === 'boolean').map(s => ({ id: s.id, done: r[s.id] }));
      if (!items.length) return toast('لم تحدد أي تلميذ', 'warn');
      action = 'saveRecitation'; copy = clone(r);
    }
    setBusy(btn, true);
    try {
      const res = await call(action, { classId: S.cls.id, date: S.date, items });
      afterSave(part, res, copy);
      toast(editing ? `تم حفظ تعديل ${PART[part]}` : `تم حفظ ${PART[part]}`, 'ok');
    } catch (x) { setBusy(btn, false); toast(x.message, 'bad'); if (x.code === 'LOCKED') refreshIndex(); }
  }

  async function saveLog(btn) {
    const L = S.draft.log, q = Object.assign({}, L.quran), editing = !!S.edit.log;
    if (L.off && L.off.on) {
      if (!L.off.reason) return toast('اختر سبب عدم تقديم الحصة', 'warn');
      setBusy(btn, true);
      try {
        const noSession = { reason: L.off.reason, note: L.off.note };
        const res = await call('saveLog', { classId: S.cls.id, date: S.date, noSession });
        afterSave('log', res, logFrom({ off: Object.assign({ on: true }, noSession) }));
        toast('تم تسجيل أن الحصة لم تُقدَّم', 'ok');
      } catch (x) { setBusy(btn, false); toast(x.message, 'bad'); if (x.code === 'LOCKED') refreshIndex(); }
      return;
    }
    if (S.cls.type === T.MUNAFASA) { q.type = T.MUNAFASA; q.from = q.to = ''; }
    else if (q.type === T.TALQIN) q.notes = '';
    else { q.from = q.to = ''; }
    const lessons = L.lessons.filter(l => l.subject || l.lesson);
    if (isMain() && S.cls.type !== T.MUNAFASA && !q.type && !lessons.length) return toast('التقرير فارغ', 'warn');
    if (!isMain() && !lessons.length) return toast('اختر المادة واكتب الدرس أولاً', 'warn');
    setBusy(btn, true);
    try {
      const payload = { quran: isMain() ? q : null, lessons, notes: L.notes };
      const res = await call('saveLog', Object.assign({ classId: S.cls.id, date: S.date }, payload));
      afterSave('log', res, logFrom(clone({ quran: payload.quran || {}, lessons, notes: L.notes })));
      toast(editing ? 'تم حفظ تعديل التقرير' : 'تم إرسال التقرير', 'ok');
    } catch (x) { setBusy(btn, false); toast(x.message, 'bad'); if (x.code === 'LOCKED') refreshIndex(); }
  }

  /* فتح آخر تقرير للتعديل */
  async function startEdit(part, btn) {
    let r = recOf(part);
    if (!r) {
      setBusy(btn, true);
      try { r = await fetchRecord(part, S.date); }
      catch (x) { setBusy(btn, false); toast(x.message, 'bad'); if (x.code === 'NOT_FOUND') refreshIndex(); return; }
    }
    S.edit[part] = true;
    S.draft[part] = clone(r.data);
    if (part === 'log') S.draft.log.step = 0;
    S.draft.dirty[part] = false;
    renderPanel(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goStep(i) {
    S.draft.log.step = Math.max(0, Math.min(i, logSteps().length - 1));
    persist(); renderPanel(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function checkLessons() {
    const bad = S.draft.log.lessons.findIndex(l => l.subject && !l.lesson.trim());
    if (bad > -1) {
      toast(`اكتب عنوان درس الحصة ${ORD[bad]}`, 'warn');
      const inp = $(`[data-bind="log.lessons.${bad}.lesson"]`); if (inp) inp.focus();
      return false;
    }
    return true;
  }

  function changeDate(d, editPart) {
    closeSheet();
    persist(true);
    S.pendingEdit = editPart || null;
    S.date = d; saveUI(); loadDay();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function logout(silent, msg) {
    if (!silent && !confirm('تسجيل الخروج من هذا الجهاز؟')) return;
    LS.keys('draft.').forEach(k => LS.del(k));
    LS.del('session'); LS.del('ui');
    Object.assign(S, { session: null, cls: null, draft: null, edit: {}, recs: {} });
    renderLogin();
    if (msg) toast(msg, 'warn');
  }

  /* ───────────── الأحداث ───────────── */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
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
      case 'tab': {
        if (b.dataset.t === S.tab) return;
        S.tab = b.dataset.t; saveUI(); syncTabs();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return renderPanel(true);
      }
    }
    if (!S.draft) return;
    switch (act) {
      case 'go-last': { const p = b.dataset.p; return changeDate(idx(p).last, p); }
      case 'edit': return startEdit(b.dataset.p, b);
      case 'cancel-edit': {
        const p = b.dataset.p;
        if (S.draft.dirty[p] && !confirm('إلغاء التعديلات غير المحفوظة؟')) return;
        S.draft[p] = emptyOf(p); S.draft.dirty[p] = false; S.edit[p] = false; persist(true);
        return renderPanel(true);
      }
      case 'att': {
        const id = b.parentElement.dataset.id, v = b.dataset.v;
        if (S.draft.att[id] === v) delete S.draft.att[id]; else S.draft.att[id] = v;
        $$('button', b.parentElement).forEach(x => x.classList.toggle('on', x === b && !!S.draft.att[id]));
        b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
        markDirty('att'); return refreshStats();
      }
      case 'att-all': {
        const v = cfg().lists.attendance[0];
        students().forEach(s => { if (!S.draft.att[s.id]) S.draft.att[s.id] = v; });
        markDirty('att'); return renderPanel(false);
      }
      case 'rec': {
        const id = b.parentElement.dataset.id, v = b.dataset.v === '1';
        if (S.draft.rec[id] === v) delete S.draft.rec[id]; else S.draft.rec[id] = v;
        $$('button', b.parentElement).forEach(x => x.classList.toggle('on', S.draft.rec[id] === (x.dataset.v === '1')));
        b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
        markDirty('rec'); return refreshStats();
      }
      case 'rec-all': {
        students().forEach(s => { if (typeof S.draft.rec[s.id] !== 'boolean') S.draft.rec[s.id] = true; });
        markDirty('rec'); return renderPanel(false);
      }
      case 'save-att': return savePart('att', b);
      case 'save-rec': return savePart('rec', b);
      case 'save-log': return saveLog(b);
      case 'chip': {
        const path = b.dataset.path, v = b.dataset.v;
        if (b.dataset.multi) {
          const arr = getPath(S.draft, path) || [], i = arr.indexOf(v);
          i < 0 ? arr.push(v) : arr.splice(i, 1);
          setPath(S.draft, path, arr); b.classList.toggle('on', i < 0);
        } else {
          const nv = getPath(S.draft, path) === v ? '' : v;
          setPath(S.draft, path, nv);
          if (b.dataset.rr) { markDirty('log'); return renderPanel(false); }
          $$('.chip', b.parentElement).forEach(x => x.classList.toggle('on', x === b && !!nv));
          const card = b.closest('.card'), sub = card && $('.sec-h small', card);
          if (sub && /subject$/.test(path)) sub.textContent = nv || 'اختر المادة';
        }
        return markDirty('log');
      }
      case 'add-lesson': {
        if (S.draft.log.lessons.length < MAX_LESSONS) S.draft.log.lessons.push(emptyLesson());
        markDirty('log'); renderPanel(false);
        const cards = $$('#panel .card'), lastCard = cards[cards.length - 1];
        if (lastCard) window.scrollTo({ top: window.scrollY + lastCard.getBoundingClientRect().top - 12, behavior: 'smooth' });
        return;
      }
      case 'del-lesson': {
        if (!confirm('حذف هذه الحصة؟')) return;
        S.draft.log.lessons.splice(+b.dataset.i, 1);
        markDirty('log'); return renderPanel(false);
      }
      case 'step-next': {
        if (logSteps()[S.draft.log.step || 0] === 'lessons' && !checkLessons()) return;
        return goStep((S.draft.log.step || 0) + 1);
      }
      case 'step-prev': return goStep((S.draft.log.step || 0) - 1);
      case 'off-on': case 'off-off': {
        S.draft.log.off = S.draft.log.off || freshOff();
        S.draft.log.off.on = act === 'off-on';
        markDirty('log'); renderPanel(true);
        return window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      case 'step-go': return goStep(+b.dataset.s);
    }
  });

  app.addEventListener('input', e => {
    const el = e.target.closest('[data-bind]'); if (!el || !S.draft) return;
    setPath(S.draft, el.dataset.bind, el.value);
    markDirty('log');
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return persist(true);
    if (S.session && S.session.token && Date.now() - S.lastIdx > 60000) refreshIndex();   // عند العودة للتطبيق
  });
  window.addEventListener('pagehide', () => persist(true));
  window.addEventListener('offline', () => toast('انقطع الاتصال — تغييراتك محفوظة على الجهاز', 'warn'));
  window.addEventListener('online', () => toast('عاد الاتصال', 'ok'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncChrome);

  /* ───────────── الإقلاع ───────────── */
  function boot() {
    const s = LS.get('session', null);
    const fresh = s && s.code && s.config && ('today' in s.config) && s.classes && s.classes.every(c => c.index);
    if (!fresh) { if (s && s.code) return relogin(s.code); return renderLogin(); }
    S.session = s;
    const ui = LS.get('ui', {});
    const only = s.classes.length === 1 ? s.classes[0].id : null;
    const target = s.classes.some(c => c.id === ui.classId) ? ui.classId : only;
    target ? openClass(target, ui.date, ui.tab) : renderPicker();          // عرض فوري من الذاكرة
    login(s.code).then(cleanupDrafts).catch(x => { if (x.code === 'BAD_CODE') logout(true, 'تغيّر رمز الدخول، أعد الدخول'); });
  }
  /* جلسة من إصدار سابق: دخول صامت بالرمز المحفوظ */
  function relogin(code) {
    renderLogin();
    S.session = { code, config: {} };
    login(code).then(() => { const cs = S.session.classes; cs.length === 1 ? openClass(cs[0].id) : renderPicker(); })
      .catch(() => { S.session = null; LS.del('session'); });
  }

  boot();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
