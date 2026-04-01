// 全局应用对象 - 模块化管理
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
        tagCloudExpanded: false,      // 标签云展开状态
        displayedTagsCount: 12        // 默认随机显示标签数量
    },

    // ==================== 工具函数 ====================
    extractBvidFromLink(link) {
        if (!link) return null;
        const bvMatch = link.match(/(BV[a-zA-Z0-9]{10})/i);
        return bvMatch ? bvMatch[1] : null;
    },

    // ==================== 初始化 ====================
    init() {
        this.loadVideoData();
    },

    // ==================== 加载视频数据（增强版） ====================
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

            // 按发布时间倒序排序
            this.state.videoList.sort((a, b) => {
                const timeA = new Date(a.uploadTime || a.publishTime || 0);
                const timeB = new Date(b.uploadTime || b.publishTime || 0);
                return timeB - timeA;
            });

            this.applyFilters();
            this.state.currentPage = 1;
            statusTip.style.display = 'none';
            pagination.style.display = 'flex';

            this.renderVideoList();
            this.renderPagination();
            this.renderTagCloud();        // 渲染标签云

        } catch (error) {
            console.error('数据加载错误：', error);
            statusTip.innerHTML = `
                视频数据加载失败<br>
                <span style="font-size:14px;color:#ff6b6b;">
                    请确认 videos.json 文件存在于根目录且格式正确
                </span>
            `;
            videoGrid.innerHTML = '';
            pagination.style.display = 'none';
        }
    },

    // ==================== 标签云功能（新增） ====================
    getAllTags() {
        const tagSet = new Set();
        this.state.videoList.forEach(video => {
            if (video.keywords && Array.isArray(video.keywords)) {
                video.keywords.forEach(tag => {
                    if (tag && tag.trim()) tagSet.add(tag.trim());
                });
            }
        });
        return Array.from(tagSet).sort();
    },

    renderTagCloud() {
        const tagCloud = document.getElementById('tagCloud');
        if (!tagCloud) return;

        const allTags = this.getAllTags();
        if (allTags.length === 0) {
            tagCloud.innerHTML = '<p style="color:#999;font-size:13px;padding:8px 0;">暂无标签</p>';
            return;
        }

        const displayTags = allTags.slice(0, this.state.displayedTagsCount);
        let html = '';
        displayTags.forEach(tag => {
            html += `<span class="tag" data-tag="${tag}">${tag}</span>`;
        });

        tagCloud.innerHTML = html;

        // 点击标签进行搜索
        tagCloud.querySelectorAll('.tag').forEach(tagEl => {
            tagEl.addEventListener('click', () => {
                const tagText = tagEl.dataset.tag;
                document.getElementById('searchInput').value = tagText;
                this.filterVideos(tagText);

                // 高亮当前标签
                tagCloud.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
                tagEl.classList.add('active');
            });
        });
    },

    toggleTagCloud() {
        const tagCloud = document.getElementById('tagCloud');
        const toggleBtn = document.getElementById('tagToggleBtn');
        
        this.state.tagCloudExpanded = !this.state.tagCloudExpanded;

        if (this.state.tagCloudExpanded) {
            tagCloud.classList.add('expanded');
            toggleBtn.textContent = '收起 ▲';
        } else {
            tagCloud.classList.remove('expanded');
            toggleBtn.textContent = '展开 ▼';
        }
    },

    // ==================== 搜索与过滤（已支持标签搜索） ====================
    filterVideos(keyword = '') {
        const searchText = (keyword || document.getElementById('searchInput').value || '').toLowerCase().trim();
        const { videoList, isPremiumFilterActive } = this.state;

        let result = [...videoList];

        if (searchText) {
            const keywordList = searchText.split(/\s+/).filter(w => w.trim() !== '');
            result = result.filter(video => {
                const title = video.name.toLowerCase();
                const kws = (video.keywords || []).map(k => k.toLowerCase()).join(' ');
                return keywordList.every(word => title.includes(word) || kws.includes(word));
            });
        }

        if (isPremiumFilterActive) {
            result = result.filter(video => {
                const kws = (video.keywords || []).map(k => k.toLowerCase());
                return kws.includes('充电专属') || kws.includes('充电');
            });
        }

        this.state.filteredList = result;
        this.state.currentPage = 1;
        this.renderVideoList();
        this.renderPagination();
    },

    bindSearchEvent() {
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', () => this.filterVideos());
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
        const { filteredList, currentPage, pageSize, latestVideoCount, videoList } = this.state;
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const currentPageData = filteredList.slice(startIndex, endIndex);

        videoGrid.innerHTML = currentPageData.map((video) => {
            const globalIndex = videoList.findIndex(v => v.name === video.name && v.link === video.link);
            const isNew = globalIndex >= 0 && globalIndex < latestVideoCount;

            let coverPath = video.cover.startsWith('/') ? video.cover.slice(1) : video.cover;
            coverPath = './' + coverPath;

            const uploadDate = (video.uploadTime || video.publishTime)
                ? new Date(video.uploadTime || video.publishTime).toLocaleDateString('zh-CN', {
                    year: 'numeric', month: '2-digit', day: '2-digit'
                }) : '';

            return `
                <div class="video-card" data-link="${video.link}">
                    <div class="card-cover">
                        ${isNew ? '<div class="new-badge">✨ 最新</div>' : ''}
                        <img src="${coverPath}" alt="${video.name}" loading="lazy">
                    </div>
                    <div class="card-content">
                        <div class="card-title">${video.name}</div>
                        ${uploadDate ? `<div class="card-time">发布时间：${uploadDate}</div>` : ''}
                        ${video.keywords && video.keywords.length > 0 ? `
                            <div class="card-tags">
                                ${video.keywords.slice(0, 3).map(kw => `<span class="tag">${kw}</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        this.bindCardClickEvent();
    },

    // ==================== 分页相关（保持你原来的逻辑） ====================
    renderPagination() {
        const pagination = document.getElementById('pagination');
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
        cards.forEach((card, index) => {
            card.addEventListener('click', () => {
                const { filteredList, currentPage, pageSize } = this.state;
                const videoIndex = (currentPage - 1) * pageSize + index;
                const targetVideo = filteredList[videoIndex];
                if (targetVideo) this.openVideoModal(targetVideo);
            });
        });
    },

    // ==================== 随机抽视频（保留你原来逻辑） ====================
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
        const randomIndex = Math.floor(Math.random() * this.state.videoList.length);
        this.state.currentRandomVideo = this.state.videoList[randomIndex];
        this.updateModalContent();
    },

    updateModalContent() {
        const video = this.state.currentRandomVideo;
        if (!video) return;
        let coverPath = video.cover.startsWith('/') ? video.cover.slice(1) : video.cover;
        coverPath = './' + coverPath;
        document.getElementById('modalVideoCover').style.backgroundImage = `url('${coverPath}')`;
        document.getElementById('modalVideoTitle').textContent = video.name;
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

        modalTitle.textContent = videoItem.name;
        const playerUrl = `https://player.bilibili.com/player.html?bvid=${bvid}&p=1&high_quality=1&danmaku=1&theme=dark`;
        player.src = playerUrl;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    closeVideoModal() {
        const modal = document.getElementById('videoModal');
        const player = document.getElementById('bilibiliPlayer');
        modal.style.display = 'none';
        player.src = '';
        document.body.style.overflow = '';
    },

    bindVideoModalEvent() {
        const modal = document.getElementById('videoModal');
        const closeBtn = document.getElementById('videoModalClose');
        closeBtn.addEventListener('click', () => this.closeVideoModal());
        modal.addEventListener('click', e => { if (e.target === modal) this.closeVideoModal(); });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') this.closeVideoModal();
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
            this.applyFilters();
            this.state.currentPage = 1;
            this.renderVideoList();
            this.renderPagination();
        });
    }
};

// 页面加载完成
document.addEventListener('DOMContentLoaded', () => {
    VideoApp.init();
});
