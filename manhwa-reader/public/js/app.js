'use strict';
const app = document.getElementById('app');
let isAdmin = false;
let currentUser = null;
let _skipHashChange = false; // منع التكرار من hashchange أثناء navigate()

// ============================================================
//   أدوات مساعدة
// ============================================================
async function api(path, opts = {}) {
    const res = await fetch('/api' + path, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
    });
    if (res.status === 401) {
        showLoginOverlay();
        throw new Error('يحتاج تسجيل دخول');
    }
    if (!res.ok) throw new Error((await res.json()).error || 'خطأ غير متوقع');
    return res.json();
}
function tpl(id) {
    return document.getElementById('tpl-' + id).content.cloneNode(true);
}
function escapeHtml(s = '') {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function placeholderCover() {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300">
            <rect width="200" height="300" fill="#1A1A26"/>
            <text x="100" y="160" font-size="48" text-anchor="middle" fill="#C9A84C" opacity=".4">📖</text>
        </svg>`
    );
}

// ============================================================
//   نافذة تسجيل الدخول / إنشاء حساب
// ============================================================
function showLoginOverlay(options = {}) {
    if (document.getElementById('login-overlay')) return;
    const { adminMode = false, startTab = 'admin', onClose = null } = options;

    const overlay = document.createElement('div');
    overlay.id = 'login-overlay';
    overlay.className = 'login-overlay';

    const tabs = [
        { id: 'admin', label: 'مدير' },
        { id: 'user', label: 'تسجيل دخول' },
        { id: 'register', label: 'حساب جديد' },
    ];

    overlay.innerHTML = `
        <div class="login-box">
            <div class="login-logo">MED<span class="logo-accent">O</span>SA</div>
            <div class="login-tabs">
                ${tabs.map(t => `<button class="login-tab${t.id === startTab ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
            </div>
            <div id="login-form-area"></div>
            <p class="login-error" id="login-error" style="display:none"></p>
            <button class="login-skip" id="login-skip">تصفح بدون تسجيل دخول ✕</button>
        </div>
    `;

    let activeTab = startTab;

    function renderForm(tab) {
        const area = overlay.querySelector('#login-form-area');
        if (tab === 'admin') {
            area.innerHTML = `
                <p class="login-hint">كلمة مرور المدير</p>
                <input type="password" class="login-input" id="login-pw" placeholder="كلمة المرور المدير" autocomplete="current-password">
                <button class="btn btn-primary login-btn" id="login-submit">دخول كمدير</button>
            `;
            area.querySelector('#login-submit').onclick = () => doAdminLogin();
            area.querySelector('#login-pw').onkeydown = e => { if (e.key === 'Enter') doAdminLogin(); };
        } else if (tab === 'user') {
            area.innerHTML = `
                <p class="login-hint">تسجيل دخول بحساب مسجّل</p>
                <input type="text" class="login-input" id="login-username" placeholder="اسم المستخدم" autocomplete="username" style="margin-bottom:8px">
                <input type="password" class="login-input" id="login-pw" placeholder="كلمة المرور" autocomplete="current-password">
                <button class="btn btn-primary login-btn" id="login-submit">دخول</button>
            `;
            area.querySelector('#login-submit').onclick = () => doUserLogin();
            area.querySelector('#login-pw').onkeydown = e => { if (e.key === 'Enter') doUserLogin(); };
        } else {
            area.innerHTML = `
                <p class="login-hint">إنشاء حساب جديد</p>
                <input type="text" class="login-input" id="reg-username" placeholder="اسم المستخدم" autocomplete="username" style="margin-bottom:8px">
                <input type="password" class="login-input" id="reg-pw" placeholder="كلمة المرور (4 أحرف+)" autocomplete="new-password">
                <button class="btn btn-primary login-btn" id="login-submit">إنشاء الحساب</button>
            `;
            area.querySelector('#login-submit').onclick = () => doRegister();
            area.querySelector('#reg-pw').onkeydown = e => { if (e.key === 'Enter') doRegister(); };
        }
        setTimeout(() => area.querySelector('input')?.focus(), 100);
    }

    overlay.querySelectorAll('.login-tab').forEach(btn => {
        btn.onclick = () => {
            activeTab = btn.dataset.tab;
            overlay.querySelectorAll('.login-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
            overlay.querySelector('#login-error').style.display = 'none';
            renderForm(activeTab);
        };
    });

    function showError(msg) {
        const el = overlay.querySelector('#login-error');
        el.textContent = msg; el.style.display = 'block';
    }

    async function doAdminLogin() {
        const pw = overlay.querySelector('#login-pw')?.value;
        const btn = overlay.querySelector('#login-submit');
        btn.disabled = true;
        overlay.querySelector('#login-error').style.display = 'none';
        try {
            const r = await fetch('/api/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pw }),
            });
            const result = await r.json();
            if (result.error) throw new Error(result.error);
            overlay.remove();
            isAdmin = result.isAdmin;
            currentUser = null;
            updateAdminUI();
            if (result.isAdmin) navigate('admin');
            else if (!location.hash) navigate('home');
            else routeFromHash();
        } catch (e) { showError(e.message); btn.disabled = false; }
    }

    async function doUserLogin() {
        const username = overlay.querySelector('#login-username')?.value?.trim();
        const pw = overlay.querySelector('#login-pw')?.value;
        const btn = overlay.querySelector('#login-submit');
        btn.disabled = true;
        overlay.querySelector('#login-error').style.display = 'none';
        try {
            const r = await fetch('/api/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password: pw }),
            });
            const result = await r.json();
            if (result.error) throw new Error(result.error);
            overlay.remove();
            isAdmin = false;
            currentUser = result.userId ? { userId: result.userId, username: result.username, avatarEmoji: result.avatarEmoji } : null;
            updateAdminUI();
            routeFromHash();
            if (!location.hash) navigate('home');
        } catch (e) { showError(e.message); btn.disabled = false; }
    }

    async function doRegister() {
        const username = overlay.querySelector('#reg-username')?.value?.trim();
        const pw = overlay.querySelector('#reg-pw')?.value;
        const btn = overlay.querySelector('#login-submit');
        btn.disabled = true;
        overlay.querySelector('#login-error').style.display = 'none';
        try {
            const r = await fetch('/api/register', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password: pw }),
            });
            const result = await r.json();
            if (result.error) throw new Error(result.error);
            overlay.remove();
            isAdmin = false;
            currentUser = { username: result.username, avatarEmoji: result.avatarEmoji };
            updateAdminUI();
            navigate('profile');
        } catch (e) { showError(e.message); btn.disabled = false; }
    }

    overlay.querySelector('#login-skip').onclick = () => {
        overlay.remove();
        if (onClose) onClose();
        else if (!location.hash) navigate('home');
        else routeFromHash();
    };

    document.body.appendChild(overlay);
    renderForm(activeTab);
}

function updateAdminUI() {
    const adminItem = document.getElementById('drawer-admin-item');
    if (adminItem) adminItem.hidden = !isAdmin;
}

// ============================================================
//   الدرج الجانبي
// ============================================================
const drawer     = document.getElementById('drawer');
const drawerOver = document.getElementById('drawer-overlay');

function openDrawer() { drawer.classList.add('open'); drawerOver.classList.add('open'); }
function closeDrawer() { drawer.classList.remove('open'); drawerOver.classList.remove('open'); }

document.getElementById('btn-open-drawer').onclick  = openDrawer;
document.getElementById('btn-close-drawer').onclick = closeDrawer;
drawerOver.onclick = closeDrawer;
document.getElementById('btn-header-profile').onclick = () => { closeDrawer(); navigate('profile'); };

document.querySelectorAll('.drawer-item').forEach(btn => {
    btn.onclick = () => {
        closeDrawer();
        const view = btn.dataset.view;
        const list = btn.dataset.list;
        if (list) navigate(view, { id: list });
        else navigate(view);
    };
});

function setActiveDrawer(view, listName) {
    document.querySelectorAll('.drawer-item').forEach(b => {
        const viewMatch = b.dataset.view === view;
        const listMatch = !listName || !b.dataset.list || b.dataset.list === listName;
        b.classList.toggle('active', viewMatch && listMatch);
    });
}

// ============================================================
//   تأثير انتقال الصفحة
// ============================================================
function pageTransition() {
    app.style.animation = 'none';
    void app.offsetHeight;
    app.style.animation = 'fadeUp .25s ease';
}

// ============================================================
//   التنقل
// ============================================================
const topViews = ['home', 'library-list', 'my-library', 'profile', 'admin'];

async function navigate(view, params = {}) {
    const hash = view + (params.id ? `/${params.id}` : '') + (params.chapter ? `/${params.chapter}` : '');
    _skipHashChange = true;
    location.hash = hash;
    await render(view, params);
    window.scrollTo(0, 0);
    _skipHashChange = false;
}

async function render(view, params) {
    app.innerHTML = '';
    document.body.classList.remove('detail-page');
    document.body.style.removeProperty('--detail-bg-url');
    pageTransition();
    if (view === 'home')         return renderHome();
    if (view === 'library-list') return renderLibraryList();
    if (view === 'my-library')   return renderMyLibrary(params.id || 'favorites');
    if (view === 'profile')      return renderProfile();
    if (view === 'admin')        { if (!isAdmin) return navigate('home'); return renderAdmin(); }
    if (view === 'admin-edit')   { if (!isAdmin) return navigate('home'); return renderAdminEdit(params.id); }
    if (view === 'detail')       return renderDetail(params.id);
    if (view === 'reader')       return renderReader(params.id, params.chapter);
}

// ============================================================
//   الرئيسية — AZORA style: Hero + تابع القراءة + شائع اليوم + أحدث الإصدارات
// ============================================================
async function renderHome() {
    setActiveDrawer('home');
    app.appendChild(tpl('home'));

    const [library, allProgress] = await Promise.all([
        api('/library'),
        api('/progress-all'),
    ]);

    // تنظيف التكرار من البيانات
    const seenIds = new Set();
    const unique = library.filter(m => { if (seenIds.has(m.id)) return false; seenIds.add(m.id); return true; });

    if (!unique.length) {
        document.getElementById('home-empty').hidden = false;
        return;
    }

    // ── Hero ──
    const featured = unique[0];
    const ftags    = (featured.tags || []).slice(0, 3);
    const ftypeLabel = ftags.some(t => /رواية|novel/i.test(t)) ? 'رواية' : 'مانهوا';
    const hero = document.createElement('div');
    hero.className = 'hero';
    hero.innerHTML = `
        <img class="hero-bg" src="${featured.coverUrl || placeholderCover()}" alt="${escapeHtml(featured.title)}">
        <div class="hero-overlay"></div>
        <span class="hero-badge-type">${ftypeLabel}</span>
        <div class="hero-content">
            <div class="hero-tags">${ftags.map(t => `<span class="hero-tag">${escapeHtml(t)}</span>`).join('')}</div>
            <div class="hero-title">${escapeHtml(featured.title)}</div>
            <button class="hero-btn" id="hero-read-btn">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l12 8-12 8V4z"/></svg>
                ابدأ القراءة
            </button>
        </div>
    `;
    hero.querySelector('#hero-read-btn').onclick = () => navigate('detail', { id: featured.id });
    document.getElementById('home-hero-wrap').appendChild(hero);

    // ── تابع القراءة ──
    const inProgress = unique.filter(m => allProgress[m.id]?.lastReadChapter);
    if (inProgress.length) {
        document.getElementById('continue-row').hidden = false;
        const scroll = document.getElementById('continue-scroll');
        inProgress.forEach(m => scroll.appendChild(buildCard(m, allProgress[m.id])));
    }

    // ── شائع اليوم — أول 6 أعمال في شبكة 2 عمود ──
    const popularItems = unique.slice(0, 6);
    if (popularItems.length) {
        document.getElementById('home-popular-sec').hidden = false;
        const grid = document.getElementById('home-popular-grid');
        popularItems.forEach(m => {
            const tl = (m.tags || []).some(t => /رواية|novel/i.test(t)) ? 'رواية' : 'مانهوا';
            const card = document.createElement('div');
            card.className = 'home-pop-card';
            card.innerHTML = `
                <img src="${m.coverUrl || placeholderCover()}" alt="${escapeHtml(m.title)}" loading="lazy">
                <div class="home-pop-overlay"></div>
                <span class="home-pop-badge">${tl}</span>
                <div class="home-pop-title">${escapeHtml(m.title)}</div>
            `;
            card.onclick = () => navigate('detail', { id: m.id });
            grid.appendChild(card);
        });
    }

    // ── أحدث الإصدارات — أعمال لها فصول ──
    const withChapters = unique.filter(m => m.chapters?.length > 0);
    if (withChapters.length) {
        document.getElementById('home-updates-sec').hidden = false;
        document.getElementById('btn-home-view-all').onclick = () => navigate('library-list');
        const list = document.getElementById('home-updates-list');
        withChapters.slice(0, 12).forEach(m => {
            const latestCh = m.chapters[m.chapters.length - 1];
            const row = document.createElement('div');
            row.className = 'home-update-row';
            row.innerHTML = `
                <img class="home-update-thumb" src="${m.coverUrl || placeholderCover()}" alt="" loading="lazy">
                <div class="home-update-info">
                    <div class="home-update-title">${escapeHtml(m.title)}</div>
                    <div class="home-update-ch">الفصل ${latestCh.num}${latestCh.title ? ' — ' + escapeHtml(latestCh.title) : ''}</div>
                    <span class="home-update-free">مجاني</span>
                </div>
            `;
            row.onclick = () => navigate('detail', { id: m.id });
            list.appendChild(row);
        });
    }
}

function buildCard(m, progress) {
    const card = document.createElement('div');
    card.className = 'card';
    const readCount = progress?.readChapters?.length || 0;
    const total = m.chapters?.length || 0;
    card.innerHTML = `
        <img class="card-cover" src="${m.coverUrl || placeholderCover()}" alt="${escapeHtml(m.title)}" loading="lazy">
        <div class="card-title">${escapeHtml(m.title)}</div>
        ${total ? `<div class="card-progress">${readCount}/${total} فصل</div>` : ''}
    `;
    card.onclick = () => navigate('detail', { id: m.id });
    return card;
}

// ============================================================
//   قائمة المانجا (كل الأعمال)
// ============================================================
function buildAzoraCard(m, progress, showProgress = false) {
    const readCount = progress?.readChapters?.length || 0;
    const total     = m.chapters?.length || 0;
    const pct       = total ? Math.round((readCount / total) * 100) : 0;
    const tags      = m.tags || [];
    const typeLabel = tags.some(t => /رواية|novel/i.test(t)) ? 'رواية' : 'مانهوا';
    const typeClass = typeLabel === 'رواية' ? 'novel' : 'manhwa';

    return `
        <div class="list-card-cover-wrap">
            <img class="list-card-cover" src="${m.coverUrl || placeholderCover()}" alt="${escapeHtml(m.title)}" loading="lazy">
            <span class="list-card-type ${typeClass}">${typeLabel}</span>
        </div>
        <div class="list-card-body">
            <div class="list-card-title">${escapeHtml(m.title)}</div>
            <div class="list-card-status">
                <span class="status-dot"></span>
                <span>مستمر</span>
            </div>
            <div class="list-card-meta">
                <span>${total ? `${total} فصل` : 'لا توجد فصول'}</span>
                <span class="list-card-rating">⭐ 5.0</span>
            </div>
            ${showProgress && total ? `<div class="list-card-bar"><div class="list-card-fill" style="width:${pct}%"></div></div>` : ''}
        </div>
    `;
}

async function renderLibraryList() {
    setActiveDrawer('library-list');
    app.appendChild(tpl('library-list'));

    const [library, allProgress] = await Promise.all([
        api('/library'),
        api('/progress-all'),
    ]);

    const countEl  = document.getElementById('lib-list-count');
    const grid     = document.getElementById('lib-list-grid');
    const empty    = document.getElementById('lib-list-empty');
    const searchEl = document.getElementById('lib-search-input');

    const seenIds = new Set();
    const unique  = library.filter(m => { if (seenIds.has(m.id)) return false; seenIds.add(m.id); return true; });

    countEl.textContent = `تم العثور على ${unique.length} عمل`;
    empty.hidden = unique.length > 0;

    function renderCards(items) {
        grid.innerHTML = '';
        empty.hidden = items.length > 0;
        if (!items.length) { empty.textContent = 'لا توجد نتائج.'; return; }
        items.forEach(m => {
            const row = document.createElement('div');
            row.className = 'list-card';
            row.innerHTML = buildAzoraCard(m, allProgress[m.id], false);
            row.onclick = () => navigate('detail', { id: m.id });
            grid.appendChild(row);
        });
    }

    renderCards(unique);

    searchEl.addEventListener('input', () => {
        const q = searchEl.value.trim().toLowerCase();
        renderCards(q ? unique.filter(m => m.title.toLowerCase().includes(q)) : unique);
    });
}

// ============================================================
//   مكتبتي (قوائم القراءة الشخصية)
// ============================================================
const LIST_META = {
    favorites:        { label: '♥ مفضلة',       empty: 'لم تضف أي عمل للمفضلة بعد.' },
    currentlyReading: { label: '📖 أقرأها الآن', empty: 'لا توجد أعمال جاري قراءتها.' },
    readLater:        { label: '🔖 قراءة لاحقاً', empty: 'لا توجد أعمال في قائمة القراءة لاحقاً.' },
    completed:        { label: '✓ مقروءة',         empty: 'لم تُكمل أي عمل بعد.' },
};

async function renderMyLibrary(listName = 'favorites') {
    setActiveDrawer('my-library', listName);
    app.appendChild(tpl('my-library'));

    const tabs = document.querySelectorAll('.my-lib-tab');
    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.list === listName);
        tab.onclick = () => {
            if (tab.dataset.list === listName) return;
            navigate('my-library', { id: tab.dataset.list });
        };
    });

    const [lists, library, allProgress] = await Promise.all([
        api('/lists'),
        api('/library'),
        api('/progress-all'),
    ]);

    const ids = lists[listName] || [];
    const libMap = Object.fromEntries(library.map(m => [m.id, m]));
    const grid   = document.getElementById('my-lib-grid');
    const empty  = document.getElementById('my-lib-empty');

    const items = ids.map(id => libMap[id]).filter(Boolean);
    empty.hidden = items.length > 0;
    if (!items.length) {
        empty.textContent = LIST_META[listName]?.empty || 'لا توجد أعمال.';
        return;
    }

    items.forEach(m => {
        const row = document.createElement('div');
        row.className = 'list-card';
        row.innerHTML = buildAzoraCard(m, allProgress[m.id], true);
        row.onclick = () => navigate('detail', { id: m.id });
        grid.appendChild(row);
    });
}

// ============================================================
//   بوتوم شيت — أضف للمكتبة
// ============================================================
function showAddToListSheet(manhwaId, lists) {
    const OPTS = [
        { key: 'favorites',        icon: '♥', label: 'مفضلة' },
        { key: 'currentlyReading', icon: '📖', label: 'أقرأها الآن' },
        { key: 'readLater',        icon: '🔖', label: 'قراءة لاحقاً' },
        { key: 'completed',        icon: '✓', label: 'مقروءة' },
    ];

    const overlay = document.createElement('div');
    overlay.className = 'sheet-overlay';

    const sheet = document.createElement('div');
    sheet.className = 'bottom-sheet';
    sheet.innerHTML = `
        <div class="sheet-handle"></div>
        <div class="sheet-title">أضف للمكتبة</div>
        ${OPTS.map(o => {
            const active = (lists[o.key] || []).includes(manhwaId);
            return `<button class="sheet-option${active ? ' active' : ''}" data-list="${o.key}">
                <span class="sheet-option-icon">${o.icon}</span>
                <span class="sheet-option-label">${o.label}</span>
                <span class="sheet-check">${active ? '✓' : ''}</span>
            </button>`;
        }).join('')}
    `;

    sheet.querySelectorAll('.sheet-option').forEach(btn => {
        btn.onclick = async () => {
            const listName = btn.dataset.list;
            try {
                await api(`/lists/${listName}/toggle/${manhwaId}`, { method: 'POST' });
                btn.classList.toggle('active');
                btn.querySelector('.sheet-check').textContent = btn.classList.contains('active') ? '✓' : '';
            } catch { /* ignore */ }
        };
    });

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    overlay.onclick = e => { if (e.target === overlay) { sheet.classList.remove('open'); setTimeout(() => overlay.remove(), 320); } };
    requestAnimationFrame(() => sheet.classList.add('open'));
}

// ============================================================
//   صفحة التفاصيل — AZORA style
// ============================================================
async function renderDetail(id) {
    const [m, lists] = await Promise.all([
        api('/manhwa/' + id),
        api('/lists'),
    ]);

    // تفعيل AZORA: خلفية مضبّبة من الغلاف
    document.body.classList.add('detail-page');
    if (m.coverUrl) {
        document.body.style.setProperty('--detail-bg-url', `url("${m.coverUrl}")`);
    }

    app.appendChild(tpl('detail'));

    // الغلاف
    const coverEl = document.getElementById('detail-cover');
    coverEl.src = m.coverUrl || placeholderCover();

    // العنوان
    document.getElementById('detail-title').textContent = m.title;

    // النوع
    const typeEl = document.getElementById('detail-type');
    if (typeEl) {
        typeEl.textContent = (m.tags || []).some(t => /رواية|novel/i.test(t)) ? 'رواية' : 'مانهوا';
    }

    // الوصف (في تبويب الملخص)
    const descEl = document.getElementById('detail-desc');
    if (descEl) descEl.textContent = m.description || 'لا يوجد وصف.';

    const chapters = m.chapters || [];
    const chCountEl = document.getElementById('detail-ch-count');
    if (chCountEl) chCountEl.textContent = chapters.length || '—';

    // زر الرجوع
    document.getElementById('btn-back').onclick = () => history.back();

    // وسوم
    const tagsEl = document.getElementById('detail-tags');
    (m.tags || []).forEach(t => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip'; chip.textContent = t;
        tagsEl.appendChild(chip);
    });

    // تبويبات
    const detailTabs = document.querySelectorAll('.detail-tab');
    const tabChapters = document.getElementById('detail-tab-chapters');
    const tabSummary  = document.getElementById('detail-tab-summary');
    detailTabs.forEach(tab => {
        tab.onclick = () => {
            detailTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const isChapters = tab.dataset.tab === 'chapters';
            if (tabChapters) tabChapters.hidden = !isChapters;
            if (tabSummary)  tabSummary.hidden  = isChapters;
        };
    });

    // زر أضف للمكتبة
    document.getElementById('btn-add-list').onclick = () => showAddToListSheet(id, lists);

    // زر القراءة
    document.getElementById('btn-continue-read').onclick = () => {
        const next = m.progress.lastReadChapter
            ? chapters.find(c => String(c.num) === String(m.progress.lastReadChapter))?.num
            : chapters[0]?.num;
        if (next != null) navigate('reader', { id, chapter: next });
    };

    // فصول MangaDex — للمدير فقط
    if (isAdmin && m.mdxId) {
        const mdxSection = document.getElementById('mdx-chapter-section');
        if (mdxSection) {
            mdxSection.hidden = false;
            const mdxList = document.getElementById('mdx-chapter-list');
            mdxList.innerHTML = '<div class="loader"><div class="loader-ring"></div><p class="loader-text">جاري جلب الفصول من MangaDex...</p></div>';
            try {
                const mdxChapters = await api(`/mangadex/${m.mdxId}/chapters`);
                mdxList.innerHTML = '';
                const existingNums = new Set((m.chapters || []).map(c => String(c.num)));
                if (!mdxChapters.length) {
                    mdxList.innerHTML = '<p class="empty-hint">لا توجد فصول على MangaDex.</p>';
                } else {
                    const lang = mdxChapters[0]?.lang || 'en';
                    const bulkBtn = document.createElement('button');
                    bulkBtn.className = 'btn btn-blue';
                    bulkBtn.style.cssText = 'margin-bottom:12px;width:100%';
                    const notDownloaded = mdxChapters.filter(ch => !existingNums.has(String(ch.num))).length;
                    bulkBtn.textContent = `⬇ تحميل جميع الفصول (${notDownloaded} فصل ${lang === 'ar' ? '🇸🇦' : 'EN'})`;
                    bulkBtn.onclick = async () => {
                        if (!confirm(`سيتم تحميل ${notDownloaded} فصل — قد يستغرق وقتاً. هل تريد المتابعة؟`)) return;
                        bulkBtn.disabled = true;
                        bulkBtn.textContent = 'جاري التحميل...';
                        try {
                            const { jobKey } = await api('/mangadex/download-all', {
                                method: 'POST',
                                body: JSON.stringify({ manhwaId: id, mdxId: m.mdxId }),
                            });
                            const poll = setInterval(async () => {
                                const job = await fetch(`/api/job/${jobKey}`).then(r => r.json());
                                if (job.status === 'done') {
                                    clearInterval(poll);
                                    bulkBtn.textContent = `✓ اكتمل تحميل ${job.done} فصل`;
                                    setTimeout(() => navigate('detail', { id }), 1500);
                                } else if (job.status === 'error') {
                                    clearInterval(poll);
                                    bulkBtn.textContent = '❌ ' + job.error;
                                    bulkBtn.disabled = false;
                                } else if (job.progress) {
                                    bulkBtn.textContent = `⬇ فصل ${job.progress.chapterNum} (${job.progress.page}/${job.progress.total})...`;
                                }
                            }, 2500);
                        } catch (err) {
                            bulkBtn.textContent = '❌ ' + err.message;
                            bulkBtn.disabled = false;
                        }
                    };
                    mdxList.appendChild(bulkBtn);

                    mdxChapters.forEach(ch => {
                        const downloaded = existingNums.has(String(ch.num));
                        const isAr = ch.lang === 'ar';
                        const row = document.createElement('div');
                        row.className = 'chapter-row';
                        const dlLabel = isAr ? 'تحميل 🇸🇦' : 'تحميل ✦ ترجمة';
                        row.innerHTML = `
                            <span class="chapter-num">فصل ${ch.num}${ch.title ? ' — ' + escapeHtml(ch.title) : ''}</span>
                            <div style="display:flex;align-items:center;gap:8px">
                                <span style="font-size:10px;padding:2px 6px;border-radius:20px;background:${isAr ? '#1565c0' : '#333'};color:#fff">${isAr ? 'عربي' : 'EN'}</span>
                                <span style="font-size:11px;color:var(--text-muted)">${ch.pages} صفحة</span>
                                ${downloaded
                                    ? '<span style="color:var(--gold);font-size:13px">✓ محمّل</span>'
                                    : `<button class="btn-mdx-dl" data-cid="${ch.id}" data-num="${ch.num}" data-lang="${isAr ? 'ar' : 'en'}">${dlLabel}</button>`}
                            </div>
                        `;
                        if (!downloaded) {
                            const btn = row.querySelector('.btn-mdx-dl');
                            btn.onclick = async () => {
                                btn.disabled = true;
                                btn.textContent = 'جاري التحميل...';
                                try {
                                    const { jobKey } = await api('/mangadex/download-chapter', {
                                        method: 'POST',
                                        body: JSON.stringify({ manhwaId: id, chapterId: ch.id, chapterNum: ch.num, lang: ch.lang }),
                                    });
                                    while (true) {
                                        await new Promise(r => setTimeout(r, 2000));
                                        const job = await fetch(`/api/job/${jobKey}`).then(r => r.json());
                                        if (job.status === 'done') {
                                            btn.textContent = '✓ تم التحميل';
                                            btn.style.color = 'var(--gold)';
                                            existingNums.add(String(ch.num));
                                            break;
                                        } else if (job.status === 'error') {
                                            throw new Error(job.error);
                                        } else if (job.progress) {
                                            const { page, total, stage } = job.progress;
                                            const stageLabel = stage === 'download' ? 'تحميل' : stage === 'done' ? 'اكتمل' : 'ترجمة';
                                            btn.textContent = `${stageLabel} ${page}/${total}...`;
                                        }
                                    }
                                } catch (err) {
                                    btn.textContent = '❌ ' + err.message;
                                    btn.disabled = false;
                                }
                            };
                        }
                        mdxList.appendChild(row);
                    });
                }
            } catch (e) {
                document.getElementById('mdx-chapter-list').innerHTML =
                    `<p class="empty-hint">خطأ في MangaDex: ${escapeHtml(e.message)}</p>`;
            }
        }
    }

    // الفصول المحلية — AZORA style
    const chapterList = document.getElementById('chapter-list');
    if (!chapters.length) {
        chapterList.innerHTML = '<p class="empty-hint">لا توجد فصول بعد.</p>';
        chapterList.style.background = 'none';
    } else {
        chapters.forEach(ch => {
            const isRead = m.progress.readChapters.includes(String(ch.num));
            const thumbUrl = ch.pages?.[0]?.imageUrl;
            const row = document.createElement('div');
            row.className = 'azora-ch-row';
            row.innerHTML = `
                <div class="azora-ch-right">
                    ${thumbUrl
                        ? `<img class="azora-ch-thumb" src="${thumbUrl}" alt="" loading="lazy">`
                        : `<div class="azora-ch-thumb-ph"></div>`}
                    <div class="azora-ch-info">
                        <span class="azora-ch-num">الفصل ${ch.num}${ch.title ? ' — ' + escapeHtml(ch.title) : ''}</span>
                        ${!isRead ? '<span class="azora-ch-badge">🔥 جديد</span>' : ''}
                    </div>
                </div>
                <div class="azora-ch-left">
                    <span class="azora-ch-stat">♡ 0</span>
                    <span class="azora-ch-stat">💬 0</span>
                    ${isRead ? '<span class="azora-ch-read">✓</span>' : ''}
                </div>
            `;
            row.onclick = () => navigate('reader', { id, chapter: ch.num });
            chapterList.appendChild(row);
        });
    }
}

// ============================================================
//   Canvas Scanlation Engine
//   كما تعمل فرق الترجمة: يكشف لون الخلفية → يمحو النص الأصلي → يكتب العربية
// ============================================================

// يسامل متوسط السطوع لمنطقة (من الحواف لتجنب النص نفسه)
function _sampleBrightness(ctx, x, y, w, h) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const pts = [
        [x + w * .12, y + h * .12], [x + w * .88, y + h * .12],
        [x + w * .12, y + h * .88], [x + w * .88, y + h * .88],
        [x + w * .5,  y + h * .08], [x + w * .5,  y + h * .92],
        [x + w * .08, y + h * .5],  [x + w * .92, y + h * .5],
    ];
    let total = 0, n = 0;
    for (let [sx, sy] of pts) {
        sx = Math.max(0, Math.min(cw - 1, Math.round(sx)));
        sy = Math.max(0, Math.min(ch - 1, Math.round(sy)));
        const d = ctx.getImageData(sx, sy, 1, 1).data;
        total += (d[0] + d[1] + d[2]) / 3;
        n++;
    }
    return n ? total / n : 128;
}

// يسامل لون الخلفية من خارج الـ bbox مباشرة (للنصوص على خلفية داكنة)
function _sampleSurroundColor(ctx, x, y, w, h) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const pad = 8;
    const pts = [
        [x - pad, y + h / 2], [x + w + pad, y + h / 2],
        [x + w / 2, y - pad], [x + w / 2, y + h + pad],
        [x - pad, y + h / 4], [x + w + pad, y + h * 3 / 4],
    ].filter(([sx, sy]) => sx >= 0 && sx < cw && sy >= 0 && sy < ch);

    let r = 0, g = 0, b = 0, n = 0;
    for (const [sx, sy] of pts) {
        const d = ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
        r += d[0]; g += d[1]; b += d[2]; n++;
    }
    if (!n) return 'rgb(8,8,8)';
    return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
}

// Flood fill من نقطة مركزية — يملأ كل البيكسلات الفاتحة حتى يصطدم بالحدود الداكنة
// هذا هو جوهر عمل فرق الترجمة: يملأ الفقاعة البيضاء كاملة تلقائياً
function _floodFillWhite(imageData, startX, startY) {
    const W = imageData.width, H = imageData.height;
    const data = imageData.data;
    const sx = Math.max(0, Math.min(W - 1, Math.round(startX)));
    const sy = Math.max(0, Math.min(H - 1, Math.round(startY)));

    const si = (sy * W + sx) * 4;
    if ((data[si] + data[si + 1] + data[si + 2]) / 3 < 145) return; // ليست منطقة فاتحة

    const filled = new Uint8Array(W * H);
    const queue  = [sy * W + sx];
    filled[sy * W + sx] = 1;
    let qi = 0;
    const MAX = 150000; // حد أقصى لعدد البيكسلات (فقاعة عادية ≤ 50,000)

    while (qi < queue.length && qi < MAX) {
        const pos = queue[qi++];
        const px = pos % W, py = (pos / W) | 0;
        const i  = pos * 4;
        // ابيّض هذا البيكسل
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;

        // تحقق من الجيران الأربعة
        if (px > 0)     { const n = pos - 1; if (!filled[n]) { const ni = n*4; if ((data[ni]+data[ni+1]+data[ni+2])/3 >= 145) { filled[n]=1; queue.push(n); }}}
        if (px < W - 1) { const n = pos + 1; if (!filled[n]) { const ni = n*4; if ((data[ni]+data[ni+1]+data[ni+2])/3 >= 145) { filled[n]=1; queue.push(n); }}}
        if (py > 0)     { const n = pos - W; if (!filled[n]) { const ni = n*4; if ((data[ni]+data[ni+1]+data[ni+2])/3 >= 145) { filled[n]=1; queue.push(n); }}}
        if (py < H - 1) { const n = pos + W; if (!filled[n]) { const ni = n*4; if ((data[ni]+data[ni+1]+data[ni+2])/3 >= 145) { filled[n]=1; queue.push(n); }}}
    }
}

function buildPageCanvas(page) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx    = canvas.getContext('2d', { willReadFrequently: true });
        const img    = new Image();

        img.onload = () => {
            canvas.width  = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);

            const blocks = (page.textBlocks || []).filter(b => {
                if (!b.translated?.trim() || !b.bbox) return false;
                return (b.bbox.x1 - b.bbox.x0) >= 8 && (b.bbox.y1 - b.bbox.y0) >= 8;
            }).map(b => {
                const x = b.bbox.x0, y = b.bbox.y0;
                const w = b.bbox.x1 - b.bbox.x0, h = b.bbox.y1 - b.bbox.y0;
                const t = ['speech','thought','narration','sfx'].includes(b.type) ? b.type : 'speech';
                const brightness = (t === 'sfx') ? 0 : _sampleBrightness(ctx, x, y, w, h);
                return { x, y, w, h, t, brightness, translated: b.translated };
            });

            if (!blocks.length) { resolve(canvas); return; }

            // ── جولة 1: flood fill كل الفقاعات الفاتحة دفعة واحدة على image data مباشرة ──
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            for (const { x, y, w, h, t, brightness } of blocks) {
                if (t !== 'sfx' && brightness > 145) {
                    _floodFillWhite(imgData, Math.round(x + w / 2), Math.round(y + h / 2));
                }
            }
            ctx.putImageData(imgData, 0, 0);

            // ── جولة 2: عالج الخلفيات الداكنة + ارسم كل النصوص ──
            for (const { x, y, w, h, t, brightness, translated } of blocks) {
                ctx.save();

                if (t === 'sfx') {
                    // مؤثر صوتي: بادج صغير داكن
                    ctx.font = 'bold 13px Cairo, sans-serif';
                    const tw = ctx.measureText(translated).width + 14;
                    ctx.fillStyle = 'rgba(0,0,0,.82)';
                    ctx.fillRect(x, y, tw, 22);
                    ctx.fillStyle = '#ffd54f';
                    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
                    ctx.fillText(translated, x + tw - 7, y + 11);

                } else if (brightness <= 145) {
                    // نص على خلفية داكنة — يسامل لون الخلفية من حوله ويطمس النص الأصلي
                    const bg  = _sampleSurroundColor(ctx, x, y, w, h);
                    const pad = Math.max(4, Math.round(Math.min(w, h) * 0.12));
                    ctx.fillStyle = bg;
                    ctx.fillRect(x - pad, y - pad, w + 2 * pad, h + 2 * pad);
                    // نص أبيض فوق الخلفية الداكنة
                    paintTextInBubble(ctx, translated, x - pad, y - pad, w + 2*pad, h + 2*pad, '#ffffff', 0.92);

                } else {
                    // فقاعة فاتحة — flood fill أُنجز في جولة 1، ارسم النص الداكن فقط
                    paintTextInBubble(ctx, translated, x, y, w, h, '#111111', 0.80);
                }

                ctx.restore();
            }

            resolve(canvas);
        };

        img.onerror = reject;
        img.src = page.imageUrl;
    });
}

function paintTextInBubble(ctx, text, bx, by, bw, bh, color, padFactor) {
    const maxW = bw * padFactor;
    const maxH = bh * padFactor;
    const cx   = bx + bw / 2;
    const cy   = by + bh / 2;

    const hi = Math.min(Math.floor(bw / 3.5), Math.floor(bh / 1.5), 36);
    let bestSize = 10, bestLines = [text];

    for (let size = Math.max(hi, 10); size >= 10; size--) {
        ctx.font = `700 ${size}px Cairo, sans-serif`;
        const lines = wrapTextCanvas(ctx, text, maxW);
        if (lines.length * size * 1.35 <= maxH) { bestSize = size; bestLines = lines; break; }
    }

    ctx.font = `700 ${bestSize}px Cairo, sans-serif`;
    ctx.fillStyle    = color;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction    = 'rtl';

    const lineH  = bestSize * 1.35;
    const totalH = bestLines.length * lineH;
    const startY = cy - totalH / 2 + lineH / 2;
    bestLines.forEach((line, i) => ctx.fillText(line, cx, startY + i * lineH));
}

function wrapTextCanvas(ctx, text, maxW) {
    const words = text.split(/\s+/);
    const lines  = [];
    let cur = '';
    for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
        else cur = test;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [text];
}

// ============================================================
//   القارئ
// ============================================================
async function renderReader(id, chapterNum) {
    const m = await api('/manhwa/' + id);
    const chapter = (m.chapters || []).find(c => String(c.num) === String(chapterNum));
    if (!chapter) return navigate('detail', { id });

    app.appendChild(tpl('reader'));
    document.getElementById('reader-title').textContent = `${m.title} — فصل ${chapter.num}`;
    document.getElementById('reader-back').onclick = () => navigate('detail', { id });

    const scroll = document.getElementById('reader-scroll');
    let showOriginal = false;
    const hasBlocks = (chapter.pages || []).some(p => p.textBlocks?.length > 0);

    const toggleBtn = document.getElementById('reader-toggle-original');
    toggleBtn.title = 'عرض الصفحة الأصلية';
    toggleBtn.onclick = () => {
        showOriginal = !showOriginal;
        toggleBtn.style.color = showOriginal ? 'var(--red)' : '';
        renderPages();
    };

    function renderPages() {
        scroll.innerHTML = '';
        document.getElementById('reader-end').hidden = true;

        if (showOriginal || !hasBlocks) {
            // الصور الأصلية بدون معالجة
            (chapter.pages || []).forEach(page => {
                const wrap = document.createElement('div');
                wrap.className = 'reader-page';
                const img = document.createElement('img');
                img.src = page.imageUrl; img.loading = 'lazy';
                wrap.appendChild(img);
                scroll.appendChild(wrap);
            });
            document.getElementById('reader-end').hidden = false;
        } else {
            renderWithCanvas();
        }
    }

    async function renderWithCanvas() {
        await document.fonts.ready;
        for (const page of chapter.pages || []) {
            const wrap = document.createElement('div');
            wrap.className = 'reader-page';
            scroll.appendChild(wrap);

            if (page.textBlocks?.length) {
                try {
                    const canvas = await buildPageCanvas(page);
                    canvas.style.cssText = 'width:100%;display:block;';
                    wrap.appendChild(canvas);
                } catch {
                    appendPageImg(wrap, page.imageUrl);
                }
            } else {
                appendPageImg(wrap, page.imageUrl);
            }
        }
        document.getElementById('reader-end').hidden = false;
    }

    function appendPageImg(wrap, url) {
        const img = document.createElement('img');
        img.src = url; img.loading = 'lazy';
        wrap.appendChild(img);
    }

    renderPages();

    const hintKey = `hint-${id}`;
    if (!sessionStorage.getItem(hintKey)) {
        const hint = document.createElement('div');
        hint.className = 'reader-hint';
        hint.innerHTML = `
            <div class="reader-hint-icon">📖</div>
            <div class="reader-hint-title">القراءة جاهزة</div>
            <div class="reader-hint-sub">اسحب للأسفل لتقليب الصفحات</div>
            <div class="reader-hint-tap">اضغط للبدء</div>
        `;
        const dismiss = () => { hint.remove(); sessionStorage.setItem(hintKey, '1'); };
        hint.onclick = dismiss;
        setTimeout(dismiss, 3000);
        document.body.appendChild(hint);
    }

    await api(`/manhwa/${id}/read/${chapter.num}`, { method: 'POST' });

    const chapters = m.chapters;
    const idx  = chapters.findIndex(c => String(c.num) === String(chapter.num));
    const next = chapters[idx + 1];
    const nextBtn = document.getElementById('btn-next-chapter');
    if (next) {
        nextBtn.textContent = `الفصل ${next.num} ⟵`;
        nextBtn.onclick = () => navigate('reader', { id, chapter: next.num });
    } else {
        nextBtn.textContent = 'هذا آخر فصل متاح';
        nextBtn.disabled = true;
    }
}

// ============================================================
//   الملف الشخصي
// ============================================================
async function renderProfile() {
    setActiveDrawer('profile');
    app.appendChild(tpl('profile'));
    const stats = await api('/profile');

    document.getElementById('stat-chapters').textContent  = stats.totalChaptersRead;
    document.getElementById('stat-manhwa').textContent    = stats.totalManhwa;
    document.getElementById('stat-fav').textContent       = stats.favoritesCount;
    document.getElementById('stat-reading').textContent   = stats.currentlyReadingCount;
    document.getElementById('stat-later').textContent     = stats.readLaterCount;
    document.getElementById('stat-completed').textContent = stats.completedCount;

    // عرض اسم المستخدم إذا كان مسجلاً
    if (currentUser) {
        const avatarEl = document.getElementById('profile-avatar');
        const nameEl   = document.getElementById('profile-name');
        const userEl   = document.getElementById('profile-username');
        const editSec  = document.getElementById('profile-edit-section');
        if (avatarEl) avatarEl.textContent = currentUser.avatarEmoji || '📖';
        if (nameEl)   nameEl.textContent   = currentUser.username || 'قارئ';
        if (userEl)   { userEl.textContent = `@${currentUser.username?.toLowerCase() || ''}`; userEl.style.display = ''; }
        if (editSec)  editSec.style.display = '';

        // حقل تعديل الاسم
        const nameInput = document.getElementById('edit-display-name');
        if (nameInput) nameInput.value = currentUser.username || '';

        // أيقونات الإيموجي
        const emojiOpts = document.getElementById('emoji-options');
        if (emojiOpts) {
            const emojis = ['📖', '📚', '🗡️', '⚔️', '🔥', '❄️', '🌙', '⭐', '👑', '🐉'];
            emojiOpts.innerHTML = '';
            let selectedEmoji = currentUser.avatarEmoji || '📖';
            emojis.forEach(e => {
                const span = document.createElement('span');
                span.textContent = e;
                if (e === selectedEmoji) span.classList.add('selected');
                span.onclick = () => {
                    emojiOpts.querySelectorAll('span').forEach(s => s.classList.remove('selected'));
                    span.classList.add('selected');
                    selectedEmoji = e;
                };
                emojiOpts.appendChild(span);
            });

            const saveBtn = document.getElementById('btn-save-profile');
            if (saveBtn) {
                saveBtn.onclick = async () => {
                    const displayName = nameInput?.value?.trim();
                    saveBtn.disabled = true;
                    try {
                        const result = await api('/profile/update', {
                            method: 'POST',
                            body: JSON.stringify({ displayName, avatarEmoji: selectedEmoji }),
                        });
                        currentUser.username   = result.displayName;
                        currentUser.avatarEmoji = result.avatarEmoji;
                        if (avatarEl) avatarEl.textContent = result.avatarEmoji;
                        if (nameEl)   nameEl.textContent   = result.displayName;
                        saveBtn.textContent = '✓ تم الحفظ';
                        setTimeout(() => { saveBtn.textContent = 'حفظ التغييرات'; saveBtn.disabled = false; }, 1500);
                    } catch (e) { saveBtn.disabled = false; alert(e.message); }
                };
            }
        }
    } else {
        // لم يسجّل دخول — اعرض أزرار التسجيل
        const regBtn  = document.getElementById('btn-register-link');
        const loginBtn = document.getElementById('btn-user-login-link');
        if (regBtn)   { regBtn.style.display   = ''; regBtn.onclick   = () => showLoginOverlay({ startTab: 'register' }); }
        if (loginBtn) { loginBtn.style.display = ''; loginBtn.onclick = () => showLoginOverlay({ startTab: 'user' }); }
    }

    document.getElementById('btn-logout').onclick = async () => {
        await fetch('/api/logout', { method: 'POST' });
        isAdmin = false;
        currentUser = null;
        updateAdminUI();
        location.reload();
    };

    if (!isAdmin) {
        const adminBtn = document.getElementById('btn-admin-login');
        if (adminBtn) {
            adminBtn.style.display = '';
            adminBtn.onclick = () => showLoginOverlay({ startTab: 'admin' });
        }
    }
}

// ============================================================
//   لوحة الإدارة
// ============================================================
async function renderAdmin() {
    setActiveDrawer('admin');
    app.appendChild(tpl('admin'));

    const mdxInput   = document.getElementById('mdx-search-input');
    const mdxSearch  = document.getElementById('btn-mdx-search');
    const mdxResults = document.getElementById('mdx-results');

    async function doMdxSearch() {
        const q = mdxInput.value.trim();
        if (!q) return;
        mdxResults.innerHTML = '<div class="loader"><div class="loader-ring"></div></div>';
        try {
            const results = await api(`/mangadex/search?q=${encodeURIComponent(q)}`);
            mdxResults.innerHTML = '';
            if (!results.length) {
                mdxResults.innerHTML = '<p class="empty-hint">لا توجد نتائج.</p>';
                return;
            }
            results.forEach(manga => {
                const card = document.createElement('div');
                card.className = 'mdx-card';
                const statusMap = { ongoing: 'مستمر', completed: 'مكتمل', hiatus: 'متوقف', cancelled: 'ملغى' };
                card.innerHTML = `
                    <img class="mdx-cover" src="${manga.cover || placeholderCover()}" alt="" loading="lazy">
                    <div class="mdx-info">
                        <div class="mdx-title">${escapeHtml(manga.title)}</div>
                        <div class="mdx-status">
                            ${statusMap[manga.status] || manga.status || ''}
                            ${manga.hasAr ? '<span style="margin-right:6px;padding:2px 7px;border-radius:20px;background:#1565c0;color:#fff;font-size:10px">🇸🇦 عربي</span>' : ''}
                        </div>
                        <div class="mdx-tags">${manga.tags.map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>
                        <button class="btn btn-primary mdx-add-btn" style="margin-top:8px;font-size:12px;padding:8px 14px">+ إضافة للموقع</button>
                    </div>
                `;
                card.querySelector('.mdx-add-btn').onclick = async (e) => {
                    const btn = e.currentTarget;
                    btn.disabled = true;
                    btn.textContent = 'جاري الإضافة...';
                    const manhwaId = 'm_' + Date.now();
                    await api('/manhwa', {
                        method: 'POST',
                        body: JSON.stringify({
                            id: manhwaId, title: manga.title, description: manga.description,
                            coverUrl: manga.cover || '', tags: manga.tags, mdxId: manga.id, chapters: [],
                        }),
                    });
                    btn.textContent = '✓ تمت الإضافة';
                    if (manga.hasAr) {
                        const dlBtn = document.createElement('button');
                        dlBtn.className = 'btn btn-blue';
                        dlBtn.style.cssText = 'margin-top:6px;font-size:11px;padding:7px 12px;width:100%';
                        dlBtn.textContent = '⬇ تحميل الفصول العربية الآن';
                        dlBtn.onclick = async () => {
                            dlBtn.disabled = true;
                            dlBtn.textContent = 'جاري التحميل...';
                            try {
                                const { jobKey } = await api('/mangadex/download-all', {
                                    method: 'POST',
                                    body: JSON.stringify({ manhwaId, mdxId: manga.id }),
                                });
                                const poll = setInterval(async () => {
                                    const job = await fetch(`/api/job/${jobKey}`).then(r => r.json());
                                    if (job.status === 'done') {
                                        clearInterval(poll);
                                        dlBtn.textContent = `✓ تم تحميل ${job.done} فصل`;
                                    } else if (job.status === 'error') {
                                        clearInterval(poll);
                                        dlBtn.textContent = '❌ ' + job.error;
                                    } else if (job.progress) {
                                        dlBtn.textContent = `تحميل فصل ${job.progress.chapterNum} (${job.progress.page}/${job.progress.total})...`;
                                    }
                                }, 2000);
                            } catch (err) {
                                dlBtn.textContent = '❌ ' + err.message;
                            }
                        };
                        btn.parentElement.appendChild(dlBtn);
                    } else {
                        navigate('admin-edit', { id: manhwaId });
                    }
                };
                mdxResults.appendChild(card);
            });
        } catch (e) {
            mdxResults.innerHTML = `<p class="empty-hint">خطأ: ${escapeHtml(e.message)}</p>`;
        }
    }

    mdxSearch.onclick = doMdxSearch;
    mdxInput.addEventListener('keydown', e => { if (e.key === 'Enter') doMdxSearch(); });

    const library = await api('/library');
    const libList = document.getElementById('admin-lib-list');
    const seenIds = new Set();
    library.forEach(m => {
        if (seenIds.has(m.id)) return;
        seenIds.add(m.id);
        const row = document.createElement('div');
        row.className = 'admin-lib-row';
        row.innerHTML = `
            <img src="${m.coverUrl || placeholderCover()}" class="admin-lib-cover" alt="">
            <span class="admin-lib-title">${escapeHtml(m.title)}</span>
            <div class="admin-lib-actions">
                <button class="btn-edit" data-id="${escapeHtml(m.id)}">تعديل</button>
                <button class="btn-danger" data-id="${escapeHtml(m.id)}">حذف</button>
            </div>
        `;
        row.querySelector('.btn-edit').onclick = () => navigate('admin-edit', { id: m.id });
        row.querySelector('.btn-danger').onclick = async () => {
            if (!confirm(`حذف "${m.title}"؟`)) return;
            await api('/manhwa/' + m.id, { method: 'DELETE' });
            row.remove();
        };
        libList.appendChild(row);
    });
    if (!library.length) libList.innerHTML = '<p class="empty-hint">لا يوجد أعمال بعد.</p>';

    document.getElementById('form-admin-add-manhwa').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const id = 'm_' + Date.now();
        await api('/manhwa', {
            method: 'POST',
            body: JSON.stringify({
                id, title: fd.get('title'), description: fd.get('description'),
                tags: (fd.get('tags') || '').split(',').map(s => s.trim()).filter(Boolean),
                coverUrl: fd.get('coverUrl'), chapters: [],
            }),
        });
        navigate('admin-edit', { id });
    };

    document.getElementById('btn-save-admin-settings').onclick = async () => {
        const body = {
            groqKey:        document.getElementById('admin-groqkey').value.trim(),
            groqModel:      document.getElementById('admin-groqmodel').value.trim(),
            sourceLanguage: document.getElementById('admin-source').value,
        };
        const readerPw = document.getElementById('admin-reader-pw').value.trim();
        if (readerPw) body.readerPassword = readerPw;
        const adminPw = document.getElementById('admin-admin-pw').value.trim();
        if (adminPw) body.adminPassword = adminPw;
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        document.getElementById('admin-reader-pw').value = '';
        document.getElementById('admin-admin-pw').value = '';
        alert('تم الحفظ ✓');
    };

    await loadGlossaryUI();
    document.getElementById('form-add-glossary').onsubmit = async (e) => {
        e.preventDefault();
        const korean = document.getElementById('glossary-korean').value.trim();
        const arabic = document.getElementById('glossary-arabic').value.trim();
        if (!korean || !arabic) return;
        await api('/glossary', { method: 'POST', body: JSON.stringify({ korean, arabic }) });
        document.getElementById('glossary-korean').value = '';
        document.getElementById('glossary-arabic').value = '';
        await loadGlossaryUI();
    };
}

// ============================================================
//   صفحة تعديل عمل (للمدير)
// ============================================================
async function renderAdminEdit(id) {
    const m = await api('/manhwa/' + id);
    app.appendChild(tpl('admin-edit'));

    document.getElementById('edit-back-btn').onclick = () => navigate('admin');

    const coverPreview = document.getElementById('edit-cover-preview');
    const titleInput   = document.getElementById('edit-title');
    const descInput    = document.getElementById('edit-description');
    const tagsInput    = document.getElementById('edit-tags');
    const coverInput   = document.getElementById('edit-cover-url');

    coverPreview.src    = m.coverUrl || placeholderCover();
    titleInput.value    = m.title || '';
    descInput.value     = m.description || '';
    tagsInput.value     = (m.tags || []).join(', ');
    coverInput.value    = m.coverUrl || '';

    coverInput.addEventListener('input', () => {
        if (coverInput.value) coverPreview.src = coverInput.value;
    });

    document.getElementById('btn-save-edit').onclick = async () => {
        const btn = document.getElementById('btn-save-edit');
        btn.disabled = true;
        try {
            await api('/manhwa', {
                method: 'POST',
                body: JSON.stringify({
                    id,
                    title:       titleInput.value.trim(),
                    description: descInput.value.trim(),
                    tags:        tagsInput.value.split(',').map(s => s.trim()).filter(Boolean),
                    coverUrl:    coverInput.value.trim(),
                }),
            });
            btn.textContent = '✓ تم الحفظ';
            setTimeout(() => { btn.textContent = 'حفظ التغييرات'; btn.disabled = false; }, 1200);
        } catch (e) { btn.disabled = false; alert(e.message); }
    };

    // رفع فصل جديد
    const uploadForm = document.getElementById('form-upload-chapter');
    if (uploadForm) {
        uploadForm.onsubmit = async (e) => {
            e.preventDefault();
            const chapterNum = uploadForm.chapterNum.value;
            const files = uploadForm.pages.files;
            if (!files.length) return;
            const btn    = document.getElementById('btn-upload-chapter');
            const status = document.getElementById('upload-status');
            btn.disabled = true;
            status.textContent = `جاري رفع ${files.length} صفحة...`;

            const fd = new FormData();
            for (const f of files) fd.append('pages', f);

            try {
                const uploadRes = await fetch(`/api/manhwa/${id}/chapter/${chapterNum}/upload`, { method: 'POST', body: fd });
                if (!uploadRes.ok) throw new Error((await uploadRes.json()).error);
                const { jobKey } = await uploadRes.json();

                while (true) {
                    await new Promise(r => setTimeout(r, 1500));
                    const job = await fetch(`/api/job/${jobKey}`).then(r => r.json());
                    if (job.status === 'done') {
                        status.textContent = '✅ تمت المعالجة بنجاح!';
                        setTimeout(() => navigate('detail', { id }), 800);
                        break;
                    } else if (job.status === 'error') {
                        throw new Error(job.error || 'فشلت المعالجة');
                    } else if (job.progress) {
                        const { page, total, stage } = job.progress;
                        status.textContent = `صفحة ${page}/${total} — ${stage === 'ocr' ? 'استخراج' : 'ترجمة'}...`;
                    }
                }
            } catch (err) {
                status.textContent = '❌ ' + err.message;
            } finally {
                btn.disabled = false;
            }
        };
    }

    // فصول MangaDex في صفحة التعديل
    const mdxHint = document.getElementById('edit-mdx-hint');
    const mdxChList = document.getElementById('edit-mdx-chapter-list');
    if (m.mdxId && mdxChList) {
        if (mdxHint) mdxHint.style.display = 'none';
        mdxChList.style.display = '';
        mdxChList.innerHTML = '<div class="loader"><div class="loader-ring"></div></div>';
        try {
            const mdxChapters = await api(`/mangadex/${m.mdxId}/chapters`);
            mdxChList.innerHTML = '';
            const existingNums = new Set((m.chapters || []).map(c => String(c.num)));
            const lang = mdxChapters[0]?.lang || 'en';
            const notDownloaded = mdxChapters.filter(ch => !existingNums.has(String(ch.num))).length;

            if (notDownloaded > 0) {
                const bulkBtn = document.createElement('button');
                bulkBtn.className = 'btn btn-blue';
                bulkBtn.style.cssText = 'margin-bottom:12px;width:100%';
                bulkBtn.textContent = `⬇ تحميل ${notDownloaded} فصل ${lang === 'ar' ? '🇸🇦' : 'EN'}`;
                bulkBtn.onclick = async () => {
                    if (!confirm(`تحميل ${notDownloaded} فصل؟`)) return;
                    bulkBtn.disabled = true;
                    try {
                        const { jobKey } = await api('/mangadex/download-all', {
                            method: 'POST',
                            body: JSON.stringify({ manhwaId: id, mdxId: m.mdxId }),
                        });
                        const poll = setInterval(async () => {
                            const job = await fetch(`/api/job/${jobKey}`).then(r => r.json());
                            if (job.status === 'done') {
                                clearInterval(poll); bulkBtn.textContent = `✓ اكتمل`;
                            } else if (job.status === 'error') {
                                clearInterval(poll); bulkBtn.textContent = '❌ ' + job.error; bulkBtn.disabled = false;
                            } else if (job.progress) {
                                bulkBtn.textContent = `فصل ${job.progress.chapterNum}...`;
                            }
                        }, 2500);
                    } catch (err) { bulkBtn.textContent = '❌ ' + err.message; bulkBtn.disabled = false; }
                };
                mdxChList.appendChild(bulkBtn);
            }

            mdxChapters.forEach(ch => {
                const downloaded = existingNums.has(String(ch.num));
                const row = document.createElement('div');
                row.className = 'chapter-row';
                row.innerHTML = `
                    <span class="chapter-num">فصل ${ch.num}</span>
                    <span>${downloaded ? '<span style="color:var(--gold)">✓ محمّل</span>' : '<span style="color:var(--text-muted)">غير محمّل</span>'}</span>
                `;
                mdxChList.appendChild(row);
            });
        } catch (e) {
            if (mdxChList) mdxChList.innerHTML = `<p class="empty-hint">خطأ: ${escapeHtml(e.message)}</p>`;
        }
    }
}

async function loadGlossaryUI() {
    const glossary = await api('/glossary');
    const list = document.getElementById('glossary-list');
    list.innerHTML = '';
    const entries = Object.entries(glossary);
    if (!entries.length) {
        list.innerHTML = '<p class="empty-hint" style="padding:16px 0">لا توجد مصطلحات مضافة بعد.</p>';
        return;
    }
    entries.forEach(([kor, ara]) => {
        const row = document.createElement('div');
        row.className = 'glossary-row';
        row.innerHTML = `
            <span class="glossary-kor">${escapeHtml(kor)}</span>
            <span class="glossary-arrow">→</span>
            <span class="glossary-ara">${escapeHtml(ara)}</span>
            <button class="glossary-del" aria-label="حذف">×</button>
        `;
        row.querySelector('.glossary-del').onclick = async () => {
            await api(`/glossary/${encodeURIComponent(kor)}`, { method: 'DELETE' });
            await loadGlossaryUI();
        };
        list.appendChild(row);
    });
}

// ============================================================
//   بدء التشغيل + التوجيه
// ============================================================
function routeFromHash() {
    if (_skipHashChange) return;
    const parts = location.hash.replace('#', '').split('/').filter(Boolean);
    const [view, id, chapter] = parts;
    const v = view || 'home';
    render(v, { id, chapter });
    if (topViews.includes(v)) {
        if (v === 'my-library') setActiveDrawer('my-library', id || 'favorites');
        else setActiveDrawer(v);
    }
}
window.addEventListener('hashchange', routeFromHash);

window.addEventListener('load', async () => {
    try {
        const res = await fetch('/api/me');
        if (res.status === 401) {
            showLoginOverlay();
            return;
        }
        const me = await res.json();
        isAdmin = me.isAdmin;
        if (me.loggedIn && me.userId) {
            currentUser = { userId: me.userId, username: me.username, avatarEmoji: me.avatarEmoji };
        }
    } catch { isAdmin = false; }

    updateAdminUI();
    setActiveDrawer('home');
    routeFromHash();
    if (!location.hash) navigate('home');
});
