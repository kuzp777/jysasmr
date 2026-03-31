// 全局应用对象 模块化管理
const VideoApp = {
    // 状态管理
    state: {
        videoList: [],
        filteredList: [],
        currentRandomVideo: null,
        currentPage: 1,
        pageSize: 9 // 每页显示9个视频，3列布局
    },
    // 工具函数：从B站链接中提取BV号
extractBvidFromLink(link) {
    if (!link) return null;
    // 匹配BV号规则：BV开头+数字/字母，共12位
    const bvMatch = link.match(/BV([a-zA-Z0-9]{10})/i);
    return bvMatch ? bvMatch[0] : null;
},

   // 初始化入口
init() {
    this.loadVideoData();
    this.bindSearchEvent();
    this.bindRandomEvent();
    this.bindVideoModalEvent(); // 新增：绑定视频弹框事件
},,

    // ========== 模块1：加载视频数据 ==========
    async loadVideoData() {
        const statusTip = document.getElementById('statusTip');
        const videoGrid = document.getElementById('videoGrid');
        const pagination = document.getElementById('pagination');

        try {
            const response = await fetch('./videos.json');
            if (!response.ok) throw new Error('数据加载失败，请检查videos.json文件是否存在');
            
            this.state.videoList = await response.json();
            this.state.filteredList = this.state.videoList;
            this.state.currentPage = 1; // 重置页码

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

    // ========== 模块2：渲染视频列表（含分页截取） ==========
    renderVideoList() {
        const videoGrid = document.getElementById('videoGrid');
        const { filteredList, currentPage, pageSize } = this.state;

        // 计算当前页的数据
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const currentPageData = filteredList.slice(startIndex, endIndex);

        videoGrid.innerHTML = currentPageData.map(video => {
            let coverPath = video.cover.startsWith('/') ? video.cover.slice(1) : video.cover;
            coverPath = './' + coverPath;
            const uploadDate = video.uploadTime ? new Date(video.uploadTime).toLocaleDateString() : '';

            return `
                <div class="video-card" data-link="${video.link}">
                    <div class="card-cover">
                        <img src="${coverPath}" alt="${video.name}" loading="lazy" onerror="this.style.backgroundColor='#18181b'">
                    </div>
                    <div class="card-content">
                        <div class="card-title">${video.name}</div>
                        ${uploadDate ? `<div class="card-time">上传时间：${uploadDate}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        this.bindCardClickEvent();
    },

    // ========== 模块3：新增：渲染分页控件 ==========
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

        // 上一页按钮
        paginationHTML += `
            <button class="page-btn prev-btn ${currentPage === 1 ? 'disabled' : ''}" data-page="prev">
                上一页
            </button>
        `;

        // 页码按钮（最多显示5个页码，超出用省略号）
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

        // 下一页按钮
        paginationHTML += `
            <button class="page-btn next-btn ${currentPage === totalPages ? 'disabled' : ''}" data-page="next">
                下一页
            </button>
        `;

        pagination.innerHTML = paginationHTML;
        this.bindPaginationEvent();
    },

    // ========== 模块4：新增：绑定分页点击事件 ==========
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
                // 滚动到页面顶部
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });
    },

    // ========== 模块5：检索功能（搜索后重置页码） ==========
    bindSearchEvent() {
        const searchInput = document.getElementById('searchInput');
        
        searchInput.addEventListener('input', (e) => {
            const keyword = e.target.value.trim().toLowerCase();
            this.filterVideos(keyword);
        });
    },

    filterVideos(keyword) {
        const { videoList } = this.state;
        
        if (!keyword) {
            this.state.filteredList = videoList;
        } else {
            this.state.filteredList = videoList.filter(video => 
                video.name.toLowerCase().includes(keyword)
            );
        }

        this.state.currentPage = 1; // 搜索后重置到第一页
        this.renderVideoList();
        this.renderPagination();
    },

    // ========== 模块6：卡片点击跳转 ==========
    bindCardClickEvent() {
        const cards = document.querySelectorAll('.video-card');
        
        cards.forEach(card => {
            card.addEventListener('click', () => {
                const videoLink = card.getAttribute('data-link');
                if (videoLink) {
                    window.open(videoLink, '_blank');
                }
            });
        });
    },

    // ========== 模块7：随机抽视频功能（增加容错） ==========
    bindRandomEvent() {
        const randomBtn = document.getElementById('randomBtn');
        const modalClose = document.getElementById('modalClose');
        const reRandomBtn = document.getElementById('reRandomBtn');
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

        if (goWatchBtn) {
            goWatchBtn.addEventListener('click', () => {
                if (this.state.currentRandomVideo) {
                    window.open(this.state.currentRandomVideo.link, '_blank');
                    this.hideModal();
                }
            });
        }
        // 随机弹窗-站内播放按钮
const watchInSiteBtn = document.getElementById('watchInSiteBtn');
if (watchInSiteBtn) {
    watchInSiteBtn.addEventListener('click', () => {
        if (this.state.currentRandomVideo) {
            this.openVideoModal(this.state.currentRandomVideo);
            this.hideModal(); // 关闭随机弹窗
        }
    });
}},


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
    }
};


// 页面加载完成 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    VideoApp.init();
});
