'use strict';
const app = document.getElementById('app');
let isAdmin = false;

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
//   نافذة تسجيل الدخول
// ============================================================
function showLoginOverlay(isAdminMode = false) {
    if (document.getElementById('login-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'login-overlay';
    overlay.className = 'login-overlay';
    overlay.innerHTML = `
        <div class="login-box">
            <div class="login-logo">MED<span class="logo-accent">O</span>SA</div>
            <p class="login-hint">${isAdminMode ? 'كلمة مرور المدير' : 'أدخل كلمة المرور للدخول'}</p>
            <input type="password" class="login-input" id="login-pw" placeholder="كلمة المرور" autocomplete="current-password">
            <button class="btn btn-primary login-btn" id="login-submit">${isAdminMode ? 'دخول كمدير' : 'دخول'}</button>
            <p class="login-error" id="login-error" style="display:none"></p>
        </div>
    `;
    const doLogin = async () => {
        const pw = document.getElementById('login-pw').value;
        const errEl = document.getElementById('login-error');
        const btn = document.getElementById('login-submit');
        btn.disabled = true; errEl.style.display = 'none';
        try {
            const r = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pw }),
            });
            const result = await r.json();
            if (result.error) throw new Error(result.error);
            overlay.remove();
            isAdmin = result.isAdmin;
            const adminItem = document.getElementById('drawer-admin-item');
            if (adminItem) adminItem.hidden = !isAdmin;
            if (isAdminMode && result.isAdmin) navigate('admin');
            else if (!location.hash) navigate('home');
            else routeFromHash();
        } catch (e) {
            errEl.textContent = e.message;
            errEl.style.display = 'block';
            btn.disabled = false;
        }
    };
    overlay.querySelector('#login-submit').onclick = doLogin;
    overlay.querySelector('#login-pw').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    document.body.appendChild(overlay);
    setTimeout(() => overlay.querySelector('#login-pw')?.focus(), 150);
}

// ============================================================
//   الدرج الجانبي
// ============================================================
const drawer     = document.getElementById('drawer');
const drawerOver = document.getElementById('drawer-overlay');

function openDrawer() {
    drawer.classList.add('open');
    drawerOver.classList.add('open');
}
function closeDrawer() {
    drawer.classList.remove('open');
    drawerOver.classList.remove('open');
}

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
    location.hash = hash;
    await render(view, params);
    window.scrollTo(0, 0);
}

async function render(view, params) {
    app.innerHTML = '';
    document.body.classList.remove('detail-page');
    pageTransition();
    if (view === 'home')         return renderHome();
    if (view === 'library-list') return renderLibraryList();
    if (view === 'my-library')   return renderMyLibrary(params.id || 'favorites');
    if (view === 'profile')      return renderProfile();
    if (view === 'admin')        return renderAdmin();
    if (view === 'detail')       return renderDetail(params.id);
    if (view === 'reader')       return renderReader(params.id, params.chapter);
}

// ============================================================
//   الرئيسية — Hero + تابع القراءة فقط
// ============================================================
async function renderHome() {
    setActiveDrawer('home');
    app.appendChild(tpl('home'));

    const [library, allProgress] = await Promise.all([
        api('/library'),
        api('/progress-all'),
    ]);

    // بانر Hero — أول عمل بالمكتبة
    const heroSection = document.getElementById('hero-section');
    if (library.length) {
        const featured = library[0];
        const hero = document.createElement('div');
        hero.className = 'hero';
        hero.innerHTML = `
            <img class="hero-bg" src="${featured.coverUrl || placeholderCover()}" alt="${escapeHtml(featured.title)}">
            <div class="hero-overlay"></div>
            <div class="hero-content">
                <div class="hero-tags">${(featured.tags || []).slice(0,3).map(t => `<span class="hero-tag">${escapeHtml(t)}</span>`).join('')}</div>
                <div class="hero-title">${escapeHtml(featured.title)}</div>
                <button class="hero-btn" id="hero-read-btn">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l12 8-12 8V4z"/></svg>
                    ابدأ القراءة
                </button>
            </div>
        `;
        hero.querySelector('#hero-read-btn').onclick = () => navigate('detail', { id: featured.id });
        heroSection.appendChild(hero);
    } else {
        document.getElementById('home-empty').hidden = false;
        return;
    }

    // تابع القراءة
    const inProgress = library.filter(m => allProgress[m.id]?.lastReadChapter);
    if (inProgress.length) {
        document.getElementById('continue-row').hidden = false;
        const scroll = document.getElementById('continue-scroll');
        const seen = new Set();
        inProgress.forEach(m => {
            if (seen.has(m.id)) return;
            seen.add(m.id);
            scroll.appendChild(buildCard(m, allProgress[m.id]));
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
    const chapters  = (m.chapters || []).slice(-4).reverse();
    const tags      = m.tags || [];
    const typeLabel = tags.some(t => /رواية|novel/i.test(t)) ? 'رواية' : 'مانهوا';
    const typeClass = typeLabel === 'رواية' ? 'novel' : 'manhwa';

    const chapRows = chapters.length
        ? chapters.map(ch => {
            const isRead = progress?.readChapters?.includes(String(ch.num));
            return `<div class="lcc-row">
                <span class="lcc-num">الفصل ${ch.num}</span>
                ${isRead
                    ? `<span class="lcc-read">✓ مقروء</span>`
                    : `<span class="lcc-badge">🔥 جديد</span>`}
            </div>`;
        }).join('')
        : `<div class="lcc-row"><span class="lcc-num" style="color:var(--text-muted)">لا توجد فصول بعد</span></div>`;

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
                <span class="list-card-rating">⭐ ${total}</span>
            </div>
            <div class="list-card-chapters-inner">${chapRows}</div>
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

    // تفعيل التاب الصحيح
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
            } catch (e) { /* ignore */ }
        };
    });

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    overlay.onclick = e => { if (e.target === overlay) { sheet.classList.remove('open'); setTimeout(() => overlay.remove(), 320); } };
    requestAnimationFrame(() => sheet.classList.add('open'));
}

// ============================================================
//   صفحة التفاصيل
// ============================================================
async function renderDetail(id) {
    const [m, lists] = await Promise.all([
        api('/manhwa/' + id),
        api('/lists'),
    ]);
    app.appendChild(tpl('detail'));

    document.getElementById('detail-cover').src = m.coverUrl || placeholderCover();
    document.getElementById('detail-title').textContent = m.title;
    document.getElementById('detail-desc').textContent = m.description || '';
    document.getElementById('btn-back').onclick = () => history.back();

    const uploadSection = document.getElementById('admin-upload-section');
    if (uploadSection) uploadSection.hidden = !isAdmin;

    // زر أضف للمكتبة
    document.getElementById('btn-add-list').onclick = () => showAddToListSheet(id, lists);

    // MangaDex — فصول تلقائية
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
                    mdxChapters.forEach(ch => {
                        const downloaded = existingNums.has(String(ch.num));
                        const row = document.createElement('div');
                        row.className = 'chapter-row';
                        row.innerHTML = `
                            <span class="chapter-num">فصل ${ch.num}${ch.title ? ' — ' + escapeHtml(ch.title) : ''}</span>
                            <div style="display:flex;align-items:center;gap:10px">
                                <span style="font-size:11px;color:var(--text-muted)">${ch.pages} صفحة</span>
                                ${downloaded
                                    ? '<span style="color:var(--gold);font-size:13px">✓ محمّل</span>'
                                    : `<button class="btn-mdx-dl" data-cid="${ch.id}" data-num="${ch.num}">تحميل ✦ ترجمة</button>`}
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
                                        body: JSON.stringify({ manhwaId: id, chapterId: ch.id, chapterNum: ch.num }),
                                    });
                                    while (true) {
                                        await new Promise(r => setTimeout(r, 2000));
                                        const job = await fetch(`/api/job/${jobKey}`).then(r => r.json());
                                        if (job.status === 'done') {
                                            btn.textContent = '✓ تمت الترجمة';
                                            btn.style.color = 'var(--gold)';
                                            existingNums.add(String(ch.num));
                                            break;
                                        } else if (job.status === 'error') {
                                            throw new Error(job.error);
                                        } else if (job.progress) {
                                            const { page, total, stage } = job.progress;
                                            btn.textContent = `${stage === 'download' ? 'تحميل' : 'ترجمة'} ${page}/${total}...`;
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

    const tagsEl = document.getElementById('detail-tags');
    (m.tags || []).forEach(t => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip'; chip.textContent = t;
        tagsEl.appendChild(chip);
    });

    const chapters = m.chapters || [];
    const chapterList = document.getElementById('chapter-list');
    chapters.forEach(ch => {
        const isRead = m.progress.readChapters.includes(String(ch.num));
        const row = document.createElement('div');
        row.className = 'chapter-row';
        row.innerHTML = `
            <span class="chapter-num">فصل ${ch.num}${ch.title ? ' — ' + escapeHtml(ch.title) : ''}</span>
            <span class="read-check">${isRead ? '✓' : ''}</span>
        `;
        row.onclick = () => navigate('reader', { id, chapter: ch.num });
        chapterList.appendChild(row);
    });

    document.getElementById('btn-continue-read').onclick = () => {
        const next = m.progress.lastReadChapter
            ? chapters.find(c => String(c.num) === String(m.progress.lastReadChapter))?.num
            : chapters[0]?.num;
        if (next != null) navigate('reader', { id, chapter: next });
    };

    const uploadForm = document.getElementById('form-upload-chapter');
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
    document.getElementById('reader-toggle-original').onclick = () => {
        showOriginal = !showOriginal;
        renderPages();
    };

    function renderPages() {
        scroll.innerHTML = '';
        (chapter.pages || []).forEach(page => {
            const wrap = document.createElement('div');
            wrap.className = 'reader-page';
            const img = document.createElement('img');
            img.src = page.imageUrl;
            wrap.appendChild(img);
            (page.textBlocks || []).forEach(block => {
                const box = document.createElement('div');
                box.className = 'text-overlay';
                const [x0, y0, x1, y1] = normalizedBbox(block.bbox, page.width, page.height);
                box.style.left   = x0 + '%';
                box.style.top    = y0 + '%';
                box.style.width  = (x1 - x0) + '%';
                box.style.height = (y1 - y0) + '%';
                box.textContent  = showOriginal ? block.original : block.translated;
                wrap.appendChild(box);
            });
            scroll.appendChild(wrap);
        });
        document.getElementById('reader-end').hidden = false;
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

function normalizedBbox(bbox, w, h) {
    if (!bbox || !w || !h) return [0, 0, 0, 0];
    return [
        (bbox.x0 / w) * 100, (bbox.y0 / h) * 100,
        (bbox.x1 / w) * 100, (bbox.y1 / h) * 100,
    ];
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

    document.getElementById('btn-logout').onclick = async () => {
        await fetch('/api/logout', { method: 'POST' });
        isAdmin = false;
        const adminItem = document.getElementById('drawer-admin-item');
        if (adminItem) adminItem.hidden = true;
        location.reload();
    };

    if (!isAdmin) {
        const adminBtn = document.getElementById('btn-admin-login');
        adminBtn.style.display = '';
        adminBtn.onclick = () => showLoginOverlay(true);
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
                        <div class="mdx-status">${statusMap[manga.status] || manga.status || ''}</div>
                        <div class="mdx-tags">${manga.tags.map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>
                        <button class="btn btn-primary mdx-add-btn" style="margin-top:8px;font-size:12px;padding:8px 14px">+ إضافة للمكتبة</button>
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
                    navigate('detail', { id: manhwaId });
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
            <button class="btn-danger" data-id="${escapeHtml(m.id)}">حذف</button>
        `;
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
        navigate('detail', { id });
    };

    document.getElementById('btn-save-admin-settings').onclick = async () => {
        const body = {
            groqKey:        document.getElementById('admin-groqkey').value.trim(),
            groqModel:      document.getElementById('admin-groqmodel').value.trim(),
            sourceLanguage: document.getElementById('admin-source').value,
        };
        const readerPw = document.getElementById('admin-reader-pw').value.trim();
        if (readerPw) body.readerPassword = readerPw;
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        document.getElementById('admin-reader-pw').value = '';
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
    } catch { isAdmin = false; }

    const adminItem = document.getElementById('drawer-admin-item');
    if (adminItem) adminItem.hidden = !isAdmin;

    setActiveDrawer('home');
    routeFromHash();
    if (!location.hash) navigate('home');
});
