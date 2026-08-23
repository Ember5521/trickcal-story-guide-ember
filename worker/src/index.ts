/**
 * trickcal-story-guide API
 *
 * GitHub Pages에 있는 정적 앱이 유일하게 말을 거는 대상. D1(노드 데이터)과
 * R2(이미지)는 이 Worker 뒤에만 존재하며 바깥에 직접 노출되지 않는다.
 *
 * 이 구조가 곧 요금 안전장치다. R2 버킷이 비공개라 이미지에 닿는 경로가
 * Worker뿐이고, Workers 무료 플랜은 한도를 넘기면 과금 대신 요청을 거부한다.
 * 따라서 Worker가 먼저 끊기고 R2는 무료 한도에 닿지 못한다.
 * (전제: Workers를 유료로 올리지 말 것, 버킷을 public으로 만들지 말 것)
 */

export interface Env {
    DB: D1Database;
    IMAGES: R2Bucket;
    ADMIN_PASSWORD: string;
}

// 앱이 올라가는 출처만 허용한다. '*' 로 열면 임의의 사이트가 이 Worker를 통해
// 이미지를 끌어다 쓸 수 있고, 그만큼 무료 요청 한도가 남의 트래픽에 소모된다.
const ALLOWED_ORIGINS = [
    'https://ember5521.github.io',
    'http://localhost:3000',
];

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;   // 8시간
const LOGIN_WINDOW_MS = 15 * 60 * 1000;      // 실패 횟수를 세는 창
const LOGIN_MAX_FAILS = 10;                  // 창 안에서 이만큼 틀리면 잠금
const LOCKOUT_MS = 15 * 60 * 1000;

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
    'image/webp': 'webp',
    'image/png': 'png',
    'image/jpeg': 'jpg',
};

// ---------------------------------------------------------------- helpers

function corsHeaders(origin: string | null): Record<string, string> {
    const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
    };
}

function json(body: unknown, init: ResponseInit = {}, origin: string | null = null): Response {
    return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin), ...(init.headers || {}) },
    });
}

const bad = (msg: string, status: number, origin: string | null) =>
    json({ error: msg }, { status }, origin);

/** 길이와 내용 모두에서 조기 반환하지 않는 비교. 타이밍으로 비밀번호를 흘리지 않기 위함. */
function timingSafeEqual(a: string, b: string): boolean {
    const ab = new TextEncoder().encode(a);
    const bb = new TextEncoder().encode(b);
    let diff = ab.length ^ bb.length;
    const len = Math.max(ab.length, bb.length);
    for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
    return diff === 0;
}

// ---------------------------------------------------------------- auth

async function hmacKey(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
    );
}

const b64url = (buf: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** 토큰은 만료시각만 담고 비밀번호로 서명한다. 비밀번호를 바꾸면 기존 세션이 전부 무효가 된다. */
async function issueToken(env: Env): Promise<{ token: string; expiresAt: number }> {
    const expiresAt = Date.now() + SESSION_TTL_MS;
    const payload = b64url(new TextEncoder().encode(String(expiresAt)));
    const sig = await crypto.subtle.sign('HMAC', await hmacKey(env.ADMIN_PASSWORD), new TextEncoder().encode(payload));
    return { token: `${payload}.${b64url(sig)}`, expiresAt };
}

async function verifyToken(env: Env, token: string | null): Promise<boolean> {
    if (!token) return false;
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return false;

    const expected = b64url(
        await crypto.subtle.sign('HMAC', await hmacKey(env.ADMIN_PASSWORD), new TextEncoder().encode(payload)),
    );
    if (!timingSafeEqual(sig, expected)) return false;

    const expiresAt = Number(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return Number.isFinite(expiresAt) && Date.now() < expiresAt;
}

const bearer = (req: Request) => req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null;

async function requireAdmin(req: Request, env: Env): Promise<boolean> {
    return verifyToken(env, bearer(req));
}

// ---------------------------------------------------------------- rate limit

async function checkLockout(env: Env, ip: string): Promise<number> {
    const row = await env.DB.prepare('SELECT locked_until FROM login_attempts WHERE ip = ?')
        .bind(ip).first<{ locked_until: number }>();
    const until = row?.locked_until ?? 0;
    return until > Date.now() ? until : 0;
}

async function recordFailure(env: Env, ip: string): Promise<void> {
    const now = Date.now();
    const row = await env.DB.prepare('SELECT fail_count, window_start FROM login_attempts WHERE ip = ?')
        .bind(ip).first<{ fail_count: number; window_start: number }>();

    // 창이 지났으면 카운트를 새로 시작한다.
    const inWindow = row && now - row.window_start < LOGIN_WINDOW_MS;
    const count = inWindow ? row.fail_count + 1 : 1;
    const windowStart = inWindow ? row.window_start : now;
    const lockedUntil = count >= LOGIN_MAX_FAILS ? now + LOCKOUT_MS : 0;

    await env.DB.prepare(
        'INSERT INTO login_attempts (ip, fail_count, window_start, locked_until) VALUES (?, ?, ?, ?)'
        + ' ON CONFLICT(ip) DO UPDATE SET fail_count = ?, window_start = ?, locked_until = ?',
    ).bind(ip, count, windowStart, lockedUntil, count, windowStart, lockedUntil).run();
}

const clearFailures = (env: Env, ip: string) =>
    env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();

// ---------------------------------------------------------------- routes

async function getLayout(env: Env, url: URL, origin: string | null): Promise<Response> {
    const view = url.searchParams.get('view') ?? '';
    const season = Number(url.searchParams.get('season'));
    if (!view || !Number.isInteger(season)) return bad('view, season 필요', 400, origin);

    const layout = await env.DB
        .prepare('SELECT nodes, edges FROM story_layouts WHERE view_type = ? AND season = ?')
        .bind(view, season).first<{ nodes: string; edges: string }>();

    if (!layout) return json({ nodes: [], edges: [], stories: [] }, {}, origin);

    const nodes = JSON.parse(layout.nodes) as Array<{ story_id?: string; type?: string }>;
    const ids = [...new Set(nodes.filter(n => n.story_id).map(n => n.story_id!))];

    // 레이아웃이 참조하는 스토리만 골라 보낸다. 전체를 보내면 페이로드가 불필요하게 커진다.
    let stories: unknown[] = [];
    if (ids.length) {
        const placeholders = ids.map(() => '?').join(',');
        const res = await env.DB.prepare(`SELECT * FROM master_stories WHERE id IN (${placeholders})`)
            .bind(...ids).all();
        stories = res.results;
    }

    return json({ nodes, edges: JSON.parse(layout.edges), stories }, {}, origin);
}

async function serveImage(req: Request, env: Env, key: string, ctx: ExecutionContext): Promise<Response> {
    if (!key || key.includes('..')) return new Response('bad key', { status: 400 });

    // 엣지 캐시를 먼저 본다. 기존 워커가 빠뜨렸던 부분이고, R2 읽기 횟수를 줄인다.
    const cache = caches.default;
    const cached = await cache.match(req);
    if (cached) return cached;

    const obj = await env.IMAGES.get(key);
    if (!obj) return new Response('not found', { status: 404 });

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('etag', obj.httpEtag);
    // 키에 타임스탬프가 들어 있어 내용이 바뀌면 키도 바뀐다. 따라서 immutable 이 안전하다.
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Access-Control-Allow-Origin', '*');

    const res = new Response(obj.body, { headers });
    ctx.waitUntil(cache.put(req, res.clone()));
    return res;
}

async function login(req: Request, env: Env, origin: string | null): Promise<Response> {
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';

    const lockedUntil = await checkLockout(env, ip);
    if (lockedUntil) {
        const mins = Math.ceil((lockedUntil - Date.now()) / 60000);
        return bad(`시도 횟수 초과. ${mins}분 후 다시 시도하세요.`, 429, origin);
    }

    const { password } = await req.json<{ password?: string }>();
    if (!password || !timingSafeEqual(password, env.ADMIN_PASSWORD)) {
        await recordFailure(env, ip);
        return bad('인증 실패', 401, origin);
    }

    await clearFailures(env, ip);
    return json(await issueToken(env), {}, origin);
}

async function saveLayout(req: Request, env: Env, origin: string | null): Promise<Response> {
    const { view, season, nodes, edges } = await req.json<{
        view?: string; season?: number; nodes?: unknown[]; edges?: unknown[];
    }>();
    if (!view || !Number.isInteger(season) || !Array.isArray(nodes) || !Array.isArray(edges))
        return bad('view, season, nodes, edges 필요', 400, origin);

    await env.DB.prepare(
        'INSERT INTO story_layouts (view_type, season, nodes, edges, updated_at) VALUES (?, ?, ?, ?, ?)'
        + ' ON CONFLICT(view_type, season) DO UPDATE SET nodes = ?, edges = ?, updated_at = ?',
    ).bind(
        view, season, JSON.stringify(nodes), JSON.stringify(edges), new Date().toISOString(),
        JSON.stringify(nodes), JSON.stringify(edges), new Date().toISOString(),
    ).run();

    return json({ ok: true }, {}, origin);
}

async function saveStory(req: Request, env: Env, origin: string | null): Promise<Response> {
    const b = await req.json<Record<string, any>>();
    const now = new Date().toISOString();
    const fields = {
        label: b.label ?? '',
        type: b.type ?? 'main',
        image: b.image ?? '',
        youtube_url: b.youtube_url ?? '',
        full_video_url: b.full_video_url ?? null,
        protagonist: b.protagonist ?? '',
        part_label: b.part_label ?? '',
        split_type: b.split_type ?? 'none',
        importance: Number(b.importance) || 0,
        content: b.content ?? '',
    };
    // 아래 두 쿼리는 Object.values(fields) 를 위치 인자로 넘긴다.
    // fields 에 키를 추가하면 두 SQL 의 컬럼 순서도 같이 고쳐야 한다.

    if (b.id) {
        await env.DB.prepare(
            'UPDATE master_stories SET label=?, type=?, image=?, youtube_url=?, full_video_url=?,'
            + ' protagonist=?, part_label=?, split_type=?, importance=?, content=?, updated_at=? WHERE id=?',
        ).bind(...Object.values(fields), now, b.id).run();
        return json({ id: b.id }, {}, origin);
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(
        'INSERT INTO master_stories (id, label, type, image, youtube_url, full_video_url,'
        + ' protagonist, part_label, split_type, importance, content, created_at, updated_at)'
        + ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(id, ...Object.values(fields), now, now).run();
    return json({ id }, {}, origin);
}

async function uploadImage(req: Request, env: Env, origin: string | null): Promise<Response> {
    const form = await req.formData();
    const season = Number(form.get('season')) || 1;

    // workers-types 의 FormDataEntryValue 에 File 이 없어 구조적 타입으로 받는다.
    type Uploaded = { size: number; type: string; stream(): ReadableStream };
    const file = form.get('file') as unknown as Uploaded | null;
    if (!file || typeof file === 'string' || typeof file.stream !== 'function')
        return bad('file 필요', 400, origin);
    if (file.size > MAX_UPLOAD_BYTES) return bad(`파일이 너무 큼 (최대 ${MAX_UPLOAD_BYTES / 1048576}MB)`, 413, origin);

    const ext = ALLOWED_UPLOAD_TYPES[file.type];
    if (!ext) return bad(`허용되지 않는 형식: ${file.type}`, 415, origin);

    const key = `nodes/${season}/${Date.now()}.${ext}`;
    await env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    return json({ key }, {}, origin);
}

// ---------------------------------------------------------------- entry

export default {
    async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(req.url);
        const origin = req.headers.get('Origin');
        const p = url.pathname;

        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

        // 빈 secret으로 HMAC 키를 만들면 crypto가 예외를 던져 원인이 500에 묻힌다.
        // (비대화형 셸에서 `wrangler secret put` 이 값을 못 받고 빈 값을 올리는 일이 실제로 있었다.)
        const needsAuth = p === '/api/login' || (p.startsWith('/api/') && p !== '/api/layout' && p !== '/api/updates')
            || (p === '/api/layout' && req.method === 'POST');
        if (needsAuth && !env.ADMIN_PASSWORD) {
            return bad('ADMIN_PASSWORD secret이 설정되지 않았습니다.', 503, origin);
        }

        try {
            // --- 공개 ---
            if (p.startsWith('/img/')) return serveImage(req, env, decodeURIComponent(p.slice(5)), ctx);

            if (p === '/api/layout' && req.method === 'GET') return getLayout(env, url, origin);

            if (p === '/api/updates' && req.method === 'GET') {
                const res = await env.DB.prepare('SELECT * FROM app_updates ORDER BY updated_at DESC LIMIT 1').all();
                return json(res.results, {}, origin);
            }

            if (p === '/api/login' && req.method === 'POST') return login(req, env, origin);

            // --- 관리자 ---
            if (p.startsWith('/api/')) {
                if (!(await requireAdmin(req, env))) return bad('인증 필요', 401, origin);

                if (p === '/api/layout' && req.method === 'POST') return saveLayout(req, env, origin);
                if (p === '/api/story' && req.method === 'POST') return saveStory(req, env, origin);
                if (p === '/api/image' && req.method === 'POST') return uploadImage(req, env, origin);

                if (p === '/api/stories' && req.method === 'GET') {
                    const res = await env.DB.prepare('SELECT * FROM master_stories ORDER BY updated_at DESC').all();
                    return json(res.results, {}, origin);
                }

                if (p === '/api/images' && req.method === 'GET') {
                    const listed = await env.IMAGES.list({ prefix: 'nodes/', limit: 1000 });
                    const keys = listed.objects.map(o => o.key).sort().reverse();
                    return json(keys, {}, origin);
                }

                if (p === '/api/update-log' && req.method === 'POST') {
                    const { content } = await req.json<{ content?: string }>();
                    await env.DB.prepare(
                        'INSERT INTO app_updates (id, content, updated_at) VALUES (1, ?, ?)'
                        + ' ON CONFLICT(id) DO UPDATE SET content = ?, updated_at = ?',
                    ).bind(content ?? '', new Date().toISOString(), content ?? '', new Date().toISOString()).run();
                    return json({ ok: true }, {}, origin);
                }
            }

            return bad('not found', 404, origin);
        } catch (err: any) {
            console.error(err?.stack ?? err);
            return bad('서버 오류', 500, origin);
        }
    },
} satisfies ExportedHandler<Env>;
