// =============================================================
// JY's ASMR · 用户数据层
// 目标：1000+ 用户的收藏/历史/播放列表可跨设备同步
//
// 策略：
//   1. localStorage 本地缓存（默认，开箱即用）
//   2. 可选云端同步（配置 window.JYS_CLOUD_API 后启用）
//   3. 导出/导入 JSON（无后端时的保底方案）
//
// 云端协议（Cloudflare Workers + KV 免费版即可承载 1000+ 用户）：
//   GET  {api}/data/{userId}  -> { "ok": true, "data": {...} } | { "ok": false }
//   PUT  {api}/data/{userId}  body: { data: {...} } -> { "ok": true }
// =============================================================

const UserData = {
    KEYS: {
        theme: 'jys_theme',
        favorites: 'jys_favorites',
        history: 'jys_history',
        playlist: 'jys_playlist',
        filtersOpen: 'jys_filters_open',
        userId: 'jys_uid',
    },

    // 云端写入节流计时器
    _cloudTimer: null,
    _dirty: false,

    // ---------------- 本地 ----------------
    lsGet(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw == null ? fallback : JSON.parse(raw);
        } catch (e) {
            return fallback;
        }
    },

    lsSet(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) { /* 私密模式忽略 */ }
        this.markDirty();
    },

    // ---------------- 用户 ID（同步码） ----------------
    getUserId() {
        let uid = this.lsGet(this.KEYS.userId, null);
        if (!uid) {
            uid = 'u_' + this._randHex(12);
            this.lsSetRaw(this.KEYS.userId, uid);
        }
        return uid;
    },

    setUserId(uid) {
        uid = String(uid || '').trim();
        if (!uid) return false;
        this.lsSetRaw(this.KEYS.userId, uid);
        return true;
    },

    lsSetRaw(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {}
    },

    _randHex(n) {
        const bytes = new Uint8Array(Math.ceil(n / 2));
        (window.crypto || window.msCrypto).getRandomValues(bytes);
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, n);
    },

    // ---------------- 打包 / 解包 ----------------
    pack() {
        return {
            version: 1,
            updatedAt: Date.now(),
            favorites: this.lsGet(this.KEYS.favorites, []),
            history: this.lsGet(this.KEYS.history, []),
            playlist: this.lsGet(this.KEYS.playlist, []),
            theme: this.lsGet(this.KEYS.theme, 'dark'),
        };
    },

    unpack(data) {
        if (!data || typeof data !== 'object') return false;
        try {
            if (Array.isArray(data.favorites)) this.lsSetRaw(this.KEYS.favorites, data.favorites);
            if (Array.isArray(data.history)) this.lsSetRaw(this.KEYS.history, data.history);
            if (Array.isArray(data.playlist)) this.lsSetRaw(this.KEYS.playlist, data.playlist);
            if (data.theme) this.lsSetRaw(this.KEYS.theme, data.theme);
            return true;
        } catch (e) {
            return false;
        }
    },

    // ---------------- 导出 / 导入 ----------------
    exportJson() {
        return JSON.stringify({
            app: 'jys-asmr',
            userId: this.getUserId(),
            ...this.pack(),
        }, null, 2);
    },

    importJson(text) {
        let obj;
        try {
            obj = JSON.parse(text);
        } catch (e) {
            return { ok: false, error: 'JSON 解析失败' };
        }
        if (obj.app && obj.app !== 'jys-asmr') {
            return { ok: false, error: '不是本站导出的文件' };
        }
        // 兼容直接是 pack 的情况
        const data = obj.data || obj;
        const ok = this.unpack(data);
        return ok ? { ok: true } : { ok: false, error: '数据格式不正确' };
    },

    // ---------------- 云端同步 ----------------
    get apiBase() {
        return (window.JYS_CLOUD_API || '').replace(/\/$/, '');
    },

    get cloudEnabled() {
        return !!this.apiBase;
    },

    markDirty() {
        this._dirty = true;
        if (!this.cloudEnabled) return;
        clearTimeout(this._cloudTimer);
        this._cloudTimer = setTimeout(() => this.pushToCloud(), 1500);
    },

    async pushToCloud() {
        if (!this.cloudEnabled) return { ok: false, error: '云端未配置' };
        const uid = this.getUserId();
        const payload = this.pack();
        try {
            const res = await fetch(`${this.apiBase}/data/${encodeURIComponent(uid)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: payload }),
            });
            const json = await res.json().catch(() => ({}));
            if (res.ok && json.ok !== false) {
                this._dirty = false;
                return { ok: true };
            }
            return { ok: false, error: json.error || res.status };
        } catch (e) {
            return { ok: false, error: String(e) };
        }
    },

    async pullFromCloud() {
        if (!this.cloudEnabled) return { ok: false, error: '云端未配置' };
        const uid = this.getUserId();
        try {
            const res = await fetch(`${this.apiBase}/data/${encodeURIComponent(uid)}`, {
                headers: { 'Accept': 'application/json' },
            });
            if (res.status === 404) return { ok: true, empty: true };
            const json = await res.json();
            if (!json || json.ok === false) return { ok: false, error: json && json.error };
            if (json.data) {
                // 取「较新的一份」合并
                const local = this.pack();
                const remoteTs = json.data.updatedAt || 0;
                const localTs = local.updatedAt || 0;
                if (remoteTs >= localTs) {
                    this.unpack(json.data);
                    return { ok: true, applied: 'remote' };
                }
                // 本地更新则推送
                await this.pushToCloud();
                return { ok: true, applied: 'local' };
            }
            return { ok: true, empty: true };
        } catch (e) {
            return { ok: false, error: String(e) };
        }
    },

    // ---------------- 一键换设备 ----------------
    // 生成短码（把 uid 的一部分做成易读形式）
    getSyncCode() {
        return this.getUserId().replace(/^u_/, '').toUpperCase();
    },

    applySyncCode(code) {
        code = String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (code.length < 8) return false;
        return this.setUserId('u_' + code);
    },
};

// 暴露到全局，便于调试与未来扩展
window.UserData = UserData;
