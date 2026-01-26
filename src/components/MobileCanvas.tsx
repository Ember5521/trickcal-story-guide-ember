"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Search, Info, Youtube, Play, X, Settings, StickyNote, ChevronDown,
    Plus, Edit2, Trash2, Save, Upload, Image as ImageIcon,
    Layout, Monitor, CheckCircle, Shield, ChevronLeft, ChevronRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const isProd = process.env.NODE_ENV === 'production';
const repoName = 'trickcal-story-guide-ember';
const basePath = isProd ? `/${repoName}` : '';

interface StoryNodeData {
    label: string;
    type: 'main' | 'theme' | 'etc';
    image: string;
    youtubeUrl: string;
    protagonist?: string;
    partLabel?: string;
    importance?: number;
    watched?: boolean;
    m_x?: number; // Mobile specific X
    m_y?: number; // Mobile specific Y
}

interface Node {
    id: string;
    data: StoryNodeData;
    position: { x: number; y: number };
}

export default function MobileCanvas({ onToggleView, isMobileView }: { onToggleView: () => void, isMobileView: boolean }) {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<any[]>([]);
    const [season, setSeason] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [showInfo, setShowInfo] = useState(false);
    const [showMemo, setShowMemo] = useState(false);
    const [memoText, setMemoText] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [selectedDetailNode, setSelectedDetailNode] = useState<Node | null>(null);
    const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
    const [searchIndex, setSearchIndex] = useState(0);

    // Admin States
    const [showForm, setShowForm] = useState(false);
    const [editingNode, setEditingNode] = useState<Node | null>(null);
    const [formData, setFormData] = useState<StoryNodeData & { x: number, y: number }>({
        label: '', type: 'main', image: '', youtubeUrl: '', protagonist: '', x: 0, y: 0
    });
    const [isUploading, setIsUploading] = useState(false);

    // Drag States
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const sessionPassword = useRef<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Load Data
    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            try {
                if (supabase) {
                    const { data, error } = await supabase
                        .from('story_data')
                        .select('*')
                        .eq('season', season)
                        .single();

                    if (data && !error) {
                        const histStr = localStorage.getItem(`watched_history_s${season}`) || '{}';
                        const hist = JSON.parse(histStr);

                        const processedNodes = data.nodes.map((n: any) => ({
                            ...n,
                            data: {
                                ...n.data,
                                watched: !!hist[n.id]
                            }
                        }));
                        setNodes(processedNodes);
                        setEdges(data.edges || []);
                    }
                }
            } catch (err) {
                console.error("Mobile load error:", err);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [season]);

    // Load Memo
    useEffect(() => {
        const savedMemo = localStorage.getItem('user_story_memo');
        if (savedMemo) setMemoText(savedMemo);
    }, []);

    // Handle History (Back Button)
    useEffect(() => {
        const handlePopState = (e: PopStateEvent) => {
            // Priority: Player > Detail > Others
            if (activeVideoUrl) {
                setActiveVideoUrl(null);
            } else if (selectedDetailNode) {
                setSelectedDetailNode(null);
            } else if (showInfo) {
                setShowInfo(false);
            } else if (showMemo) {
                setShowMemo(false);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [activeVideoUrl, selectedDetailNode, showInfo, showMemo]);

    // Push states to history to enable back button closing
    useEffect(() => {
        // If any modal becomes open, push a state
        const anyOpen = !!selectedDetailNode || !!activeVideoUrl || showInfo || showMemo;
        if (anyOpen) {
            // Check if we already pushed for this state to avoid loops
            // Using a simple state check
            window.history.pushState({ modal: true }, '');
        }
    }, [!!selectedDetailNode, !!activeVideoUrl, showInfo, showMemo]);

    // Save Memo
    useEffect(() => {
        localStorage.setItem('user_story_memo', memoText);
    }, [memoText]);

    // Save Data to Supabase (Preserving Edges via Read-before-write)
    const syncToCloud = async (newNodes: Node[]) => {
        if (!supabase || !isAdmin || !sessionPassword.current) return;
        try {
            // 1. Fetch latest state from DB to avoid overwriting edges changed elsewhere (PC)
            const { data: latestData } = await supabase
                .from('story_data')
                .select('edges')
                .eq('season', season)
                .single();

            const currentEdges = latestData?.edges || edges;

            // 2. Sync with the merged data
            await supabase.rpc('save_story_data', {
                p_season: season,
                p_nodes: newNodes,
                p_edges: currentEdges,
                p_password: sessionPassword.current
            });

            // 3. Update local state to match cloud
            setEdges(currentEdges);
        } catch (err) {
            console.error("Cloud sync error:", err);
        }
    };

    const getYouTubeId = (url: string) => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    };

    // Layout Constants (Denser Layout)
    const ROW_HEIGHT = 70;
    const ROW_GAP = 6;
    const SLOT_UNIT = 80; // Slightly tighter slot unit

    // Layout Logic (Slot-based Engine)
    const layoutInfo = useMemo(() => {
        // Render ALL nodes for continuity
        const nodesToLayout = nodes;

        if (nodesToLayout.length === 0) return { nodes: [], totalHeight: 1000, maxRow: 10 };

        // 1. Static Grid Mapping
        const slottedNodes = nodesToLayout.map(node => {
            const curY = node.data.m_y ?? node.position.y;
            const curX = node.data.m_x ?? node.position.x;

            // Fixed Row/Col mapping based on absolute coordinates
            const rowIndex = Math.max(0, Math.round(curY / SLOT_UNIT));
            const colIndex = curX >= 200 ? 1 : 0;

            return {
                ...node,
                rowIndex,
                colIndex,
                renderTop: rowIndex * (ROW_HEIGHT + ROW_GAP)
            };
        });

        const maxRow = slottedNodes.length > 0 ? Math.max(...slottedNodes.map(n => n.rowIndex)) : 0;

        return {
            nodes: slottedNodes,
            totalHeight: (maxRow + 10) * (ROW_HEIGHT + ROW_GAP) + 400,
            maxRow
        };
    }, [nodes]);

    const matchedNodeIds = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (query.length < 2) return [];

        return nodes
            .filter(n => {
                const labelMatch = n.data.label.toLowerCase().includes(query);
                if (n.data.type === 'main') return labelMatch;
                return labelMatch || n.data.protagonist?.toLowerCase().includes(query);
            })
            .map(n => n.id);
    }, [nodes, searchQuery]);

    const scrollToMatch = (id: string) => {
        if (!scrollRef.current) return;
        const nodeLayout = layoutInfo.nodes.find(n => n.id === id);
        if (!nodeLayout) return;

        const top = nodeLayout.renderTop;
        scrollRef.current.scrollTo({
            top: Math.max(0, top - 150),
            behavior: 'smooth'
        });
    };

    // Auto-scroll on search start
    useEffect(() => {
        if (matchedNodeIds.length > 0) {
            setSearchIndex(0);
            scrollToMatch(matchedNodeIds[0]);
        }
    }, [searchQuery, matchedNodeIds.length]);

    const toggleWatch = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const histStr = localStorage.getItem(`watched_history_s${season}`) || '{}';
        const hist = JSON.parse(histStr);
        const nw = !hist[id];
        hist[id] = nw;
        localStorage.setItem(`watched_history_s${season}`, JSON.stringify(hist));

        setNodes(nds => nds.map(n =>
            n.id === id ? { ...n, data: { ...n.data, watched: nw } } : n
        ));
    };

    const toggleAdmin = async () => {
        if (isAdmin) {
            setIsAdmin(false);
            sessionPassword.current = null;
        } else {
            const pw = prompt("관리자 비밀번호를 입력하세요.");
            if (!pw) return;
            if (!supabase) { alert("DB 연결 실패"); return; }
            const { data: isValid, error } = await supabase.rpc('verify_admin_password', { input_password: pw });
            if (error) { alert("인증 오류"); return; }
            if (isValid) {
                sessionPassword.current = pw;
                setIsAdmin(true);
            } else {
                alert("권한이 없습니다.");
            }
        }
    };

    const handleDragStart = (id: string, e: React.PointerEvent) => {
        if (!isAdmin) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setDraggedId(id);
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
        setDragPos({ x: e.clientX, y: e.clientY });
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    };

    const handleDragMove = (e: React.PointerEvent) => {
        if (!draggedId) return;
        setDragPos({ x: e.clientX, y: e.clientY });
    };

    const handleDragEnd = async () => {
        if (!draggedId || !scrollRef.current) {
            setDraggedId(null);
            return;
        }

        const scrollRect = scrollRef.current.getBoundingClientRect();
        const dropX = dragPos.x - scrollRect.left;
        const dropY = dragPos.y - scrollRect.top + scrollRef.current.scrollTop;

        // Calculate Target Logical Indices for order check
        const c = dropX >= scrollRect.width * 0.6 ? 1 : 0;
        const r = Math.max(0, Math.floor(dropY / (ROW_HEIGHT + ROW_GAP)));

        const node = nodes.find(n => n.id === draggedId);
        if (!node) { setDraggedId(null); return; }

        const targetX = c === 1 ? 400 : 0;
        const targetY = r * SLOT_UNIT;

        // Find if any node is already logically at this grid slot
        const occupant = nodes.find(n => {
            if (n.id === draggedId) return false;
            const ny = n.data.m_y ?? n.position.y;
            const nx = n.data.m_x ?? n.position.x;
            const nr = Math.max(0, Math.round(ny / SLOT_UNIT));
            const nc = nx >= 200 ? 1 : 0;
            return nr === r && nc === c;
        });

        const newNodes = nodes.map(n => {
            if (n.id === draggedId) {
                if (occupant) {
                    // Swap logic: take occupant's mobile coordinates
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            m_x: occupant.data.m_x ?? (occupant.position.x >= 200 ? 400 : 0),
                            m_y: occupant.data.m_y ?? (Math.round(occupant.position.y / SLOT_UNIT) * SLOT_UNIT)
                        }
                    };
                }
                // No occupant: simply move to the absolute grid coordinate
                return { ...n, data: { ...n.data, m_x: targetX, m_y: targetY } };
            }
            if (occupant && n.id === occupant.id) {
                // Occupant takes the dragged node's old mobile coordinates
                return {
                    ...n,
                    data: {
                        ...n.data,
                        m_x: node.data.m_x ?? (node.position.x >= 200 ? 400 : 0),
                        m_y: node.data.m_y ?? (Math.round(node.position.y / SLOT_UNIT) * SLOT_UNIT)
                    }
                };
            }
            return n;
        });

        setNodes(newNodes);
        await syncToCloud(newNodes);
        setDraggedId(null);
    };


    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !supabase) return;
        setIsUploading(true);
        try {
            const fileName = `${season}/${Date.now()}.${file.name.split('.').pop()}`;
            const { error: uploadError } = await supabase.storage.from('story-images').upload(`nodes/${fileName}`, file);
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage.from('story-images').getPublicUrl(`nodes/${fileName}`);
            setFormData(prev => ({ ...prev, image: publicUrl }));
        } catch (err) {
            alert("업로드 실패");
        } finally {
            setIsUploading(false);
        }
    };

    const getImageUrl = (imagePath: string) => {
        if (!imagePath) return `${basePath}/images/placeholder.jpg`;
        if (imagePath.startsWith('http') || imagePath.startsWith('data:')) return imagePath;
        return `${basePath}/images/${imagePath}`;
    };

    const scrollContainerHeight = layoutInfo.totalHeight;

    return (
        <div className="fixed inset-0 bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
            <div className="absolute inset-0 pointer-events-none z-0 opacity-10" style={{ backgroundImage: `url(${basePath}/images/background.jpg)`, backgroundSize: 'cover', backgroundPosition: 'center' }} />

            <header className="relative z-50 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/50 p-3 pt-4 shrink-0 shadow-2xl">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowInfo(!showInfo)} className="p-1.5 bg-slate-800/50 rounded-lg text-slate-400 border border-slate-700/30">
                            <Info size={16} />
                        </button>
                        <button onClick={onToggleView} className="p-1.5 bg-slate-800/50 rounded-lg text-slate-400 border border-slate-700/30 flex items-center gap-2">
                            <Monitor size={16} />
                            <span className="text-[10px] font-bold uppercase">PC View</span>
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        {isAdmin && (
                            <button onClick={() => {
                                const maxY = nodes.length > 0 ? Math.max(...nodes.map(n => n.position.y)) : 0;
                                setEditingNode(null);
                                setFormData({ label: '', type: 'main', image: '', youtubeUrl: '', protagonist: '', x: 0, y: maxY + SLOT_UNIT });
                                setShowForm(true);
                            }} className="p-1.5 bg-indigo-600 rounded-lg text-white border border-indigo-500">
                                <Plus size={16} />
                            </button>
                        )}
                        <button onClick={toggleAdmin} className={`p-1.5 rounded-lg border transition-all ${isAdmin ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-transparent border-none text-slate-800 opacity-[0.15] hover:opacity-50'}`}>
                            <Shield size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-800/50 border border-slate-700/30 rounded-lg py-2 pl-9 pr-3 text-xs focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all" />
                        {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">✕</button>}
                    </div>
                    {matchedNodeIds.length > 0 && (
                        <div className="flex items-center bg-slate-800/50 border border-slate-700/30 rounded-lg px-2 py-1.5 gap-2 shrink-0 animate-in fade-in slide-in-from-right-2">
                            <span className="text-[10px] font-bold text-slate-400">{searchIndex + 1}/{matchedNodeIds.length}</span>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => {
                                        const next = (searchIndex - 1 + matchedNodeIds.length) % matchedNodeIds.length;
                                        setSearchIndex(next);
                                        scrollToMatch(matchedNodeIds[next]);
                                    }}
                                    className="p-0.5"
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <button
                                    onClick={() => {
                                        const next = (searchIndex + 1) % matchedNodeIds.length;
                                        setSearchIndex(next);
                                        scrollToMatch(matchedNodeIds[next]);
                                    }}
                                    className="p-0.5"
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                    <button onClick={() => setShowMemo(true)} className={`p-2 bg-slate-800/50 rounded-lg border border-slate-700/30 ${memoText.trim() ? 'text-indigo-400' : 'text-slate-500'}`}><StickyNote size={16} /></button>
                    <div className="relative">
                        <select value={season} onChange={(e) => setSeason(Number(e.target.value))} className="appearance-none bg-slate-800/70 border border-slate-700/30 text-[10px] font-black text-white px-3 py-2 pr-7 rounded-lg outline-none">
                            <option value={1}>SEASON 1</option>
                            <option value={2}>SEASON 2</option>
                            <option value={3}>SEASON 3</option>
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    </div>
                </div>
            </header>

            {/* Unified Scrollable Area (Explicit 3:2 Split) */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-x-hidden overflow-y-auto relative z-10 overscroll-contain pb-32"
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
            >
                <div className="w-full relative" style={{ height: `${scrollContainerHeight}px` }}>
                    {/* 3:2 Divider Line (60%) */}
                    <div className="absolute left-[60%] top-0 bottom-0 w-px bg-white/10" />

                    {/* Render Invisible Grid Slots (Visible in Admin Mode) */}
                    {isAdmin && Array.from({ length: (layoutInfo.maxRow + 15) * 2 }).map((_, i) => {
                        const r = Math.floor(i / 2);
                        const c = i % 2;
                        return (
                            <div
                                key={`slot-${i}`}
                                className="absolute border border-dashed border-white/5 pointer-events-none"
                                style={{
                                    top: `${r * (ROW_HEIGHT + ROW_GAP)}px`,
                                    left: c === 1 ? '60%' : '0',
                                    width: c === 1 ? '40%' : '60%',
                                    height: `${ROW_HEIGHT}px`,
                                }}
                            />
                        );
                    })}

                    {layoutInfo.nodes.map((node) => {
                        const { colIndex, renderTop } = node;
                        const isRight = colIndex === 1;
                        const isDragging = draggedId === node.id;

                        // Drag override
                        const dragStyle = isDragging ? {
                            position: 'fixed' as const,
                            top: `${dragPos.y - dragOffset.y}px`,
                            left: `${dragPos.x - dragOffset.x}px`,
                            width: isRight ? '40%' : '60%',
                            zIndex: 1000,
                            pointerEvents: 'none' as const,
                            opacity: 0.8,
                            transform: 'scale(1.05)',
                        } : {
                            top: `${renderTop}px`,
                            left: isRight ? '60%' : '0',
                            width: isRight ? '40%' : '60%',
                        };

                        return (
                            <div
                                key={node.id}
                                className={`absolute transition-all select-none ${isDragging ? '' : 'duration-700 ease-[cubic-bezier(0.2,1,0.2,1)]'} ${isAdmin ? 'touch-none' : 'touch-pan-y active:scale-[0.98]'}`}
                                onPointerDown={(e) => handleDragStart(node.id, e)}
                                onClick={() => !isAdmin && setSelectedDetailNode(node)}
                                style={{
                                    ...dragStyle,
                                    height: `${ROW_HEIGHT}px`,
                                    padding: '4px'
                                }}
                            >
                                <div className={`h-full group relative bg-slate-900/40 border rounded-xl overflow-hidden backdrop-blur-md transition-all ${node.data.watched ? 'opacity-30 grayscale-[0.8]' : 'hover:bg-slate-800/60 shadow-lg'} ${isDragging ? 'ring-2 ring-indigo-500 shadow-2xl bg-slate-800' : ''} ${matchedNodeIds.includes(node.id) ? 'ring-2 ring-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.5)] border-yellow-400/50' : 'border-slate-800/40'}`}>
                                    <div className="flex items-center h-full">
                                        <div className="relative h-full aspect-square bg-black/20 shrink-0 flex items-center justify-center p-1 border-r border-slate-800/30">
                                            <img src={getImageUrl(node.data.image)} alt={node.data.label} className="max-w-full max-h-full object-contain drop-shadow-2xl" />
                                            {node.data.youtubeUrl && !node.data.watched && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                                                    <Play className="text-white/30 fill-white/10" size={18} />
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 px-2.5 min-w-0 flex flex-col justify-center gap-1">
                                            {/* Top Row: Type */}
                                            <div className="flex items-center">
                                                <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-black tracking-widest uppercase ${node.data.type === 'main' ? 'bg-blue-500/20 text-blue-400' : node.data.type === 'theme' ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-500/20 text-slate-400'}`}>
                                                    {node.data.type === 'main' ? 'MAIN' : node.data.type === 'theme' ? 'THEME' : 'ETC'}
                                                </span>
                                            </div>

                                            {/* Bottom Row: Title | Watch Button */}
                                            <div className="flex items-center justify-between gap-1">
                                                <h3 className="font-bold leading-tight text-[11px] text-slate-100 line-clamp-2 flex-1 tracking-tight">
                                                    {node.data.type === 'main' ? (node.data.partLabel || node.data.label) : node.data.label}
                                                </h3>

                                                <div className="flex items-center gap-1.5 ml-auto">
                                                    <button
                                                        onPointerDown={(e) => e.stopPropagation()}
                                                        onClick={(e) => toggleWatch(node.id, e)}
                                                        className={`transition-all pointer-events-auto p-1.5 ${node.data.watched ? 'text-indigo-400' : 'text-slate-600 active:scale-125'}`}
                                                        title={node.data.watched ? '시청 완료' : '시청 미완료'}
                                                    >
                                                        <CheckCircle size={18} fill={node.data.watched ? 'currentColor' : 'none'} className={node.data.watched ? 'fill-indigo-400/20' : ''} />
                                                    </button>

                                                    {isAdmin && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingNode(node);
                                                                setFormData({ ...node.data, x: node.position.x, y: node.position.y });
                                                                setShowForm(true);
                                                            }}
                                                            className="p-1.5 text-blue-400/80 hover:text-blue-400 bg-slate-800/50 rounded pointer-events-auto"
                                                        >
                                                            <Edit2 size={12} />
                                                        </button>
                                                    )}

                                                    {isAdmin && (
                                                        <button
                                                            onPointerDown={(e) => e.stopPropagation()}
                                                            onClick={async (e) => { e.stopPropagation(); if (confirm("삭제할까요?")) { const up = nodes.filter(n => n.id !== node.id); setNodes(up); await syncToCloud(up); } }}
                                                            className="text-red-400/50 hover:text-red-400 transition-colors pointer-events-auto p-1"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Admin Form Modal */}
            {showForm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                            <h2 className="text-sm font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                <Shield size={16} />
                                {editingNode ? 'Edit Node' : 'New Node'}
                            </h2>
                            <button onClick={() => setShowForm(false)} className="text-slate-500"><X size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            <div>
                                <label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">Title</label>
                                <input type="text" value={formData.label} onChange={e => setFormData({ ...formData, label: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-sm focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="제목을 입력하세요" />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">Column Placement</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setFormData({ ...formData, x: 0 })}
                                        className={`py-3 rounded-lg border text-[10px] font-black uppercase transition-all ${formData.x < 200 ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700'}`}
                                    >
                                        LEFT (60%)
                                    </button>
                                    <button
                                        onClick={() => setFormData({ ...formData, x: 400 })}
                                        className={`py-3 rounded-lg border text-[10px] font-black uppercase transition-all ${formData.x >= 200 ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700'}`}
                                    >
                                        RIGHT (40%)
                                    </button>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">Type</label>
                                    <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as any })} className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-sm appearance-none outline-none focus:ring-1 focus:ring-indigo-500">
                                        <option value="main">Main</option>
                                        <option value="theme">Theme</option>
                                        <option value="etc">ETC</option>
                                    </select>
                                </div>
                                <div className="w-24">
                                    <label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">Grid Y (Pos)</label>
                                    <input type="number" step="10" value={formData.y} onChange={e => setFormData({ ...formData, y: Number(e.target.value) })} className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-sm focus:ring-1 focus:ring-indigo-500 outline-none" />
                                </div>
                            </div>

                            <div>
                                <label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">Image URL / Selection</label>
                                <div className="flex gap-2">
                                    <input type="text" value={formData.image} onChange={e => setFormData({ ...formData, image: e.target.value })} className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-xs outline-none" placeholder="image_path.jpg" />
                                    <label className="bg-slate-700 p-3 rounded-lg cursor-pointer hover:bg-slate-600 transition-colors">
                                        {isUploading ? <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /> : <ImageIcon size={20} className="text-indigo-400" />}
                                        <input type="file" onChange={handleImageUpload} className="hidden" accept="image/*" />
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">YouTube link</label>
                                <input type="text" value={formData.youtubeUrl} onChange={e => setFormData({ ...formData, youtubeUrl: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-xs font-mono outline-none" placeholder="https://youtube.com/..." />
                            </div>
                        </div>
                        <div className="p-4 bg-slate-950/80 border-t border-slate-800 rounded-b-2xl">
                            <button onClick={async () => {
                                if (!formData.label) { alert("제목!"); return; }
                                let newNodes: Node[];
                                if (editingNode) {
                                    newNodes = nodes.map(n => n.id === editingNode.id ? { ...n, position: { x: formData.x, y: formData.y }, data: { ...n.data, ...formData } } : n);
                                } else {
                                    const newNode: Node = { id: `n_${Date.now()}`, position: { x: formData.x, y: formData.y }, data: { ...formData, watched: false } };
                                    newNodes = [...nodes, newNode];
                                }
                                setNodes(newNodes);
                                await syncToCloud(newNodes);
                                setShowForm(false);
                                setEditingNode(null);
                            }} className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
                                <Save size={16} /> SAVE NODE
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modals remain same but ensure they are z-indexed above form */}
            {showMemo && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm flex flex-col shadow-2xl">
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between"><h2 className="text-sm font-black text-indigo-400">Personal Memo</h2><button onClick={() => setShowMemo(false)} className="text-slate-500"><X size={20} /></button></div>
                        <textarea value={memoText} onChange={(e) => setMemoText(e.target.value)} placeholder="메모를 입력하세요..." className="bg-transparent p-4 h-64 text-sm text-slate-200 outline-none resize-none" />
                        <div className="p-4 bg-slate-950/50 border-t border-slate-800"><button onClick={() => setShowMemo(false)} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase">Close</button></div>
                    </div>
                </div>
            )}

            {showInfo && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full relative"><button onClick={() => setShowInfo(false)} className="absolute top-4 right-4 text-slate-500"><X size={20} /></button><h2 className="text-lg font-black mb-4 uppercase italic">Notice</h2><p className="text-xs text-slate-400">비공식 가이드입니다.</p><button onClick={() => setShowInfo(false)} className="w-full mt-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase">Check</button></div>
                </div>
            )}

            {/* Selected Node Detail Modal */}
            {selectedDetailNode && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/10 backdrop-blur-xl animate-in fade-in duration-500 overflow-y-auto pt-10 pb-20">
                    <button
                        onClick={() => {
                            setSelectedDetailNode(null);
                            window.history.back();
                        }}
                        className="fixed top-6 right-6 z-[410] p-3 rounded-full bg-slate-800/80 text-white hover:bg-slate-700 transition-all border border-slate-700/50 shadow-xl"
                    >
                        <X size={24} />
                    </button>

                    <div className="w-full max-w-lg flex flex-col items-center px-6 my-auto animate-in zoom-in-95 duration-300">
                        {/* Status Badge Above Image */}
                        <div className="mb-4">
                            <span className={`text-[10px] px-6 py-2 rounded-full font-black tracking-[0.3em] uppercase shadow-lg backdrop-blur-md border border-white/10 ${selectedDetailNode.data.type === 'main' ? 'bg-blue-600/60 text-white' : selectedDetailNode.data.type === 'theme' ? 'bg-purple-600/60 text-white' : 'bg-slate-700/60 text-white'}`}>
                                {selectedDetailNode.data.type}
                            </span>
                        </div>
                        {/* Poster Box - Original Aspect Ratio */}
                        <div className="w-full flex items-center justify-center rounded-3xl overflow-hidden border border-white/10 shadow-2xl mb-8 relative group bg-black/40">
                            <img
                                src={getImageUrl(selectedDetailNode.data.image)}
                                alt={selectedDetailNode.data.label}
                                className="w-full h-auto max-h-[45vh] object-contain"
                            />
                        </div>

                        {/* Text Info */}
                        <div className="w-full space-y-4 text-center">
                            <h2 className="text-2xl font-black text-white leading-tight tracking-tight">
                                {selectedDetailNode.data.partLabel || selectedDetailNode.data.label}
                            </h2>

                            {selectedDetailNode.data.protagonist && (
                                <p className="text-slate-400 text-sm font-medium">
                                    주인공: <span className="text-slate-200">{selectedDetailNode.data.protagonist}</span>
                                </p>
                            )}

                            {/* CTA Button - Integrated Player */}
                            {selectedDetailNode.data.youtubeUrl && (
                                <div className="pt-8 w-full px-4">
                                    <button
                                        onClick={() => setActiveVideoUrl(selectedDetailNode.data.youtubeUrl!)}
                                        className="flex items-center justify-center gap-3 w-full py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-rose-900/40 transition-all active:scale-95 border border-rose-400/30"
                                    >
                                        <Youtube size={20} />
                                        <span>{selectedDetailNode.data.type === 'theme' ? 'PV 시청하기' : 'YOUTUBE 시청하기'}</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Background Click to Close */}
                    <div className="absolute inset-0 -z-10" onClick={() => {
                        setSelectedDetailNode(null);
                        window.history.back();
                    }} />
                </div>
            )}

            {/* Integrated YouTube Player Modal */}
            {activeVideoUrl && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/60 backdrop-blur-2xl animate-in fade-in duration-300 p-4">
                    <div className="w-full max-w-4xl relative aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                        <iframe
                            src={`https://www.youtube.com/embed/${getYouTubeId(activeVideoUrl)}?autoplay=1`}
                            className="w-full h-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            title="YouTube Video"
                        />
                        <button
                            onClick={() => {
                                setActiveVideoUrl(null);
                                window.history.back();
                            }}
                            className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white transition-colors flex items-center gap-2 font-black text-[10px] uppercase tracking-widest"
                        >
                            CLOSE <X size={18} />
                        </button>
                    </div>
                    <div className="absolute inset-0 -z-10" onClick={() => {
                        setActiveVideoUrl(null);
                        window.history.back();
                    }} />
                </div>
            )}
        </div>
    );
}
