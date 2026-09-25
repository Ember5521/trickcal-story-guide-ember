/**
 * 관리자 되돌리기용 스냅샷 스택.
 *
 * PC(StoryCanvas)와 모바일(MobileCanvas)이 같은 규칙을 쓴다. 노드 모양이 서로
 * 달라서 "무엇이 바뀌면 한 단계인가"를 정하는 서명 함수만 각자 넘긴다.
 *
 * 한 단계 = 사용자 동작 하나다. 드래그 한 번, 리사이즈 한 번, 삭제 한 번.
 * 드래그/리사이즈는 진행 중에 상태가 수십 번 갱신되므로 호출부가 `inGesture`로
 * "아직 손 안 뗐다"를 알려준다. 그 구간은 통째로 한 단계로 묶인다.
 *
 * 되돌리기 대상은 **배치뿐**이다. 제목/이미지 같은 마스터 스토리 내용은 폼에서
 * 곧바로 D1에 저장되므로 여기서 되돌릴 수 없다.
 *
 * .ts가 아니라 .mjs인 이유: 이 파일만 따로 `node scripts/test-undo.mjs`로
 * 돌려서 검증한다. Node 20은 타입 스트립을 못 한다.
 */

/**
 * @template T
 * @typedef {{ history: T[], prev: T | null, gestureOpen: boolean }} UndoStack
 */

/**
 * @template T
 * @returns {UndoStack<T>}
 */
export const createUndoStack = () => ({ history: [], prev: null, gestureOpen: false });

/**
 * 바뀐 상태를 반영한다. 새 단계가 시작될 때만 직전 상태를 스택에 쌓는다.
 *
 * @template T
 * @param {UndoStack<T>} stack
 * @param {T} next 지금 화면 상태
 * @param {(v: T) => string} signature
 * @param {boolean} [inGesture] 드래그/리사이즈가 아직 진행 중인가
 * @param {number} [limit]
 */
export function record(stack, next, signature, inGesture = false, limit = 50) {
    // 첫 호출은 기준선만 잡는다. 이걸 쌓으면 되돌리기가 빈 캔버스로 가버린다.
    if (stack.prev === null) {
        stack.prev = next;
        return;
    }
    if (signature(stack.prev) === signature(next)) return;

    if (stack.gestureOpen) {
        // 진행 중인 동작의 중간 상태. 새 단계가 아니라 열려 있는 단계에 흡수한다.
        // 마지막 갱신(손 뗀 시점)은 inGesture가 false로 들어오므로 여기서 닫힌다.
        stack.prev = next;
        stack.gestureOpen = inGesture;
        return;
    }

    stack.history.push(stack.prev);
    if (stack.history.length > limit) stack.history.shift();
    stack.prev = next;
    stack.gestureOpen = inGesture;
}

/**
 * 직전 상태를 꺼낸다. 꺼낸 상태를 곧바로 기준선으로 삼기 때문에, 이걸 화면에
 * 반영해도 record가 다시 스냅샷으로 쌓지 않는다.
 *
 * @template T
 * @param {UndoStack<T>} stack
 * @returns {T | null}
 */
export function undo(stack) {
    const prev = stack.history.pop();
    if (prev === undefined) return null;
    stack.prev = prev;
    stack.gestureOpen = false;
    return prev;
}

/**
 * @template T
 * @param {UndoStack<T>} stack
 */
export const canUndo = (stack) => stack.history.length > 0;

/**
 * 되돌리기 한 단계로 칠 변화를 정하는 서명. 위치/크기/주석 내용만 본다.
 * 시청 여부나 검색 하이라이트 같은 건 배치가 아니므로 무시한다.
 *
 * @param {Array<{ id: string, position?: { x: number, y: number }, width?: number | null, height?: number | null, data?: Record<string, any> }>} nodes
 * @param {Array<{ source: string, target: string, data?: { required?: boolean } }>} [edges]
 */
export const layoutSignature = (nodes, edges = []) =>
    nodes
        .map((n) =>
            [
                n.id,
                Math.round(n.position?.x ?? 0),
                Math.round(n.position?.y ?? 0),
                n.width ?? '',
                n.height ?? '',
                n.data?.m_x ?? '',
                n.data?.m_y ?? '',
                n.data?.splitType ?? '',
                n.data?.content ?? '',
            ].join(':'),
        )
        .join('|') +
    '#' +
    edges.map((e) => `${e.source}>${e.target}:${e.data?.required === true ? 1 : 0}`).join('|');
