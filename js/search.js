let videos = [];
let fuse;

async function loadData() {
    try {
        const res = await fetch('data/videos.json');
        videos = await res.json();
        
        // 初始化 Fuse.js 模糊搜索
        fuse = new Fuse(videos, {
            keys: [
                { name: "title", weight: 0.7 },   // 标题权重更高
                { name: "tags", weight: 0.3 }     // 标签权重
            ],
            threshold: 0.4,        // 模糊匹配程度（可调整）
            includeScore: true
        });
        
        renderResults(videos);   // 初始显示所有视频
    } catch (e) {
        console.error("加载数据失败", e);
        document.getElementById('results').innerHTML = 
            "<p style='text-align:center; color:red;'>❌ 数据加载失败，请检查 data/videos.json 文件是否存在</p>";
    }
}

function renderResults(results) {
    const container = document.getElementById('results');
    container.innerHTML = '';

    if (results.length === 0) {
        container.innerHTML = '<p style="text-align:center; grid-column:1/-1;">没有找到匹配的内容</p>';
        return;
    }

    results.forEach(video => {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.innerHTML = `
            <a href="${video.url}" target="_blank" rel="noopener">
                <img src="${video.cover}" alt="${video.title}" loading="lazy">
            </a>
            <h3><a href="${video.url}" target="_blank" rel="noopener">${video.title}</a></h3>
            <div class="tags">
                ${video.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
        `;
        container.appendChild(card);
    });
}

// 实时搜索功能
document.getElementById('searchInput').addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    if (!query) {
        renderResults(videos);
        return;
    }
    
    const searchResults = fuse.search(query);
    renderResults(searchResults.map(item => item.item));
});

// 页面加载完成后执行
window.onload = loadData;

