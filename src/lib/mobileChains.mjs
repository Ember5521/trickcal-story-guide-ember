const isChainStory = type => ['main', 'theme', 'theme_x', 'theme_now'].includes(type);

/** 모바일의 메인·테마 흐름에 실제로 표시할 연결 구간. */
export function mobileChainPairs(nodes, edges) {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const pairs = [];
    const seen = new Set();
    for (const edge of edges) {
        if (edge.data?.mobileChain !== true) continue;
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        if (!source || !target || !isChainStory(source.data.type) || !isChainStory(target.data.type)) continue;
        const key = `${source.id}:${target.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ source, target });
    }
    return pairs;
}

/** 두 끝 사이의 모든 메인·테마 카드를 순서대로 연결하거나 해제한다. */
export function toggleMobileChain(edges, nodes, first, second, id) {
    if (!isChainStory(first.data.type) || !isChainStory(second.data.type)) {
        throw new Error('메인 스토리나 테마극장 노드를 선택하세요.');
    }
    const ordered = nodes.filter(node => isChainStory(node.data.type))
        .sort((a, b) => a.rowIndex - b.rowIndex || a.colIndex - b.colIndex);
    const firstIndex = ordered.findIndex(node => node.id === first.id);
    const secondIndex = ordered.findIndex(node => node.id === second.id);
    if (firstIndex < 0 || secondIndex < 0 || firstIndex === secondIndex) return edges;
    const from = Math.min(firstIndex, secondIndex);
    const to = Math.max(firstIndex, secondIndex);
    const pairs = ordered.slice(from, to).map((node, index) => [node.id, ordered[from + index + 1].id]);
    const existing = (source, target) => edges.find(edge => edge.data?.mobileChain === true && edge.source === source && edge.target === target);
    if (pairs.every(([source, target]) => existing(source, target))) {
        const removed = new Set(pairs.map(([source, target]) => existing(source, target).id));
        return edges.filter(edge => !removed.has(edge.id));
    }
    return [...edges, ...pairs.flatMap(([source, target], index) => existing(source, target) ? [] : [{
        id: `${id}_${index}`, source, target, data: { mobileChain: true }
    }])];
}
