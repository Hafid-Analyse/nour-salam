/**
 * ═══════════════════════════════════════════════════════════
 *  سجل المعلم — مدرسة نور السلام القرآنية
 *  الواجهة (GitHub Pages) — تتصل بخادم Apps Script
 *  • حفظ الجلسة ورمز الدخول  • حفظ المسودات تلقائياً
 *  • الوضع النهاري/الليلي     • عرض فوري من الذاكرة ثم تحديث
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
  const STEP_LABEL = { quran: 'حصة القرآن', lessons: 'الدروس', notes: 'الإرسال' };
  const ORD = ['الأولى', 'الثانية'];
  const MAX_LESSONS = 2;
  const TONES = ['var(--ok)', 'var(--bad)', 'var(--warn)'];   // حسب ترتيب حالات الحضور في الشيت

  const app = document.getElementById('app');
  const S = { session: null, cls: null, date: null, tab: 'att', data: null, draft: null, saved: {}, err: null };

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
  const cfg = () => S.session.config;
  const isMain = () => !!S.cls && S.cls.role === T.MAIN;
  const dayKey = () => S.cls.id + '|' + S.date;

  const IC = {
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
    note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    next: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    prev: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M17.9 17.9A10 10 0 0 1 12 19c-6.5 0-10-7-10-7a18 18 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0M12 20h.01"/>'
  };
  const ic = (n, c) => `<svg class="ic ${c || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;
  const logo = (kind, cls) => `<svg class="logo ${cls || ''}" aria-hidden="true"><use href="#logo-${kind}"/></svg>`;

  let toastTimer;
  function toast(msg, type) {
    const el = $('#toast');
    const icon = { ok: 'check', bad: 'x', warn: 'info', info: 'info' }[type || 'info'];
    el.className = type || 'info';
    el.innerHTML = `<span class="dot">${ic(icon)}</span><span>${esc(msg)}</span>`;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function setBusy(btn, on) { if (btn) { btn.classList.toggle('loading', on); btn.disabled = on; } }

  /* التاريخ: yyyy-mm-dd ← { يوم الأسبوع ، يوم/شهر } */
  const WD = new Intl.DateTimeFormat('ar', { weekday: 'long' });
  function dLabel(s) {
    const p = s.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]);
    const t = new Date(); const today = t.getFullYear() === p[0] && t.getMonth() === p[1] - 1 && t.getDate() === p[2];
    return { wd: today ? 'اليوم' : WD.format(d), dm: p[2] + '/' + p[1], full: WD.format(d) + ' ' + p[2] + '/' + p[1] };
  }

  /* الوصول للمسارات داخل المسودة: "log.lessons.0.subject" */
  function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
  function setPath(o, path, v) { const ks = path.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }

  /* ───────────── الوضع النهاري/الليلي ───────────── */
  const theme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  function toggleTheme() {
    const html = document.documentElement, next = theme() === 'dark' ? 'light' : 'dark';
    html.classList.add('theme-anim');
    html.dataset.theme = next; LS.set('theme', next); syncTheme();
    setTimeout(() => html.classList.remove('theme-anim'), 450);
  }
  function syncTheme() {
    const dark = theme() === 'dark';
    $$('[data-act="theme"]').forEach(b => { b.innerHTML = ic(dark ? 'sun' : 'moon'); b.title = dark ? 'الوضع النهاري' : 'الوضع الليلي'; });
    const m = $('meta[name="theme-color"]'); if (m) m.content = dark ? '#22060E' : '#7A1032';
  }

  /* ───────────── الاتصال بالخادم ───────────── */
  async function call(action, payload, retry) {
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(API_URL) || /ضع_المعرف/.test(API_URL)) throw new Error('ضع رابط الخادم في ملف config.js');
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
    // انتهت الجلسة ← دخول صامت بالرمز المحفوظ ثم إعادة الطلب مرة واحدة
    if (res.error === 'SESSION' && retry !== false && S.session && S.session.code) {
      await login(S.session.code);
      return call(action, payload, false);
    }
    const err = new Error(res.message || 'حدث خطأ غير متوقع'); err.code = res.error; throw err;
  }

  async function login(code) {
    const d = await call('login', { code }, false);
    const prevDates = S.session ? S.session.config.dates.join() : '';
    S.session = { code, token: d.token, teacher: d.teacher, classes: d.classes, config: d.config, at: Date.now() };
    LS.set('session', S.session);
    // تحديث القسم الحالي والتواريخ إن تغيّرت
    if (S.cls) {
      const c = d.classes.find(x => x.id === S.cls.id);
      if (!c) { renderPicker(); return S.session; }
      S.cls = c;
      if (prevDates !== d.config.dates.join()) {
        renderDates();
        if (d.config.dates.indexOf(S.date) < 0) { S.date = d.config.dates[0]; saveUI(); loadDay(); }
      }
    }
    return S.session;
  }

  /* ───────────── المسودات (الحفاظ على التقدّم) ───────────── */
  const emptyLesson = () => ({ subject: '', lesson: '', strategies: [], tools: [], tasks: [] });
  const freshLog = () => ({ quran: { type: '', from: '', to: '', notes: '' }, lessons: [emptyLesson()], notes: '', step: 0 });
  const str = v => (v == null ? '' : String(v));

  function mergeDraft(d, local) {
    let log = freshLog();
    if (d.log) {
      const q = d.log.quran || {};
      log = {
        quran: { type: str(q.type), from: str(q.from), to: str(q.to), notes: str(q.notes) },
        lessons: (d.log.lessons && d.log.lessons.length ? d.log.lessons : [{}]).map(l => ({
          subject: str(l.subject), lesson: str(l.lesson),
          strategies: l.strategies || [], tools: l.tools || [], tasks: l.tasks || []
        })),
        notes: str(d.log.notes), step: 0
      };
    }
    const draft = { att: Object.assign({}, d.attendance), rec: Object.assign({}, d.recitation), log, dirty: { att: false, rec: false, log: false } };
    let restored = false;
    if (local && local.dirty) {
      ['att', 'rec', 'log'].forEach(k => { if (local.dirty[k] && local[k]) { draft[k] = local[k]; draft.dirty[k] = true; restored = true; } });
    }
    if (local && local.log && !draft.dirty.log) draft.log.step = local.log.step || 0;
    S.saved = { att: Object.keys(d.attendance || {}).length > 0, rec: Object.keys(d.recitation || {}).length > 0, log: !!d.log };
    if (restored) setTimeout(() => toast('استُرجعت تغييرات لم تُحفظ بعد', 'info'), 350);
    return draft;
  }

  let persistTimer;
  function persist(now) {
    clearTimeout(persistTimer);
    const run = () => { if (S.cls && S.draft) LS.set('draft.' + dayKey(), S.draft); };
    now ? run() : (persistTimer = setTimeout(run, 250));
  }
  function markDirty(part) { S.draft.dirty[part] = true; persist(); updateSaveState(part); }
  function markSaved(part) {
    S.draft.dirty[part] = false; S.saved[part] = true;
    const d = S.draft.dirty;
    d.att || d.rec || d.log ? persist(true) : LS.set('draft.' + dayKey(), { log: { step: S.draft.log.step }, dirty: d });
    updateSaveState(part);
  }
  function cleanupDrafts() {
    const dates = cfg().dates;
    LS.keys('draft.').forEach(k => { const d = k.split('|')[1]; if (dates.indexOf(d) < 0) LS.del(k); });
  }
  function saveUI() { LS.set('ui', { classId: S.cls && S.cls.id, date: S.date, tab: S.tab }); }

  /* ═════════════ الشاشات ═════════════ */

  /* ① الدخول */
  function renderLogin() {
    S.cls = null;
    app.innerHTML = `
      <section class="screen login">
        <div class="top">
          <span class="brand-sm">${ic('book')} سجل المعلم</span>
          <button class="icon-btn plain" data-act="theme"></button>
        </div>
        <div class="login-art">
          <span class="orbit spin"></span><span class="orbit o2"></span>
          ${logo('full')}
        </div>
        <h1>سجل <em>المعلم</em> الرقمي</h1>
        <p class="sub">مدرسة نور السلام القرآنية</p>
        <div class="feat anim">
          <div style="--i:1"><i>${ic('users')}</i>الحضور</div>
          <div style="--i:2"><i>${ic('mic')}</i>الاستظهار</div>
          <div style="--i:3"><i>${ic('note')}</i>السجل اليومي</div>
        </div>
        <form id="loginForm" autocomplete="on" novalidate>
          <div class="code-wrap">
            <input id="code" class="inp" type="password" inputmode="numeric" autocomplete="current-password"
                   placeholder="رمز الدخول" aria-label="رمز الدخول" required>
            <button type="button" class="eye" data-act="eye" aria-label="إظهار الرمز">${ic('eye')}</button>
          </div>
          <button class="btn btn-primary btn-cta" type="submit"><span>دخول</span><span class="cta-ic">${ic('next')}</span></button>
          <p class="form-err" id="loginErr"></p>
        </form>
        <p class="foot">يبقى دخولك محفوظاً على هذا الجهاز</p>
      </section>`;
    syncTheme();
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

  /* ② اختيار القسم */
  function renderPicker() {
    S.cls = null; S.data = null; S.draft = null; saveUI();
    const t = S.session.teacher;
    app.innerHTML = `
      <section class="screen">
        <header class="hero compact">
          <div class="topbar">
            <div class="brand on-hero">${logo('mark')} نور السلام</div>
            <button class="icon-btn glass" data-act="theme"></button>
            <button class="icon-btn glass" data-act="logout" title="خروج">${ic('logout')}</button>
          </div>
          <div class="hero-title">
            <p class="hello">السلام عليكم</p>
            <h2>${esc(t.name)}</h2>
            <div class="pills"><span class="pill">${S.session.classes.length} أقسام مسندة</span></div>
          </div>
          ${wave()}
        </header>
        <main class="panel anim">
          <div class="toolbar" style="--i:0"><h3>اختر القسم الذي تدرّسه الآن</h3></div>
          ${S.session.classes.map((c, i) => `
            <button class="ccard" style="--i:${i + 1}" data-act="pick" data-id="${esc(c.id)}">
              <span class="badge">${ic(c.role === T.MAIN ? 'book' : 'note')}</span>
              <span class="t"><b>${esc(c.name)}</b><small>${esc(c.level)} · ${esc(c.type)}</small></span>
              <span class="role">${esc(c.role)}</span>
              <span class="go">${ic('next')}</span>
            </button>`).join('')}
        </main>
      </section>`;
    syncTheme();
  }

  /* ③ الشاشة الرئيسية */
  function openClass(id, date, tab) {
    const c = S.session.classes.find(x => x.id === id);
    if (!c) return renderPicker();
    S.cls = c;
    const dates = cfg().dates;
    S.date = dates.indexOf(date) > -1 ? date : dates[0];
    S.tab = isMain() ? (TABS.some(t => t.id === tab) ? tab : 'att') : 'log';
    saveUI();
    renderMain();
    loadDay();
  }

  function renderMain() {
    const c = S.cls, many = S.session.classes.length > 1, main = isMain();
    app.innerHTML = `
      <section class="screen ${main ? '' : 'no-tabs'}">
        <header class="hero">
          <div class="topbar">
            ${many ? `<button class="icon-btn glass" data-act="picker" title="تغيير القسم">${ic('grid')}</button>` : ''}
            <div class="brand on-hero">${logo('mark')} نور السلام</div>
            <button class="icon-btn glass" data-act="theme"></button>
            <button class="icon-btn glass" data-act="logout" title="خروج">${ic('logout')}</button>
          </div>
          <div class="hero-title">
            <p class="hello">السلام عليكم، ${esc(S.session.teacher.name)}</p>
            <h2>${esc(c.name)}</h2>
            <div class="pills">
              <span class="pill light">${esc(c.role)}</span>
              <span class="pill">${esc(c.level)}</span>
              <span class="pill">${esc(c.type)}</span>
            </div>
          </div>
          <div class="dates" id="dates"></div>
          ${wave()}
        </header>
        <main class="panel" id="panel"></main>
        ${main ? `
        <nav class="tabbar" id="tabbar">
          <span class="ind"></span>
          ${TABS.map(t => `<button class="tab" data-act="tab" data-t="${t.id}">${ic(t.icon)}<span>${t.label}</span></button>`).join('')}
        </nav>` : ''}
      </section>`;
    syncTheme();
    renderDates();
    syncTabs();
  }

  const wave = () => `<svg class="wave" viewBox="0 0 400 58" preserveAspectRatio="none" aria-hidden="true"><path d="M0 58V30C70 6 130 4 200 24S330 52 400 18V58Z"/></svg>`;

  function renderDates() {
    const box = $('#dates'); if (!box) return;
    box.innerHTML = cfg().dates.map(d => { const l = dLabel(d); return `<button class="dchip ${d === S.date ? 'on' : ''}" data-act="date" data-d="${d}"><b>${l.wd}</b><small>${l.dm}</small></button>`; }).join('');
    // توسيط التاريخ المختار داخل الشريط فقط (دون تحريك الصفحة)
    const on = $('.dchip.on', box);
    if (on) { const a = on.getBoundingClientRect(), b = box.getBoundingClientRect(); box.scrollLeft += (a.left + a.width / 2) - (b.left + b.width / 2); }
  }

  function syncTabs() {
    const bar = $('#tabbar'); if (!bar) return;
    const i = TABS.findIndex(t => t.id === S.tab);
    $('.ind', bar).style.transform = `translateX(${-100 * i}%)`;   // اتجاه RTL
    $$('.tab', bar).forEach(b => b.classList.toggle('on', b.dataset.t === S.tab));
  }

  /* تحميل يوم معيّن: عرض المسودة/الهيكل فوراً ثم بيانات الخادم */
  async function loadDay() {
    const key = dayKey();
    S.data = null; S.err = null; S.draft = null;
    renderPanel(true);
    try {
      const d = await call('getClass', { classId: S.cls.id, date: S.date });
      if (!S.cls || key !== dayKey()) return;            // تغيّر القسم أو التاريخ أثناء التحميل
      S.data = d;
      S.draft = mergeDraft(d, LS.get('draft.' + key, null));
      renderPanel(true);
    } catch (x) {
      if (!S.cls || key !== dayKey()) return;
      if (x.code === 'BAD_CODE') return logout(true, 'تغيّر رمز الدخول، أعد الدخول');
      if (x.code === 'DATE') { toast(x.message, 'warn'); return login(S.session.code).catch(() => {}); }
      S.err = x.message; renderPanel(true);
    }
  }

  function renderPanel(animate) {
    const p = $('#panel'); if (!p) return;
    p.classList.toggle('anim', !!animate);
    if (S.err) {
      p.innerHTML = `<div class="card empty">${ic(navigator.onLine ? 'info' : 'wifi')}<p>${esc(S.err)}</p>
        <button class="btn btn-soft" data-act="retry">${ic('refresh')} إعادة المحاولة</button></div>`;
      return;
    }
    if (!S.data) { p.innerHTML = '<div class="sk big"></div>' + '<div class="sk"></div>'.repeat(5); return; }
    p.innerHTML = S.tab === 'att' ? panelAtt() : S.tab === 'rec' ? panelRec() : panelLog();
  }

  /* ───────── تبويب ١: الحضور ───────── */
  function attCounts() {
    const st = S.data.students || [], list = cfg().lists.attendance, a = S.draft.att;
    const by = {}; list.forEach(s => { by[s] = 0; });
    let marked = 0; st.forEach(s => { if (a[s.id]) { marked++; if (by[a[s.id]] != null) by[a[s.id]]++; } });
    return { total: st.length, marked, by };
  }
  function attStats() {
    const c = attCounts(), list = cfg().lists.attendance, pct = c.total ? Math.round(c.marked * 100 / c.total) : 0;
    return `
      <div class="score" style="--i:0">
        <div class="ring" style="--v:${pct}"><b>${pct}%</b></div>
        <div class="txt"><small>تسجيل الحضور</small><strong>${c.marked} <span>من ${c.total} تلميذ</span></strong>
          <div class="bar"><i style="width:${pct}%"></i></div></div>
      </div>
      <div class="stats" style="--i:1">
        ${list.slice(0, 3).map((s, i) => `<div class="stat" style="--tone:${TONES[i]}"><small>${esc(s)}</small><b>${c.by[s] || 0}</b></div>`).join('')}
      </div>`;
  }
  function panelAtt() {
    const st = S.data.students || [], list = cfg().lists.attendance, a = S.draft.att;
    if (!st.length) return emptyState('لا يوجد تلاميذ نشطون في هذا القسم');
    return `
      <div id="stats">${attStats()}</div>
      <div class="toolbar" style="--i:2"><h3>قائمة التلاميذ</h3>
        <button class="btn btn-soft btn-sm" data-act="att-all">${ic('check')} الكل ${esc(list[0] || '')}</button></div>
      <div class="list">
        ${st.map((s, n) => `
          <div class="srow att" style="--i:${Math.min(n + 3, 14)}">
            <span class="av">${esc(initial(s.name))}</span>
            <span class="sname">${esc(s.name)}</span>
            <div class="seg" data-id="${esc(s.id)}">
              ${list.map((v, i) => `<button data-act="att" data-v="${esc(v)}" class="${a[s.id] === v ? 'on' : ''}" style="--tone:${TONES[i] || 'var(--p)'}">${esc(v)}</button>`).join('')}
            </div>
          </div>`).join('')}
      </div>
      ${saveBar('att', 'حفظ الحضور')}`;
  }

  /* ───────── تبويب ٢: الاستظهار ───────── */
  function recStats() {
    const st = S.data.students || [], r = S.draft.rec;
    let y = 0, n = 0; st.forEach(s => { if (r[s.id] === true) y++; else if (r[s.id] === false) n++; });
    const pct = st.length ? Math.round(y * 100 / st.length) : 0;
    return `
      <div class="score" style="--i:0">
        <div class="ring" style="--v:${pct}"><b>${pct}%</b></div>
        <div class="txt"><small>نسبة الاستظهار</small><strong>${y} <span>من ${st.length} تلميذ</span></strong>
          <div class="bar"><i style="width:${pct}%"></i></div></div>
      </div>
      <div class="stats" style="--i:1">
        <div class="stat" style="--tone:var(--ok)"><small>استظهر</small><b>${y}</b></div>
        <div class="stat" style="--tone:var(--bad)"><small>لم يستظهر</small><b>${n}</b></div>
        <div class="stat"><small>لم يُحدَّد</small><b>${st.length - y - n}</b></div>
      </div>`;
  }
  function panelRec() {
    const st = S.data.students || [], r = S.draft.rec, a = S.draft.att, absent = cfg().lists.attendance[1];
    if (!st.length) return emptyState('لا يوجد تلاميذ نشطون في هذا القسم');
    return `
      <div id="stats">${recStats()}</div>
      <div class="toolbar" style="--i:2"><h3>من استظهر اليوم؟</h3>
        <button class="btn btn-soft btn-sm" data-act="rec-all">${ic('check')} الكل استظهر</button></div>
      <div class="list">
        ${st.map((s, n) => {
          const abs = absent && a[s.id] === absent;
          return `
          <div class="srow ${abs ? 'dim' : ''}" style="--i:${Math.min(n + 3, 14)}">
            <span class="av">${esc(initial(s.name))}</span>
            <span class="sname">${esc(s.name)}${abs ? `<span class="tag">${esc(absent)}</span>` : ''}</span>
            <div class="yn" data-id="${esc(s.id)}">
              <button data-act="rec" data-v="1" class="y ${r[s.id] === true ? 'on' : ''}" aria-label="استظهر">${ic('check')}</button>
              <button data-act="rec" data-v="0" class="n ${r[s.id] === false ? 'on' : ''}" aria-label="لم يستظهر">${ic('x')}</button>
            </div>
          </div>`; }).join('')}
      </div>
      ${saveBar('rec', 'حفظ الاستظهار')}`;
  }

  /* ───────── تبويب ٣: السجل اليومي ───────── */
  const logSteps = () => (isMain() ? ['quran', 'lessons', 'notes'] : ['lessons', 'notes']);

  function panelLog() {
    const steps = logSteps(), L = S.draft.log;
    const st = Math.min(L.step || 0, steps.length - 1), last = st === steps.length - 1;
    const body = { quran: stepQuran, lessons: stepLessons, notes: stepNotes }[steps[st]]();
    return `
      <div class="stepper" style="--i:0">
        ${steps.map((s, i) => `<button class="stp ${i < st ? 'done' : i === st ? 'on' : ''}" data-act="step-go" data-s="${i}"><div class="bar"><i></i></div><span>${i + 1}. ${STEP_LABEL[s]}</span></button>`).join('')}
      </div>
      ${body}
      <div class="stepnav" style="--i:6">
        ${st > 0 ? `<button class="btn btn-ghost" data-act="step-prev">${ic('prev')} السابق</button>` : ''}
        ${last
          ? `<button class="btn btn-primary" data-act="save-log"><span>${ic('send')}</span><span>${S.saved.log ? 'تحديث السجل' : 'إرسال السجل'}</span></button>`
          : `<button class="btn btn-primary" data-act="step-next"><span>التالي</span>${ic('next')}</button>`}
      </div>
      <div class="sv-line" style="margin-top:14px;display:flex;justify-content:center">${saveState('log')}</div>`;
  }

  function stepQuran() {
    const q = S.draft.log.quran;
    if (S.cls.type === T.MUNAFASA) {
      return `<div class="card" style="--i:1">
        <div class="sec-h"><span class="badge">${ic('book')}</span><div><b>حصة الاستظهار</b><small>قسم منافسة — يحفظ التلاميذ بأنفسهم</small></div></div>
        <label class="field"><span>ملاحظات الحصة أثناء الاستظهار</span>
          <textarea class="inp" data-bind="log.quran.notes" placeholder="اكتب ملاحظاتك عن الحصة...">${esc(q.notes)}</textarea></label>
      </div>`;
    }
    let extra = '';
    if (q.type === T.TALQIN) {
      extra = `<div class="two">
        <label class="field"><span>من</span><input class="inp" data-bind="log.quran.from" value="${esc(q.from)}" placeholder="السورة / الآية"></label>
        <label class="field"><span>إلى</span><input class="inp" data-bind="log.quran.to" value="${esc(q.to)}" placeholder="السورة / الآية"></label>
      </div>`;
    } else if (q.type) {
      extra = `<label class="field"><span>ملاحظات حصة ${esc(q.type)}</span>
        <textarea class="inp" data-bind="log.quran.notes" placeholder="اكتب ملاحظاتك...">${esc(q.notes)}</textarea></label>`;
    }
    return `<div class="card" style="--i:1">
      <div class="sec-h"><span class="badge">${ic('book')}</span><div><b>حصة القرآن</b><small>قسم تلقين</small></div></div>
      <div class="field"><span>نوع الحصة</span><div class="chips">${cfg().lists.talqin.map(t => chip('log.quran.type', t, q.type === t, false, true)).join('')}</div></div>
      ${extra}
    </div>`;
  }

  function stepLessons() {
    const L = S.draft.log, subs = cfg().curriculum[S.cls.level] || [], li = cfg().lists;
    const multi = (label, path, opts, sel) => opts.length ? `<div class="field"><span>${label}</span><div class="chips">${opts.map(o => chip(path, o, sel.indexOf(o) > -1, true)).join('')}</div></div>` : '';
    return L.lessons.map((l, i) => `
      <div class="card" style="--i:${i + 1}">
        <div class="sec-h"><span class="num">${i + 1}</span><div><b>الحصة ${ORD[i]}</b><small>${esc(l.subject || 'اختر المادة')}</small></div>
          ${i > 0 ? `<button class="icon-btn sm plain" data-act="del-lesson" data-i="${i}" aria-label="حذف الحصة">${ic('trash')}</button>` : ''}</div>
        <div class="field"><span>المادة</span><div class="chips">${subs.map(s => chip(`log.lessons.${i}.subject`, s, l.subject === s)).join('') || '<small class="muted">لا توجد مواد لهذا المستوى في صفحة المنهاج</small>'}</div></div>
        <label class="field"><span>الدرس</span><input class="inp" data-bind="log.lessons.${i}.lesson" value="${esc(l.lesson)}" placeholder="عنوان الدرس"></label>
        ${multi('استراتيجية التدريس', `log.lessons.${i}.strategies`, li.strategies, l.strategies)}
        ${multi('الوسائل التعليمية', `log.lessons.${i}.tools`, li.tools, l.tools)}
        ${multi('المهام المنجزة', `log.lessons.${i}.tasks`, li.tasks, l.tasks)}
      </div>`).join('') +
      (L.lessons.length < MAX_LESSONS ? `<button class="btn btn-dashed" style="--i:3;margin-bottom:14px" data-act="add-lesson">${ic('plus')} إضافة الحصة الثانية</button>` : '');
  }

  function stepNotes() {
    const L = S.draft.log, q = L.quran, rows = [];
    if (isMain()) {
      const qt = S.cls.type === T.MUNAFASA ? T.MUNAFASA : q.type;
      rows.push(['القرآن', qt ? (qt === T.TALQIN && (q.from || q.to) ? `${qt}: من ${q.from || '…'} إلى ${q.to || '…'}` : qt) : '—']);
    }
    L.lessons.forEach((l, i) => (i === 0 || l.subject) && rows.push(['الحصة ' + ORD[i], l.subject ? l.subject + (l.lesson ? ' — ' + l.lesson : '') : '—']));
    return `
      <div class="card" style="--i:1">
        <div class="sec-h"><span class="badge">${ic('note')}</span><div><b>ملاحظات اليوم</b><small>اختيارية</small></div></div>
        <label class="field"><textarea class="inp" data-bind="log.notes" placeholder="أي ملاحظة عن الحصة أو التلاميذ...">${esc(L.notes)}</textarea></label>
      </div>
      <div class="card" style="--i:2">
        <div class="sec-h"><span class="badge">${ic('check')}</span><div><b>ملخص السجل</b><small>${esc(dLabel(S.date).full)}</small></div></div>
        <ul class="sum">${rows.map(r => `<li><b>${r[0]}</b><span>${esc(r[1])}</span></li>`).join('')}</ul>
      </div>`;
  }

  /* ───────── عناصر مشتركة ───────── */
  const initial = n => (String(n || '؟').trim()[0] || '؟');
  const emptyState = msg => `<div class="card empty">${ic('users')}<p>${esc(msg)}</p></div>`;
  function chip(path, v, on, multi, rerender) {
    return `<button class="chip ${on ? 'on' : ''}" data-act="chip" data-path="${path}" data-v="${esc(v)}"${multi ? ' data-multi="1"' : ''}${rerender ? ' data-rr="1"' : ''}>${ic('check')}${esc(v)}</button>`;
  }
  function saveState(part) {
    const dirty = S.draft.dirty[part];
    return dirty ? '<span class="sv dirty">تغييرات غير محفوظة</span>'
      : S.saved[part] ? '<span class="sv ok">محفوظ</span>'
      : '<span class="sv">لم يُسجَّل بعد</span>';
  }
  function saveBar(part, label) {
    return `<div class="savebar" data-part="${part}">${saveState(part)}
      <button class="btn btn-primary" data-act="save-${part}"><span>${ic('check')}</span><span>${label}</span></button></div>`;
  }
  function updateSaveState(part) {
    const sv = part === 'log' ? $('.sv-line') : $(`.savebar[data-part="${part}"]`);
    if (sv) { const el = $('.sv', sv); if (el) el.outerHTML = saveState(part); }
  }
  function refreshStats() {
    const box = $('#stats'); if (!box) return;
    box.innerHTML = S.tab === 'att' ? attStats() : recStats();
  }

  /* ───────────── الحفظ ───────────── */
  async function saveAtt(btn) {
    const st = S.data.students || [], a = S.draft.att;
    const items = st.filter(s => a[s.id]).map(s => ({ id: s.id, status: a[s.id] }));
    if (!items.length) return toast('لم تحدد حالة أي تلميذ', 'warn');
    setBusy(btn, true);
    try {
      await call('saveAttendance', { classId: S.cls.id, date: S.date, items });
      markSaved('att');
      const left = st.length - items.length;
      toast(left ? `حُفظ ${items.length}، وبقي ${left} دون تحديد` : 'تم حفظ الحضور', left ? 'warn' : 'ok');
    } catch (x) { toast(x.message, 'bad'); } finally { setBusy(btn, false); }
  }

  async function saveRec(btn) {
    const st = S.data.students || [], r = S.draft.rec;
    const items = st.filter(s => typeof r[s.id] === 'boolean').map(s => ({ id: s.id, done: r[s.id] }));
    if (!items.length) return toast('لم تحدد أي تلميذ', 'warn');
    setBusy(btn, true);
    try {
      await call('saveRecitation', { classId: S.cls.id, date: S.date, items });
      markSaved('rec');
      toast('تم حفظ الاستظهار', 'ok');
    } catch (x) { toast(x.message, 'bad'); } finally { setBusy(btn, false); }
  }

  async function saveLog(btn) {
    const L = S.draft.log, q = Object.assign({}, L.quran);
    if (S.cls.type === T.MUNAFASA) { q.type = T.MUNAFASA; q.from = q.to = ''; }
    else if (q.type === T.TALQIN) q.notes = '';
    else { q.from = q.to = ''; }
    const lessons = L.lessons.filter(l => l.subject || l.lesson);
    if (isMain() && S.cls.type !== T.MUNAFASA && !q.type && !lessons.length) return toast('السجل فارغ', 'warn');
    if (!isMain() && !lessons.length) return toast('اختر المادة واكتب الدرس أولاً', 'warn');
    setBusy(btn, true);
    try {
      await call('saveLog', { classId: S.cls.id, date: S.date, quran: isMain() ? q : null, lessons, notes: L.notes });
      markSaved('log');
      btn.querySelector('span:last-child').textContent = 'تحديث السجل';
      toast('تم إرسال السجل اليومي', 'ok');
    } catch (x) { toast(x.message, 'bad'); } finally { setBusy(btn, false); }
  }

  function goStep(i) {
    const steps = logSteps(), L = S.draft.log;
    L.step = Math.max(0, Math.min(i, steps.length - 1));
    persist();
    renderPanel(true);
    scrollToEl($('#panel'), true);
  }
  function scrollToEl(el, onlyIfAbove) {
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (onlyIfAbove && top >= 0) return;
    window.scrollTo({ top: window.scrollY + top - 12, behavior: 'smooth' });
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

  function logout(silent, msg) {
    if (!silent && !confirm('تسجيل الخروج من هذا الجهاز؟')) return;
    LS.keys('draft.').forEach(LS.del);
    LS.del('session'); LS.del('ui');
    Object.assign(S, { session: null, cls: null, data: null, draft: null, saved: {}, err: null });
    renderLogin();
    if (msg) toast(msg, 'warn');
  }

  /* ───────────── الأحداث (تفويض واحد لكل الواجهة) ───────────── */
  app.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    switch (act) {
      case 'theme': return toggleTheme();
      case 'logout': return logout(false);
      case 'picker': return renderPicker();
      case 'pick': return openClass(b.dataset.id);
      case 'retry': return loadDay();
      case 'eye': {
        const inp = $('#code'), show = inp.type === 'password';
        inp.type = show ? 'text' : 'password'; b.innerHTML = ic(show ? 'eyeOff' : 'eye'); return;
      }
      case 'date': {
        if (b.dataset.d === S.date) return loadDay();
        persist(true);
        S.date = b.dataset.d; saveUI();
        $$('.dchip').forEach(x => x.classList.toggle('on', x === b));
        return loadDay();
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
      case 'att': {
        const id = b.parentElement.dataset.id, v = b.dataset.v;
        S.draft.att[id] = S.draft.att[id] === v ? '' : v;
        if (!S.draft.att[id]) delete S.draft.att[id];
        $$('button', b.parentElement).forEach(x => x.classList.toggle('on', x === b && !!S.draft.att[id]));
        b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
        markDirty('att'); return refreshStats();
      }
      case 'att-all': {
        const v = cfg().lists.attendance[0];
        (S.data.students || []).forEach(s => { if (!S.draft.att[s.id]) S.draft.att[s.id] = v; });
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
        (S.data.students || []).forEach(s => { if (typeof S.draft.rec[s.id] !== 'boolean') S.draft.rec[s.id] = true; });
        markDirty('rec'); return renderPanel(false);
      }
      case 'save-att': return saveAtt(b);
      case 'save-rec': return saveRec(b);
      case 'save-log': return saveLog(b);
      case 'chip': {
        const path = b.dataset.path, v = b.dataset.v;
        if (b.dataset.multi) {
          const arr = getPath(S.draft, path) || [], i = arr.indexOf(v);
          i < 0 ? arr.push(v) : arr.splice(i, 1);
          setPath(S.draft, path, arr);
          b.classList.toggle('on', i < 0);
        } else {
          const nv = getPath(S.draft, path) === v ? '' : v;
          setPath(S.draft, path, nv);
          if (b.dataset.rr) { markDirty('log'); return renderPanel(false); }
          $$('.chip', b.parentElement).forEach(x => x.classList.toggle('on', x === b && !!nv));
          const sub = b.closest('.card') && $('.sec-h small', b.closest('.card'));
          if (sub && /subject$/.test(path)) sub.textContent = nv || 'اختر المادة';
        }
        return markDirty('log');
      }
      case 'add-lesson': {
        if (S.draft.log.lessons.length < MAX_LESSONS) S.draft.log.lessons.push(emptyLesson());
        markDirty('log'); renderPanel(false);
        const cards = $$('#panel .card');
        return scrollToEl(cards[cards.length - 1]);
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
      case 'step-go': return goStep(+b.dataset.s);
    }
  });

  app.addEventListener('input', e => {
    const el = e.target.closest('[data-bind]'); if (!el || !S.draft) return;
    setPath(S.draft, el.dataset.bind, el.value);
    markDirty('log');
  });

  // حفظ فوري للمسودة عند مغادرة التطبيق أو إخفائه
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(true); });
  window.addEventListener('pagehide', () => persist(true));
  window.addEventListener('offline', () => toast('انقطع الاتصال — تغييراتك محفوظة على الجهاز', 'warn'));
  window.addEventListener('online', () => toast('عاد الاتصال', 'ok'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);

  /* ───────────── الإقلاع ───────────── */
  function boot() {
    const s = LS.get('session', null);
    if (!s || !s.code) return renderLogin();
    S.session = s;
    const ui = LS.get('ui', {});
    const only = s.classes.length === 1 ? s.classes[0].id : null;
    const target = s.classes.some(c => c.id === ui.classId) ? ui.classId : only;
    // عرض فوري من الذاكرة، ثم تحديث الجلسة والإعدادات في الخلفية
    target ? openClass(target, ui.date, ui.tab) : renderPicker();
    login(s.code).then(cleanupDrafts).catch(x => { if (x.code === 'BAD_CODE') logout(true, 'تغيّر رمز الدخول، أعد الدخول'); });
  }

  boot();
})();
