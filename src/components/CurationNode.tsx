"use client";

import React, { useState, memo } from 'react';
import { Lightbulb, X, Save, Trash2 } from 'lucide-react';
import { Handle, Position, NodeProps } from 'reactflow';
import { StoryNodeData } from './StoryNode';

/**
 * CurationNode component for displaying professional guidance notes on the map.
 * Replaces the old AnnotationNode.
 */
const CurationNode = ({ id, data, selected }: NodeProps<StoryNodeData>) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempContent, setTempContent] = useState(data.content || '');
    const [showTooltip, setShowTooltip] = useState(false);

    const handleSave = (e: React.MouseEvent) => {
        e.stopPropagation();
        data.onUpdate?.(id, tempContent);
        setIsEditing(false);
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm("이 큐레이션 노트를 삭제할까요?")) {
            data.onDelete?.(id);
        }
    };

    return (
        <div className="relative group">
            <Handle type="target" position={Position.Top} className="opacity-0" />

            {/* Curation Icon (Large & Glowing) */}
            <div
                onClick={(e) => {
                    e.stopPropagation();
                    data.isAdmin ? setIsEditing(!isEditing) : setShowTooltip(!showTooltip);
                }}
                className={`
                    w-24 h-24 flex items-center justify-center rounded-full cursor-pointer transition-all duration-500
                    ${selected ? 'ring-4 ring-amber-400 scale-110 shadow-[0_0_60px_rgba(245,158,11,0.9)]' : 'hover:scale-110 shadow-[0_0_40px_rgba(245,158,11,0.6)]'}
                    bg-amber-500/20 border-2 border-amber-500 backdrop-blur-md
                    text-amber-400 relative overflow-visible
                `}
            >
                {/* Pulsing Outer Glow */}
                <div className="absolute inset-0 rounded-full animate-pulse bg-amber-500/20 -z-10 scale-150" />

                <Lightbulb size={54} className="drop-shadow-[0_0_15px_rgba(245,158,11,0.6)]" />
            </div>

            {/* Admin Editor Modal - Top Right View */}
            {data.isAdmin && isEditing && (
                <div className="absolute bottom-[120%] left-0 z-[1000] w-80 bg-slate-900 border-2 border-amber-500/50 rounded-3xl shadow-2xl p-5 animate-in fade-in slide-in-from-bottom-4 zoom-in-95 origin-bottom-left" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                            <Lightbulb size={18} className="text-amber-500" />
                            <span className="text-[12px] font-black text-amber-500 uppercase tracking-widest">Curation Editor</span>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleDelete} className="p-2 hover:bg-red-500/20 text-red-400 rounded-xl transition-colors" title="삭제"><Trash2 size={16} /></button>
                            <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-slate-800 text-slate-400 rounded-xl transition-colors"><X size={16} /></button>
                        </div>
                    </div>
                    <textarea
                        value={tempContent}
                        onChange={(e) => setTempContent(e.target.value)}
                        placeholder="큐레이션(배치 의도) 내용을 입력하세요..."
                        className="w-full h-40 bg-slate-950/50 border border-slate-800 rounded-2xl p-4 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-amber-500/30 resize-none mb-4 custom-scrollbar leading-relaxed"
                    />
                    <button
                        onClick={handleSave}
                        className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-black rounded-2xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 shadow-amber-900/20"
                    >
                        <Save size={16} /> 의도 저장하기
                    </button>
                    {/* Arrow/Pointer to icon */}
                    <div className="absolute -bottom-2 left-8 w-4 h-4 bg-slate-900 border-r-2 border-b-2 border-amber-500/50 rotate-45" />
                </div>
            )}

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
                        {data.isAdmin && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsEditing(true);
                                    setShowTooltip(false);
                                }}
                                className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black rounded-full transition-all border border-indigo-400/50 shadow-lg shadow-indigo-500/20 flex items-center gap-2"
                            >
                                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                EDIT CONTENT
                            </button>
                        )}
                    </div>
                    <div
                        className="text-[26px] text-slate-100 leading-[1.5] font-black italic opacity-100 drop-shadow-lg cursor-text break-words whitespace-pre-wrap select-text"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {(() => {
                            const content = data.content || '배치 의도가 기록되지 않았습니다.';
                            const urlRegex = /(https?:\/\/[^\s]+)/g;
                            const parts = content.split(urlRegex);

                            return parts.map((part, i) => {
                                if (part.match(urlRegex)) {
                                    return (
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
                                    );
                                }
                                return part;
                            });
                        })()}
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

            <Handle type="source" position={Position.Bottom} className="opacity-0" />
        </div>
    );
};

export default memo(CurationNode);
