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
        latestVideoCount: 3,
        tagCloudExpanded: false,
        displayedTagsCount: 12,
        // 新增：收藏夹
        favorites: new Set(),
        showFavOnly: false,
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
        this.loadFavorites();
        this.loadVideoData();
        this.bindSearchEvent();
        this.bindTagEvents();
        this.bindRandomEvent();
        this.bindFilterEvent();
        this.bindVideoModalEvent();
        this.bindSortEvent();
        this.bindFavEvent();
    },

    // ==================== 收藏夹 ====================
    loadFavorites() {
        try {
            const stored = JSON.parse(localStorage.getItem('jy_favs') || '[]');
            this.state.favorites = new Set(stored);
        } catch { this.state.favorites = new Set(); }
        this.updateFavBadge();
    },

    saveFavorites() {
        localStorage.setItem('jy_favs', JSON.stringify([...this.state.favorites]));
        this.updateFavBadge();
    },

    toggleFav(id) {
        if (this.state.favorites.has(id)) this.state.favorites.delete(id);
        else this.state.favorites.add(id);
        this.saveFavorites();
        this.renderVideoList();
    },

    updateFavBadge() {
        const n = this.state.favorites.size;
        const favCount = document.getElementById('fav-count');
        const btnFav = document.getElementById('btn-favorites');
        if (favCount) {
            if (n > 0) {
                favCount.textContent = n;
                favCount.style.display = '';
            } else {
                favCount.style.display = 'none';
            }
        }
        if (btnFav) btnFav.classList.toggle('active', this.state.showFavOnly);
    },

    bindFavEvent() {
        const btnFav = document.getElementById('btn-favorites');
        if (btnFav) {
            btnFav.addEventListener('click', () => {
                this.state.showFavOnly = !this.state.showFavOnly;
                this.applyFilters();
                this.state.currentPage = 1;
                this.renderVideoList();
                this.renderPagination();
            });
        }
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
                case 'name-asc':
                    return a.name.localeCompare(b.name, 'zh');
                case 'name-desc':
                    return b.name.localeCompare(a.name, 'zh');
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
                throw new Error('无法加载 videos.json');
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

    // ==================== 标签云功能 ====================
    getAllTags() {
        const tagMap = {};
        this.state.videoList.forEach(video => {
            if (video.keywords && Array.isArray(video.keywords)) {
                video.keywords.forEach(tag => {
                    if (tag && tag.trim()) {
                        tagMap[tag.trim()] = (tagMap[tag.trim()] || 0) + 1;
                    }
                });
            }
        });
        return Object.entries(tagMap).sort((a, b) => b[1] - a[1]);
    },

    renderTagCloud() {
        const tagCloud = document.getElementById('tagCloud');
        if (!tagCloud) return;

        const allTags = this.getAllTags();
        if (allTags.length === 0) {
            tagCloud.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px 0;">暂无标签</p>';
            return;
        }

        const displayTags = allTags.slice(0, this.state.displayedTagsCount);
        let html = '';
        displayTags.forEach(([tag, count]) => {
            const isActive = this.state.activeKeywords.has(tag);
            html += `<span class="tag ${isActive ? 'active' : ''}" data-tag="${this.escAttr(tag)}">${this.escHtml(tag)} <span class="tag-count">${count}</span></span>`;
        });

        tagCloud.innerHTML = html;

        // 点击标签进行筛选
        tagCloud.querySelectorAll('.tag').forEach(tagEl => {
            tagEl.addEventListener('click', () => {
                const tagText = tagEl.dataset.tag;
                if (this.state.activeKeywords.has(tagText)) {
                    this.state.activeKeywords.delete(tagText);
                    tagEl.classList.remove('active');
                } else {
                    this.state.activeKeywords.add(tagText);
                    tagEl.classList.add('active');
                }
                // 同步搜索框
                document.getElementById('searchInput').value = [...this.state.activeKeywords].join(' ');
                this.filterVideos();
            });
        });
    },

    toggleTagCloud() {
        const tagCloud = document.getElementById('tagCloud');
        const toggleBtn = document.getElementById('tagToggleBtn');

        this.state.tagCloudExpanded = !this.state.tagCloudExpanded;

        if (this.state.tagCloudExpanded) {
            tagCloud.classList.add('expanded');
            if (toggleBtn) toggleBtn.textContent = '收起 ▲';
        } else {
            tagCloud.classList.remove('expanded');
            if (toggleBtn) toggleBtn.textContent = '展开 ▼';
        }
    },

    // ==================== 搜索与过滤 ====================
    filterVideos(keyword) {
        const searchText = (keyword !== undefined ? keyword : document.getElementById('searchInput').value || '').toLowerCase().trim();
        const { videoList, isPremiumFilterActive, showFavOnly } = this.state;

        let result = [...videoList];

        // 收藏筛选
        if (showFavOnly) {
            result = result.filter(video => this.state.favorites.has(this.genId(video)));
        }

        // 搜索筛选
        if (searchText) {
            const keywordList = searchText.split(/\s+/).filter(w => w.trim() !== '');
            result = result.filter(video => {
                const title = video.name.toLowerCase();
                const kws = (video.keywords || []).map(k => k.toLowerCase()).join(' ');
                return keywordList.every(word => title.includes(word) || kws.includes(word));
            });
        }

        // 充电专属筛选
        if (isPremiumFilterActive) {
            result = result.filter(video => {
                const kws = (video.keywords || []).map(k => k.toLowerCase());
                return kws.includes('充电专属') || kws.includes('充电');
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
                // 同步活跃关键词
                const val = searchInput.value.trim();
                this.state.activeKeywords.clear();
                if (val) {
                    val.split(/\s+/).forEach(w => {
                        if (w) this.state.activeKeywords.add(w);
                    });
                }
                // 更新标签高亮
                const tagCloud = document.getElementById('tagCloud');
                if (tagCloud) {
                    tagCloud.querySelectorAll('.tag').forEach(t => {
                        t.classList.toggle('active', this.state.activeKeywords.has(t.dataset.tag));
                    });
                }
                this.filterVideos();
            });
        }
    },

    bindTagEvents() {
        const toggleBtn = document.getElementById('tagToggleBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleTagCloud());
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
                    <p>暂无视频</p>
                    <p class="sub">${this.state.showFavOnly ? '收藏夹为空，去 <a href="admin.html">管理后台</a> 添加一些吧' : '没有匹配的视频'}</p>
                </div>
            `;
            return;
        }

        videoGrid.innerHTML = currentPageData.map((video) => {
            const globalIndex = videoList.findIndex(v => v.name === video.name && v.link === video.link);
            const isNew = globalIndex >= 0 && globalIndex < latestVideoCount;
            const videoId = this.genId(video);
            const isFav = this.state.favorites.has(videoId);

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
                    <button class="card-fav ${isFav ? 'is-fav' : ''}" data-id="${this.escAttr(videoId)}" title="收藏">
                        ${isFav ? '⭐' : '☆'}
                    </button>
                    <div class="card-cover">
                        ${isNew ? '<div class="new-badge">✨ 最新</div>' : ''}
                        <img src="${this.escAttr(coverPath)}" alt="${this.escAttr(video.name)}" loading="lazy" onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 672 378\'><rect fill=\'%231a1a22\' width=\'672\' height=\'378\'/><text x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%2371717a\' font-size=\'24\'>🎬</text></svg>'">
                        <div class="play-overlay"><div class="play-icon">▶</div></div>
                    </div>
                    <div class="card-content">
                        <div class="card-title">${this.escHtml(video.name)}</div>
                        ${uploadDate ? `<div class="card-time">📅 ${this.escHtml(uploadDate)}</div>` : ''}
                        ${video.keywords && video.keywords.length > 0 ? `
                            <div class="card-tags">
                                ${video.keywords.slice(0, 3).map(kw => `<span class="tag">${this.escHtml(kw)}</span>`).join('')}
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
            // 收藏按钮
            const favBtn = card.querySelector('.card-fav');
            if (favBtn) {
                favBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleFav(favBtn.dataset.id);
                });
            }

            // 卡片点击 → 站内播放
            card.addEventListener('click', (e) => {
                if (e.target.closest('.card-fav')) return;
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
        const filterBtn = document.getElementById('premiumFilterBtn');
        if (!filterBtn) return;
        filterBtn.addEventListener('click', () => {
            this.state.isPremiumFilterActive = !this.state.isPremiumFilterActive;
            filterBtn.textContent = this.state.isPremiumFilterActive ? '⚡ 全部视频' : '⚡ 充电专属';
            filterBtn.classList.toggle('active', this.state.isPremiumFilterActive);
            this.filterVideos();
        });
    }
};

// 页面加载完成
document.addEventListener('DOMContentLoaded', () => {
    VideoApp.init();
});
