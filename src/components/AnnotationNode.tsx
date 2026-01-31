"use client";

import React, { useState } from 'react';
import { TriangleAlert, X, Save, Trash2 } from 'lucide-react';
import { Handle, Position, NodeProps } from 'reactflow';

export interface AnnotationNodeData {
    content?: string;
    isAdmin?: boolean;
    onDelete?: (id: string) => void;
    onUpdate?: (id: string, content: string) => void;
}

const AnnotationNode = ({ id, data, selected }: NodeProps<AnnotationNodeData>) => {
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
        if (confirm("이 주석을 삭제할까요?")) {
            data.onDelete?.(id);
        }
    };

    return (
        <div className="relative group">
            {/* 연결점은 없애기 위해 투명하게 처리하거나 최소화 */}
            <Handle type="target" position={Position.Top} className="opacity-0" />

            {/* 메인 버튼 (삼각형 느낌표) */}
            <div
                onClick={() => data.isAdmin ? setIsEditing(!isEditing) : setShowTooltip(!showTooltip)}
                className={`
                    w-16 h-16 flex items-center justify-center rounded-full cursor-pointer transition-all
                    ${selected ? 'ring-4 ring-yellow-400 scale-110' : 'hover:scale-110'}
                    bg-amber-500/20 border-2 border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.4)]
                    text-amber-500 backdrop-blur-sm
                `}
            >
                <TriangleAlert size={32} fill="currentColor" className="fill-amber-500/20" />
            </div>

            {/* 관리자 편집창 */}
            {data.isAdmin && isEditing && (
                <div className="absolute top-14 left-0 z-[1000] w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Developer Note</span>
                        <div className="flex gap-1">
                            <button onClick={handleDelete} className="p-1 hover:bg-red-500/20 text-red-400 rounded transition-colors"><Trash2 size={14} /></button>
                            <button onClick={() => setIsEditing(false)} className="p-1 hover:bg-slate-800 text-slate-400 rounded transition-colors"><X size={14} /></button>
                        </div>
                    </div>
                    <textarea
                        value={tempContent}
                        onChange={(e) => setTempContent(e.target.value)}
                        placeholder="주석 내용을 입력하세요..."
                        className="w-full h-24 bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 outline-none focus:ring-1 focus:ring-amber-500 resize-none mb-2"
                    />
                    <button
                        onClick={handleSave}
                        className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                        <Save size={12} /> 저장하기
                    </button>
                </div>
            )}

            {/* 일반 사용자 툴팁 */}
            {!data.isAdmin && showTooltip && (
                <div
                    className="absolute top-14 left-0 z-[1000] w-56 bg-slate-900/95 border border-amber-500/30 rounded-xl shadow-2xl p-4 backdrop-blur-md animate-in fade-in slide-in-from-top-2"
                    onClick={() => setShowTooltip(false)}
                >
                    <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                        {data.content || '내용이 없습니다.'}
                    </div>
                    <div className="mt-2 text-[10px] text-amber-500/60 font-medium">Click to close</div>
                </div>
            )}

            <Handle type="source" position={Position.Bottom} className="opacity-0" />
        </div>
    );
};

export default React.memo(AnnotationNode);
