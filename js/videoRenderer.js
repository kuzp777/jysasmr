import { createElement, formatDate } from './utils.js';
import { openVideoModal } from './modal.js';

export function renderVideos(videos, container) {
    container.innerHTML = '';

    if (videos.length === 0) {
        document.getElementById('noResults').style.display = 'block';
        return;
    }

    document.getElementById('noResults').style.display = 'none';

    videos.forEach(video => {
        const card = createElement('div', 'video-card');

        const img = createElement('img');
        img.src = video.cover || 'https://via.placeholder.com/280x180?text=无封面';
        img.alt = video.name;
        img.loading = "lazy";

        const info = createElement('div', 'video-info');
        const title = createElement('h3', '', video.name);
        
        info.appendChild(title);
        card.appendChild(img);
        card.appendChild(info);

        // 点击打开播放器
        card.addEventListener('click', () => openVideoModal(video));

        container.appendChild(card);
    });
}
