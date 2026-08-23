/**
 * 큐레이션 노드가 어느 스토리 노드에 붙는지, 그 앞인지 뒤인지 정한다.
 *
 * PC 는 좌표로 큐레이션을 대상 옆에 놓지만 모바일은 자동 배치라 그 근접성이
 * 사라진다. 그래서 붙는 자리를 엣지로 명시한다.
 *
 * 앞/뒤는 엣지 방향이 아니라 **스토리 노드의 어느 코너 핸들에 붙였는지**로
 * 정한다. 화살표 방향은 화면에서 잘 안 보이지만 위치는 보인다.
 *
 *   상단 좌측 (topLeft)  : 이 스토리를 보기 전에 읽을 것   -> 'before'
 *   상단 우측 (topRight) : 본 뒤에 읽을 것                -> 'after'
 *
 * 앵커가 없으면 null. 모바일은 그런 큐레이션을 그리지 않고, PC 관리자 화면이
 * 붉은 테두리로 표시한다.
 */
export function resolveAnchor(curationId, edges, isStoryNode) {
    for (const e of edges) {
        // 큐레이션이 어느 끝에 있든 받는다. ConnectionMode.Loose 라 관리자가
        // 어느 쪽에서 끌어도 연결되기 때문이다.
        let anchorId, handle;
        if (e.source === curationId && isStoryNode(e.target)) {
            anchorId = e.target; handle = e.targetHandle;
        } else if (e.target === curationId && isStoryNode(e.source)) {
            anchorId = e.source; handle = e.sourceHandle;
        } else {
            continue;
        }

        return { anchorId, side: handle === 'topRight' ? 'after' : 'before' };
    }

    return null;
}
