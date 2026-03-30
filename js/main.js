import { renderVideos } from './videoRenderer.js';

let allVideos = [];

async function loadVideos() {
    const loading = document.getElementById('loading');
    const grid = document.getElementById('videoGrid');

    loading.style.display = 'block';
    grid.innerHTML = '';

    try {
        const response = await fetch('videos.json?' + Date.now()); // 防止缓存
        if (!response.ok) throw new Error('无法加载视频数据');

        allVideos = await response.json();

        if (!Array.isArray(allVideos)) {
            throw new Error('JSON 格式错误');
        }

        loading.style.display = 'none';
        renderVideos(allVideos, grid);
    } catch (error) {
        loading.style.display = 'none';
        grid.innerHTML = `<p style="color:red; text-align:center; grid-column:1/-1;">
                            加载失败：${error.message}<br>
                            请确认 videos.json 存在且格式正确
                          </p>`;
        console.error(error);
    }
}

// 搜索和排序逻辑
function filterAndSortVideos() {
    const searchText = document.getElementById('searchInput').value.toLowerCase().trim();
    const sortType = document.getElementById('sortSelect').value;

    let filtered = allVideos.filter(video => 
        video.name.toLowerCase().includes(searchText)
    );

    if (sortType === 'name') {
        filtered.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    } else {
        // 默认最新优先（根据 uploadTime 降序）
        filtered.sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime));
    }

    renderVideos(filtered, document.getElementById('videoGrid'));
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadVideos();

    // 实时搜索
    document.getElementById('searchInput').addEventListener('input', filterAndSortVideos);
    document.getElementById('sortSelect').addEventListener('change', filterAndSortVideos);
});
