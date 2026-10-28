// 全局应用对象 - 模块化管理（整合版）
const VideoApp = {
    // 状态管理
    state: {
        videoList: [],
        filteredList: [],
        currentRandomVideo: null,
        currentPage: 1,
        pageSize: 12,
        isPremiumFilterActive: false,
        isLiveReplayFilterActive: false,
        latestVideoCount: 3,
        activePrimary: null,
        durationFilter: null,
        // 新增：排序
        sortMode: 'date-desc',
        // 新增：活跃关键词筛选
        activeKeywords: new Set(),
        // 来源筛选：'all' | 'bilibili' | 'youtube'
        sourceFilter: 'all',
        // 个人筛选
        favOnly: false,
        historyOnly: false,
        // 播放列表当前索引（-1 表示不在列表播放）
        playlistIndex: -1,
        // 当前播放中的视频（小窗恢复用）
        currentPlayingVideo: null,
    },

    // ==================== 本地存储 ====================
    STORAGE_KEYS: {
        theme: 'jys_theme',
        favorites: 'jys_favorites',
        history: 'jys_history',
    },

    // 存储层：优先 UserData（支持云端同步），否则退化到 localStorage
    lsGet(key, fallback) {
        if (window.UserData && UserData.lsGet) return UserData.lsGet(key, fallback);
        try {
            const raw = localStorage.getItem(key);
            return raw == null ? fallback : JSON.parse(raw);
        } catch (e) {
            return fallback;
        }
    },

    lsSet(key, value) {
        if (window.UserData && UserData.lsSet) return UserData.lsSet(key, value);
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) { /* 私密模式下忽略 */ }
    },

    // ==================== 主题 ====================
    // 三档：dark（默认暗色）→ dim（夜深调暗）→ light（浅色）
    THEME_CYCLE: ['dark', 'dim', 'light'],

    initTheme() {
        const saved = this.lsGet(this.STORAGE_KEYS.theme, null);
        const theme = saved || 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        this.syncThemeUI(theme);
    },

    setTheme(next) {
        document.documentElement.setAttribute('data-theme', next);
        this.lsSet(this.STORAGE_KEYS.theme, next);
        this.syncThemeUI(next);
    },

    toggleTheme() {
        const cur = document.documentElement.getAttribute('data-theme') || 'dark';
        const idx = this.THEME_CYCLE.indexOf(cur);
        const next = this.THEME_CYCLE[(idx + 1) % this.THEME_CYCLE.length];
        this.setTheme(next);
    },

    syncThemeUI(theme) {
        const wrap = document.getElementById('themeToggle');
        if (!wrap) return;
        wrap.querySelectorAll('.theme-opt').forEach(btn => {
            btn.classList.toggle('active', (btn.dataset.themeVal || '') === theme);
        });
    },

    bindThemeEvent() {
        const wrap = document.getElementById('themeToggle');
        if (!wrap) return;
        wrap.addEventListener('click', (e) => {
            const btn = e.target.closest('.theme-opt');
            if (!btn) return;
            const val = btn.dataset.themeVal;
            if (val) this.setTheme(val);
        });
    },

    // ==================== 收藏 ====================
    loadFavorites() {
        return this.lsGet(this.STORAGE_KEYS.favorites, []);
    },

    isFavorite(id) {
        return this.loadFavorites().includes(id);
    },

    toggleFavorite(id) {
        let favs = this.loadFavorites();
        if (favs.includes(id)) {
            favs = favs.filter(x => x !== id);
        } else {
            favs.unshift(id);
            if (favs.length > 500) favs = favs.slice(0, 500);
        }
        this.lsSet(this.STORAGE_KEYS.favorites, favs);
        return favs.includes(id);
    },

    // ==================== 观看历史 ====================
    loadHistory() {
        return this.lsGet(this.STORAGE_KEYS.history, []);
    },

    addHistory(id, name) {
        let hist = this.loadHistory().filter(h => h.id !== id);
        hist.unshift({ id, name: name || '', ts: Date.now() });
        if (hist.length > 100) hist = hist.slice(0, 100);
        this.lsSet(this.STORAGE_KEYS.history, hist);
    },

    isWatched(id) {
        return this.loadHistory().some(h => h.id === id);
    },

    clearHistory() {
        this.lsSet(this.STORAGE_KEYS.history, []);
    },

    // ==================== 播放列表（今晚序列） ====================
    loadPlaylist() {
        return this.lsGet('jys_playlist', []);
    },

    savePlaylist(list) {
        this.lsSet('jys_playlist', list);
        this.updatePlaylistCount();
    },

    updatePlaylistCount() {
        const el = document.getElementById('playlistCount');
        if (el) el.textContent = String(this.loadPlaylist().length);
    },

    isInPlaylist(id) {
        return this.loadPlaylist().includes(id);
    },

    addToPlaylist(id) {
        let list = this.loadPlaylist();
        if (list.includes(id)) return false;
        list.push(id);
        this.savePlaylist(list);
        return true;
    },

    removeFromPlaylist(id) {
        const list = this.loadPlaylist().filter(x => x !== id);
        this.savePlaylist(list);
    },

    movePlaylistItem(id, dir) {
        const list = this.loadPlaylist();
        const i = list.indexOf(id);
        if (i < 0) return;
        const j = i + dir;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        this.savePlaylist(list);
    },

    clearPlaylist() {
        this.savePlaylist([]);
        this.state.playlistIndex = -1;
    },

    findVideoById(id) {
        return this.state.videoList.find(v => this.genId(v) === id);
    },

    openPlaylistDrawer() {
        const drawer = document.getElementById('playlistDrawer');
        if (drawer) drawer.style.display = 'flex';
        this.renderPlaylist();
    },

    closePlaylistDrawer() {
        const drawer = document.getElementById('playlistDrawer');
        if (drawer) drawer.style.display = 'none';
    },

    renderPlaylist() {
        const box = document.getElementById('playlistItems');
        if (!box) return;
        const list = this.loadPlaylist();
        if (list.length === 0) {
            box.innerHTML = '<div class="playlist-empty">还没有加入任何视频<br>在卡片上点 ➕ 加入今晚序列</div>';
            return;
        }
        box.innerHTML = list.map((id, idx) => {
            const v = this.findVideoById(id);
            if (!v) return '';
            let cover = v.cover || '';
            if (cover && !cover.startsWith('http') && !cover.startsWith('data:')) {
                if (!cover.startsWith('covers/') && !cover.startsWith('/')) cover = 'covers/' + cover;
                cover = './' + cover.replace(/^\//, '');
            }
            const playing = this.state.playlistIndex === idx;
            return `
                <div class="pl-item ${playing ? 'playing' : ''}" data-id="${this.escAttr(id)}" data-idx="${idx}">
                    <div class="pl-item-index">${idx + 1}</div>
                    <img class="pl-item-thumb" src="${this.escAttr(cover)}" alt="" loading="lazy">
                    <div class="pl-item-title">${this.escHtml(v.name)}</div>
                    <div class="pl-item-tools">
                        <button class="pl-tool up" title="上移">↑</button>
                        <button class="pl-tool down" title="下移">↓</button>
                        <button class="pl-tool play" title="播放">▶</button>
                        <button class="pl-tool remove" title="移除">✕</button>
                    </div>
                </div>
            `;
        }).join('');

        box.querySelectorAll('.pl-item').forEach(item => {
            const id = item.dataset.id;
            const idx = parseInt(item.dataset.idx, 10);
            item.querySelector('.up')?.addEventListener('click', e => {
                e.stopPropagation();
                this.movePlaylistItem(id, -1);
                this.renderPlaylist();
            });
            item.querySelector('.down')?.addEventListener('click', e => {
                e.stopPropagation();
                this.movePlaylistItem(id, 1);
                this.renderPlaylist();
            });
            item.querySelector('.remove')?.addEventListener('click', e => {
                e.stopPropagation();
                this.removeFromPlaylist(id);
                this.renderPlaylist();
                // 同步卡片上的 ➕ 按钮
                this.renderVideoList();
            });
            item.querySelector('.play')?.addEventListener('click', e => {
                e.stopPropagation();
                this.playPlaylistAt(idx);
                this.closePlaylistDrawer();
            });
        });
    },

    playPlaylistAt(idx) {
        const list = this.loadPlaylist();
        if (idx < 0 || idx >= list.length) return;
        const v = this.findVideoById(list[idx]);
        if (!v) return;
        this.state.playlistIndex = idx;
        this.openVideoModal(v, true);
    },

    playNextInPlaylist() {
        const list = this.loadPlaylist();
        const next = this.state.playlistIndex + 1;
        if (next < list.length) this.playPlaylistAt(next);
    },

    playPrevInPlaylist() {
        const prev = this.state.playlistIndex - 1;
        if (prev >= 0) this.playPlaylistAt(prev);
    },

    playPlaylistShuffled() {
        const list = this.loadPlaylist();
        if (list.length === 0) return alert('播放列表是空的');
        // Fisher-Yates
        const arr = [...list];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        this.savePlaylist(arr);
        this.renderPlaylist();
        this.playPlaylistAt(0);
        this.closePlaylistDrawer();
    },

    updatePlaylistNav() {
        const nav = document.getElementById('playlistNav');
        const pos = document.getElementById('plPosition');
        const list = this.loadPlaylist();
        const inList = this.state.playlistIndex >= 0 && this.state.playlistIndex < list.length;
        if (nav) nav.style.display = inList ? 'flex' : 'none';
        if (pos && inList) pos.textContent = `${this.state.playlistIndex + 1} / ${list.length}`;
    },

    // ==================== 工具函数 ====================
    extractBvidFromLink(link) {
        if (!link) return null;
        const bvMatch = link.match(/(BV[a-zA-Z0-9]{10})/i);
        return bvMatch ? bvMatch[1] : null;
    },

    extractYoutubeIdFromLink(link) {
        if (!link) return null;
        if (this.state && this.state.currentYoutubeId) {
            // fall through to regex below
        }
        // youtu.be/ID, /watch?v=ID, /embed/ID, /shorts/ID
        const m = link.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{11})/i);
        return m ? m[1] : null;
    },

    getVideoSource(video) {
        if (!video) return 'bilibili';
        if (video.source) return video.source;
        if (video.youtubeId) return 'youtube';
        if (video.link && /youtube\.com|youtu\.be/i.test(video.link)) return 'youtube';
        return 'bilibili';
    },

    buildPlayerUrl(video) {
        const src = this.getVideoSource(video);
        if (src === 'youtube') {
            const id = video.youtubeId || this.extractYoutubeIdFromLink(video.link);
            if (!id) return null;
            // 轻量参数：自动播、无推荐、无注释卡片、无品牌水印
            return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1`;
        }
        const bvid = this.extractBvidFromLink(video.link);
        if (!bvid) return null;
        // 关闭弹幕引擎（省一半加载），自动播放，允许 PIP
        return `https://player.bilibili.com/player.html?bvid=${bvid}&p=1&autoplay=1&danmaku=0&as_wide=1&high_quality=1&allowfullscreen=true&pip=true`;
    },

    genId(video, index) {
        return video.link || ('v_' + index);
    },

    escHtml(s) {
        const d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    },

    escAttr(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    // ==================== 初始化 ====================
    init() {
        this.initTheme();
        this.loadVideoData();
        this.bindSearchEvent();
        this.bindTagEvents();
        this.bindRandomEvent();
        this.bindFilterEvent();
        this.bindVideoModalEvent();
        this.bindSortEvent();
        this.bindDurationEvent();
        this.bindTagFilterToggle();
        this.bindSourceEvent();
        this.bindPersonalEvent();
        this.bindThemeEvent();
        this.bindPlaylistEvent();
        this.bindFiltersToggle();
        this.bindSyncEvent();
        this.bindPlayerActions();
        this.bindPlayerLoading();
        this.bindGuideEvent();
        this.bindSeriesEvent();
        this.readStateFromUrl();
        this.updateFilterCount();
    },

    // ==================== 引导选片：今晚听什么 ====================
    guideState: {
        step: 1,
        duration: null,
        mood: null,
        voice: null,
    },

    MOOD_RULES: {
        relax: ['助眠', '放松', '解压', '按摩', '头疗', '轻语', '冥想', '睡眠引导', '疗愈', '护肤', '化妆'],
        focus: ['专注力测试', '指令', '听力测试', '检查', '专注力'],
        asmr: ['敲击音', '口腔音', '采耳', '抓挠', '刮擦', '触发音', '白噪音', '双耳分听', '叠层声音'],
    },

    VOICE_RULES: {
        talk: ['轻语', '耳语', '对话', '有人声', '人声', '角色扮演'],
        notalk: ['无对话', 'No Talking', 'no talking'],
    },

    bindGuideEvent() {
        const openBtn = document.getElementById('guideBtn');
        const modal = document.getElementById('guideModal');
        const closeBtn = document.getElementById('guideClose');
        const backBtn = document.getElementById('guideBack');
        const againBtn = document.getElementById('guideAgain');
        if (!openBtn || !modal) return;

        openBtn.addEventListener('click', () => {
            this.guideState = { step: 1, duration: null, mood: null, voice: null };
            this.renderGuideStep();
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        });

        if (closeBtn) closeBtn.addEventListener('click', () => this.closeGuide());
        modal.addEventListener('click', e => { if (e.target === modal) this.closeGuide(); });

        if (backBtn) backBtn.addEventListener('click', () => {
            if (this.guideState.step > 1) {
                this.guideState.step--;
                this.renderGuideStep();
            }
        });

        if (againBtn) againBtn.addEventListener('click', () => this.pickGuideResult());

        // 三组选项
        const bindOpts = (wrapId, key) => {
            const wrap = document.getElementById(wrapId);
            if (!wrap) return;
            wrap.addEventListener('click', e => {
                const btn = e.target.closest('.guide-opt');
                if (!btn) return;
                this.guideState[key] = btn.dataset.val;
                // 进入下一步或出结果
                if (this.guideState.step < 3) {
                    this.guideState.step++;
                    this.renderGuideStep();
                } else {
                    this.guideState.step = 4;
                    this.pickGuideResult();
                }
            });
        };
        bindOpts('guideDuration', 'duration');
        bindOpts('guideMood', 'mood');
        bindOpts('guideVoice', 'voice');
    },

    closeGuide() {
        const modal = document.getElementById('guideModal');
        if (modal) modal.style.display = 'none';
        document.body.style.overflow = '';
    },

    renderGuideStep() {
        const step = this.guideState.step;
        document.querySelectorAll('.guide-step').forEach(el => {
            const n = parseInt(el.dataset.step, 10);
            el.hidden = n !== step;
        });
        const progress = document.getElementById('guideProgress');
        if (progress) {
            progress.textContent = step >= 4 ? '为你挑选完成' : `第 ${step} / 3 步`;
        }
        const backBtn = document.getElementById('guideBack');
        if (backBtn) backBtn.hidden = step <= 1 || step >= 4;
        const againBtn = document.getElementById('guideAgain');
        if (againBtn) againBtn.hidden = step < 4;
        const subtitle = document.getElementById('guideSubtitle');
        if (subtitle) {
            subtitle.textContent = step >= 4 ? '不喜欢？换个角度再挑一个' : '三步帮你挑一个，选择困难退散';
        }
    },

    scoreGuideVideo(v) {
        const { duration, mood, voice } = this.guideState;
        const sec = this.parseDuration(v.duration);
        let score = 0;

        // 时长匹配（0–40 分）
        const ranges = {
            short: [0, 300], medium: [300, 1200], long: [1200, 3600], xlong: [3600, Infinity],
        };
        const r = ranges[duration];
        if (r) {
            if (sec >= r[0] && sec < r[1]) score += 40;
            else if (sec < r[0]) score += 15; // 短了也行
            else score += 10;
        }

        // 氛围匹配（0–40）
        const tags = (v.keywords || []).map(t => t.toLowerCase());
        const title = (v.name || '').toLowerCase();
        if (mood && mood !== 'any') {
            const rules = this.MOOD_RULES[mood] || [];
            const hit = rules.filter(rule => {
                const lr = rule.toLowerCase();
                return tags.some(t => t.includes(lr)) || title.includes(lr);
            }).length;
            score += Math.min(40, hit * 12);
        } else {
            score += 20;
        }

        // 人声匹配（0–20）
        if (voice && voice !== 'any') {
            const rules = this.VOICE_RULES[voice] || [];
            const hit = rules.some(rule => {
                const lr = rule.toLowerCase();
                return tags.some(t => t.includes(lr)) || title.includes(lr);
            });
            score += hit ? 20 : 5;
        } else {
            score += 10;
        }

        return score;
    },

    pickGuideResult() {
        const pool = this.state.videoList || [];
        if (pool.length === 0) return;
        const scored = pool
            .map(v => ({ v, s: this.scoreGuideVideo(v) }))
            .sort((a, b) => b.s - a.s);
        // 从前 20 名里随机抽一个，避免每次都一样
        const top = scored.slice(0, Math.min(20, scored.length));
        const pick = top[Math.floor(Math.random() * top.length)].v;
        this.renderGuideResult(pick, scored);
    },

    renderGuideResult(video, scored) {
        const box = document.getElementById('guideResult');
        if (!box) return;

        let cover = video.cover || '';
        if (cover && !cover.startsWith('http') && !cover.startsWith('data:')) {
            if (!cover.startsWith('covers/') && !cover.startsWith('/')) cover = 'covers/' + cover;
            cover = './' + cover.replace(/^\//, '');
        }
        const src = this.getVideoSource(video);
        const srcLabel = src === 'youtube' ? 'YouTube' : 'B 站';
        const date = (video.uploadTime || '').slice(0, 10);

        // 3 个备选
        const others = (scored || [])
            .filter(x => x.v !== video)
            .slice(0, 3)
            .map(x => x.v);

        box.innerHTML = `
            <div class="guide-result-card" data-id="${this.escAttr(this.genId(video))}">
                <img src="${this.escAttr(cover)}" alt="" loading="lazy">
                <div class="guide-result-body">
                    <div class="guide-result-title">${this.escHtml(video.name)}</div>
                    <div class="guide-result-meta">
                        <span>📅 ${this.escHtml(date)}</span>
                        <span>⏱ ${this.escHtml(video.duration || '')}</span>
                        <span>▶ ${srcLabel}</span>
                    </div>
                    <div class="guide-result-actions">
                        <button class="btn-primary sm" data-act="play">▶ 立即播放</button>
                        <button class="btn-ghost sm" data-act="next">🔄 换一个</button>
                    </div>
                </div>
            </div>
            ${others.length ? `<div class="guide-subtitle" style="margin-top:6px">备选</div>` : ''}
            ${others.map(o => {
                let oc = o.cover || '';
                if (oc && !oc.startsWith('http') && !oc.startsWith('data:')) {
                    if (!oc.startsWith('covers/') && !oc.startsWith('/')) oc = 'covers/' + oc;
                    oc = './' + oc.replace(/^\//, '');
                }
                return `
                    <div class="guide-result-card" data-id="${this.escAttr(this.genId(o))}" style="padding:8px">
                        <img src="${this.escAttr(oc)}" alt="" style="width:100px;height:56px">
                        <div class="guide-result-body">
                            <div class="guide-result-title" style="font-size:13px">${this.escHtml(o.name)}</div>
                            <div class="guide-result-meta">
                                <span>⏱ ${this.escHtml(o.duration || '')}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        `;

        // 绑定播放
        box.querySelectorAll('.guide-result-card').forEach(card => {
            const id = card.dataset.id;
            const video2 = this.state.videoList.find(x => this.genId(x) === id);
            if (!video2) return;
            card.addEventListener('click', (e) => {
                const act = e.target.dataset && e.target.dataset.act;
                if (act === 'next') {
                    this.pickGuideResult();
                    return;
                }
                // 点任意位置 → 播放
                this.closeGuide();
                this.openVideoModal(video2);
            });
        });

        this.renderGuideStep();
    },

    // ==================== 系列合集 ====================
    SERIES_DEFS: [
        {
            id: 'headspa', name: '🧖 头疗 / 头皮按摩', desc: '头疗、头皮检查、深度放松',
            match: ['头疗', '头皮', '按摩'],
        },
        {
            id: 'focus', name: '🎯 专注力测试', desc: '指令、专注、注意力挑战',
            match: ['专注力测试', '专注力', '指令'],
        },
        {
            id: 'ear', name: '👂 采耳 / 耳部护理', desc: '掏耳、耳语、耳部清洁',
            match: ['采耳', '掏耳', '耳部', '耳道', '耳语'],
        },
        {
            id: 'mouth', name: '👄 口腔音', desc: '口腔、口水、咀嚼',
            match: ['口腔音', '口水', '咀嚼', '黏糊'],
        },
        {
            id: 'tapping', name: '🎵 敲击 / 触发音', desc: '敲击、抓挠、刮擦、刷子',
            match: ['敲击', '抓挠', '刮擦', '刷子', '触发音', '摩擦'],
        },
        {
            id: 'makeup', name: '💄 化妆 / 护肤', desc: '化妆、护肤、SPA、美容',
            match: ['化妆', '护肤', 'SPA', '美容', '卸妆'],
        },
        {
            id: 'haircut', name: '💈 理发', desc: '剪发、理发店、修面',
            match: ['理发', '剪发', '剪刀', '修面'],
        },
        {
            id: 'meditation', name: '🧘 冥想 / 放松', desc: '冥想、正念、能量、疗愈',
            match: ['冥想', '正念', '能量', '疗愈', '睡眠引导'],
        },
        {
            id: 'live', name: '📺 直播回放', desc: '直播录像，整夜陪伴',
            match: ['直播'],
            extra: v => v.isLiveReplay,
        },
        {
            id: 'premium', name: '⚡ 充电专属', desc: '仅充电用户可见的专属内容',
            match: ['充电专属'],
            extra: v => v.isPremium,
        },
        {
            id: 'short', name: '⚡ 竖屏 / 快速', desc: '5 分钟以内的快速助眠',
            match: ['竖屏'],
            extra: v => this.parseDuration(v.duration) > 0 && this.parseDuration(v.duration) <= 300,
        },
        {
            id: 'lofi', name: '🎬 Lofi / 氛围', desc: 'Lofi 风、氛围陪伴',
            match: ['Lofi', 'lofi'],
        },
    ],

    bindSeriesEvent() {
        const openBtn = document.getElementById('seriesBtn');
        const drawer = document.getElementById('seriesDrawer');
        const closeBtn = document.getElementById('seriesCloseBtn');
        if (!openBtn || !drawer) return;

        openBtn.addEventListener('click', () => {
            this.renderSeriesList();
            drawer.style.display = 'flex';
        });
        if (closeBtn) closeBtn.addEventListener('click', () => drawer.style.display = 'none');
        drawer.addEventListener('click', e => { if (e.target === drawer) drawer.style.display = 'none'; });
    },

    seriesMatch(def, v) {
        if (def.extra && def.extra.call(this, v)) return true;
        const tags = (v.keywords || []).map(t => t.toLowerCase());
        const title = (v.name || '').toLowerCase();
        return (def.match || []).some(rule => {
            const lr = rule.toLowerCase();
            return tags.some(t => t.includes(lr)) || title.includes(lr);
        });
    },

    renderSeriesList() {
        const box = document.getElementById('seriesList');
        if (!box) return;
        const pool = this.state.videoList || [];
        const items = this.SERIES_DEFS
            .map(def => {
                const videos = pool.filter(v => this.seriesMatch(def, v));
                return { def, videos };
            })
            .filter(x => x.videos.length > 0)
            .sort((a, b) => b.videos.length - a.videos.length);

        if (items.length === 0) {
            box.innerHTML = '<div class="playlist-empty">暂时没有识别出系列</div>';
            return;
        }

        box.innerHTML = items.map(({ def, videos }) => {
            // 取该系列的前几个标签
            const tagCount = {};
            videos.forEach(v => (v.keywords || []).forEach(t => {
                tagCount[t] = (tagCount[t] || 0) + 1;
            }));
            const topTags = Object.entries(tagCount)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([t]) => t);
            return `
                <div class="series-card" data-id="${def.id}">
                    <div class="series-card-title">
                        ${this.escHtml(def.name)}
                        <span class="series-card-count">${videos.length}</span>
                    </div>
                    <div class="series-card-desc">${this.escHtml(def.desc)}</div>
                    <div class="series-card-tags">
                        ${topTags.map(t => `<span>${this.escHtml(t)}</span>`).join('')}
                    </div>
                </div>
            `;
        }).join('');

        box.querySelectorAll('.series-card').forEach(card => {
            card.addEventListener('click', () => {
                const def = this.SERIES_DEFS.find(d => d.id === card.dataset.id);
                if (!def) return;
                // 用关键词筛选：把系列 match 的第一个词塞进 activeKeywords
                this.state.activeKeywords.clear();
                // 优先用系列里最能命中的关键词
                const pool = this.state.videoList || [];
                const videos = pool.filter(v => this.seriesMatch(def, v));
                // 从视频标签里挑 1 个最共通的
                const tagCount = {};
                videos.forEach(v => (v.keywords || []).forEach(t => {
                    tagCount[t] = (tagCount[t] || 0) + 1;
                }));
                const best = Object.entries(tagCount).sort((a, b) => b[1] - a[1])[0];
                if (best) {
                    this.state.activeKeywords.add(best[0]);
                } else if (def.match && def.match[0]) {
                    this.state.activeKeywords.add(def.match[0]);
                }
                this.syncSearchInput();
                this.syncTagHighlight();
                this.filterVideos();
                const drawer = document.getElementById('seriesDrawer');
                if (drawer) drawer.style.display = 'none';
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });
    },

    // ==================== 数据同步（导出/导入/同步码） ====================
    bindSyncEvent() {
        const exportBtn = document.getElementById('exportBtn');
        const importBtn = document.getElementById('importBtn');
        const syncCodeBtn = document.getElementById('syncCodeBtn');
        const syncCodeInput = document.getElementById('syncCodeInput');
        const applySyncBtn = document.getElementById('applySyncBtn');
        const status = document.getElementById('syncStatus');

        const setStatus = (msg, ok) => {
            if (!status) return;
            status.textContent = msg || '';
            status.className = 'sync-status' + (ok === true ? ' ok' : ok === false ? ' err' : '');
        };

        if (exportBtn) exportBtn.addEventListener('click', () => {
            const json = (window.UserData ? UserData.exportJson() : JSON.stringify({ app: 'jys-asmr', favorites: this.loadFavorites(), history: this.loadHistory(), playlist: this.loadPlaylist() }, null, 2));
            const blob = new Blob([json], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `jys-asmr-数据-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            setStatus('已导出', true);
        });

        if (importBtn) importBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.addEventListener('change', () => {
                const file = input.files && input.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    const res = window.UserData
                        ? UserData.importJson(String(reader.result))
                        : { ok: false, error: '请先加载 user-data.js' };
                    if (res.ok) {
                        setStatus('导入成功，正在刷新…', true);
                        // 重新应用
                        this.state.activeKeywords = this.state.activeKeywords || new Set();
                        this.initTheme();
                        this.updatePlaylistCount();
                        this.filterVideos();
                    } else {
                        setStatus('导入失败：' + res.error, false);
                    }
                };
                reader.readAsText(file);
            });
            input.click();
        });

        if (syncCodeBtn) syncCodeBtn.addEventListener('click', () => {
            const code = window.UserData ? UserData.getSyncCode() : '';
            if (!code) return;
            // 复制到剪贴板
            const done = () => setStatus('同步码已复制：' + code, true);
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(code).then(done).catch(() => {
                    prompt('你的同步码（请保存好）：', code);
                    done();
                });
            } else {
                prompt('你的同步码（请保存好）：', code);
                done();
            }
        });

        if (applySyncBtn) applySyncBtn.addEventListener('click', async () => {
            const code = syncCodeInput ? syncCodeInput.value : '';
            if (!code) return setStatus('请输入同步码', false);
            if (!window.UserData) return setStatus('user-data.js 未加载', false);
            if (!UserData.applySyncCode(code)) return setStatus('同步码格式不正确', false);

            setStatus('正在从云端同步…', null);
            const r = await UserData.pullFromCloud();
            if (r && r.ok) {
                if (r.applied) {
                    setStatus('同步成功，正在刷新…', true);
                    this.initTheme();
                    this.updatePlaylistCount();
                    this.filterVideos();
                } else if (r.empty) {
                    setStatus('该同步码暂无云端数据，已切换设备 ID', true);
                    this.updatePlaylistCount();
                }
            } else {
                setStatus('云端同步失败：' + (r && r.error) + '（数据仍存本地）', false);
            }
        });

        // 初始化状态显示
        if (window.UserData) {
            setStatus(UserData.cloudEnabled ? '云端已启用' : '本地模式 · 可导出带走', true);
        }
    },

    // ==================== 筛选区展开收起 ====================
    bindFiltersToggle() {
        const section = document.getElementById('filtersSection');
        const toggle = document.getElementById('filtersToggle');
        if (!section || !toggle) return;
        // 默认展开；记住用户偏好
        const saved = this.lsGet('jys_filters_open', true);
        section.classList.toggle('is-collapsed', !saved);
        toggle.setAttribute('aria-expanded', String(!!saved));

        toggle.addEventListener('click', () => {
            const collapsed = section.classList.toggle('is-collapsed');
            toggle.setAttribute('aria-expanded', String(!collapsed));
            this.lsSet('jys_filters_open', !collapsed);
        });
    },

    updateFilterCount() {
        const el = document.getElementById('filtersCount');
        if (!el) return;
        const s = this.state;
        let n = 0;
        if (s.sourceFilter && s.sourceFilter !== 'all') n++;
        if (s.durationFilter) n++;
        if (s.isPremiumFilterActive) n++;
        if (s.isLiveReplayFilterActive) n++;
        if (s.favOnly) n++;
        if (s.historyOnly) n++;
        if (s.activeKeywords && s.activeKeywords.size > 0) n += s.activeKeywords.size;
        el.textContent = n > 0 ? String(n) : '';
    },

    // ==================== 排序 ====================
    bindSortEvent() {
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                this.state.sortMode = sortSelect.value;
                this.sortVideos();
                this.state.currentPage = 1;
                this.renderVideoList();
                this.renderPagination();
            });
        }
    },

    sortVideos() {
        const mode = this.state.sortMode;
        this.state.filteredList.sort((a, b) => {
            switch (mode) {
                case 'date-desc':
                    return new Date(b.uploadTime || b.publishTime || 0) - new Date(a.uploadTime || a.publishTime || 0);
                case 'date-asc':
                    return new Date(a.uploadTime || a.publishTime || 0) - new Date(b.uploadTime || b.publishTime || 0);
                case 'random':
                    return Math.random() - 0.5;
                default:
                    return 0;
            }
        });
    },

    // ==================== 加载视频数据 ====================
    async loadVideoData() {
        const statusTip = document.getElementById('statusTip');
        const videoGrid = document.getElementById('videoGrid');
        const pagination = document.getElementById('pagination');

        try {
            let response = null;
            const possibleUrls = [
                './videos.json?' + Date.now(),
                'videos.json?' + Date.now()
            ];

            for (let url of possibleUrls) {
                try {
                    response = await fetch(url);
                    if (response.ok) break;
                } catch (e) {}
            }

            if (!response || !response.ok) {
                throw new Error('无法加载 videos.json (status: ' + (response ? response.status : 'no response') + ')');
            }

            const text = await response.text();
            this.state.videoList = JSON.parse(text);

            if (!Array.isArray(this.state.videoList)) {
                throw new Error('JSON 格式错误，必须是数组');
            }

            // 给每个视频生成 id（如果没有）
            this.state.videoList.forEach((v, i) => {
                if (!v.id) v.id = this.genId(v, i);
            });

            // 按发布时间倒序排序
            this.state.videoList.sort((a, b) => {
                const timeA = new Date(a.uploadTime || a.publishTime || 0);
                const timeB = new Date(b.uploadTime || b.publishTime || 0);
                return timeB - timeA;
            });

            this.applyFilters();
            this.state.currentPage = 1;
            if (statusTip) statusTip.style.display = 'none';
            if (pagination) pagination.style.display = 'flex';

            this.renderVideoList();
            this.renderPagination();
            this.renderTagCloud();
            this.renderStats();

        } catch (error) {
            console.error('数据加载错误：', error);
            if (statusTip) {
                statusTip.innerHTML = `
                    视频数据加载失败<br>
                    <span style="font-size:14px;color:#ff6b6b;">
                        请确认 videos.json 文件存在于根目录且格式正确
                    </span>
                `;
            }
            if (videoGrid) videoGrid.innerHTML = '';
            if (pagination) pagination.style.display = 'none';
        }
    },

    // ==================== 统计栏 ====================
    renderStats() {
        const statsText = document.getElementById('stats-text');
        if (statsText) {
            statsText.textContent = `共 ${this.state.videoList.length} 个视频，当前显示 ${this.state.filteredList.length} 个`;
        }
    },

    // ==================== 标签筛选（一级/二级） ====================
    TAG_CATEGORIES: [
        {
            name: '人声',
            icon: '🗣',
            tags: ['有人声', '无对话', '轻语', '耳语']
        },
        {
            name: '触发音',
            icon: '🎵',
            tags: ['口腔音', '敲击音', '双耳分听', '白噪音', '叠层声音', '抓挠', '刮擦', '水声', '音叉', '涂抹', '刷子音', '雨声', '剪刀音']
        },
        {
            name: '视觉',
            icon: '👁️',
            tags: ['视觉触发', '灯光', '隐形触发', '模糊/失焦', '手势', '镜头触摸']
        },
        {
            name: '场景',
            icon: '🎭',
            tags: ['按摩', '护肤', '化妆', '眼部检查', '理发', '头疗', '全身检查', '采耳', '猫咪', 'SPA', '机器人维修']
        },
        {
            name: '效果',
            icon: '💤',
            tags: ['专注力测试', '疗愈', '冥想', '酥麻', '大脑放松', '解压', '陪伴', '听力测试', '睡眠引导']
        },
        {
            name: '风格',
            icon: '🎬',
            tags: ['竖屏', '沉浸式', 'Lofi', '角色扮演', '合集', '微恐']
        },
        {
            name: '特殊',
            icon: '⚡',
            tags: ['Emoji触发', '能量音乐', '英文']
        }
    ],

    // 统计每个标签出现次数
    getTagCount(tag) {
        return this.state.videoList.filter(v => (v.keywords || []).includes(tag)).length;
    },

    renderTagCloud() {
        const primaryEl = document.getElementById('tagPrimary');
        if (!primaryEl) return;

        // 渲染一级分类标签
        let html = '';
        this.TAG_CATEGORIES.forEach((cat, idx) => {
            const isActive = this.state.activePrimary === idx;
            html += `<span class="cat-tag ${isActive ? 'active' : ''}" data-idx="${idx}">${cat.icon} ${cat.name}</span>`;
        });
        primaryEl.innerHTML = html;

        // 绑定一级标签点击
        primaryEl.querySelectorAll('.cat-tag').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.idx);
                if (this.state.activePrimary === idx) {
                    this.state.activePrimary = null;
                } else {
                    this.state.activePrimary = idx;
                }
                this.renderTagCloud();
            });
        });

        // 渲染二级标签
        const wrapEl = document.getElementById('tagSecondaryWrap');
        const secondaryEl = document.getElementById('tagSecondary');
        if (this.state.activePrimary === null) {
            wrapEl.style.display = 'none';
            return;
        }

        const cat = this.TAG_CATEGORIES[this.state.activePrimary];
        let secHtml = '';
        cat.tags.forEach(tag => {
            const count = this.getTagCount(tag);
            const isActive = this.state.activeKeywords.has(tag);
            secHtml += `<span class="sub-tag ${isActive ? 'active' : ''}" data-tag="${this.escAttr(tag)}">${this.escHtml(tag)}${count > 0 ? ` <span class="tag-count">${count}</span>` : ''}</span>`;
        });
        secondaryEl.innerHTML = secHtml;
        wrapEl.style.display = '';

        // 绑定二级标签点击
        secondaryEl.querySelectorAll('.sub-tag').forEach(el => {
            el.addEventListener('click', () => {
                const tag = el.dataset.tag;
                if (this.state.activeKeywords.has(tag)) {
                    this.state.activeKeywords.delete(tag);
                } else {
                    this.state.activeKeywords.add(tag);
                }
                this.syncSearchInput();
                this.syncTagHighlight();
                this.filterVideos();
            });
        });
    },

    // ==================== 搜索与过滤 ====================
    filterVideos() {
        const { videoList, isPremiumFilterActive, durationFilter, activeKeywords, sourceFilter, favOnly, historyOnly } = this.state;

        let result = [...videoList];

        // 来源筛选（B站 / 油管）
        if (sourceFilter && sourceFilter !== 'all') {
            result = result.filter(video => this.getVideoSource(video) === sourceFilter);
        }

        // 仅看收藏
        if (favOnly) {
            const favs = new Set(this.loadFavorites());
            result = result.filter(video => favs.has(this.genId(video)));
        }

        // 最近看过
        if (historyOnly) {
            const hist = new Map(this.loadHistory().map(h => [h.id, h.ts]));
            result = result.filter(video => hist.has(this.genId(video)));
            // 按观看时间倒序
            result.sort((a, b) => (hist.get(this.genId(b)) || 0) - (hist.get(this.genId(a)) || 0));
        }

        // 多关键词联合筛选（AND 逻辑）
        if (activeKeywords.size > 0) {
            const keywordList = [...activeKeywords].map(k => k.toLowerCase());
            result = result.filter(video => {
                const title = video.name.toLowerCase();
                const kws = (video.keywords || []).map(k => k.toLowerCase());
                return keywordList.every(word =>
                    title.includes(word) || kws.some(kw => kw.includes(word))
                );
            });
        }

        // 充电专属筛选
        if (isPremiumFilterActive) {
            result = result.filter(video => video.isPremium);
        }

        // 直播回放筛选
        if (this.state.isLiveReplayFilterActive) {
            result = result.filter(video => video.isLiveReplay);
        }

        // 时长筛选
        if (durationFilter && this.DURATION_RANGES[durationFilter]) {
            const range = this.DURATION_RANGES[durationFilter];
            result = result.filter(video => {
                const sec = this.parseDuration(video.duration);
                return sec >= range.min && sec < range.max;
            });
        }

        this.state.filteredList = result;
        // 历史模式下已按观看时间排序，跳过常规排序
        if (!historyOnly) this.sortVideos();
        this.state.currentPage = 1;
        this.renderVideoList();
        this.renderPagination();
        this.renderStats();
        this.writeStateToUrl();
        this.updateFilterCount();
    },

    bindSearchEvent() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                // 从搜索框同步到 activeKeywords
                const val = searchInput.value.trim();
                this.state.activeKeywords.clear();
                if (val) {
                    val.split(/\s+/).forEach(w => {
                        if (w) this.state.activeKeywords.add(w);
                    });
                }
                this.syncTagHighlight();
                this.filterVideos();
            });
        }
    },

    // 同步标签高亮状态
    syncTagHighlight() {
        const secondaryEl = document.getElementById('tagSecondary');
        if (secondaryEl) {
            secondaryEl.querySelectorAll('.sub-tag').forEach(t => {
                t.classList.toggle('active', this.state.activeKeywords.has(t.dataset.tag));
            });
        }
    },

    // 更新搜索框显示
    syncSearchInput() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = [...this.state.activeKeywords].join(' ');
        }
    },

    bindTagEvents() {
        // 标签事件已在 renderTagCloud 中绑定
    },

    // ==================== 标签筛选展开/收起 ====================
    bindTagFilterToggle() {
        const toggle = document.getElementById('tagFilterToggle');
        const panel = document.getElementById('tagFilter');
        if (!toggle || !panel) return;
        let expanded = false;
        toggle.addEventListener('click', () => {
            expanded = !expanded;
            panel.hidden = !expanded;
            toggle.classList.toggle('active', expanded);
            toggle.textContent = expanded ? '🏷️ 收起标签' : '🏷️ 标签筛选';
        });
    },

    // ==================== 渲染视频列表 ====================
    renderVideoList() {
        const videoGrid = document.getElementById('videoGrid');
        if (!videoGrid) return;

        const { filteredList, currentPage, pageSize, latestVideoCount, videoList } = this.state;
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const currentPageData = filteredList.slice(startIndex, endIndex);

        if (filteredList.length === 0) {
            videoGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">😴</div>
                    <p>没有匹配的视频</p>
                </div>
            `;
            return;
        }

        videoGrid.innerHTML = currentPageData.map((video) => {
            const globalIndex = videoList.findIndex(v => v.name === video.name && v.link === video.link);
            const isNew = globalIndex >= 0 && globalIndex < latestVideoCount;
            const videoId = this.genId(video, globalIndex);
            let coverPath = video.cover || '';
            if (coverPath && !coverPath.startsWith('http') && !coverPath.startsWith('data:')) {
                // 兼容：没有 covers/ 前缀的自动补上
                if (!coverPath.startsWith('covers/') && !coverPath.startsWith('/')) {
                    coverPath = 'covers/' + coverPath;
                }
                coverPath = coverPath.startsWith('/') ? coverPath.slice(1) : coverPath;
                coverPath = './' + coverPath;
            }

            const uploadDate = (video.uploadTime || video.publishTime)
                ? new Date(video.uploadTime || video.publishTime).toLocaleDateString('zh-CN', {
                    year: 'numeric', month: '2-digit', day: '2-digit'
                }) : '';

            const source = this.getVideoSource(video);
            const sourceBadge = source === 'youtube'
                ? '<div class="source-badge youtube-badge">▶ YouTube</div>'
                : '';
            const isFav = this.isFavorite(videoId);
            const isWatched = this.isWatched(videoId);
            const inPlaylist = this.isInPlaylist(videoId);

            return `
                <div class="video-card" data-link="${this.escAttr(video.link)}" data-id="${this.escAttr(videoId)}">
                    <div class="card-cover">
                        ${isNew ? '<div class="new-badge">✨ 最新</div>' : ''}
                        ${video.isPremium ? '<div class="premium-badge">⚡ 充电专属</div>' : ''}
                        ${video.isLiveReplay ? '<div class="live-badge">📺 直播回放</div>' : ''}
                        ${sourceBadge}
                        <button class="fav-btn ${isFav ? 'active' : ''}" data-id="${this.escAttr(videoId)}" title="${isFav ? '取消收藏' : '收藏'}">${isFav ? '★' : '☆'}</button>
                        <button class="pl-add-btn ${inPlaylist ? 'in-list' : ''}" data-id="${this.escAttr(videoId)}" title="${inPlaylist ? '已在今晚序列' : '加入今晚序列'}">${inPlaylist ? '✓' : '➕'}</button>
                        ${isWatched ? '<div class="watched-dot">已看过</div>' : ''}
                        <img src="${this.escAttr(coverPath)}" alt="${this.escAttr(video.name)}" loading="lazy" onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 672 378\'><rect fill=\'%231a1a22\' width=\'672\' height=\'378\'/><text x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%2371717a\' font-size=\'24\'>🎬</text></svg>'">
                        <div class="play-overlay"><div class="play-icon">▶</div></div>
                    </div>
                    <div class="card-content">
                        <div class="card-title">${this.escHtml(video.name)}</div>
                        ${uploadDate ? `<div class="card-time">📅 ${this.escHtml(uploadDate)}</div>` : ''}
                        ${video.keywords && video.keywords.length > 0 ? `
                            <div class="card-tags">
                                ${video.keywords.slice(0, 5).map(kw => `<span class="tag clickable-tag" data-kw="${this.escAttr(kw)}">${this.escHtml(kw)}</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        this.bindCardClickEvent();
    },

    // ==================== 分页相关 ====================
    renderPagination() {
        const pagination = document.getElementById('pagination');
        if (!pagination) return;

        const { filteredList, currentPage, pageSize } = this.state;
        const totalPages = Math.ceil(filteredList.length / pageSize);
        if (totalPages <= 1) {
            pagination.style.display = 'none';
            return;
        }
        pagination.style.display = 'flex';

        let html = `
            <button class="page-btn prev-btn ${currentPage === 1 ? 'disabled' : ''}" data-page="prev">上一页</button>
        `;

        const maxVisible = 5;
        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);

        if (start > 1) {
            html += `<button class="page-btn" data-page="1">1</button>`;
            if (start > 2) html += `<span style="color:#888;padding:0 4px;">...</span>`;
        }

        for (let i = start; i <= end; i++) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }

        if (end < totalPages) {
            if (end < totalPages - 1) html += `<span style="color:#888;padding:0 4px;">...</span>`;
            html += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
        }

        html += `<button class="page-btn next-btn ${currentPage === totalPages ? 'disabled' : ''}" data-page="next">下一页</button>`;

        pagination.innerHTML = html;
        this.bindPaginationEvent();
    },

    bindPaginationEvent() {
        const pagination = document.getElementById('pagination');
        if (!pagination) return;

        const { filteredList, pageSize } = this.state;
        const totalPages = Math.ceil(filteredList.length / pageSize);

        pagination.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.classList.contains('disabled')) return;
                const page = btn.getAttribute('data-page');
                if (page === 'prev') this.state.currentPage = Math.max(1, this.state.currentPage - 1);
                else if (page === 'next') this.state.currentPage = Math.min(totalPages, this.state.currentPage + 1);
                else this.state.currentPage = parseInt(page);

                this.renderVideoList();
                this.renderPagination();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });
    },

    // ==================== 卡片点击 ====================
    bindCardClickEvent() {
        const cards = document.querySelectorAll('.video-card');
        cards.forEach((card) => {
            // 卡片关键词点击 → 添加到筛选
            card.querySelectorAll('.clickable-tag').forEach(tagEl => {
                tagEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const kw = tagEl.dataset.kw;
                    if (kw) {
                        this.state.activeKeywords.add(kw);
                        this.syncSearchInput();
                        this.syncTagHighlight();
                        this.filterVideos();
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                });
            });

            // 收藏按钮点击
            card.querySelectorAll('.fav-btn').forEach(favEl => {
                favEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = favEl.dataset.id;
                    if (!id) return;
                    const nowFav = this.toggleFavorite(id);
                    favEl.classList.toggle('active', nowFav);
                    favEl.textContent = nowFav ? '★' : '☆';
                    favEl.title = nowFav ? '取消收藏' : '收藏';
                    // 若正在「仅看收藏」，取消后立即刷新列表
                    if (this.state.favOnly && !nowFav) this.filterVideos();
                });
            });

            // 加入播放列表按钮
            card.querySelectorAll('.pl-add-btn').forEach(plEl => {
                plEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = plEl.dataset.id;
                    if (!id) return;
                    if (this.isInPlaylist(id)) {
                        this.removeFromPlaylist(id);
                        plEl.classList.remove('in-list');
                        plEl.textContent = '➕';
                        plEl.title = '加入今晚序列';
                    } else {
                        this.addToPlaylist(id);
                        plEl.classList.add('in-list');
                        plEl.textContent = '✓';
                        plEl.title = '已在今晚序列';
                    }
                });
            });

            // 卡片点击 → 站内播放
            card.addEventListener('click', (e) => {
                if (e.target.closest('.clickable-tag')) return;
                if (e.target.closest('.fav-btn')) return;
                if (e.target.closest('.pl-add-btn')) return;
                const videoId = card.dataset.id;
                const video = this.state.videoList.find(v => this.genId(v) === videoId);
                if (video) this.openVideoModal(video);
            });
        });
    },

    // ==================== 随机抽视频 ====================
    bindRandomEvent() {
        const randomBtn = document.getElementById('randomBtn');
        const modalClose = document.getElementById('modalClose');
        const reRandomBtn = document.getElementById('reRandomBtn');
        const watchInSiteBtn = document.getElementById('watchInSiteBtn');
        const goWatchBtn = document.getElementById('goWatchBtn');
        const modalOverlay = document.getElementById('randomModal');

        if (randomBtn) randomBtn.addEventListener('click', () => {
            if (this.state.videoList.length === 0) return alert('视频数据还在加载中');
            this.getRandomVideo();
            this.showModal();
        });

        if (modalClose) modalClose.addEventListener('click', () => this.hideModal());
        if (modalOverlay) modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) this.hideModal(); });
        if (reRandomBtn) reRandomBtn.addEventListener('click', () => this.getRandomVideo());
        if (watchInSiteBtn) watchInSiteBtn.addEventListener('click', () => {
            if (this.state.currentRandomVideo) {
                this.openVideoModal(this.state.currentRandomVideo);
                this.hideModal();
            }
        });
        if (goWatchBtn) goWatchBtn.addEventListener('click', () => {
            if (this.state.currentRandomVideo) window.open(this.state.currentRandomVideo.link, '_blank');
            this.hideModal();
        });
    },

    getRandomVideo() {
        const pool = this.state.filteredList.length > 0 ? this.state.filteredList : this.state.videoList;
        if (pool.length === 0) return;
        const randomIndex = Math.floor(Math.random() * pool.length);
        this.state.currentRandomVideo = pool[randomIndex];
        this.updateModalContent();
    },

    updateModalContent() {
        const video = this.state.currentRandomVideo;
        if (!video) return;
        let coverPath = video.cover || '';
        if (coverPath && !coverPath.startsWith('http') && !coverPath.startsWith('data:')) {
            if (!coverPath.startsWith('covers/') && !coverPath.startsWith('/')) {
                coverPath = 'covers/' + coverPath;
            }
            coverPath = coverPath.startsWith('/') ? coverPath.slice(1) : coverPath;
            coverPath = './' + coverPath;
        }
        const modalCover = document.getElementById('modalVideoCover');
        const modalTitle = document.getElementById('modalVideoTitle');
        if (modalCover) modalCover.style.backgroundImage = `url('${coverPath}')`;
        if (modalTitle) modalTitle.textContent = video.name;

        // 来源识别：按钮文案 + 来源角标
        const source = this.getVideoSource(video);
        const isYouTube = source === 'youtube';
        const goBtn = document.getElementById('goWatchBtn');
        if (goBtn) {
            goBtn.innerHTML = isYouTube ? '▶️ 跳转 YouTube' : '▶️ 跳转 B 站';
            goBtn.title = isYouTube ? '在 YouTube 打开' : '在 B 站打开';
        }
        const srcEl = document.getElementById('modalVideoSource');
        if (srcEl) {
            srcEl.innerHTML = isYouTube
                ? '<span class="modal-src-tag yt">▶ YouTube</span>'
                : '<span class="modal-src-tag bili">📺 B 站</span>';
        }
    },

    showModal() {
        const modal = document.getElementById('randomModal');
        if (modal) modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    hideModal() {
        const modal = document.getElementById('randomModal');
        if (modal) modal.style.display = 'none';
        document.body.style.overflow = '';
    },

    // ==================== 视频弹框播放 ====================
    openVideoModal(videoItem, fromPlaylist) {
        const modal = document.getElementById('videoModal');
        const modalTitle = document.getElementById('videoModalTitle');
        const player = document.getElementById('videoPlayer') || document.getElementById('bilibiliPlayer');
        const loading = document.getElementById('playerLoading');

        const playerUrl = this.buildPlayerUrl(videoItem);
        if (!playerUrl) return alert('视频链接无效');

        this.addHistory(this.genId(videoItem), videoItem.name);
        if (!fromPlaylist) this.state.playlistIndex = -1;

        if (modalTitle) modalTitle.textContent = videoItem.name;

        // 相同视频已在播放 → 只是重新显示弹窗，不重载
        const sameVideo = this.state.currentPlayingVideo
            && this.genId(this.state.currentPlayingVideo) === this.genId(videoItem)
            && player && (player.getAttribute('src') || '').includes(playerUrl.split('?')[0]);

        if (player && !sameVideo) {
            // 显示加载态
            if (loading) {
                loading.classList.remove('hidden');
                // 给封面做背景，感知更快
                const cover = videoItem.cover ? this.resolveCover(videoItem.cover) : '';
                if (cover) loading.style.backgroundImage = `linear-gradient(rgba(10,12,16,.55), rgba(10,12,16,.85)), url('${cover}')`;
                loading.style.backgroundSize = 'cover';
                loading.style.backgroundPosition = 'center';
            }
            // 先置空再赋值，强制重建
            player.src = 'about:blank';
            requestAnimationFrame(() => { player.src = playerUrl; });
        }

        if (modal) modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        this.updatePlaylistNav();
        this.applyPlayerOrientation(videoItem);
        this.state.currentPlayingVideo = videoItem;
        // 小窗若正在播同一视频，收起小窗把焦点给大窗
        this.syncMiniOnModalOpen(this.genId(videoItem));
    },

    resolveCover(cover) {
        if (!cover) return '';
        if (cover.startsWith('http') || cover.startsWith('data:')) return cover;
        if (!cover.startsWith('covers/') && !cover.startsWith('/')) cover = 'covers/' + cover;
        return './' + cover.replace(/^\//, '');
    },

    bindPlayerLoading() {
        const player = document.getElementById('videoPlayer');
        const loading = document.getElementById('playerLoading');
        if (!player || !loading) return;
        // iframe load 事件：加载完成淡出
        player.addEventListener('load', () => {
            setTimeout(() => loading.classList.add('hidden'), 220);
        });
    },

    closeVideoModal() {
        const modal = document.getElementById('videoModal');
        const player = document.getElementById('videoPlayer') || document.getElementById('bilibiliPlayer');
        if (modal) modal.style.display = 'none';
        if (player) player.src = '';
        document.body.style.overflow = '';
    },

    // ==================== 播放器：横竖屏 + 全屏 + 小窗 ====================
    detectOrientation(video) {
        if (!video) return 'landscape';
        const kws = video.keywords || [];
        const name = video.name || '';
        if (kws.includes('竖屏') || /竖屏|vertical|shorts|竖版/i.test(name)) return 'portrait';
        // 时长短且是短视频系列
        const sec = this.parseDuration(video.duration);
        if (sec > 0 && sec <= 60 && /emoji|快速|random trigger/i.test(name)) return 'portrait';
        return 'landscape';
    },

    applyPlayerOrientation(video) {
        const frame = document.getElementById('playerFrame');
        if (!frame) return;
        const orient = this.detectOrientation(video);
        frame.classList.remove('orient-landscape', 'orient-portrait');
        frame.classList.add(orient === 'portrait' ? 'orient-portrait' : 'orient-landscape');
    },

    bindPlayerActions() {
        // 事件委托：不论元素何时插入都能响应
        document.addEventListener('click', (e) => {
            const t = e.target;
            if (!(t instanceof Element)) return;

            if (t.closest('#btnFullscreen')) {
                e.preventDefault();
                e.stopPropagation();
                this.requestPlayerFullscreen();
                return;
            }
            if (t.closest('#btnMini')) {
                e.preventDefault();
                e.stopPropagation();
                this.enterMiniPlayer();
                return;
            }
            if (t.closest('#miniClose')) {
                e.preventDefault();
                this.exitMiniPlayer();
                return;
            }
            if (t.closest('#miniExpand')) {
                e.preventDefault();
                this.exitMiniPlayer(true);
                return;
            }
        });

        const miniHeader = document.getElementById('miniHeader');
        if (miniHeader) this.bindMiniDrag(miniHeader);

        // 四角缩放
        this.bindMiniResize();
    },

    // ---- 四角缩放 ----
    MINI_SIZE: { minW: 240, minH: 176, maxW: 900, maxH: 700 },

    bindMiniResize() {
        const mini = document.getElementById('miniPlayer');
        if (!mini) return;

        // 恢复上次尺寸
        const saved = this.lsGet('jys_mini_size', null);
        if (saved && saved.w && saved.h) {
            this.applyMiniSize(saved.w, saved.h);
        } else {
            this.applyMiniSize(380, 262);
        }

        document.querySelectorAll('.mini-resize').forEach(handle => {
            const onDown = (e) => {
                e.preventDefault();
                e.stopPropagation();
                handle.classList.add('active');

                const corner = handle.dataset.corner;
                const rect = mini.getBoundingClientRect();
                const startW = rect.width, startH = rect.height;
                const startLeft = rect.left, startTop = rect.top;
                const pt = e.touches ? e.touches[0] : e;
                const sx = pt.clientX, sy = pt.clientY;

                const onMove = (e2) => {
                    e2.preventDefault();
                    const p = e2.touches ? e2.touches[0] : e2;
                    const dx = p.clientX - sx;
                    const dy = p.clientY - sy;

                    const { minW, minH, maxW, maxH } = this.MINI_SIZE;
                    let w = startW, h = startH;

                    // 依据方向计算
                    if (corner.includes('e')) w = startW + dx;      // 向右拖 = 变宽
                    if (corner.includes('w')) w = startW - dx;      // 向左拖 = 变宽
                    if (corner.includes('s')) h = startH + dy;      // 向下拖 = 变高
                    if (corner.includes('n')) h = startH - dy;      // 向上拖 = 变高

                    // 保比例（可选）：这里不强制，用户可自由调
                    // 最小/最大约束
                    w = Math.max(minW, Math.min(w, Math.min(maxW, window.innerWidth - 16)));
                    h = Math.max(minH, Math.min(h, Math.min(maxH, window.innerHeight - 16)));

                    // 对于 n/w 边，拖拽会改变 left/top，需要保持右下角不动
                    if (corner.includes('w')) {
                        const newLeft = startLeft + (startW - w);
                        mini.style.left = newLeft + 'px';
                        mini.style.right = 'auto';
                    }
                    if (corner.includes('n')) {
                        const newTop = startTop + (startH - h);
                        mini.style.top = newTop + 'px';
                        mini.style.bottom = 'auto';
                    }

                    this.applyMiniSize(w, h);
                };

                const onUp = () => {
                    handle.classList.remove('active');
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('touchmove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    window.removeEventListener('touchend', onUp);
                    const r = mini.getBoundingClientRect();
                    this.lsSet('jys_mini_size', { w: Math.round(r.width), h: Math.round(r.height) });
                };

                window.addEventListener('mousemove', onMove, { passive: false });
                window.addEventListener('touchmove', onMove, { passive: false });
                window.addEventListener('mouseup', onUp);
                window.addEventListener('touchend', onUp);
            };

            handle.addEventListener('mousedown', onDown);
            handle.addEventListener('touchstart', onDown, { passive: false });
        });
    },

    applyMiniSize(w, h) {
        const mini = document.getElementById('miniPlayer');
        if (!mini) return;
        mini.style.width = Math.round(w) + 'px';
        mini.style.height = Math.round(h) + 'px';
    },

    requestPlayerFullscreen() {
        const frame = document.getElementById('playerFrame');
        if (!frame) return;
        const tryFs = (el, fn) => {
            try {
                const r = fn.call(el);
                if (r && r.catch) r.catch(() => this.toast('全屏被浏览器拦截，可点播放器右下角全屏'));
            } catch (err) {
                this.toast('全屏被浏览器拦截，可点播放器右下角全屏');
            }
        };
        if (frame.requestFullscreen) tryFs(frame, frame.requestFullscreen);
        else if (frame.webkitRequestFullscreen) tryFs(frame, frame.webkitRequestFullscreen);
        else if (frame.msRequestFullscreen) tryFs(frame, frame.msRequestFullscreen);
        else this.toast('当前浏览器不支持全屏');
    },

    toast(msg) {
        let el = document.getElementById('appToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'appToast';
            el.className = 'app-toast';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    },

    enterMiniPlayer() {
        const modal = document.getElementById('videoModal');
        const player = document.getElementById('videoPlayer');
        const mini = document.getElementById('miniPlayer');
        const miniIframe = document.getElementById('miniIframe');
        const miniTitle = document.getElementById('miniTitle');

        if (!mini || !miniIframe) return;

        // ★ 优先从 currentPlayingVideo 重建 URL，绕开 about:blank 短路
        const video = this.state.currentPlayingVideo;
        let src = '';
        if (video) src = this.buildPlayerUrl(video) || '';
        if (!src && player) {
            const ps = player.getAttribute('src') || player.src || '';
            if (ps && ps !== 'about:blank') src = ps;
        }
        if (!src) {
            this.toast('请先打开一个视频');
            return;
        }

        // 大窗关掉，避免双播放
        if (player) player.src = 'about:blank';
        if (modal) modal.style.display = 'none';
        document.body.style.overflow = '';

        // 标题
        if (miniTitle) {
            const t = document.getElementById('videoModalTitle');
            miniTitle.textContent = (video && video.name) || (t && t.textContent) || '正在播放';
        }

        // 尺寸位置（首次使用默认值，之后用记忆值）
        const sz = this.lsGet('jys_mini_size', null);
        if (sz && sz.w >= 200 && sz.h >= 150) {
            this.applyMiniSize(sz.w, sz.h);
        } else {
            this.applyMiniSize(380, 262);
        }
        const pos = this.lsGet('jys_mini_pos', null);
        if (pos && typeof pos.left === 'number' && pos.left >= 0 && pos.top >= 0) {
            mini.style.left = pos.left + 'px';
            mini.style.top = pos.top + 'px';
            mini.style.right = 'auto';
            mini.style.bottom = 'auto';
        }

        // 显示小窗
        mini.style.display = 'flex';

        // ★ 无缝切换：同一视频不重载；不同视频平滑换 src
        const cur = miniIframe.getAttribute('src') || '';
        const curKey = cur && cur !== 'about:blank' ? cur.split('?')[0] : '';
        const newKey = src.split('?')[0];
        if (curKey && curKey === newKey) {
            // 已在播放该视频，不动
            return;
        }
        miniIframe.src = 'about:blank';
        requestAnimationFrame(() => { miniIframe.src = src; });

        // 切换时微光反馈
        mini.classList.remove('pulse');
        void mini.offsetWidth;
        mini.classList.add('pulse');
    },

    // ★ 大窗打开时若小窗在播同一视频，直接把焦点切回大窗（避免双播）
    syncMiniOnModalOpen(videoId) {
        const mini = document.getElementById('miniPlayer');
        const miniIframe = document.getElementById('miniIframe');
        if (!mini || mini.style.display === 'none') return;
        const cur = miniIframe.getAttribute('src') || '';
        if (!cur || cur === 'about:blank') return;
        // 只在小窗播的确实是当前视频时才收起，其它情况保持小窗继续播
        const miniPlayingId = this.state.currentPlayingVideo
            ? this.genId(this.state.currentPlayingVideo) : '';
        if (miniPlayingId && videoId === miniPlayingId) {
            this.exitMiniPlayer(false);
        }
    },

    exitMiniPlayer(backToModal) {
        const mini = document.getElementById('miniPlayer');
        const miniIframe = document.getElementById('miniIframe');
        if (miniIframe) miniIframe.src = 'about:blank';
        if (mini) mini.style.display = 'none';

        if (backToModal && this.state.currentPlayingVideo) {
            this.openVideoModal(this.state.currentPlayingVideo);
        }
    },

    bindMiniDrag(handle) {
        let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
        const mini = document.getElementById('miniPlayer');
        if (!mini) return;

        const onDown = (e) => {
            dragging = true;
            const pt = e.touches ? e.touches[0] : e;
            sx = pt.clientX; sy = pt.clientY;
            const rect = mini.getBoundingClientRect();
            ox = rect.left; oy = rect.top;
            e.preventDefault();
        };
        const onMove = (e) => {
            if (!dragging) return;
            const pt = e.touches ? e.touches[0] : e;
            let nx = ox + (pt.clientX - sx);
            let ny = oy + (pt.clientY - sy);
            // 边界限制
            nx = Math.max(0, Math.min(nx, window.innerWidth - mini.offsetWidth));
            ny = Math.max(0, Math.min(ny, window.innerHeight - mini.offsetHeight));
            mini.style.left = nx + 'px';
            mini.style.top = ny + 'px';
            mini.style.right = 'auto';
        };
        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            const rect = mini.getBoundingClientRect();
            this.lsSet('jys_mini_pos', { left: Math.round(rect.left), top: Math.round(rect.top) });
        };

        handle.addEventListener('mousedown', onDown);
        handle.addEventListener('touchstart', onDown, { passive: false });
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
    },

    bindVideoModalEvent() {
        const modal = document.getElementById('videoModal');
        const closeBtn = document.getElementById('videoModalClose');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeVideoModal());
        if (modal) modal.addEventListener('click', e => { if (e.target === modal) this.closeVideoModal(); });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                this.closeVideoModal();
                this.hideModal();
            }
        });
    },

    // ==================== 时长筛选 ====================
    DURATION_RANGES: {
        short:  { label: '⚡ 短视频',  min: 0,    max: 300 },   // <5分钟
        medium: { label: '☕ 中等',    min: 300,  max: 1200 },  // 5-20分钟
        long:   { label: '🌙 长视频',  min: 1200, max: 3600 },  // 20-60分钟
        xlong:  { label: '🕐 超长',    min: 3600, max: Infinity }, // >1小时
    },

    parseDuration(d) {
        if (!d) return 0;
        const parts = String(d).split(':');
        try {
            if (parts.length === 3) return parseInt(parts[0])*3600 + parseInt(parts[1])*60 + parseInt(parts[2]);
            if (parts.length === 2) return parseInt(parts[0])*60 + parseInt(parts[1]);
        } catch {}
        return 0;
    },

    bindDurationEvent() {
        const container = document.getElementById('durationFilter');
        if (!container) return;
        container.querySelectorAll('.chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const dur = btn.dataset.dur;
                if (this.state.durationFilter === dur) {
                    this.state.durationFilter = null;
                    btn.classList.remove('active');
                } else {
                    container.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
                    this.state.durationFilter = dur;
                    btn.classList.add('active');
                }
                this.filterVideos();
            });
        });
    },

    // ==================== 充电专属筛选 ====================
    applyFilters() {
        const { videoList, isPremiumFilterActive } = this.state;
        let result = [...videoList];
        if (isPremiumFilterActive) {
            result = result.filter(video => {
                const kws = (video.keywords || []).map(k => k.toLowerCase());
                return kws.includes('充电专属') || kws.includes('充电');
            });
        }
        this.state.filteredList = result;
    },

    bindFilterEvent() {
        // 充电专属
        const premiumBtn = document.getElementById('premiumFilterBtn');
        if (premiumBtn) {
            premiumBtn.addEventListener('click', () => {
                this.state.isPremiumFilterActive = !this.state.isPremiumFilterActive;
                premiumBtn.classList.toggle('active', this.state.isPremiumFilterActive);
                this.filterVideos();
            });
        }
        // 直播回放
        const liveBtn = document.getElementById('liveReplayBtn');
        if (liveBtn) {
            liveBtn.addEventListener('click', () => {
                this.state.isLiveReplayFilterActive = !this.state.isLiveReplayFilterActive;
                liveBtn.classList.toggle('active', this.state.isLiveReplayFilterActive);
                this.filterVideos();
            });
        }
    },

    // ==================== 来源筛选 ====================
    bindSourceEvent() {
        const container = document.getElementById('sourceFilter');
        if (!container) return;
        container.querySelectorAll('.chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const src = btn.dataset.src || 'all';
                this.state.sourceFilter = src;
                container.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.filterVideos();
            });
        });
    },

    // ==================== 收藏 / 历史 筛选 ====================
    bindPersonalEvent() {
        const favBtn = document.getElementById('favOnlyBtn');
        const histBtn = document.getElementById('historyOnlyBtn');
        const clearBtn = document.getElementById('clearHistoryBtn');

        if (favBtn) favBtn.addEventListener('click', () => {
            this.state.favOnly = !this.state.favOnly;
            if (this.state.favOnly) this.state.historyOnly = false;
            favBtn.classList.toggle('active', this.state.favOnly);
            if (histBtn) histBtn.classList.remove('active');
            if (clearBtn) clearBtn.style.display = this.state.historyOnly ? '' : 'none';
            this.filterVideos();
        });

        if (histBtn) histBtn.addEventListener('click', () => {
            this.state.historyOnly = !this.state.historyOnly;
            if (this.state.historyOnly) this.state.favOnly = false;
            histBtn.classList.toggle('active', this.state.historyOnly);
            if (favBtn) favBtn.classList.remove('active');
            if (clearBtn) clearBtn.style.display = this.state.historyOnly ? '' : 'none';
            this.filterVideos();
        });

        if (clearBtn) clearBtn.addEventListener('click', () => {
            if (confirm('确定清空观看历史？')) {
                this.clearHistory();
                this.filterVideos();
            }
        });
    },

    // ==================== 播放列表事件 ====================
    bindPlaylistEvent() {
        const openBtn = document.getElementById('playlistBtn');
        const closeBtn = document.getElementById('playlistCloseBtn');
        const playBtn = document.getElementById('playlistPlayBtn');
        const shuffleBtn = document.getElementById('playlistShuffleBtn');
        const clearBtn = document.getElementById('playlistClearBtn');
        const drawer = document.getElementById('playlistDrawer');
        const prevBtn = document.getElementById('plPrevBtn');
        const nextBtn = document.getElementById('plNextBtn');

        if (openBtn) openBtn.addEventListener('click', () => this.openPlaylistDrawer());
        if (closeBtn) closeBtn.addEventListener('click', () => this.closePlaylistDrawer());
        if (drawer) drawer.addEventListener('click', e => {
            if (e.target === drawer) this.closePlaylistDrawer();
        });

        if (playBtn) playBtn.addEventListener('click', () => {
            const list = this.loadPlaylist();
            if (list.length === 0) return alert('播放列表是空的，先在卡片上点 ➕ 加入');
            this.playPlaylistAt(0);
            this.closePlaylistDrawer();
        });

        if (shuffleBtn) shuffleBtn.addEventListener('click', () => this.playPlaylistShuffled());

        if (clearBtn) clearBtn.addEventListener('click', () => {
            if (confirm('确定清空今晚序列？')) {
                this.clearPlaylist();
                this.renderPlaylist();
                this.renderVideoList();
            }
        });

        if (prevBtn) prevBtn.addEventListener('click', () => this.playPrevInPlaylist());
        if (nextBtn) nextBtn.addEventListener('click', () => this.playNextInPlaylist());

        this.updatePlaylistCount();
    },

    // ==================== URL 状态同步 ====================
    writeStateToUrl() {
        const p = new URLSearchParams();
        const { sourceFilter, favOnly, historyOnly, isPremiumFilterActive, isLiveReplayFilterActive, durationFilter, activeKeywords, sortMode } = this.state;
        if (sourceFilter && sourceFilter !== 'all') p.set('src', sourceFilter);
        if (favOnly) p.set('fav', '1');
        if (historyOnly) p.set('hist', '1');
        if (isPremiumFilterActive) p.set('premium', '1');
        if (isLiveReplayFilterActive) p.set('live', '1');
        if (durationFilter) p.set('dur', durationFilter);
        if (activeKeywords && activeKeywords.size > 0) p.set('q', [...activeKeywords].join(' '));
        if (sortMode && sortMode !== 'date-desc') p.set('sort', sortMode);
        const qs = p.toString();
        const url = qs ? `?${qs}` : location.pathname;
        try {
            history.replaceState(null, '', url);
        } catch (e) { /* file:// 下忽略 */ }
    },

    readStateFromUrl() {
        const p = new URLSearchParams(location.search);
        if (p.get('src')) this.state.sourceFilter = p.get('src');
        if (p.get('fav') === '1') this.state.favOnly = true;
        if (p.get('hist') === '1') this.state.historyOnly = true;
        if (p.get('premium') === '1') this.state.isPremiumFilterActive = true;
        if (p.get('live') === '1') this.state.isLiveReplayFilterActive = true;
        if (p.get('dur')) this.state.durationFilter = p.get('dur');
        if (p.get('sort')) this.state.sortMode = p.get('sort');
        const q = p.get('q');
        if (q) {
            this.state.activeKeywords.clear();
            q.split(/\s+/).forEach(w => { if (w) this.state.activeKeywords.add(w); });
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = q;
        }
        // 同步 UI 按钮状态
        this.syncUiFromState();
    },

    syncUiFromState() {
        const { sourceFilter, favOnly, historyOnly, isPremiumFilterActive, isLiveReplayFilterActive, durationFilter, sortMode } = this.state;

        const srcWrap = document.getElementById('sourceFilter');
        if (srcWrap) {
            srcWrap.querySelectorAll('.chip').forEach(b => {
                b.classList.toggle('active', (b.dataset.src || 'all') === sourceFilter);
            });
        }
        const favBtn = document.getElementById('favOnlyBtn');
        if (favBtn) favBtn.classList.toggle('active', favOnly);
        const histBtn = document.getElementById('historyOnlyBtn');
        if (histBtn) histBtn.classList.toggle('active', historyOnly);
        const clearBtn = document.getElementById('clearHistoryBtn');
        if (clearBtn) clearBtn.style.display = historyOnly ? '' : 'none';

        const premiumBtn = document.getElementById('premiumFilterBtn');
        if (premiumBtn) premiumBtn.classList.toggle('active', isPremiumFilterActive);
        const liveBtn = document.getElementById('liveReplayBtn');
        if (liveBtn) liveBtn.classList.toggle('active', isLiveReplayFilterActive);

        const durWrap = document.getElementById('durationFilter');
        if (durWrap) {
            durWrap.querySelectorAll('.chip').forEach(b => {
                b.classList.toggle('active', b.dataset.dur === durationFilter);
            });
        }
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) sortSelect.value = sortMode || 'date-desc';
    }
};

// 页面加载完成
document.addEventListener('DOMContentLoaded', () => {
    VideoApp.init();
});
