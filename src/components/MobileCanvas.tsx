"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Search, Info, Youtube, Play, X, Settings, StickyNote, ChevronDown,
    Plus, Edit2, Trash2, Save, Upload, Image as ImageIcon,
    Layout, Monitor, CheckCircle, Shield, ChevronLeft, ChevronRight, Library, Sprout
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const isProd = process.env.NODE_ENV === 'production';
const repoName = 'trickcal-story-guide-ember';
const basePath = isProd ? `/${repoName}` : '';
const isDbConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const TABLE_NAME = process.env.NEXT_PUBLIC_STORY_TABLE_NAME || 'story_data';
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

interface StoryNodeData {
    label: string;
    type: 'main' | 'theme' | 'etc' | 'eternal' | 'annotation';
    image: string;
    youtubeUrl: string;
    protagonist?: string;
    partLabel?: string;
    importance?: number;
    watched?: boolean;
    m_x?: number; // Mobile specific X
    m_y?: number; // Mobile specific Y
    story_id?: string;
}

interface Node {
    id: string;
    data: StoryNodeData;
    position: { x: number; y: number };
    x?: number;
    y?: number;
}

export default function MobileCanvas({ onToggleView, isMobileView }: { onToggleView: () => void, isMobileView: boolean }) {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<any[]>([]);
    const [season, setSeason] = useState(1);
    const [viewType, setViewType] = useState<'recommended' | 'chrono' | 'release'>('release');
    const [showMasterLibrary, setShowMasterLibrary] = useState(false);
    const [masterStories, setMasterStories] = useState<any[]>([]);
    const [isFetchingMasters, setIsFetchingMasters] = useState(false);
    const [libraryCategory, setLibraryCategory] = useState<'main' | 'theme' | 'etc' | 'eternal' | 'annotation'>('main');
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
        label: '',
        type: 'main',
        image: '',
        youtubeUrl: '',
        protagonist: '',
        x: 0,
        y: 0,
        partLabel: '',
        importance: 1
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
            setNodes([]);
            try {
                if (supabase) {
                    const { data: layout, error: lError } = await supabase
                        .from('story_layouts')
                        .select('*')
                        .eq('view_type', viewType)
                        .eq('season', season)
                        .single();

                    if (layout && !lError) {
                        const layoutNodes = (layout.nodes as any[]).filter(ln => ln.type !== 'annotationNode');
                        const storyIds = layoutNodes.map(ln => ln.story_id);

                        const { data: masters, error: mError } = await supabase
                            .from('master_stories')
                            .select('*')
                            .in('id', storyIds);

                        if (masters && !mError) {
                            const masterMap = new Map(masters.map(m => [m.id, m]));
                            const histStr = localStorage.getItem(`watched_history_s${season}`) || '{}';
                            const hist = JSON.parse(histStr);

                            const processedNodes = layoutNodes.map(ln => {
                                const master = masterMap.get(ln.story_id);
                                const masterData = master || {};

                                // Consistent defaults for migrated data
                                const getMigratedDimensions = (type: string) => {
                                    if (type === 'main') return { w: 260, h: 380 };
                                    if (type === 'theme') return { w: 320, h: 200 };
                                    return { w: 300, h: 200 };
                                };

                                const { w: defW, h: defH } = getMigratedDimensions(masterData.type || 'main');

                                // Robust fallback: If width/height is missing OR too small (e.g. 0 from bad migration), use default
                                // SPECIAL FIX: Season 2 Main nodes appearing as wide (Theme-like) -> Force to Portrait
                                let finalW = (typeof ln.w === 'number' && ln.w > 50) ? ln.w : defW;
                                let finalH = (typeof ln.h === 'number' && ln.h > 50) ? ln.h : defH;

                                // Note: season var might not be available here directly if it's propped differently, 
                                // but MobileCanvas props usually have season or we check masterData.story_id range or similar if strictly needed.
                                // However, MobileCanvas usually renders one season at a time.
                                // Checking context: MobileCanvas receives 'season' as prop? No, it has its own state. 
                                // Let's check state 'season' usage in MobileCanvas. Assuming 'season' state variable exists in scope.
                                if (season === 2 && (masterData.type === 'main' || !masterData.type)) {
                                    if (finalW > finalH) {
                                        finalW = 260;
                                        finalH = 380;
                                    }
                                }

                                return {
                                    id: ln.id,
                                    position: { x: ln.x || 0, y: ln.y || 0 },
                                    width: finalW,
                                    height: finalH,
                                    style: { width: finalW, height: finalH },
                                    data: {
                                        ...masterData,
                                        youtubeUrl: masterData.youtube_url,
                                        partLabel: masterData.part_label,
                                        story_id: ln.story_id,
                                        m_x: ln.m_x,
                                        m_y: ln.m_y,
                                        watched: !!hist[ln.id],
                                        image: getProxyUrl(masterData.image)
                                    }
                                } as Node;
                            });
                            setNodes(processedNodes);
                            setEdges(layout.edges || []);
                        }
                    }
                }
            } catch (err) {
                console.error("Mobile load error:", err);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [season, viewType]);

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
        if (!supabase || !isAdmin || !sessionPassword.current) {
            console.error("Mobile Cloud sync: Pre-conditions failed", { hasSupabase: !!supabase, isAdmin, hasPassword: !!sessionPassword.current });
            return false;
        }
        try {
            // Convert to layout format
            const layoutNodes = newNodes.map(n => ({
                id: n.id,
                story_id: (n.data as any).story_id || n.id,
                x: n.position.x,
                y: n.position.y,
                w: (n as any).width,
                h: (n as any).height,
                m_x: n.data.m_x,
                m_y: n.data.m_y
            }));

            console.log(`Mobile Cloud sync starting for ${viewType} ${season}...`, { nodeCount: layoutNodes.length });

            const { data, error } = await supabase.rpc('save_story_layout', {
                p_view_type: viewType,
                p_season: season,
                p_nodes: layoutNodes,
                p_edges: edges,
                p_password: sessionPassword.current
            });

            if (error) {
                console.error("Mobile Cloud sync RPC error:", error);
                return false;
            }

            if (data === false) {
                console.error("Mobile Cloud sync failed: RPC returned false (Password mismatch?)");
                return false;
            }

            console.log("Mobile Cloud sync successful!");
            return true;
        } catch (err) {
            console.error("Mobile Cloud sync exception:", err);
            return false;
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

    const fetchMasterStories = async () => {
        if (!supabase) return;
        setIsFetchingMasters(true);
        try {
            const { data, error } = await supabase
                .from('master_stories')
                .select('*')
                .order('label', { ascending: true });
            if (error) throw error;
            setMasterStories(data || []);
        } catch (err) {
            console.error("Fetch master stories error:", err);
        } finally {
            setIsFetchingMasters(false);
        }
    };

    const handleImportMaster = (m: any) => {
        const maxY = nodes.length > 0 ? Math.max(...nodes.map(n => n.position.y)) : 0;
        const newNode: Node = {
            id: `n_${Date.now()}`,
            position: { x: 0, y: maxY + SLOT_UNIT },
            data: {
                label: m.label,
                type: m.type,
                image: getProxyUrl(m.image),
                youtubeUrl: m.youtube_url,
                protagonist: m.protagonist,
                importance: m.importance,
                story_id: m.id,
                watched: false
            }
        };
        setNodes(nds => [...nds, newNode]);
        setShowMasterLibrary(false);
    };

    const toggleAdmin = async () => {
        if (isAdmin) {
            const ok = await syncToCloud(nodes);
            if (ok) alert("저장되었습니다.");
            else if (!confirm("저장 실패. 무시하고 나갈까요?")) return;
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
                        <button onClick={() => setShowInfo(!showInfo)} className="p-2 bg-slate-800/80 rounded-xl text-slate-400 border border-slate-700 transition-all active:scale-95">
                            <Info size={18} />
                        </button>
                        <button onClick={onToggleView} className="p-2 bg-slate-800/80 rounded-xl text-slate-400 border border-slate-700 transition-all active:scale-95" title="PC View">
                            <Monitor size={18} />
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        {isAdmin && (
                            <>
                                <button
                                    onClick={() => {
                                        fetchMasterStories();
                                        setShowMasterLibrary(true);
                                    }}
                                    className="p-1.5 bg-indigo-600 rounded-lg text-white border border-indigo-500"
                                    title="마스터 불러오기"
                                >
                                    <Library size={16} />
                                </button>
                                <button
                                    onClick={() => {
                                        const maxY = nodes.length > 0 ? Math.max(...nodes.map(n => n.position.y)) : 0;
                                        setEditingNode(null);
                                        setFormData({ label: '', type: 'main', image: '', youtubeUrl: '', protagonist: '', x: 0, y: maxY + SLOT_UNIT });
                                        setShowForm(true);
                                    }}
                                    className="p-1.5 bg-green-600 rounded-lg text-white border border-green-500"
                                    title="새 마스터 생성"
                                >
                                    <Plus size={16} />
                                </button>
                            </>
                        )}
                        {process.env.NEXT_PUBLIC_ENABLE_ADMIN === 'true' && (
                            <button onClick={toggleAdmin} className={`p-1.5 rounded-lg border transition-all ${isAdmin ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-transparent border-none text-slate-800 opacity-[0.15] hover:opacity-50'}`}>
                                <Shield size={16} />
                            </button>
                        )}
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
                    <button
                        onClick={() => setShowMemo(true)}
                        className={`p-2 rounded-xl border transition-all active:scale-95 ${memoText.trim()
                            ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/20'
                            : 'bg-slate-800/80 border-slate-700 text-slate-400'
                            }`}
                    >
                        <StickyNote size={18} />
                    </button>
                    <div className="flex items-center gap-2">
                        <select
                            value={viewType}
                            onChange={(e) => setViewType(e.target.value as any)}
                            className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-100 outline-none cursor-pointer transition-all active:bg-slate-700"
                        >
                            <option value="release" className="bg-slate-900">출시 순서</option>
                            <option value="recommended" className="bg-slate-900">추천 순서</option>
                        </select>
                        <select
                            value={season}
                            onChange={e => setSeason(Number(e.target.value))}
                            className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-bold outline-none text-slate-100 transition-all active:bg-slate-700"
                        >
                            <option value={1}>S1</option>
                            <option value={2}>S2</option>
                            <option value={3}>S3</option>
                        </select>
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
                                            <img src={getImageUrl(node.data.image)} alt={node.data.label} loading="lazy" className="max-w-full max-h-full object-contain drop-shadow-2xl" />
                                            {node.data.type === 'eternal' && (
                                                <div className="absolute top-1 left-1 z-10 bg-emerald-500/80 rounded-full p-0.5 shadow-[0_0_5px_rgba(16,185,129,0.5)]">
                                                    <Sprout size={10} className="text-white" />
                                                </div>
                                            )}
                                            {node.data.youtubeUrl && !node.data.watched && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                                                    <Play className="text-white/30 fill-white/10" size={18} />
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 px-2.5 min-w-0 flex flex-col justify-center gap-1">
                                            {/* Top Row: Type & Video Indicator */}
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-black tracking-widest uppercase ${node.data.type === 'main' ? 'bg-blue-500/20 text-blue-400' : node.data.type === 'theme' ? 'bg-purple-500/20 text-purple-400' : node.data.type === 'eternal' ? 'bg-emerald-500/20 text-emerald-400' : node.data.type === 'annotation' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-500/20 text-slate-400'}`}>
                                                    {node.data.type === 'main' ? 'MAIN' : node.data.type === 'theme' ? 'THEME' : node.data.type === 'eternal' ? 'ETERNAL' : node.data.type === 'annotation' ? 'CURATION' : 'ETC'}
                                                </span>
                                                {node.data.youtubeUrl && (
                                                    <Youtube size={10} className="text-rose-500/60" />
                                                )}
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
                                                            onPointerDown={(e) => e.stopPropagation()}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingNode(node);
                                                                setFormData({ ...node.data, x: node.position.x, y: node.position.y });
                                                                setShowForm(true);
                                                            }}
                                                            className="p-1.5 text-blue-400/80 hover:text-blue-400 bg-slate-800/50 rounded pointer-events-auto active:scale-125 transition-transform"
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
                                        <option value="eternal">영원살이</option>
                                        <option value="annotation">큐레이션</option>
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
                            {(formData.type === 'theme' || formData.type === 'eternal') && (
                                <div>
                                    <label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">Protagonist</label>
                                    <input type="text" value={formData.protagonist || ''} onChange={e => setFormData({ ...formData, protagonist: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-sm focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="에르핀, 네르 등" />
                                </div>
                            )}

                            <div>
                                <label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">YouTube link</label>
                                <input type="text" value={formData.youtubeUrl} onChange={e => setFormData({ ...formData, youtubeUrl: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-xs font-mono outline-none" placeholder="https://youtube.com/..." />
                            </div>

                            <div>
                                <label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">하단 표시 정보 (회차, 부제 등)</label>
                                <input type="text" value={formData.partLabel || ''} onChange={e => setFormData({ ...formData, partLabel: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-sm focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="예: 제 1화" />
                            </div>
                        </div>
                        <div className="p-4 bg-slate-950/80 border-t border-slate-800 rounded-b-2xl flex gap-3">
                            {editingNode && (
                                <button
                                    onClick={() => {
                                        if (confirm("이 노드를 삭제하시겠습니까? (이 배치에서만 사라지고 마스터 데이터는 유지됩니다)")) {
                                            const up = nodes.filter(n => n.id !== editingNode.id);
                                            setNodes(up);
                                            syncToCloud(up);
                                            setShowForm(false);
                                            setEditingNode(null);
                                        }
                                    }}
                                    className="px-4 py-3.5 bg-rose-600/20 hover:bg-rose-600 text-rose-500 hover:text-white border border-rose-500/30 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                            <button onClick={async () => {
                                if (!formData.label) { alert("제목!"); return; }
                                if (!supabase || !sessionPassword.current) return;

                                try {
                                    let storyId = (formData as any).story_id;

                                    if (editingNode && storyId) {
                                        // Update existing master story
                                        await supabase.rpc('update_master_story', {
                                            p_id: storyId,
                                            p_label: formData.label,
                                            p_type: formData.type,
                                            p_image: formData.image,
                                            p_youtube_url: formData.youtubeUrl || '',
                                            p_protagonist: formData.protagonist || '',
                                            p_part_label: formData.partLabel || '',
                                            p_importance: formData.importance || 1,
                                            p_password: sessionPassword.current
                                        });
                                    } else {
                                        // Create new master story
                                        const { data: newId, error } = await supabase.rpc('create_master_story', {
                                            p_label: formData.label,
                                            p_type: formData.type,
                                            p_image: formData.image,
                                            p_youtube_url: formData.youtubeUrl || '',
                                            p_protagonist: formData.protagonist || '',
                                            p_part_label: formData.partLabel || '',
                                            p_importance: formData.importance || 1,
                                            p_password: sessionPassword.current
                                        });
                                        if (error || !newId) throw new Error("Master story creation failed");
                                        storyId = newId;
                                    }

                                    let newNodes: Node[];
                                    if (editingNode) {
                                        newNodes = nodes.map(n => n.id === editingNode.id ? { ...n, position: { x: formData.x, y: formData.y }, data: { ...n.data, ...formData, story_id: storyId } } : n);
                                    } else {
                                        const newNode: Node = {
                                            id: `n_${Date.now()}`,
                                            position: { x: formData.x, y: formData.y },
                                            data: { ...formData, story_id: storyId, watched: false }
                                        };
                                        newNodes = [...nodes, newNode];
                                    }
                                    setNodes(newNodes);
                                    const ok = await syncToCloud(newNodes);
                                    if (ok) alert("저장되었습니다.");
                                    else alert("클라우드 저장 실패! (로컬에는 저장됨)");
                                    setShowForm(false);
                                    setEditingNode(null);
                                } catch (err) {
                                    console.error("Save error:", err);
                                    alert("저장 중 오류가 발생했습니다.");
                                }
                            }} className="flex-grow py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
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
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full relative">
                        <button onClick={() => setShowInfo(false)} className="absolute top-4 right-4 text-slate-500">
                            <X size={20} />
                        </button>
                        <h2 className="text-lg font-black mb-4 uppercase italic text-indigo-400">Notice</h2>
                        <div className="space-y-3">
                            <p className="text-[11px] leading-relaxed text-slate-300">
                                <b>가이드 안내</b><br />
                                • 본 스토리 가이드는 공식 가이드가 아니며, 참고용 자료입니다.<br />
                                • 출시 순서: Epid Games에서 업데이트한 콘텐츠의 출시 순서를 기준으로 정리되어 있습니다.<br />
                                • 추천 순서: 극장 개편 이후 기준으로, 기존 출시 순서와 인게임에서 실제 접근 가능한 순서를 종합하여 개발자가 추천하는 진행 순서입니다.<br />
                                • 본 사이트는 운영상 문제가 발생할 경우 예고 없이 운영이 중단될 수 있으며, 모든 영상 및 이미지의 저작권은 Epid Games에 귀속됩니다.
                            </p>
                        </div>
                        <button onClick={() => setShowInfo(false)} className="w-full mt-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all">
                            Check
                        </button>
                    </div>
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
                            <span className={`text-[10px] px-6 py-2 rounded-full font-black tracking-[0.3em] uppercase shadow-lg backdrop-blur-md border border-white/10 ${selectedDetailNode.data.type === 'main' ? 'bg-blue-600/60 text-white' : selectedDetailNode.data.type === 'theme' ? 'bg-purple-600/60 text-white' : selectedDetailNode.data.type === 'eternal' ? 'bg-emerald-600/60 text-white' : selectedDetailNode.data.type === 'annotation' ? 'bg-amber-600/60 text-white' : 'bg-slate-700/60 text-white'}`}>
                                {selectedDetailNode.data.type === 'eternal' ? 'ETERNAL' : selectedDetailNode.data.type === 'annotation' ? 'CURATION' : selectedDetailNode.data.type}
                            </span>
                        </div>
                        {/* Poster Box - Original Aspect Ratio */}
                        <div className="w-full flex items-center justify-center rounded-3xl overflow-hidden border border-white/10 shadow-2xl mb-8 relative group bg-black/40">
                            <img
                                src={getImageUrl(selectedDetailNode.data.image)}
                                alt={selectedDetailNode.data.label}
                                loading="lazy"
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
                                        <span>{selectedDetailNode.data.type === 'theme' || selectedDetailNode.data.type === 'eternal' ? 'PV 시청하기' : 'YOUTUBE 시청하기'}</span>
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

            {/* Master Story Library Modal */}
            {showMasterLibrary && (
                <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-[600] flex flex-col p-4 animate-in slide-in-from-bottom-5">
                    <header className="flex flex-col gap-4 p-4 bg-slate-900 border-b border-slate-800 rounded-t-3xl">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                                    <Library size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-100 italic tracking-tight">MASTER LIBRARY</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Select story to import</p>
                                </div>
                            </div>
                            <button onClick={() => setShowMasterLibrary(false)} className="text-slate-500 hover:text-white transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex bg-slate-950/50 p-1 rounded-xl border border-slate-800">
                            {(['main', 'theme', 'etc', 'eternal'] as const).map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => setLibraryCategory(cat)}
                                    className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${libraryCategory === cat
                                        ? 'bg-indigo-600 text-white shadow-lg'
                                        : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                >
                                    {cat === 'main' ? 'Main' : cat === 'theme' ? 'Theme' : cat === 'eternal' ? 'Eternal' : 'ETC'}
                                </button>
                            ))}
                        </div>
                    </header>

                    <div className="flex-grow overflow-y-auto p-4 custom-scrollbar bg-slate-950/20">
                        {isFetchingMasters ? (
                            <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-500">
                                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                <p className="text-xs font-bold animate-pulse uppercase tracking-widest">Loading Library...</p>
                            </div>
                        ) : masterStories.filter(m => m.type === libraryCategory).length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500">
                                <Library size={40} className="opacity-20" />
                                <p className="text-sm font-bold opacity-40">이 카테고리에 마스터 노드가 없습니다.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-5 gap-1.5">
                                {masterStories.filter(m => m.type === libraryCategory).map((m) => (
                                    <button
                                        key={m.id}
                                        onClick={() => handleImportMaster(m)}
                                        className="group relative aspect-[3/4] bg-slate-800 rounded-xl overflow-hidden border border-slate-700 active:scale-95 transition-all shadow-lg"
                                    >
                                        {m.image ? (
                                            <img src={m.image} className="w-full h-full object-cover" alt={m.label} loading="lazy" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-slate-700/30">
                                                <ImageIcon size={32} className="text-slate-600" />
                                            </div>
                                        )}
                                        <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/95 via-black/70 to-transparent">
                                            <p className="text-[7px] font-bold text-white truncate">{m.label}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <footer className="p-4 bg-slate-900 border-t border-slate-800 flex justify-end">
                        <button onClick={() => setShowMasterLibrary(false)} className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-xl transition-all text-[10px] uppercase tracking-widest border border-slate-700">
                            Close Library
                        </button>
                    </footer>
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
