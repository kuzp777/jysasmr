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
        latestVideoCount: 3,
        tagCloudExpanded: false,     // 新增：标签云展开状态
        displayedTagsCount: 12       // 默认随机显示数量
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
        this.bindSearchEvent();
        this.bindRandomEvent();
        this.bindVideoModalEvent();
        this.bindFilterEvent();
        this.bindTagEvents();        // 新增：标签相关事件
    },

    // ==================== 加载视频数据 ====================
    async loadVideoData() {
        const statusTip = document.getElementById('statusTip');
        const videoGrid = document.getElementById('videoGrid');
        const pagination = document.getElementById('pagination');

        try {
            const response = await fetch('./videos.json?' + Date.now());
            if (!response.ok) throw new Error('数据加载失败');

            this.state.videoList = await response.json();

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
            this.renderTagCloud();        // 新增：渲染标签云
        } catch (error) {
            console.error('数据加载错误：', error);
            statusTip.textContent = '视频数据加载失败，请检查videos.json文件是否存在、格式是否正确';
            videoGrid.innerHTML = '';
            pagination.style.display = 'none';
        }
    },

    // ==================== 标签云相关 ====================
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
            tagCloud.innerHTML = '<p style="color:#999; font-size:13px; padding:8px 0;">暂无标签</p>';
            return;
        }

        // 默认显示部分标签（随机显示）
        const displayTags = allTags.slice(0, this.state.displayedTagsCount);
        
        let html = '';
        displayTags.forEach(tag => {
            html += `<span class="tag" data-tag="${tag}">${tag}</span>`;
        });

        tagCloud.innerHTML = html;

        // 绑定标签点击事件
        tagCloud.querySelectorAll('.tag').forEach(tagEl => {
            tagEl.addEventListener('click', () => {
                const tagText = tagEl.dataset.tag;
                document.getElementById('searchInput').value = tagText;
                this.filterVideos(tagText);
                
                // 高亮当前点击的标签
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
            toggleBtn.style.color = '#1a73e8';
        } else {
            tagCloud.classList.remove('expanded');
            toggleBtn.textContent = '展开 ▼';
        }
    },

    // ==================== 过滤与搜索 ====================
    filterVideos(keyword = '') {
        const searchText = (keyword || document.getElementById('searchInput').value || '').toLowerCase().trim();
        const { videoList, isPremiumFilterActive } = this.state;

        let result = [...videoList];

        if (searchText) {
            const keywordList = searchText.split(/\s+/).filter(item => item.trim() !== '');
            result = result.filter(video => {
                const videoTitle = video.name.toLowerCase();
                const videoKeywords = (video.keywords || []).map(item => item.toLowerCase()).join(' ');
                return keywordList.every(word => 
                    videoTitle.includes(word) || videoKeywords.includes(word)
                );
            });
        }

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

    bindSearchEvent() {
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', () => {
            this.filterVideos();
        });
    },

    // ==================== 标签事件绑定 ====================
    bindTagEvents() {
        const toggleBtn = document.getElementById('tagToggleBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleTagCloud());
        }
    },

    // ==================== 以下为你的原有模块（保持不变） ====================
    renderVideoList() {
        // ... 你的原 renderVideoList 代码保持不变 ...
        const videoGrid = document.getElementById('videoGrid');
        const { filteredList, currentPage, pageSize, latestVideoCount, videoList } = this.state;
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const currentPageData = filteredList.slice(startIndex, endIndex);

        videoGrid.innerHTML = currentPageData.map((video, indexInPage) => {
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

    // 保留你原来的 renderPagination、bindPaginationEvent、bindRandomEvent、openVideoModal 等所有函数...

    // （为了节省篇幅，这里省略了你原有的 renderPagination、bindPaginationEvent、bindRandomEvent、getRandomVideo、updateModalContent、showModal、hideModal、openVideoModal、closeVideoModal、bindVideoModalEvent、applyFilters、bindFilterEvent 等函数）

    // 请把你原来的这些函数完整复制到下面，保持不变即可
};

// 页面加载完成 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    VideoApp.init();
});
