"use client";

import React, { useState, memo } from 'react';
import { Lightbulb } from 'lucide-react';
import { Handle, Position, NodeProps } from 'reactflow';
import { StoryNodeData } from './StoryNode';

/**
 * 큐레이션 본문. 안에 섞인 URL 만 링크로 만든다.
 * PC 노드 툴팁과 모바일 노트 시트가 같은 렌더링을 써야 해서 밖으로 뺐다.
 */
export const CurationText = ({ content }: { content?: string }) => {
    const text = content || '배치 의도가 기록되지 않았습니다.';
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    return (
        <>
            {text.split(urlRegex).map((part, i) =>
                part.match(urlRegex) ? (
                    <a
                        key={i}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4 decoration-2 decoration-indigo-500/50 transition-all cursor-pointer inline-block break-all"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {part}
                    </a>
                ) : part,
            )}
        </>
    );
};

/**
 * CurationNode component for displaying professional guidance notes on the map.
 * Replaces the old AnnotationNode.
 */
const CurationNode = ({ id, data, selected }: NodeProps<StoryNodeData>) => {
    const [showTooltip, setShowTooltip] = useState(false);

    // 핸들은 하나뿐이다. 앞/뒤 구분은 이쪽이 아니라 스토리 노드의 어느 코너에
    // 붙였는지로 정해진다 (상단 좌측 = 보기 전, 상단 우측 = 본 후).
    // 예전에는 위/아래 두 개를 뒀는데 원 바깥에 점 두 개가 뜨기만 했다.
    const handleClass = data.isAdmin
        ? '!w-3 !h-3 !bg-amber-400 !border-2 !border-slate-900 !opacity-100'
        : 'opacity-0 !pointer-events-none';

    // 앵커에 물린 큐레이션은 카드 모서리에 원의 1/4 이 겹친다. 이때 반투명이면
    // 카드가 비쳐 보여 지저분하다. 불투명하게 채워야 모서리가 파인 것처럼 읽힌다.
    const isAnchored = !!data.anchorSide;
    const tone = data.anchorSide === 'after'
        ? { solid: 'bg-sky-950 border-sky-400', text: 'text-sky-300' }      // 본 후
        : { solid: 'bg-amber-950 border-amber-400', text: 'text-amber-300' }; // 보기 전

    return (
        <div className="relative group w-24 h-24">

            {/* Curation Icon (Large & Glowing) */}
            <div
                onClick={(e) => {
                    if (data.isAdmin) {
                        // Let the event bubble up to StoryCanvas.onNodeClick
                        return;
                    }
                    e.stopPropagation();
                    setShowTooltip(!showTooltip);
                }}
                className={`
                    w-24 h-24 flex items-center justify-center rounded-full cursor-pointer transition-all duration-500
                    ${selected ? 'ring-4 ring-amber-400 scale-110 shadow-[0_0_60px_rgba(245,158,11,0.9)]' : 'hover:scale-110 shadow-[0_0_40px_rgba(245,158,11,0.6)]'}
                    ${data.isAdmin && data.unanchored ? 'ring-4 ring-rose-500 ring-dashed' : ''}
                    ${isAnchored ? tone.solid : 'bg-amber-500/20 border-amber-500 backdrop-blur-md'}
                    border-2 ${tone.text} relative overflow-visible
                `}
            >
                {/* Pulsing Outer Glow */}
                {!isAnchored && <div className="absolute inset-0 rounded-full animate-pulse bg-amber-500/20 -z-10 scale-150" />}

                <Lightbulb size={isAnchored ? 40 : 54} className="drop-shadow-[0_0_15px_rgba(245,158,11,0.6)]" />
            </div>

            {/* User Info Modal - Top Right View */}
            {showTooltip && (
                <div
                    className="absolute bottom-[130%] left-0 z-[1000] w-[650px] bg-slate-950/95 border-4 border-amber-500/40 rounded-[40px] shadow-[0_0_80px_rgba(0,0,0,0.9)] p-12 backdrop-blur-3xl animate-in fade-in slide-in-from-bottom-6 origin-bottom-left nodrag nopan cursor-pointer"
                    onClick={() => setShowTooltip(false)}
                >
                    <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-amber-500 animate-pulse shadow-[0_0_20px_rgba(245,158,11,0.8)]" />
                            <span className="text-[14px] font-black text-amber-500 uppercase tracking-[0.3em]">GUIDE NOTE</span>
                        </div>
                    </div>
                    <div
                        className="text-[26px] text-slate-100 leading-[1.5] font-black italic opacity-100 drop-shadow-lg cursor-text break-words whitespace-pre-wrap select-text"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <CurationText content={data.content} />
                    </div>
                    <div
                        className="mt-8 text-[12px] text-center text-amber-500/40 font-black uppercase tracking-[0.4em] border-t border-white/10 pt-6 hover:text-amber-500 transition-colors"
                    >
                        CLICK ANYWHERE TO DISMISS
                    </div>
                    {/* Arrow/Pointer to icon */}
                    <div className="absolute -bottom-3 left-10 w-6 h-6 bg-slate-950 border-r-4 border-b-4 border-amber-500/40 rotate-45" />
                </div>
            )}

            <Handle type="source" position={Position.Bottom} id="anchor" className={handleClass} />
        </div>
    );
};

export default memo(CurationNode);
