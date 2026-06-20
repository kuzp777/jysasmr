// 全局应用对象 - 模块化管理（整合版）
const VideoApp = {
    // 状态管理
    state: {
        videoList: [],
        filteredList: [],
        currentRandomVideo: null,
        currentPage: 1,
        pageSize: 9,
        isPremiumFilterActive: false,
        isLiveReplayFilterActive: false,
        latestVideoCount: 3,
        activePrimary: null,
        durationFilter: null,
        // 新增：排序
        sortMode: 'date-desc',
        // 新增：活跃关键词筛选
        activeKeywords: new Set(),
    },

    // ==================== 工具函数 ====================
    extractBvidFromLink(link) {
        if (!link) return null;
        const bvMatch = link.match(/(BV[a-zA-Z0-9]{10})/i);
        return bvMatch ? bvMatch[1] : null;
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
        this.loadVideoData();
        this.bindSearchEvent();
        this.bindTagEvents();
        this.bindRandomEvent();
        this.bindFilterEvent();
        this.bindVideoModalEvent();
        this.bindSortEvent();
        this.bindDurationEvent();
        this.bindMenuToggle();
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
            console.log('[JY] Loading videos.json...');
            let response = null;
            const possibleUrls = [
                './videos.json?' + Date.now(),
                'videos.json?' + Date.now()
            ];

            for (let url of possibleUrls) {
                try {
                    console.log('[JY] Fetching:', url);
                    response = await fetch(url);
                    console.log('[JY] Response:', response.status, response.ok);
                    if (response.ok) break;
                } catch (e) { console.warn('[JY] Fetch failed:', url, e.message); }
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

            console.log('[JY] Data loaded:', this.state.videoList.length, 'videos');
            this.applyFilters();
            this.state.currentPage = 1;
            if (statusTip) statusTip.style.display = 'none';
            if (pagination) pagination.style.display = 'flex';

            console.log('[JY] Rendering...');
            this.renderVideoList();
            this.renderPagination();
            this.renderTagCloud();
            this.renderStats();
            console.log('[JY] All rendered ✅');

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
            name: '触发音',
            icon: '🎵',
            tags: ['口腔音', '敲击音', '刮擦', '抓挠', '摩擦音', '轻语', '耳语', '英文轻语', '翻书', '刷子音', '剪刀音', '梳音', '水声', '叮当声', '音叉', '白噪音', '棕噪音', '雨声', '呼吸声', '吹气', '泡沫音', '涂抹', '口水画', '手指灯音效', '双耳分听', '叠层声音', '刺痛', '刮耳', '采耳', '无对话']
        },
        {
            name: '视觉',
            icon: '👁️',
            tags: ['视觉触发', '灯光', '手势', '隐形触发', '模糊/失焦', '镜头触摸']
        },
        {
            name: '场景',
            icon: '🎭',
            tags: ['化妆', '理发', '头疗', '头皮检查', '眼部检查', '眼部清洁', '颅神经检查', '皮肤检测', '全身检查', '护肤', '按摩', '刮痧', '看牙', 'SPA', '机器人维修', '开箱', '猫咪', '法医', '裁缝', '冷脸上司', '吸血鬼']
        },
        {
            name: '效果',
            icon: '💤',
            tags: ['助眠', '解压', '放松', '冥想', '睡眠引导', '正念', '情绪安抚', '缓解压力', '陪伴', '酥麻', '大脑放松', '疗愈', '安神', '专注力测试', '听力测试']
        },
        {
            name: '音效',
            icon: '🔊',
            tags: ['轻柔', '黏糊糊', '双声道', '3D音效', '有BGM']
        },
        {
            name: '自然',
            icon: '🌿',
            tags: ['雨声', '雨棍', '火焰']
        },
        {
            name: '风格',
            icon: '🎬',
            tags: ['沉浸式', '竖屏', '合集', 'Lofi', '微恐']
        },
        {
            name: '特殊',
            icon: '⚡',
            tags: ['充电专属', '能量音乐', 'Emoji触发', '蓝色触发', '粉色触发']
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
        const { videoList, isPremiumFilterActive, durationFilter, activeKeywords } = this.state;

        let result = [...videoList];

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
        this.sortVideos();
        this.state.currentPage = 1;
        this.renderVideoList();
        this.renderPagination();
        this.renderStats();
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

    // ==================== 菜单展开/收起 ====================
    bindMenuToggle() {
        const toggle = document.getElementById('menuToggle');
        const actions = document.getElementById('headerActions');
        if (toggle && actions) {
            toggle.addEventListener('click', () => {
                const expanded = actions.classList.toggle('expanded');
                toggle.textContent = expanded ? '✕' : '☰';
                toggle.setAttribute('aria-expanded', expanded);
            });
        }
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

            return `
                <div class="video-card" data-link="${this.escAttr(video.link)}" data-id="${this.escAttr(videoId)}">
                    <div class="card-cover">
                        ${isNew ? '<div class="new-badge">✨ 最新</div>' : ''}
                        ${video.isPremium ? '<div class="premium-badge">⚡ 充电专属</div>' : ''}
                        ${video.isLiveReplay ? '<div class="live-badge">📺 直播回放</div>' : ''}
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

            // 卡片点击 → 站内播放
            card.addEventListener('click', (e) => {
                if (e.target.closest('.clickable-tag')) return;
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
    openVideoModal(videoItem) {
        const modal = document.getElementById('videoModal');
        const modalTitle = document.getElementById('videoModalTitle');
        const player = document.getElementById('bilibiliPlayer');
        const bvid = this.extractBvidFromLink(videoItem.link);

        if (!bvid) return alert('视频链接无效');

        if (modalTitle) modalTitle.textContent = videoItem.name;
        const playerUrl = `https://player.bilibili.com/player.html?bvid=${bvid}&p=1&high_quality=1&danmaku=1&theme=dark`;
        if (player) player.src = playerUrl;
        if (modal) modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    closeVideoModal() {
        const modal = document.getElementById('videoModal');
        const player = document.getElementById('bilibiliPlayer');
        if (modal) modal.style.display = 'none';
        if (player) player.src = '';
        document.body.style.overflow = '';
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
        container.querySelectorAll('.dur-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const dur = btn.dataset.dur;
                if (this.state.durationFilter === dur) {
                    this.state.durationFilter = null;
                    btn.classList.remove('active');
                } else {
                    container.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('active'));
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
    }
};

// 页面加载完成
document.addEventListener('DOMContentLoaded', () => {
    console.log('[JY] DOM ready, starting init...');
    try {
        VideoApp.init();
        console.log('[JY] Init OK');
    } catch (e) {
        console.error('[JY] Init failed:', e);
        const tip = document.getElementById('statusTip');
        if (tip) tip.innerHTML = '初始化失败：' + e.message;
    }
});
