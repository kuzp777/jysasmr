// =============================================================
// JY's ASMR · 用户数据云端同步（Cloudflare Workers + D1）
//
// 为什么用 D1 而不是 KV：
//   D1 免费额度：每天 10 万行写入 · 500 万行读取 · 5GB 存储
//   KV  免费额度：每天仅 1,000 次写入（1000 用户会互相抢）
//
// 部署步骤（免费版即可承载 1000+ 用户）：
//   1. npm install -g wrangler
//   2. wrangler login
//   3. wrangler d1 create jys-users
//      把输出的 database_id 填到 wrangler.toml
//   4. wrangler d1 execute jys-users --file=schema.sql
//   5. wrangler deploy
//
// API：
//   GET  /data/:userId   → { ok:true, data } | { ok:true, empty:true } | { ok:false, error }
//   PUT  /data/:userId   → { ok:true } | { ok:false, error }
//   GET  /health         → { ok:true, users? }
// =============================================================

const MAX_BODY = 64 * 1024; // 64KB
const USER_RE = /^u_[a-z0-9]{8,32}$/i;

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

function json(status, obj) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders() });
        }

        if (path === '/health') {
            try {
                const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
                return json(200, { ok: true, ts: Date.now(), users: row ? row.n : 0 });
            } catch (e) {
                return json(200, { ok: true, ts: Date.now(), users: null });
            }
        }

        const m = path.match(/^\/data\/([^/]+)$/);
        if (!m) {
            return json(404, { ok: false, error: 'not found' });
        }

        const userId = decodeURIComponent(m[1]);
        if (!USER_RE.test(userId)) {
            return json(400, { ok: false, error: 'invalid userId' });
        }

        // ---------- 读 ----------
        if (request.method === 'GET') {
            try {
                const row = await env.DB.prepare(
                    'SELECT data FROM users WHERE user_id = ?'
                ).bind(userId).first();

                if (!row || !row.data) {
                    return json(200, { ok: true, empty: true });
                }
                let data;
                try {
                    data = JSON.parse(row.data);
                } catch (e) {
                    return json(500, { ok: false, error: 'corrupt data' });
                }
                return json(200, { ok: true, data });
            } catch (e) {
                return json(500, { ok: false, error: 'db read failed' });
            }
        }

        // ---------- 写 ----------
        if (request.method === 'PUT') {
            let body;
            try {
                const text = await request.text();
                if (text.length > MAX_BODY) {
                    return json(413, { ok: false, error: 'payload too large' });
                }
                body = JSON.parse(text);
            } catch (e) {
                return json(400, { ok: false, error: 'invalid json' });
            }

            const data = body && body.data;
            if (!data || typeof data !== 'object') {
                return json(400, { ok: false, error: 'missing data' });
            }

            data.updatedAt = Date.now();
            const payload = JSON.stringify(data);
            if (payload.length > MAX_BODY) {
                return json(413, { ok: false, error: 'data too large' });
            }

            try {
                await env.DB.prepare(
                    `INSERT INTO users (user_id, data, updated_at)
                     VALUES (?, ?, ?)
                     ON CONFLICT(user_id) DO UPDATE SET
                       data = excluded.data,
                       updated_at = excluded.updated_at`
                ).bind(userId, payload, data.updatedAt).run();
                return json(200, { ok: true });
            } catch (e) {
                return json(500, { ok: false, error: 'db write failed' });
            }
        }

        return json(405, { ok: false, error: 'method not allowed' });
    },
};
