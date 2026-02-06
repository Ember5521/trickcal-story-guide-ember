"use client";

import React, { memo } from 'react';
import { Handle, Position, NodeProps, NodeResizer } from 'reactflow';
import { Youtube, User, Star, CheckCircle, Sprout } from 'lucide-react';

export interface StoryNodeData {
    label?: string;
    type?: 'main' | 'theme' | 'theme_x' | 'theme_now' | 'etc' | 'eternal' | 'annotation';
    image?: string;
    youtubeUrl?: string;
    fullVideoUrl?: string;
    protagonist?: string;
    importance?: number;
    watched?: boolean;
    isAdmin?: boolean;
    highlighted?: boolean; // For search feature
    splitType?: 'none' | 'part1' | 'part2'; // New: Split logic
    partLabel?: string; // New: Text like "1~12화"
    nodeScale?: number; // New: Precise node scaling
    onPlayVideo?: (url: string) => void;
    story_id?: string;
    isRecentlyNavigated?: boolean;
    m_x?: number;
    m_y?: number;
    content?: string; // For annotations
    onDelete?: (id: string) => void; // For annotations
    onUpdate?: (id: string, content: string) => void; // For annotations
}

const IMAGE_PROXY_URL = process.env.NEXT_PUBLIC_IMAGE_PROXY_URL || '';

// Helper to get proxied image URL via Cloudflare
const getProxyUrl = (originalUrl: string) => {
    if (!originalUrl || !IMAGE_PROXY_URL) return originalUrl;
    // Only proxy Supabase Storage URLs
    if (originalUrl.includes('.supabase.co/storage/v1/object/public/')) {
        try {
            const url = new URL(originalUrl);
            const projId = url.hostname.split('.')[0];
            const path = url.pathname.replace('/storage/v1/object/public', '');
            const cleanPath = path.startsWith('/') ? path : '/' + path;
            const cleanProxyBase = IMAGE_PROXY_URL.endsWith('/') ? IMAGE_PROXY_URL.slice(0, -1) : IMAGE_PROXY_URL;
            return `${cleanProxyBase}/${projId}${cleanPath}`;
        } catch (e) {
            return originalUrl;
        }
    }
    return originalUrl;
};

const StoryNode = ({ data, selected }: NodeProps<StoryNodeData>) => {
    const isWatched = data.watched && !data.isAdmin; // Only show watched state if not admin
    const isAdmin = data.isAdmin;
    const isHighlighted = data.highlighted;
    const isRecentlyNavigated = data.isRecentlyNavigated;

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
        if (data.type === 'theme_now') return {
            border: 'border-indigo-600',
            ring: 'ring-indigo-500/40',
            bg: 'bg-slate-900/90',
            text: 'text-indigo-200',
            badge: 'bg-indigo-950/60 text-indigo-100 border border-indigo-500/30'
        };
        if (data.type === 'theme_x') return {
            border: 'border-rose-600/60',
            ring: 'ring-rose-500/40',
            bg: 'bg-slate-900/90',
            text: 'text-rose-200',
            badge: 'bg-rose-950/60 text-rose-100 border border-rose-500/30'
        };
        if (data.type === 'eternal') return {
            border: 'border-emerald-600',
            ring: 'ring-emerald-500/50',
            bg: 'bg-slate-950/90',
            text: 'text-emerald-300',
            badge: 'bg-emerald-900/40 text-emerald-100 border border-emerald-500/30'
        };
        if (data.type === 'annotation') return {
            border: 'border-orange-600',
            ring: 'ring-orange-500/50',
            bg: 'bg-slate-900/90',
            text: 'text-orange-400',
            badge: 'bg-orange-900/30 text-orange-200 border border-orange-500/30'
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

    const isProd = process.env.NODE_ENV === 'production';
    const basePath = isProd ? '/trickcal-story-guide-ember' : '';

    return (
        <div className={`
      relative transition-all duration-500 w-full h-full flex flex-col rounded-2xl
      ${selected ? `ring-8 ${theme.ring} scale-[1.03] z-10` : isHighlighted ? 'ring-[8px] ring-amber-400 ring-offset-4 ring-offset-slate-900 scale-[1.05] z-30 shadow-[0_0_50px_rgba(251,191,36,0.6)]' : isRecentlyNavigated ? 'ring-[8px] ring-yellow-400 ring-offset-2 ring-offset-slate-900 scale-[1.05] z-30 shadow-[0_0_40px_rgba(250,204,21,0.8)] animate-pulse' : 'shadow-lg shadow-black/40'}
    `}>
            {/* Grayscale/Opacity wrapper for watched state inside the ring - Includes border and BG */}
            <div className={`
                w-full h-full flex flex-col rounded-2xl
                ${data.type === 'eternal' ? 'bg-[#062016]' : 'bg-slate-900'} border-[6px] ${isWatched ? 'border-emerald-500/50' : theme.border}
                transition-all duration-500 ${isWatched ? 'opacity-70 shadow-[0_0_30px_rgba(16,185,129,0.25)]' : ''}
            `}>
                {/* Theme X Special Badge (Sign at the top) */}
                {data.type === 'theme_x' && (
                    <div className="absolute -top-15 left-1/2 -translate-x-1/2 z-[100] whitespace-nowrap">
                        <div className="bg-rose-600 text-white text-[22px] font-black px-5 py-2 rounded-2xl shadow-lg border border-rose-400/50 flex items-center ring-4 ring-rose-500/20">
                            재개봉관 준비 중
                        </div>
                    </div>
                )}
                {/* Theme Now Special Badge (Sign at the top) */}
                {data.type === 'theme_now' && (
                    <div className="absolute -top-15 left-1/2 -translate-x-1/2 z-[100] whitespace-nowrap">
                        <div className="bg-indigo-600 text-white text-[22px] font-black px-5 py-2 rounded-2xl shadow-lg border border-indigo-400/50 flex items-center ring-4 ring-indigo-500/20">
                            현재 상영중
                        </div>
                    </div>
                )}
                {/* Resizer - Admin only */}
                {isAdmin && (
                    <NodeResizer
                        color="#4f46e5"
                        minWidth={100}
                        minHeight={100}
                        isVisible={selected}
                        keepAspectRatio={false} // Allow free resizing for all types
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
                <div className={`relative ${data.type === 'eternal' ? 'bg-[#062016]' : 'bg-slate-900'} overflow-hidden ${hasContent ? 'rounded-t-[8px]' : 'rounded-[8px]'} flex-grow flex items-center justify-center min-h-0`}>
                    {data.image ? (
                        (() => {
                            // 1. First, apply Cloudflare proxy if it's a Supabase URL
                            const proxiedImage = getProxyUrl(data.image);

                            // 2. Determine final source (Handle local path fallback)
                            const imgSrc = proxiedImage.startsWith('http') || proxiedImage.startsWith('data:')
                                ? proxiedImage
                                : `${basePath}/images/${proxiedImage}`;

                            return (
                                <img
                                    src={imgSrc}
                                    alt={data.label}
                                    loading="lazy"
                                    data-node-id={data.story_id}
                                    className={`w-full h-full block ${data.type === 'etc' ? 'object-contain' : 'object-cover'}`}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/256x128?text=Image+Not+Found';
                                    }}
                                />
                            );
                        })()
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

                    {/* Sprout Icon for Eternal Type */}
                    {data.type === 'eternal' && (
                        <div className="absolute top-2 left-2 z-30 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]">
                            <div className="bg-emerald-500/20 backdrop-blur-md p-1.5 rounded-full border border-emerald-500/30">
                                <Sprout size={24} className="text-emerald-400" />
                            </div>
                        </div>
                    )}

                    {/* Watched Overlay Icon - Only in User Mode */}
                    {isWatched && (
                        <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/5 backdrop-blur-[1px] z-20">
                            <CheckCircle size={64} className="text-emerald-400 drop-shadow-[0_0_20px_rgba(16,185,129,0.8)] fill-emerald-400/20" />
                        </div>
                    )}
                </div>

                {/* Content 영역 */}
                {hasContent && (
                    <div className={`p-2 flex flex-col gap-2 shrink-0 ${data.type === 'eternal' ? 'bg-[#0a3a2a] border-emerald-500/30' : data.type === 'theme_x' ? 'bg-rose-950/20 border-rose-500/20' : 'bg-slate-800/50 border-slate-800'} backdrop-blur-md border-t`}>
                        {showTitle && (
                            <h3 className={`font-bold text-base leading-tight text-center ${theme.text}`}>{data.label}</h3>
                        )}

                        {data.partLabel && (
                            <div className={`text-xl font-black text-center py-2.5 rounded-xl ${theme.badge} shadow-inner tracking-tight`}>
                                {data.partLabel}
                            </div>
                        )}

                        <div className="flex gap-2">
                            {data.youtubeUrl && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (data.onPlayVideo) data.onPlayVideo(data.youtubeUrl!);
                                    }}
                                    className={`
                                        flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-base font-black transition-all shadow-lg active:scale-95
                                        ${isWatched ? 'bg-slate-600' : 'bg-rose-600 hover:bg-rose-700'} 
                                        text-white flex-1
                                    `}
                                >
                                    <Youtube size={20} />
                                    <span>{data.type === 'etc' || data.type === 'eternal' ? '시청하기' : 'PV 시청하기'}</span>
                                </button>
                            )}

                            {(data.type === 'theme_x' || data.type === 'theme_now') && data.fullVideoUrl && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (data.onPlayVideo) data.onPlayVideo(data.fullVideoUrl!);
                                    }}
                                    className={`
                                        flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-base font-black transition-all shadow-lg active:scale-95
                                        bg-indigo-600 hover:bg-indigo-700 text-white flex-1
                                    `}
                                >
                                    <Youtube size={20} />
                                    <span>전체 다시보기</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default memo(StoryNode);
