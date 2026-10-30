/**
 * 팬게임 목록 규칙. Worker 는 레이아웃 내용을 검사하지 않으므로 저장 전 검사가 여기 있다.
 *
 * .ts가 아니라 .mjs인 이유: `node scripts/test-fan-games.mjs`로 따로 돌려서 검증한다.
 */

export const MAX_FAN_GAMES = 50;
export const MAX_TITLE_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 120;

/**
 * 공개 페이지의 href 로 쓸 수 있는 주소만 돌려준다.
 * React 는 javascript: 주소를 막지 않으므로 렌더 직전에도 이 함수를 거친다.
 *
 * @param {string} [url]
 * @returns {string | null}
 */
export function safeLink(url) {
    try {
        const parsed = new URL((url ?? '').trim());
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
    } catch {
        return null;
    }
}

/**
 * 저장할 목록을 다듬는다. 모든 칸이 빈 행은 버리고, 잘못된 행이 있으면 error 를 돌려준다.
 *
 * @template {{ title: string, url: string, description: string, image: string }} T
 * @param {T[]} items
 * @returns {{ items: T[], error: string | null }}
 */
export function normalizeFanGames(items) {
    const clean = [];
    for (const item of items) {
        const title = item.title.trim();
        const rawUrl = item.url.trim();
        const description = item.description.trim();
        if (!title && !rawUrl && !description && !item.image) continue;

        if (!title) return { items: [], error: '게임 이름을 입력하세요.' };
        if (title.length > MAX_TITLE_LENGTH) return { items: [], error: `게임 이름은 ${MAX_TITLE_LENGTH}자 이하로 입력하세요.` };
        if (description.length > MAX_DESCRIPTION_LENGTH) return { items: [], error: `'${title}'의 설명은 ${MAX_DESCRIPTION_LENGTH}자 이하로 입력하세요.` };

        const url = safeLink(rawUrl);
        if (!url) return { items: [], error: `'${title}'의 링크는 http:// 또는 https:// 로 시작하는 전체 주소여야 합니다.` };

        clean.push({ ...item, title, url, description });
    }
    if (clean.length > MAX_FAN_GAMES) return { items: [], error: `팬게임은 최대 ${MAX_FAN_GAMES}개까지 등록할 수 있습니다.` };
    return { items: clean, error: null };
}
