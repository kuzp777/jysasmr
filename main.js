// 全局应用对象 所有功能挂载在这里 避免全局变量污染
const VideoApp = {
    // 状态管理 存储原始数据和过滤后的数据
    state: {
        videoList: [],
        filteredList: []
    },

    // ========== 初始化入口 ==========
    init() {
        this.loadVideoData();
        this.bindSearchEvent();
    },

    // ========== 模块1：加载视频数据 ==========
    async loadVideoData() {
        const statusTip = document.getElementById('statusTip');
        const videoGrid = document.getElementById('videoGrid');

        try {
            // 相对路径加载json 适配GitHub Pages子目录
            const response = await fetch('./videos.json');
            if (!response.ok) throw new Error('数据加载失败');
            
            this.state.videoList = await response.json();
            this.state.filteredList = this.state.videoList;

            // 数据加载完成 渲染列表
            statusTip.style.display = 'none';
            this.renderVideoList();

        } catch (error) {
            console.error('数据加载错误：', error);
            statusTip.textContent = '视频数据加载失败，请检查videos.json文件是否存在且格式正确';
            videoGrid.innerHTML = '';
        }
    },

    // ========== 模块2：渲染视频列表 ==========
    renderVideoList() {
        const videoGrid = document.getElementById('videoGrid');
        const statusTip = document.getElementById('statusTip');
        const { filteredList } = this.state;

        // 空状态处理
        if (filteredList.length === 0) {
            statusTip.style.display = 'block';
            statusTip.textContent = '未找到匹配的视频';
            videoGrid.innerHTML = '';
            return;
        }

        // 隐藏提示 渲染卡片
        statusTip.style.display = 'none';
        videoGrid.innerHTML = filteredList.map(video => `
            <div class="video-card" data-url="${video.url}">
                <div class="card-cover">
                    <img src="${video.cover}" alt="${video.title}" loading="lazy">
                </div>
                <div class="card-title">${video.title}</div>
            </div>
        `).join('');

        // 绑定卡片点击跳转事件
        this.bindCardClickEvent();
    },

    // ========== 模块3：检索功能 搜索事件绑定 ==========
    bindSearchEvent() {
        const searchInput = document.getElementById('searchInput');
        
        searchInput.addEventListener('input', (e) => {
            const keyword = e.target.value.trim().toLowerCase();
            this.filterVideos(keyword);
        });
    },

    // 视频过滤逻辑
    filterVideos(keyword) {
        const { videoList } = this.state;
        
        // 无关键词 显示全部
        if (!keyword) {
            this.state.filteredList = videoList;
        } else {
            // 按标题模糊匹配
            this.state.filteredList = videoList.filter(video => 
                video.title.toLowerCase().includes(keyword)
            );
        }

        // 重新渲染
        this.renderVideoList();
    },

    // ========== 模块4：卡片点击跳转 ==========
    bindCardClickEvent() {
        const cards = document.querySelectorAll('.video-card');
        
        cards.forEach(card => {
            card.addEventListener('click', () => {
                const url = card.getAttribute('data-url');
                if (url) {
                    // 新窗口打开视频链接 不离开本站
                    window.open(url, '_blank');
                }
            });
        });
    }
};

// 页面加载完成 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    VideoApp.init();
});
