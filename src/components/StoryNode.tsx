"use client";

import React, { memo } from 'react';
import { Handle, Position, NodeProps, NodeResizer } from 'reactflow';
import { Youtube, User, Star, CheckCircle } from 'lucide-react';

export interface StoryNodeData {
    label: string;
    type: 'main' | 'theme' | 'etc';
    image: string;
    youtubeUrl?: string;
    protagonist?: string;
    importance: number;
    watched?: boolean;
    isAdmin?: boolean;
    highlighted?: boolean; // For search feature
    splitType?: 'none' | 'part1' | 'part2'; // New: Split logic
    partLabel?: string; // New: Text like "1~12화"
    nodeScale?: number; // New: Precise node scaling
    onPlayVideo?: (url: string) => void;
}

const StoryNode = ({ data, selected }: NodeProps<StoryNodeData>) => {
    const isWatched = data.watched && !data.isAdmin; // Only show watched state if not admin
    const isAdmin = data.isAdmin;
    const isHighlighted = data.highlighted;

    // Harmonious colors based on type
    const getTypeColorClasses = () => {
        if (data.type === 'main') return {
            border: 'border-slate-700',
            ring: 'ring-indigo-500/30',
            bg: 'bg-slate-800/80',
            text: 'text-white',
            badge: 'bg-slate-800 text-slate-100'
        };
        if (data.type === 'theme') return {
            border: 'border-slate-700',
            ring: 'ring-indigo-500/30',
            bg: 'bg-slate-800/80',
            text: 'text-white',
            badge: 'bg-slate-800 text-slate-100'
        };
        return {
            border: 'border-slate-700',
            ring: 'ring-indigo-500/30',
            bg: 'bg-slate-800/80',
            text: 'text-white',
            badge: 'bg-slate-800 text-slate-100'
        };
    };

    const theme = getTypeColorClasses();

    // Helper to render handles on a side
    const renderHandles = (side: string, position: Position) => (
        <div className={`absolute ${isAdmin ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} style={{
            top: side === 'top' ? -12 : side === 'bottom' ? 'auto' : '50%',
            bottom: side === 'bottom' ? -12 : 'auto',
            left: side === 'left' ? -12 : side === 'right' ? 'auto' : '50%',
            right: side === 'right' ? -12 : 'auto',
            transform: (side === 'left' || side === 'right') ? 'translateY(-50%)' : 'translateX(-50%)',
            zIndex: 1000
        }}>
            {/* Using only one handle type in loose mode for simplicity and clarity */}
            <Handle
                type="source"
                position={position}
                id={side}
                style={{ width: 14, height: 14, background: '#4f46e5', border: '2px solid white' }}
            />
        </div>
    );

    const showTitle = false; // Universal title hiding as requested
    const hasContent = (showTitle && data.label) || data.partLabel || data.youtubeUrl;

    return (
        <div className={`
      relative transition-all duration-500 w-full h-full flex flex-col
      rounded-2xl bg-slate-900 border-[6px] ${theme.border}
      ${selected ? `ring-8 ${theme.ring} scale-[1.03] z-10` : isHighlighted ? 'ring-[12px] ring-amber-400 ring-offset-8 ring-offset-slate-900 scale-[1.05] z-30 shadow-[0_0_50px_rgba(251,191,36,0.6)]' : 'shadow-lg shadow-black/40'}
      ${isWatched ? 'grayscale opacity-60' : ''}
    `}>
            {/* Resizer - Admin only */}
            {isAdmin && (
                <NodeResizer
                    color="#4f46e5"
                    minWidth={100}
                    minHeight={100}
                    isVisible={selected}
                    keepAspectRatio={data.type === 'main'} // Only Main story keeps ratio
                    lineStyle={{ border: '2px dashed #4f46e5' }}
                    handleStyle={{ width: 10, height: 10, borderRadius: 2 }}
                />
            )}

            {/* 4-way Handles */}
            {renderHandles('top', Position.Top)}
            {renderHandles('bottom', Position.Bottom)}
            {renderHandles('left', Position.Left)}
            {renderHandles('right', Position.Right)}

            {/* Image Header wrapper with Split Indicator */}
            <div className={`relative bg-slate-900 overflow-hidden ${hasContent ? 'rounded-t-[8px]' : 'rounded-[8px]'} flex-grow flex items-center justify-center min-h-0`}>
                {data.image ? (
                    <img
                        src={data.image.startsWith('http') || data.image.startsWith('data:') ? data.image : `/images/${data.image}`}
                        alt={data.label}
                        loading="lazy"
                        className={`w-full h-full block transition-opacity duration-500 ${data.type === 'etc' ? 'object-contain' : 'object-cover'}`}
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/256x128?text=Image+Not+Found';
                        }}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs py-10">
                        No Image
                    </div>
                )}

                {/* Vertical Split Overlay - Left/Right Shading */}
                {data.splitType === 'part1' && (
                    <div className="absolute inset-0 pointer-events-none" style={{
                        background: 'linear-gradient(to right, transparent 50%, rgba(0,0,0,0.8) 50%)'
                    }} />
                )}
                {data.splitType === 'part2' && (
                    <div className="absolute inset-0 pointer-events-none" style={{
                        background: 'linear-gradient(to right, rgba(0,0,0,0.8) 50%, transparent 50%)'
                    }} />
                )}

                {/* Watched Overlay Icon - Only in User Mode */}
                {isWatched && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px] z-20">
                        <CheckCircle size={64} className="text-white/80 drop-shadow-lg" />
                    </div>
                )}
            </div>

            {/* Content 영역 */}
            {hasContent && (
                <div className={`p-2 flex flex-col gap-2 shrink-0 bg-slate-800/50 backdrop-blur-sm border-t border-slate-800`}>
                    {showTitle && (
                        <h3 className={`font-bold text-base leading-tight text-center ${theme.text}`}>{data.label}</h3>
                    )}

                    {data.partLabel && (
                        <div className={`text-xl font-black text-center py-2.5 rounded-xl ${theme.badge} shadow-inner tracking-tight`}>
                            {data.partLabel}
                        </div>
                    )}

                    {data.youtubeUrl && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (data.onPlayVideo) data.onPlayVideo(data.youtubeUrl!);
                            }}
                            className={`
                            flex items-center justify-center gap-2 rounded-xl py-3 px-6 text-lg font-black transition-all shadow-lg active:scale-95
                            ${isWatched ? 'bg-slate-600' : 'bg-rose-600 hover:bg-rose-700'} 
                            text-white w-full
                        `}
                        >
                            <Youtube size={24} />
                            <span>{data.type === 'etc' ? '시청하기' : 'PV 시청하기'}</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default memo(StoryNode);
