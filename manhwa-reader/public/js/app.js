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

document.getElementById('btn-header-profile').onclick = () => navigate('profile');

// ربط عناصر الدرج بالتنقل
document.querySelectorAll('.drawer-item').forEach(btn => {
    btn.onclick = () => { closeDrawer(); navigate(btn.dataset.view); };
});

function setActiveDrawer(view) {
    document.querySelectorAll('.drawer-item').forEach(b => {
        b.classList.toggle('active', b.dataset.view === view);
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
const topViews = ['home', 'library-list', 'profile', 'admin'];

async function navigate(view, params = {}) {
    if (topViews.includes(view)) setActiveDrawer(view);
    location.hash = view + (params.id ? `/${params.id}` : '') + (params.chapter ? `/${params.chapter}` : '');
    await render(view, params);
    window.scrollTo(0, 0);
}

async function render(view, params) {
    app.innerHTML = '';
    pageTransition();
    if (view === 'home')         return renderHome();
    if (view === 'library-list') return renderLibraryList();
    if (view === 'profile')      return renderProfile();
    if (view === 'admin')        return renderAdmin();
    if (view === 'detail')       return renderDetail(params.id);
    if (view === 'reader')       return renderReader(params.id, params.chapter);
}

// ============================================================
//   الرئيسية — مع بانر Hero
// ============================================================
async function renderHome() {
    app.appendChild(tpl('home'));

    const grid = document.getElementById('library-grid');
    for (let i = 0; i < 6; i++) {
        const s = document.createElement('div');
        s.className = 'skeleton skeleton-card';
        grid.appendChild(s);
    }

    const [library, allProgress] = await Promise.all([
        api('/library'),
        api('/progress-all'),
    ]);

    grid.innerHTML = '';

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
                <div class="hero-tags">${(featured.tags || []).map(t => `<span class="hero-tag">${escapeHtml(t)}</span>`).join('')}</div>
                <div class="hero-title">${escapeHtml(featured.title)}</div>
                <button class="hero-btn" id="hero-read-btn">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l12 8-12 8V4z"/></svg>
                    ابدأ القراءة
                </button>
            </div>
        `;
        hero.querySelector('#hero-read-btn').onclick = () => navigate('detail', { id: featured.id });
        heroSection.appendChild(hero);
    }

    // تابع القراءة
    const inProgressIds = new Set();
    const inProgress = library.filter(m => allProgress[m.id]?.lastReadChapter);
    if (inProgress.length) {
        document.getElementById('continue-row').hidden = false;
        const scroll = document.getElementById('continue-scroll');
        inProgress.forEach(m => {
            if (inProgressIds.has(m.id)) return;
            inProgressIds.add(m.id);
            scroll.appendChild(buildCard(m, allProgress[m.id]));
        });
    }

    // المكتبة الكاملة
    const seenIds = new Set();
    document.getElementById('library-empty').hidden = library.length > 0;
    library.forEach(m => {
        if (seenIds.has(m.id)) return;
        seenIds.add(m.id);
        grid.appendChild(buildCard(m, allProgress[m.id]));
    });
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
//   قائمة المانجا (عرض قائمة كامل)
// ============================================================
async function renderLibraryList() {
    app.appendChild(tpl('library-list'));

    const [library, allProgress] = await Promise.all([
        api('/library'),
        api('/progress-all'),
    ]);

    const countEl = document.getElementById('lib-list-count');
    const grid    = document.getElementById('lib-list-grid');
    const empty   = document.getElementById('lib-list-empty');

    const seenIds = new Set();
    const unique  = library.filter(m => { if (seenIds.has(m.id)) return false; seenIds.add(m.id); return true; });

    countEl.textContent = `${unique.length} عمل`;
    empty.hidden = unique.length > 0;

    unique.forEach(m => {
        const progress  = allProgress[m.id];
        const readCount = progress?.readChapters?.length || 0;
        const total     = m.chapters?.length || 0;
        const pct       = total ? Math.round((readCount / total) * 100) : 0;

        const row = document.createElement('div');
        row.className = 'list-card';
        row.innerHTML = `
            <img class="list-card-cover" src="${m.coverUrl || placeholderCover()}" alt="${escapeHtml(m.title)}" loading="lazy">
            <div class="list-card-body">
                <div class="list-card-title">${escapeHtml(m.title)}</div>
                <div class="list-card-tags">${(m.tags || []).map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>
                <div class="list-card-meta">
                    <span>${total} فصل</span>
                    ${readCount ? `<span class="list-card-read">${readCount} مقروء</span>` : ''}
                </div>
                ${total ? `<div class="list-card-bar"><div class="list-card-fill" style="width:${pct}%"></div></div>` : ''}
            </div>
            <svg class="list-card-arrow" viewBox="0 0 24 24"><path d="M9 6l-6 6 6 6"/></svg>
        `;
        row.onclick = () => navigate('detail', { id: m.id });
        grid.appendChild(row);
    });
}

// ============================================================
//   صفحة التفاصيل
// ============================================================
async function renderDetail(id) {
    const m = await api('/manhwa/' + id);
    const lists = await api('/lists');
    app.appendChild(tpl('detail'));

    document.getElementById('detail-cover').src = m.coverUrl || placeholderCover();
    document.getElementById('detail-title').textContent = m.title;
    document.getElementById('detail-desc').textContent = m.description || '';
    document.getElementById('btn-back').onclick = () => history.back();
    const uploadSection = document.getElementById('admin-upload-section');
    if (uploadSection) uploadSection.hidden = !isAdmin;

    const tagsEl = document.getElementById('detail-tags');
    (m.tags || []).forEach(t => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip'; chip.textContent = t;
        tagsEl.appendChild(chip);
    });

    const favBtn   = document.getElementById('btn-fav');
    const laterBtn = document.getElementById('btn-later');
    favBtn.classList.toggle('active', lists.favorites.includes(id));
    laterBtn.classList.toggle('active', lists.readLater.includes(id));
    favBtn.onclick   = async () => { await api(`/lists/favorites/toggle/${id}`, { method: 'POST' }); favBtn.classList.toggle('active'); };
    laterBtn.onclick = async () => { await api(`/lists/readLater/toggle/${id}`, { method: 'POST' }); laterBtn.classList.toggle('active'); };

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
                    const stageLabel = stage === 'ocr' ? 'استخراج النص' : 'ترجمة';
                    status.textContent = `صفحة ${page}/${total} — ${stageLabel}...`;
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
    app.appendChild(tpl('profile'));
    const stats = await api('/profile');
    document.getElementById('stat-chapters').textContent = stats.totalChaptersRead;
    document.getElementById('stat-manhwa').textContent   = stats.totalManhwa;
    document.getElementById('stat-fav').textContent      = stats.favoritesCount;
    document.getElementById('stat-later').textContent    = stats.readLaterCount;
    document.getElementById('btn-logout').onclick = async () => {
        await fetch('/api/logout', { method: 'POST' });
        location.reload();
    };
}

// ============================================================
//   لوحة الإدارة
// ============================================================
async function renderAdmin() {
    app.appendChild(tpl('admin'));

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
    if (topViews.includes(v)) setActiveDrawer(v);
}
window.addEventListener('hashchange', routeFromHash);

window.addEventListener('load', async () => {
    try {
        const me = await api('/me');
        isAdmin = me.isAdmin;
    } catch { isAdmin = false; }

    const adminItem = document.getElementById('drawer-admin-item');
    if (adminItem) adminItem.hidden = !isAdmin;

    setActiveDrawer('home');
    routeFromHash();
    if (!location.hash) navigate('home');
});
