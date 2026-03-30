// 全局应用对象 模块化管理 避免全局污染
const VideoApp = {
    // 状态管理
    state: {
    videoList: [],
    filteredList: [],
    currentRandomVideo: null // 新增：存储当前随机选中的视频
},

    // 初始化入口
init() {
    this.loadVideoData();
    this.bindSearchEvent();
    this.bindRandomEvent(); // 新增：绑定随机抽视频事件
},

    // ========== 模块1：加载视频数据 适配你的JSON结构 ==========
    async loadVideoData() {
        const statusTip = document.getElementById('statusTip');
        const videoGrid = document.getElementById('videoGrid');

        try {
            // 相对路径加载 适配GitHub Pages子目录
            const response = await fetch('./videos.json');
            if (!response.ok) throw new Error('数据加载失败，请检查videos.json文件是否存在');
            
            // 加载原始数据
            this.state.videoList = await response.json();
            this.state.filteredList = this.state.videoList;

            // 渲染页面
            statusTip.style.display = 'none';
            this.renderVideoList();

        } catch (error) {
            console.error('数据加载错误：', error);
            statusTip.textContent = '视频数据加载失败，请检查videos.json文件是否存在、格式是否正确';
            videoGrid.innerHTML = '';
        }
    },

    // ========== 模块2：渲染视频列表 全字段适配 ==========
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
        videoGrid.innerHTML = filteredList.map(video => {
            // 处理封面路径：去掉开头的/ 转为相对路径 解决GitHub Pages 404
            const coverPath = video.cover.startsWith('/') ? video.cover.slice(1) : video.cover;
            // 格式化上传时间 只保留年月日
            const uploadDate = video.uploadTime ? new Date(video.uploadTime).toLocaleDateString() : '';

            return `
                <div class="video-card" data-link="${video.link}">
                    <div class="card-cover">
                        <img src="${coverPath}" alt="${video.name}" loading="lazy">
                    </div>
                    <div class="card-content">
                        <div class="card-title">${video.name}</div>
                        ${uploadDate ? `<div class="card-time">上传时间：${uploadDate}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // 绑定卡片点击跳转事件
        this.bindCardClickEvent();
    },

    // ========== 模块3：检索功能 适配name字段 ==========
    bindSearchEvent() {
        const searchInput = document.getElementById('searchInput');
        
        searchInput.addEventListener('input', (e) => {
            const keyword = e.target.value.trim().toLowerCase();
            this.filterVideos(keyword);
        });
    },

    // 视频过滤逻辑 按name字段模糊匹配
    filterVideos(keyword) {
        const { videoList } = this.state;
        
        if (!keyword) {
            this.state.filteredList = videoList;
        } else {
            this.state.filteredList = videoList.filter(video => 
                video.name.toLowerCase().includes(keyword)
            );
        }

        this.renderVideoList();
    },

    // ========== 模块4：卡片点击跳转 适配link字段 ==========
    bindCardClickEvent() {
        const cards = document.querySelectorAll('.video-card');
        
        cards.forEach(card => {
            card.addEventListener('click', () => {
                const videoLink = card.getAttribute('data-link');
                if (videoLink) {
                    // 新窗口打开B站链接 不离开本站
                    window.open(videoLink, '_blank');
                }
            });
        });
    }
};
// ========== 新增：随机抽视频功能模块 ==========
bindRandomEvent() {
    const randomBtn = document.getElementById('randomBtn');
    const modalClose = document.getElementById('modalClose');
    const reRandomBtn = document.getElementById('reRandomBtn');
    const goWatchBtn = document.getElementById('goWatchBtn');
    const modalOverlay = document.getElementById('randomModal');

    // 点击随机按钮
    randomBtn.addEventListener('click', () => {
        if (this.state.videoList.length === 0) {
            alert('视频数据还在加载中，请稍后再试');
            return;
        }
        this.getRandomVideo();
        this.showModal();
    });

    // 关闭弹窗
    modalClose.addEventListener('click', () => this.hideModal());
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) this.hideModal();
    });

    // 再抽一个
    reRandomBtn.addEventListener('click', () => {
        this.getRandomVideo();
    });

    // 去看视频
    goWatchBtn.addEventListener('click', () => {
        if (this.state.currentRandomVideo) {
            window.open(this.state.currentRandomVideo.link, '_blank');
            this.hideModal();
        }
    });
},

// 随机抽取视频
getRandomVideo() {
    const { videoList } = this.state;
    const randomIndex = Math.floor(Math.random() * videoList.length);
    this.state.currentRandomVideo = videoList[randomIndex];
    this.updateModalContent();
},

// 更新弹窗内容
updateModalContent() {
    const video = this.state.currentRandomVideo;
    if (!video) return;

    // 处理封面路径，适配GitHub Pages
    let coverPath = video.cover.startsWith('/') ? video.cover.slice(1) : video.cover;
    coverPath = './' + coverPath;

    // 更新弹窗UI
    const modalCover = document.getElementById('modalVideoCover');
    const modalTitle = document.getElementById('modalVideoTitle');

    modalCover.style.backgroundImage = `url('${coverPath}')`;
    modalTitle.textContent = video.name;
},

// 显示弹窗
showModal() {
    const modal = document.getElementById('randomModal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
},

// 隐藏弹窗
hideModal() {
    const modal = document.getElementById('randomModal');
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

// 页面加载完成 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    VideoApp.init();
});
