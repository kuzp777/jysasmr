// 全局应用对象 模块化管理
const VideoApp = {
    // 状态管理
    state: {
        videoList: [],
        filteredList: [],
        currentRandomVideo: null,
        currentPage: 1,
        pageSize: 9,
        isPremiumFilterActive: false,
        latestVideoCount: 3
    },

    // 工具函数：从B站链接中提取BV号
    extractBvidFromLink(link) {
        if (!link) return null;
        const bvMatch = link.match(/(BV[a-zA-Z0-9]{10})/i);
        return bvMatch ? bvMatch[1] : null;
    },

    // 初始化入口
    init() {
        this.loadVideoData();
        this.bindSearchEvent();
        this.bindRandomEvent();
        this.bindVideoModalEvent();
        this.bindFilterEvent();
    },

    // 模块1：加载视频数据（时间倒序）
    async loadVideoData() {
        const statusTip = document.getElementById('statusTip');
        const videoGrid = document.getElementById('videoGrid');
        const pagination = document.getElementById('pagination');

        try {
            const response = await fetch('./videos.json');
            if (!response.ok) throw new Error('数据加载失败');
            
            this.state.videoList = await response.json();
            
            // 按发布时间倒序排序（最新的在最前面）
            this.state.videoList.sort((a, b) => {
                const timeA = new Date(a.uploadTime || a.publishTime || 0);
                const timeB = new Date(b.uploadTime || b.publishTime || 0);
                return timeB - timeA;
            });
            
            // 初始化过滤列表
            this.applyFilters();
            this.state.currentPage = 1;

            statusTip.style.display = 'none';
            pagination.style.display = 'flex';
            this.renderVideoList();
            this.renderPagination();

        } catch (error) {
            console.error('数据加载错误：', error);
            statusTip.textContent = '视频数据加载失败，请检查videos.json文件是否存在、格式是否正确';
            videoGrid.innerHTML = '';
            pagination.style.display = 'none';
        }
    },

    // 模块2：渲染视频列表（新增最新标签）
    renderVideoList() {
        const videoGrid = document.getElementById('videoGrid');
        const { filteredList, currentPage, pageSize, latestVideoCount, videoList } = this.state;

        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const currentPageData = filteredList.slice(startIndex, endIndex);

        videoGrid.innerHTML = currentPageData.map((video, indexInPage) => {
            // 计算视频在原始列表中的全局索引，判断是否为最新视频
            const globalIndex = videoList.findIndex(v => v.name === video.name && v.link === video.link);
            const isNew = globalIndex >= 0 && globalIndex < latestVideoCount;
            
            let coverPath = video.cover.startsWith('/') ? video.cover.slice(1) : video.cover;
            coverPath = './' + coverPath;
            
            const uploadDate = (video.uploadTime || video.publishTime) 
                ? new Date(video.uploadTime || video.publishTime).toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                }) 
                : '';

            return `
                <div class="video-card" data-link="${video.link}">
                    <div class="card-cover">
                        ${isNew ? '<div class="new-badge">✨ 最新</div>' : ''}
                        <img src="${coverPath}" alt="${video.name}" loading="lazy" onerror="this.style.backgroundColor='#18181b'">
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

    // 模块3：渲染分页控件
    renderPagination() {
        const pagination = document.getElementById('pagination');
        const { filteredList, currentPage, pageSize } = this.state;
        const totalPages = Math.ceil(filteredList.length / pageSize);

        if (totalPages <= 1) {
            pagination.style.display = 'none';
            return;
        }

        pagination.style.display = 'flex';
        let paginationHTML = '';

        paginationHTML += `
            <button class="page-btn prev-btn ${currentPage === 1 ? 'disabled' : ''}" data-page="prev">
                上一页
            </button>
        `;

        const maxVisiblePages = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        if (startPage > 1) {
            paginationHTML += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) paginationHTML += `<span style="color: var(--text-muted); padding: 0 4px;">...</span>`;
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">
                    ${i}
                </button>
            `;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) paginationHTML += `<span style="color: var(--text-muted); padding: 0 4px;">...</span>`;
            paginationHTML += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
        }

        paginationHTML += `
            <button class="page-btn next-btn ${currentPage === totalPages ? 'disabled' : ''}" data-page="next">
                下一页
            </button>
        `;

        pagination.innerHTML = paginationHTML;
        this.bindPaginationEvent();
    },

    // 模块4：绑定分页点击事件
    bindPaginationEvent() {
        const pagination = document.getElementById('pagination');
        const { filteredList, pageSize } = this.state;
        const totalPages = Math.ceil(filteredList.length / pageSize);

        pagination.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.classList.contains('disabled')) return;

                const page = btn.getAttribute('data-page');
                if (page === 'prev') {
                    this.state.currentPage = Math.max(1, this.state.currentPage - 1);
                } else if (page === 'next') {
                    this.state.currentPage = Math.min(totalPages, this.state.currentPage + 1);
                } else {
                    this.state.currentPage = parseInt(page);
                }

                this.renderVideoList();
                this.renderPagination();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });
    },

    // 模块5：检索功能（和筛选联动）
    bindSearchEvent() {
        const searchInput = document.getElementById('searchInput');
        
        searchInput.addEventListener('input', (e) => {
            const keyword = e.target.value.trim().toLowerCase();
            this.filterVideos(keyword);
        });
    },

    filterVideos(keyword) {
        const { videoList, isPremiumFilterActive } = this.state;
        
        // 1. 先按关键词搜索
        let result = [...videoList];
        if (keyword) {
            const keywordList = keyword.toLowerCase().split(/\s+/).filter(item => item.trim() !== '');
            result = result.filter(video => {
                const videoTitle = video.name.toLowerCase();
                const videoKeywords = (video.keywords || []).map(item => item.toLowerCase()).join(' ');
                return keywordList.every(word => {
                    return videoTitle.includes(word) || videoKeywords.includes(word);
                });
            });
        }

        // 2. 再应用充电专属筛选
        if (isPremiumFilterActive) {
            result = result.filter(video => {
                const keywords = (video.keywords || []).map(kw => kw.toLowerCase());
                return keywords.includes('充电专属') || keywords.includes('充电');
            });
        }

        this.state.filteredList = result;
        this.state.currentPage = 1;
        this.renderVideoList();
        this.renderPagination();
    },

    // 模块6：卡片点击事件 站内弹框播放
    bindCardClickEvent() {
        const cards = document.querySelectorAll('.video-card');
        
        cards.forEach((card, index) => {
            card.addEventListener('click', () => {
                const { filteredList, currentPage, pageSize } = this.state;
                const videoIndex = (currentPage - 1) * pageSize + index;
                const targetVideo = filteredList[videoIndex];
                
                if (targetVideo) {
                    this.openVideoModal(targetVideo);
                }
            });
        });
    },

    // 模块7：随机抽视频功能
    bindRandomEvent() {
        const randomBtn = document.getElementById('randomBtn');
        const modalClose = document.getElementById('modalClose');
        const reRandomBtn = document.getElementById('reRandomBtn');
        const watchInSiteBtn = document.getElementById('watchInSiteBtn');
        const goWatchBtn = document.getElementById('goWatchBtn');
        const modalOverlay = document.getElementById('randomModal');

        if (randomBtn) {
            randomBtn.addEventListener('click', () => {
                if (this.state.videoList.length === 0) {
                    alert('视频数据还在加载中，请稍后再试');
                    return;
                }
                this.getRandomVideo();
                this.showModal();
            });
        }

        if (modalClose) modalClose.addEventListener('click', () => this.hideModal());
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) this.hideModal();
            });
        }

        if (reRandomBtn) {
            reRandomBtn.addEventListener('click', () => this.getRandomVideo());
        }

        if (watchInSiteBtn) {
            watchInSiteBtn.addEventListener('click', () => {
                if (this.state.currentRandomVideo) {
                    this.openVideoModal(this.state.currentRandomVideo);
                    this.hideModal();
                }
            });
        }

        if (goWatchBtn) {
            goWatchBtn.addEventListener('click', () => {
                if (this.state.currentRandomVideo) {
                    window.open(this.state.currentRandomVideo.link, '_blank');
                    this.hideModal();
                }
            });
        }
    },

    getRandomVideo() {
        const { videoList } = this.state;
        const randomIndex = Math.floor(Math.random() * videoList.length);
        this.state.currentRandomVideo = videoList[randomIndex];
        this.updateModalContent();
    },

    updateModalContent() {
        const video = this.state.currentRandomVideo;
        if (!video) return;

        let coverPath = video.cover.startsWith('/') ? video.cover.slice(1) : video.cover;
        coverPath = './' + coverPath;

        const modalCover = document.getElementById('modalVideoCover');
        const modalTitle = document.getElementById('modalVideoTitle');

        modalCover.style.backgroundImage = `url('${coverPath}')`;
        modalTitle.textContent = video.name;
    },

    showModal() {
        const modal = document.getElementById('randomModal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    },

    hideModal() {
        const modal = document.getElementById('randomModal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    },

    // 模块8：视频弹框播放功能
    openVideoModal(videoItem) {
        const modal = document.getElementById('videoModal');
        const modalTitle = document.getElementById('videoModalTitle');
        const player = document.getElementById('bilibiliPlayer');

        const bvid = this.extractBvidFromLink(videoItem.link);
        if (!bvid) {
            alert('视频链接无效，无法提取BV号');
            return;
        }

        modalTitle.textContent = videoItem.name;
        const playerUrl = `https://player.bilibili.com/player.html?bvid=${bvid}&p=1&high_quality=1&danmaku=1&theme=dark`;
        player.src = '';
        setTimeout(() => {
            player.src = playerUrl;
        }, 50);

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
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeVideoModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('videoModal');
                if (modal.style.display !== 'none') {
                    this.closeVideoModal();
                }
            }
        });
    },

    // 模块9：筛选功能
    applyFilters() {
        const { videoList, isPremiumFilterActive } = this.state;
        let result = [...videoList];

        if (isPremiumFilterActive) {
            result = result.filter(video => {
                const keywords = (video.keywords || []).map(kw => kw.toLowerCase());
                return keywords.includes('充电专属') || keywords.includes('充电');
            });
        }

        this.state.filteredList = result;
    },

    bindFilterEvent() {
        const filterBtn = document.getElementById('premiumFilterBtn');
        if (!filterBtn) return;

        filterBtn.addEventListener('click', () => {
            this.state.isPremiumFilterActive = !this.state.isPremiumFilterActive;
            
            if (this.state.isPremiumFilterActive) {
                filterBtn.classList.add('active');
            } else {
                filterBtn.classList.remove('active');
            }

            this.applyFilters();
            this.state.currentPage = 1;
            this.renderVideoList();
            this.renderPagination();
        });
    }
};

// 页面加载完成 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    VideoApp.init();
});
