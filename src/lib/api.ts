/**
 * Cloudflare Worker API 클라이언트.
 *
 * 이 앱은 정적 export라 서버가 없다. 데이터(D1)와 이미지(R2)는 모두 이 Worker
 * 뒤에 있고, 브라우저는 여기로만 말을 건다.
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'https://trickcal-story-guide.kms15369.workers.dev')
    .replace(/\/$/, '');

const TOKEN_KEY = 'admin_token';

// ---------------------------------------------------------------- 이미지

/**
 * D1에는 'nodes/2/1769354330180.webp' 같은 상대 경로가 저장돼 있다.
 * 절대 URL을 저장하지 않으므로 서빙 호스트를 바꿔도 데이터를 건드릴 필요가 없다.
 */
export const imageUrl = (key?: string | null): string =>
    key ? `${API_BASE}/img/${key}` : '';

// ---------------------------------------------------------------- 세션

export const getToken = (): string | null =>
    typeof window === 'undefined' ? null : sessionStorage.getItem(TOKEN_KEY);

export const setToken = (t: string | null): void => {
    if (typeof window === 'undefined') return;
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
};

// ---------------------------------------------------------------- 공통

async function call<T>(path: string, init: RequestInit = {}, auth = false): Promise<T> {
    const headers = new Headers(init.headers);
    if (auth) {
        const token = getToken();
        if (!token) throw new Error('관리자 세션이 없습니다. 다시 로그인해 주세요.');
        headers.set('Authorization', `Bearer ${token}`);
    }
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

    const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

    if (res.status === 401 && auth) {
        setToken(null);                       // 만료된 토큰은 즉시 버린다
        throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
    }
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error || `요청 실패 (${res.status})`);
    }
    return res.json() as Promise<T>;
}

// ---------------------------------------------------------------- 타입

export interface MasterStory {
    id: string;
    label: string;
    type: string;
    image: string;
    youtube_url: string;
    full_video_url: string | null;
    protagonist: string;
    part_label: string;
    split_type: string;
    importance: number;
    created_at: string;
    updated_at: string;
}

export interface LayoutNode {
    id: string;
    type?: string;
    story_id?: string;
    x?: number; y?: number; w?: number; h?: number;
    m_x?: number; m_y?: number;
    splitType?: string;
    content?: string;
}

export interface LayoutResponse {
    nodes: LayoutNode[];
    edges: any[];
    stories: MasterStory[];
}

export interface AppUpdate {
    id: number;
    content: string;
    updated_at: string;
}

// ---------------------------------------------------------------- 공개 읽기

/** 레이아웃과 그것이 참조하는 스토리를 한 번에 받는다 (Worker가 조인해서 보냄). */
export const fetchLayout = (view: string, season: number): Promise<LayoutResponse> =>
    call<LayoutResponse>(`/api/layout?view=${encodeURIComponent(view)}&season=${season}`);

export const fetchUpdates = (): Promise<AppUpdate[]> => call<AppUpdate[]>('/api/updates');

// ---------------------------------------------------------------- 관리자

export async function login(password: string): Promise<void> {
    const { token } = await call<{ token: string; expiresAt: number }>(
        '/api/login', { method: 'POST', body: JSON.stringify({ password }) },
    );
    setToken(token);
}

export const logout = (): void => setToken(null);

export const fetchAllStories = (): Promise<MasterStory[]> =>
    call<MasterStory[]>('/api/stories', {}, true);

export const fetchImageKeys = (): Promise<string[]> =>
    call<string[]>('/api/images', {}, true);

export const saveLayout = (view: string, season: number, nodes: unknown[], edges: unknown[]): Promise<{ ok: true }> =>
    call('/api/layout', { method: 'POST', body: JSON.stringify({ view, season, nodes, edges }) }, true);

export const saveStory = (story: Partial<MasterStory> & { id?: string }): Promise<{ id: string }> =>
    call('/api/story', { method: 'POST', body: JSON.stringify(story) }, true);

export const saveUpdateLog = (content: string): Promise<{ ok: true }> =>
    call('/api/update-log', { method: 'POST', body: JSON.stringify({ content }) }, true);

export async function uploadImage(file: File, season: number): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    form.append('season', String(season));
    const { key } = await call<{ key: string }>('/api/image', { method: 'POST', body: form }, true);
    return key;
}
