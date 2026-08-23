/**
 * 큐레이션 노드가 어느 스토리 노드에 붙는지, 그 앞인지 뒤인지 정한다.
 *
 * PC 는 좌표로 큐레이션을 대상 옆에 놓지만 모바일은 자동 배치라 그 근접성이
 * 사라진다. 그래서 붙는 자리를 엣지로 명시하고, 엣지 방향에 의미를 준다:
 *
 *   큐레이션 -> 노드 : 그 노드를 보기 전에 읽을 것   (side 'before')
 *   노드 -> 큐레이션 : 본 뒤에 읽을 것              (side 'after')
 *
 * 앵커가 없으면 null. 모바일은 그런 큐레이션을 그리지 않고, PC 관리자 화면이
 * 붉은 테두리로 표시한다.
 *
 * 양쪽이 다 있으면 'before' 를 택한다. 둘 다 그리면 같은 노트가 두 번 뜬다.
 */
export function resolveAnchor(curationId, edges, isStoryNode) {
    const before = edges.find(e => e.source === curationId && isStoryNode(e.target));
    if (before) return { anchorId: before.target, side: 'before' };

    const after = edges.find(e => e.target === curationId && isStoryNode(e.source));
    if (after) return { anchorId: after.source, side: 'after' };

    return null;
}
