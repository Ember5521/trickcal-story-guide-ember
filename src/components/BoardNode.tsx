"use client";

import { memo } from 'react';
import { NodeProps, NodeResizer } from 'reactflow';
import { CurationText } from './CurationNode';
import { StoryNodeData } from './StoryNode';

const BoardNode = ({ data, selected }: NodeProps<StoryNodeData>) => (
    <div className={`nowheel w-full h-full overflow-auto rounded-2xl border-4 border-sky-500/60 bg-slate-950 p-6 shadow-xl ${selected ? 'ring-4 ring-sky-400/50' : ''}`}>
        {data.isAdmin && <NodeResizer color="#38bdf8" minWidth={200} minHeight={120} isVisible={selected} />}
        <div className="mb-3 border-b border-sky-500/30 pb-3 text-lg font-black text-sky-300">{data.label || '게시판'}</div>
        <div className="whitespace-pre-wrap break-words text-2xl leading-relaxed text-slate-100 select-text nodrag">
            <CurationText content={data.content} />
        </div>
    </div>
);

export default memo(BoardNode);
