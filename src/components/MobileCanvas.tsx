"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    Search, Info, Youtube, Play, X, Settings, StickyNote, ChevronDown,
    Plus, Edit2, Trash2, Save, Upload, Image as ImageIcon,
    Layout, Monitor, CheckCircle, Shield, ChevronLeft, ChevronRight, Library, Sprout, Bell, TriangleAlert, MapPin, Lightbulb, FileSpreadsheet, RotateCcw
} from 'lucide-react';
import * as api from '../lib/api';
import { imageUrl } from '../lib/api';
import { canUndo, createUndoStack, layoutSignature, record, undo as popUndo } from '../lib/undo.mjs';
import { resolveAnchor } from '../lib/curation.mjs';
import YouTubeEmbed from './YouTubeEmbed';
import { CurationText } from './CurationNode';

const isProd = process.env.NODE_ENV === 'production';
const repoName = 'trickcal-story-guide-ember';
const basePath = isProd ? `/${repoName}` : '';
const isDbConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const TABLE_NAME = process.env.NEXT_PUBLIC_STORY_TABLE_NAME || 'story_data';
interface StoryNodeData {
    label: string;
    type: 'main' | 'theme' | 'theme_x' | 'theme_now' | 'etc' | 'eternal' | 'annotation' | 'frontier';
    image: string;
    youtubeUrl: string;
    fullVideoUrl?: string;
    protagonist?: string;
    partLabel?: string;
    importance?: number;
    watched?: boolean;
    m_x?: number; // Mobile specific X
    m_y?: number; // Mobile specific Y
    story_id?: string;
    content?: string;
    splitType?: 'none' | 'part1' | 'part2';
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

    // Load saved settings from localStorage
    const savedSettings = useMemo(() => {
        try {
            const raw = localStorage.getItem('user_settings');
            if (raw) return JSON.parse(raw);
        } catch { }
        return null;
    }, []);
    const [season, setSeason] = useState(savedSettings?.season ?? 1);
    const [viewType, setViewType] = useState<'recommended' | 'release' | 'elflix'>(savedSettings?.viewType ?? 'release');
    const [showMasterLibrary, setShowMasterLibrary] = useState(false);
    const [masterStories, setMasterStories] = useState<any[]>([]);
    const [isFetchingMasters, setIsFetchingMasters] = useState(false);
    const [libraryCategory, setLibraryCategory] = useState<'main' | 'theme' | 'etc' | 'eternal' | 'annotation' | 'frontier'>('main');
    const [searchQuery, setSearchQuery] = useState('');
    const [showInfo, setShowInfo] = useState(false);
    const [showMemo, setShowMemo] = useState(false);
    const [memoText, setMemoText] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [selectedDetailNode, setSelectedDetailNode] = useState<Node | null>(null);
    const [noteNode, setNoteNode] = useState<Node | null>(null);   // 큐레이션 노트 시트
    const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
    const [activeVideoDetails, setActiveVideoDetails] = useState<{ id: string, startTime: number, endTime: number } | null>(null);
    const [searchIndex, setSearchIndex] = useState(0);

    // Admin States
    const [showForm, setShowForm] = useState(false);
    const [editingNode, setEditingNode] = useState<Node | null>(null);
    const [formData, setFormData] = useState<StoryNodeData & { x: number, y: number }>({
        label: '',
        type: 'main',
        image: '',
        youtubeUrl: '',
        fullVideoUrl: '',
        protagonist: '',
        x: 0,
        y: 0,
        partLabel: '',
        importance: 0,
        splitType: 'none'
    });
    const [isUploading, setIsUploading] = useState(false);

    // Drag States
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const [showUpdateLog, setShowUpdateLog] = useState(false);
    const [updateLogContent, setUpdateLogContent] = useState('');
    const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null);
    const [hasNewUpdate, setHasNewUpdate] = useState(false);
    const [isSavingUpdate, setIsSavingUpdate] = useState(false);
    const [navHighlightedNodeId, setNavHighlightedNodeId] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    // Filter State
    const [importanceFilter, setImportanceFilter] = useState<0 | 1 | 2>(savedSettings?.importanceFilter ?? 0);

    const scrollRef = useRef<HTMLDivElement>(null);
    const pendingScrollStoryId = useRef<string | null>(null);

    useEffect(() => {
        const load = async () => {
            setIsLoaded(false);
            setIsLoading(true);
            setNodes([]);
            try {
                // Worker가 레이아웃과 참조 스토리를 한 번에 조인해 돌려준다.
                const layout = await api.fetchLayout(viewType, season);
                const layoutNodes = layout.nodes as any[];

                if (layoutNodes.length === 0) {
                    setNodes([]);
                    setEdges([]);
                    return;
                }

                const masterMap = new Map(layout.stories.map(m => [m.id, m as any]));
                const hist = JSON.parse(localStorage.getItem(`watched_history_s${season}`) || '{}');

                const processedNodes = layoutNodes.map(ln => {
                    if (ln.type === 'annotationNode') {
                        return {
                            id: ln.id,
                            position: { x: ln.x || 0, y: ln.y || 0 },
                            width: ln.w || 96,
                            height: ln.h || 96,
                            data: {
                                // label 은 라이브러리용 짧은 이름, content 가 본문.
                                // 본문의 정본은 master 이고 ln.content 는 이관 전 폴백이다.
                                label: masterMap.get(ln.story_id)?.label || '큐레이션',
                                type: 'annotation',
                                story_id: ln.story_id,
                                content: masterMap.get(ln.story_id)?.content || ln.content,
                                image: '',
                                youtubeUrl: '',
                                importance: 0
                            }
                        } as Node;
                    }

                    const master = masterMap.get(ln.story_id);
                    const masterData = master || {};

                    // Consistent defaults for migrated data
                    const getMigratedDimensions = (type: string) => {
                        if (type === 'main') return { w: 260, h: 380 };
                        if (type === 'theme' || type === 'theme_x') return { w: 320, h: 200 };
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
                            fullVideoUrl: masterData.full_video_url,
                            partLabel: masterData.part_label,
                            story_id: ln.story_id,
                            splitType: ln.splitType,
                            m_x: ln.m_x,
                            m_y: ln.m_y,
                            watched: !!hist[ln.story_id || ln.id],
                            image: masterData.image   // 상대 키 그대로
                        }
                    } as Node;
                });

                setNodes(processedNodes);
                setEdges(layout.edges || []);
                setIsLoaded(true);
            } catch (err) {
                console.error("Mobile load error:", err);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [season, viewType]);


    // Load Update Log
    useEffect(() => {
        const fetchUpdateLog = async () => {
            try {
                const [data] = await api.fetchUpdates();
                if (data) {
                    setUpdateLogContent(data.content);
                    setLastUpdateAt(data.updated_at);

                    // Check if there's a new update since last visit
                    const lastRead = localStorage.getItem('last_read_update_at');
                    if (!lastRead || new Date(data.updated_at) > new Date(lastRead)) {
                        setHasNewUpdate(true);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch update log:", err);
            }
        };
        fetchUpdateLog();

        // Auto-open info panel on first visit
        const introCompleted = localStorage.getItem('intro_completed');
        if (!introCompleted) {
            setShowInfo(true);
        }
    }, []);

    // Persist settings changes to localStorage
    useEffect(() => {
        const settings = { viewType, season, importanceFilter };
        localStorage.setItem('user_settings', JSON.stringify(settings));
    }, [viewType, season, importanceFilter]);

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
            } else if (noteNode) {
                setNoteNode(null);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [activeVideoUrl, selectedDetailNode, showInfo, showMemo, noteNode]);

    // Push states to history to enable back button closing
    useEffect(() => {
        // If any modal becomes open, push a state
        const anyOpen = !!selectedDetailNode || !!activeVideoUrl || showInfo || showMemo || !!noteNode;
        if (anyOpen) {
            // Check if we already pushed for this state to avoid loops
            // Using a simple state check
            window.history.pushState({ modal: true }, '');
        }
    }, [!!selectedDetailNode, !!activeVideoUrl, showInfo, showMemo, !!noteNode]);

    // Save Memo
    useEffect(() => {
        localStorage.setItem('user_story_memo', memoText);
    }, [memoText]);

    const syncToCloud = async (newNodes: Node[]) => {
        if (!isAdmin) return false;
        try {
            // Convert to layout format
            const layoutNodes = newNodes.map(n => {
                const base = {
                    id: n.id,
                    type: n.data.type === 'annotation' ? 'annotationNode' : undefined,
                    x: n.position.x,
                    y: n.position.y,
                    w: (n as any).width,
                    h: (n as any).height,
                    m_x: n.data.m_x,
                    m_y: n.data.m_y
                };

                if (n.data.type === 'annotation') {
                    return { ...base, story_id: (n.data as any).story_id, content: n.data.content };
                }

                // splitType은 PC에서만 편집하지만 저장은 양쪽이 한다. 여기서 빠뜨리면
                // 모바일 관리자가 한 번 저장하는 순간 전 노드의 분할 설정이 지워진다.
                return { ...base, story_id: (n.data as any).story_id || n.id, splitType: n.data.splitType };
            });

            await api.saveLayout(viewType, season, layoutNodes, edges);
            return true;
        } catch (err) {
            console.error("레이아웃 저장 실패:", err);
            alert(err instanceof Error ? err.message : "저장에 실패했습니다.");
            return false;
        }
    };

    // 되돌리기 (관리자 전용). PC와 같은 규칙 — src/lib/undo.mjs.
    // 모바일은 드래그 중간 상태를 setNodes 하지 않으므로(손 뗄 때 한 번) 제스처 묶음이 필요 없다.
    // 자동 저장 디바운스도 없어서 되돌린 뒤 직접 올린다.
    const undoStack = useRef(createUndoStack<Node[]>());
    const [undoAvailable, setUndoAvailable] = useState(false);
    // 관리자 진입 시점의 배치. "변경 취소하고 나가기"가 여기로 되돌린다.
    const adminBaseRef = useRef<Node[] | null>(null);

    useEffect(() => {
        if (!isAdmin || !isLoaded || nodes.length === 0) return;
        if (!adminBaseRef.current) adminBaseRef.current = nodes;
        record(undoStack.current, nodes, (s) => layoutSignature(s));
        setUndoAvailable(canUndo(undoStack.current));
    }, [nodes, isAdmin, isLoaded]);

    useEffect(() => {
        undoStack.current = createUndoStack();
        adminBaseRef.current = null;
        setUndoAvailable(false);
    }, [season, viewType]);

    const handleUndo = async () => {
        const prev = popUndo(undoStack.current);
        setUndoAvailable(canUndo(undoStack.current));
        if (!prev) return;
        setNodes(prev);
        await syncToCloud(prev);
    };

    const leaveAdmin = () => {
        setIsAdmin(false);
        api.logout();
        undoStack.current = createUndoStack();
        adminBaseRef.current = null;
        setUndoAvailable(false);
    };

    /**
     * 배치 변경을 버리고 나간다. 편집할 때마다 이미 클라우드에 올라가 있으므로,
     * 관리자로 들어온 시점의 배치를 다시 올려야 실제로 취소가 된다.
     */
    const discardAndLeaveAdmin = async () => {
        const base = adminBaseRef.current;
        if (!confirm(
            "이번 관리자 세션에서 바꾼 배치를 모두 취소하고 나갑니다.\n\n" +
            "주의: 스토리 폼에서 저장한 제목·이미지·영상 링크는 이미 저장돼 있어 되돌아가지 않습니다."
        )) return;

        if (base) {
            setNodes(base);
            const ok = await syncToCloud(base);
            if (!ok && !confirm("되돌린 배치를 저장하지 못했습니다. 그래도 나갈까요?")) return;
        }
        leaveAdmin();
    };

    const getYouTubeInfo = (url: string) => {
        if (!url) return null;
        const idRegExp = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const idMatch = url.match(idRegExp);
        if (!idMatch) return null;

        const id = idMatch[1];
        let startTime = 0;
        let endTime = 0;

        // Extract start time
        const startMatch = url.match(/[?&](t|start)=([^&#]+)/);
        if (startMatch) {
            const timeStr = startMatch[2];
            if (/^\d+$/.test(timeStr)) {
                startTime = parseInt(timeStr, 10);
            } else {
                // Handle 1m30s etc
                const h = timeStr.match(/(\d+)h/);
                const m = timeStr.match(/(\d+)m/);
                const s = timeStr.match(/(\d+)s/);
                if (h) startTime += parseInt(h[1], 10) * 3600;
                if (m) startTime += parseInt(m[1], 10) * 60;
                if (s) startTime += parseInt(s[1], 10);
            }
        }

        // Extract end time
        const endMatch = url.match(/[?&]end=([^&#]+)/);
        if (endMatch) {
            const timeStr = endMatch[1];
            if (/^\d+$/.test(timeStr)) {
                endTime = parseInt(timeStr, 10);
            }
        }

        return { id, startTime, endTime };
    };

    // Layout Constants (Denser Layout)
    const ROW_HEIGHT = 70;
    const ROW_GAP = 6;
    const SLOT_UNIT = 80; // Slightly tighter slot unit

    // Layout Logic (Slot-based Engine)
    const layoutInfo = useMemo(() => {
        // Render non-annotation nodes only
        const nodesToLayout = nodes.filter(n => n.data.type !== 'annotation');

        if (nodesToLayout.length === 0) return { nodes: [], curationByAnchor: new Map(), totalHeight: 1000, maxRow: 10 };

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

        // 큐레이션은 격자에 슬롯을 차지하지 않는다. PC 는 앵커 카드의 코너에 물리지만
        // 모바일 카드는 70px 한 줄이라 그럴 자리가 없다. 대신 앵커 카드 우측 상단에
        // 작은 버튼으로 얹는다. 시청 체크는 우측 중앙이라 세로로 떨어져 있다.
        // 앵커가 없는 큐레이션은 뜰 자리가 없어 건너뛴다. PC 관리자 화면에서 붉게 표시된다.
        const byId = new Map(slottedNodes.map(n => [n.id, n]));
        const curationByAnchor = new Map();
        for (const n of nodes) {
            if (n.data.type !== 'annotation') continue;
            const hit = resolveAnchor(n.id, edges, (id: string) => byId.has(id));
            if (!hit) continue;
            const list = curationByAnchor.get(hit.anchorId) || [];
            list.push({ node: n, side: hit.side as 'before' | 'after' });
            curationByAnchor.set(hit.anchorId, list);
        }

        return {
            nodes: slottedNodes,
            curationByAnchor,
            totalHeight: (maxRow + 10) * (ROW_HEIGHT + ROW_GAP) + 400,
            maxRow
        };
    }, [nodes, edges]);

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

        // Trigger highlight
        setNavHighlightedNodeId(id);
        setTimeout(() => setNavHighlightedNodeId(null), 2000);
    };

    // Auto-scroll on search start
    useEffect(() => {
        if (matchedNodeIds.length > 0) {
            setSearchIndex(0);
            scrollToMatch(matchedNodeIds[0]);
        }
    }, [searchQuery, matchedNodeIds.length]);

    // Handle cross-season pending navigation (Mobile)
    useEffect(() => {
        if (isLoaded && pendingScrollStoryId.current && layoutInfo.nodes.length > 0) {
            const storyId = pendingScrollStoryId.current;
            const target = layoutInfo.nodes.find(n => n.data.story_id === storyId);
            if (target) {
                pendingScrollStoryId.current = null;
                // Wait for the layout and scroll container to fully realize the new content
                setTimeout(() => {
                    scrollToMatch(target.id);
                }, 800);
            }
        }
    }, [layoutInfo.nodes, isLoaded]);

    const toggleWatch = useCallback((id: string, e: React.MouseEvent) => {
        e.stopPropagation();

        setNodes(nds => {
            const targetNode = nds.find(n => n.id === id);
            if (!targetNode) return nds;

            const nw = !targetNode.data.watched;
            const syncId = targetNode.data.story_id;

            const histStr = localStorage.getItem(`watched_history_s${season}`) || '{}';
            const hist = JSON.parse(histStr);
            const storageKey = syncId || id;
            hist[storageKey] = nw;
            localStorage.setItem(`watched_history_s${season}`, JSON.stringify(hist));

            if (nw) {
                localStorage.setItem('last_watched_story', JSON.stringify({ id: storageKey, season }));
            }

            return nds.map(n => {
                const isSameStory = syncId && n.data.story_id === syncId;
                const isSameNode = n.id === id;
                if (isSameStory || isSameNode) {
                    return { ...n, data: { ...n.data, watched: nw } };
                }
                return n;
            });
        });
    }, [season]);

    const fetchMasterStories = async () => {
        setIsFetchingMasters(true);
        try {
            const data = await api.fetchAllStories();
            setMasterStories([...data].sort((a, b) => a.label.localeCompare(b.label)));
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
                image: m.image,
                youtubeUrl: m.youtube_url,
                fullVideoUrl: m.full_video_url,
                protagonist: m.protagonist,
                partLabel: m.part_label,
                importance: m.importance,
                splitType: m.split_type || 'none',
                content: m.content || '',
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
            leaveAdmin();
        } else {
            const pw = prompt("관리자 비밀번호를 입력하세요.");
            if (!pw) return;
            try {
                await api.login(pw);
            } catch (err) {
                alert(err instanceof Error ? err.message : "인증에 실패했습니다.");
                return;
            }
            setIsAdmin(true);
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
        if (!file) return;
        setIsUploading(true);
        try {
            // R2 키를 그대로 담는다 (D1에 저장되는 값과 동일).
            const key = await api.uploadImage(file, season);
            setFormData(prev => ({ ...prev, image: key }));
        } catch (err) {
            alert(err instanceof Error ? err.message : "업로드 실패");
        } finally {
            setIsUploading(false);
        }
    };

    const getImageUrl = (imagePath: string) => {
        if (!imagePath) return `${basePath}/images/placeholder.jpg`;
        if (imagePath.startsWith('http') || imagePath.startsWith('data:')) return imagePath;
        return imageUrl(imagePath);
    };

    const scrollContainerHeight = layoutInfo.totalHeight;

    return (
        <div className="fixed inset-0 bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
            <div className="absolute inset-0 pointer-events-none z-0 opacity-10" style={{ backgroundImage: `url(${basePath}/images/background.jpg)`, backgroundSize: 'cover', backgroundPosition: 'center' }} />

            <header className="relative z-50 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/50 p-3 pt-4 shrink-0 shadow-2xl">
                <div className="flex items-center justify-between mb-3 gap-2">
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => setShowInfo(!showInfo)} className="p-2 bg-slate-800/80 rounded-xl text-slate-400 border border-slate-700 transition-all active:scale-95">
                            <Info size={16} />
                        </button>
                        <button onClick={onToggleView} className="p-2 bg-slate-800/80 rounded-xl text-slate-400 border border-slate-700 transition-all active:scale-95" title="PC View">
                            <Monitor size={16} />
                        </button>
                        <button
                            onClick={() => {
                                setShowUpdateLog(true);
                                if (hasNewUpdate) {
                                    setHasNewUpdate(false);
                                    localStorage.setItem('last_read_update_at', lastUpdateAt || new Date().toISOString());
                                }
                            }}
                            className={`p-2 rounded-xl border transition-all active:scale-95 ${hasNewUpdate
                                ? 'bg-lime-500/20 border-lime-500/50 text-lime-400 shadow-[0_0_15px_rgba(163,230,53,0.3)]'
                                : 'bg-slate-800/80 border-slate-700 text-slate-400'
                                }`}
                        >
                            <Bell size={16} className={hasNewUpdate ? 'animate-pulse' : ''} />
                        </button>
                    </div>

                    {/* Admin Center Group */}
                    {(
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/30 rounded-2xl border border-white/5 shadow-inner">
                            <button onClick={toggleAdmin} className={`p-1.5 rounded-lg border transition-all ${isAdmin ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-transparent border-none text-slate-800 opacity-[0.15] hover:opacity-50'}`}>
                                <Shield size={14} />
                            </button>
                            {isAdmin && (
                                <>
                                    <button
                                        onClick={handleUndo}
                                        disabled={!undoAvailable}
                                        className="p-1.5 bg-slate-800 rounded-lg text-slate-300 border border-slate-700 disabled:opacity-25"
                                        title="되돌리기 (배치만)"
                                    >
                                        <RotateCcw size={13} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            fetchMasterStories();
                                            setShowMasterLibrary(true);
                                        }}
                                        className="p-1.5 bg-slate-800 rounded-lg text-indigo-400 border border-slate-700"
                                        title="마스터 불러오기"
                                    >
                                        <Library size={13} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            const maxY = nodes.length > 0 ? Math.max(...nodes.map(n => n.position.y)) : 0;
                                            setEditingNode(null);
                                            setFormData({ label: '', type: 'main', image: '', youtubeUrl: '', protagonist: '', x: 0, y: maxY + SLOT_UNIT, partLabel: '', importance: 0 });
                                            setShowForm(true);
                                        }}
                                        className="p-1.5 bg-slate-800 rounded-lg text-green-400 border border-slate-700"
                                        title="새 마스터 생성"
                                    >
                                        <Plus size={13} />
                                    </button>
                                    <button
                                        onClick={discardAndLeaveAdmin}
                                        className="p-1.5 bg-slate-800 rounded-lg text-rose-400 border border-slate-700"
                                        title="변경 취소하고 나가기"
                                    >
                                        <X size={13} />
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    <div className="flex items-center gap-1.5 shrink-0">
                        <select
                            value={importanceFilter}
                            onChange={(e) => setImportanceFilter(Number(e.target.value) as 0 | 1 | 2)}
                            className="bg-slate-800 border border-slate-700 rounded-xl px-2 py-2 text-[10px] font-bold text-slate-100 outline-none"
                        >
                            <option value={0} className="bg-slate-900">필터: 모두</option>
                            <option value={1} className="bg-slate-900">필터: 권장</option>
                            <option value={2} className="bg-slate-900">필터: 압축</option>
                        </select>
                        <select
                            value={viewType}
                            onChange={(e) => setViewType(e.target.value as any)}
                            className="bg-slate-800 border border-slate-700 rounded-xl px-2 py-2 text-[10px] font-bold text-slate-100 outline-none cursor-pointer transition-all active:bg-slate-700"
                        >
                            <option value="release" className="bg-slate-900">순서: 출시</option>
                            <option value="recommended" className="bg-slate-900">순서: 추천</option>
                            <option value="elflix" className="bg-slate-900">순서: ELFLIX</option>
                        </select>
                        <select
                            value={season}
                            onChange={e => setSeason(Number(e.target.value))}
                            className="bg-slate-800 border border-slate-700 rounded-xl px-2 py-2 text-[10px] font-bold outline-none text-slate-100 transition-all active:bg-slate-700"
                        >
                            <option value={1}>시즌: 1</option>
                            <option value={2}>시즌: 2</option>
                            <option value={3}>시즌: 3</option>
                        </select>
                    </div>
                </div>

                <div className="flex gap-2 items-center">
                    <button
                        onClick={() => {
                            const last = localStorage.getItem('last_watched_story');
                            if (!last) return;
                            const { id: storyId, season: savedSeason } = JSON.parse(last);
                            if (!storyId) return;

                            // Clear search when navigating to last watched
                            setSearchQuery('');

                            if (savedSeason && savedSeason !== season) {
                                pendingScrollStoryId.current = storyId;
                                setIsLoaded(false); // Force isLoaded to false to prevent premature jump
                                setSeason(savedSeason);
                            } else {
                                const target = nodes.find(n => n.data.story_id === storyId);
                                if (target) {
                                    // Delay to ensure search clear doesn't conflict with highlight
                                    setTimeout(() => scrollToMatch(target.id), 100);
                                }
                            }
                        }}
                        className="p-2 bg-slate-800/50 border border-slate-700/30 rounded-xl text-slate-400 transition-all active:scale-95 group shrink-0"
                        title="최근 본 스토리로 이동"
                    >
                        <MapPin size={16} className="group-hover:animate-bounce" />
                    </button>
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
                        className={`p-2 rounded-xl border transition-all active:scale-95 shrink-0 ${memoText.trim()
                            ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg'
                            : 'bg-slate-800/80 border-slate-700 text-slate-400'
                            }`}
                    >
                        <StickyNote size={18} />
                    </button>
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
                        const isDimmed = !isAdmin && node.data.type !== 'annotation' && (node.data.importance || 0) < importanceFilter;

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
                                id={`node-${node.id}`}
                                className={`absolute transition-all select-none ${isDragging ? '' : 'duration-700 ease-[cubic-bezier(0.2,1,0.2,1)]'} ${isAdmin ? 'touch-none' : 'touch-pan-y active:scale-[0.98]'} ${isDimmed ? (node.data.watched ? 'opacity-40 pointer-events-none' : 'opacity-20 grayscale pointer-events-none') : ''}`}
                                onPointerDown={(e) => handleDragStart(node.id, e)}
                                onClick={() => !isAdmin && !isDimmed && setSelectedDetailNode(node)}
                                style={{
                                    ...dragStyle,
                                    height: `${ROW_HEIGHT}px`,
                                    padding: '4px'
                                }}
                            >
                                <div className={`h-full group relative transition-all ${isDragging ? 'ring-2 ring-indigo-500 shadow-2xl bg-slate-800 rounded-2xl' : ''} ${navHighlightedNodeId === node.id ? 'ring-4 ring-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.8)] rounded-2xl animate-pulse z-10' : matchedNodeIds.includes(node.id) ? 'ring-2 ring-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.5)] rounded-2xl' : ''}`}>
                                <div className={`flex items-center h-full bg-slate-900/40 border rounded-xl overflow-hidden backdrop-blur-md transition-all duration-500 ${node.data.watched ? 'opacity-60 border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'hover:bg-slate-800/60 shadow-lg border-slate-800/40'}`}>
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
                                                <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-black tracking-widest uppercase ${node.data.type === 'main' ? 'bg-blue-500/20 text-blue-400' : node.data.type === 'theme' || node.data.type === 'theme_now' ? 'bg-purple-500/20 text-purple-400' : node.data.type === 'theme_x' ? 'bg-rose-500/20 text-rose-400' : node.data.type === 'eternal' ? 'bg-emerald-500/20 text-emerald-400' : node.data.type === 'annotation' ? 'bg-amber-500/20 text-amber-400' : node.data.type === 'frontier' ? 'bg-orange-600/20 text-orange-400' : 'bg-slate-500/20 text-slate-400'}`}>
                                                    {node.data.type === 'main' ? 'MAIN' : node.data.type === 'theme' ? 'THEME' : node.data.type === 'theme_x' ? 'THEME (재개봉관 준비 중)' : node.data.type === 'theme_now' ? 'THEME (상영중)' : node.data.type === 'eternal' ? 'ETERNAL' : node.data.type === 'annotation' ? 'CURATION' : node.data.type === 'frontier' ? 'FRONTIER' : 'ETC'}
                                                </span>
                                                {node.data.youtubeUrl && (
                                                    <Youtube size={10} className="text-rose-500/60" />
                                                )}
                                            </div>

                                            {/* Bottom Row: Title */}
                                            <h3 className="font-bold leading-tight text-[11px] text-slate-100 line-clamp-2 tracking-tight">
                                                {node.data.type === 'main' ? (node.data.partLabel || node.data.label) : node.data.label}
                                            </h3>
                                        </div>

                                        {/* 버튼 열. 큐레이션이 위, 시청 체크가 바로 아래로 정렬된다.
                                            카드 안에 두고 세로로 떨어뜨려 오탭을 막는다. */}
                                        <div className="flex flex-col items-center justify-center gap-1 pr-1.5 shrink-0">
                                            {(layoutInfo.curationByAnchor.get(node.id) || []).length > 0 && (
                                                <div className="flex items-center gap-1">
                                                    {(layoutInfo.curationByAnchor.get(node.id) || []).map((c: any) => (
                                                        <button
                                                            key={c.node.id}
                                                            onPointerDown={(e) => e.stopPropagation()}
                                                            onClick={(e) => { e.stopPropagation(); setNoteNode(c.node); }}
                                                            className={`w-5 h-5 rounded-full flex items-center justify-center border shadow-sm active:scale-90 transition-transform pointer-events-auto ${c.side === 'after'
                                                                ? 'bg-sky-950 border-sky-400 text-sky-300'
                                                                : 'bg-amber-950 border-amber-400 text-amber-300'}`}
                                                            title={c.side === 'after' ? '본 후 읽을 것' : '보기 전 읽을 것'}
                                                        >
                                                            <Lightbulb size={11} />
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onPointerDown={(e) => e.stopPropagation()}
                                                    onClick={(e) => toggleWatch(node.id, e)}
                                                    className={`transition-all pointer-events-auto p-1.5 ${node.data.watched ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]' : 'text-slate-600 active:scale-125'}`}
                                                    title={node.data.watched ? '시청 완료' : '시청 미완료'}
                                                >
                                                    <CheckCircle size={18} fill={node.data.watched ? 'currentColor' : 'none'} className={node.data.watched ? 'fill-emerald-400/20' : ''} />
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
                                        <option value="theme_x">Theme(미개봉)</option>
                                        <option value="theme_now">Theme(상영중)</option>
                                        <option value="etc">ETC</option>
                                        <option value="eternal">영원살이</option>
                                        <option value="frontier">FRONTIER</option>
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
                            {(formData.type === 'theme' || formData.type === 'theme_x' || formData.type === 'eternal' || formData.type === 'frontier') && (
                                <div>
                                    <label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">Protagonist</label>
                                    <input type="text" value={formData.protagonist || ''} onChange={e => setFormData({ ...formData, protagonist: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-sm focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="에르핀, 네르 등" />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">YouTube link (PV)</label>
                                    <input type="text" value={formData.youtubeUrl} onChange={e => setFormData({ ...formData, youtubeUrl: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-xs font-mono outline-none" placeholder="PV https://..." />
                                </div>
                                <div>
                                    <label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">Full Replay (All Types)</label>
                                    <input type="text" value={formData.fullVideoUrl || ''} onChange={e => setFormData({ ...formData, fullVideoUrl: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-xs font-mono outline-none" placeholder="full https://..." />
                                </div>
                            </div>

                            <div>
                                <label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">하단 표시 정보 (회차, 부제 등)</label>
                                <input type="text" value={formData.partLabel || ''} onChange={e => setFormData({ ...formData, partLabel: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-sm focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="예: 제 1화" />
                            </div>

                            <div>
                                <label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">중요도 (0-2)</label>
                                <input type="number" value={formData.importance || 0} min="0" max="2" onChange={e => setFormData({ ...formData, importance: Number(e.target.value) })} className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-sm focus:ring-1 focus:ring-indigo-500 outline-none" />
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

                                try {
                                    let storyId = (formData as any).story_id;

                                    const saved = await api.saveStory({
                                        id: editingNode && storyId ? storyId : undefined,
                                        label: formData.label,
                                        type: formData.type,
                                        image: api.imageKey(formData.image),
                                        youtube_url: formData.youtubeUrl || '',
                                        protagonist: formData.protagonist || '',
                                        part_label: formData.partLabel || '',
                                        importance: formData.importance || 0,
                                        split_type: formData.splitType || 'none',
                                        full_video_url: formData.fullVideoUrl || '',
                                        content: formData.content || '',
                                    });
                                    storyId = saved.id;

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
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-slate-900/95 border border-slate-700/50 rounded-2xl max-w-sm w-full relative backdrop-blur-xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
                        {/* 헤더 (고정) */}
                        <div className="flex items-center gap-2 px-5 pt-5 pb-3 border-b border-slate-800 shrink-0">
                            <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-400 shrink-0">
                                <Info size={16} />
                            </div>
                            <h2 className="text-[15px] font-black bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent leading-tight">
                                트릭컬 스토리 가이드맵 - Ember
                            </h2>
                            <button
                                onClick={() => { setShowInfo(false); localStorage.setItem('intro_completed', 'true'); }}
                                className="ml-auto shrink-0 text-slate-500 p-1 active:scale-90 transition-transform"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* 본문 (스크롤) */}
                        <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">

                        {/* Order Selection Buttons */}
                        <div className="grid grid-cols-1 gap-2 mb-4">
                            <button
                                onClick={() => {
                                    setViewType('release');
                                    localStorage.setItem('intro_completed', 'true');
                                    setShowInfo(false);
                                }}
                                className={`group relative p-4 rounded-xl border-2 transition-all duration-300 text-left overflow-hidden ${viewType === 'release'
                                    ? 'border-violet-500 bg-violet-500/10'
                                    : 'border-slate-700 bg-slate-800/50'
                                    }`}
                            >
                                <div className="text-[13px] font-black text-violet-400 mb-1">📅 출시 순서:</div>
                                <p className="text-[10px] leading-relaxed text-slate-400">
                                    <span className="font-bold text-slate-300">실제 출시되었던 순서 기록</span><br />
                                    Epid Games에서 업데이트한 콘텐츠의 출시 순서를 기준으로 정리되어 있습니다.
                                </p>
                                {viewType === 'release' && (
                                    <div className="absolute top-2 right-2 w-4 h-4 bg-violet-500 rounded-full flex items-center justify-center">
                                        <span className="text-white text-[8px] font-bold">✓</span>
                                    </div>
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    setViewType('recommended');
                                    localStorage.setItem('intro_completed', 'true');
                                    setShowInfo(false);
                                }}
                                className={`group relative p-4 rounded-xl border-2 transition-all duration-300 text-left overflow-hidden ${viewType === 'recommended'
                                    ? 'border-amber-500 bg-amber-500/10'
                                    : 'border-slate-700 bg-slate-800/50'
                                    }`}
                            >
                                <div className="text-[13px] font-black text-amber-400 mb-1">⭐ 추천 순서:</div>
                                <p className="text-[10px] leading-relaxed text-slate-400">
                                    <span className="font-bold text-slate-300">다양한 관점에서 시청 경험 고려</span><br />
                                    가장 많이 유입된 1주년 교주님들의 시청 경험과 새로오신 교주님들을 고려해 순서를 정리했습니다.
                                </p>
                                {viewType === 'recommended' && (
                                    <div className="absolute top-2 right-2 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
                                        <span className="text-white text-[8px] font-bold">✓</span>
                                    </div>
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    setViewType('elflix');
                                    localStorage.setItem('intro_completed', 'true');
                                    setShowInfo(false);
                                }}
                                className={`group relative p-4 rounded-xl border-2 transition-all duration-300 text-left overflow-hidden ${viewType === 'elflix'
                                    ? 'border-sky-500 bg-sky-500/10'
                                    : 'border-slate-700 bg-slate-800/50'
                                    }`}
                            >
                                <div className="text-[13px] font-black text-sky-400 mb-1">🐾 ELFLIX 순서:</div>
                                <p className="text-[10px] leading-relaxed text-slate-400">
                                    <span className="font-bold text-slate-300">ELFLIX 정주행 루트</span><br />
                                    공식이 인게임에서 제공하는 순서 가이드인 ELFLIX의 순서를 그대로 반영하면서도 공식 순서에서 반영하지 않은 메인스토리 전반부/후반부를 나눴습니다.
                                    <br />글로벌 출시 순서로 예상되어 기존 시즌 1 순서와는 차이가 있습니다.
                                </p>
                                {viewType === 'elflix' && (
                                    <div className="absolute top-2 right-2 w-4 h-4 bg-sky-500 rounded-full flex items-center justify-center">
                                        <span className="text-white text-[8px] font-bold">✓</span>
                                    </div>
                                )}
                            </button>
                        </div>

                        {/* Guide Info */}
                        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
                            <p className="text-[10px] leading-relaxed text-slate-400">
                                <b className="text-slate-300">가이드 안내</b><br />
                                • 본 스토리 가이드는 공식 가이드가 아니며, 참고용 자료입니다.<br />
                                • 본 사이트는 문제가 발생할 경우 예고 없이 운영이 중단될 수 있으며, 모든 영상 및 이미지의 저작권은 Epid Games에 귀속됩니다.
                            </p>
                        </div>
                        </div>

                        {/* 감사 링크 (고정 푸터). 스크롤 없이 바로 보여야 해서 본문 밖에 둔다.
                            내용이 겹치던 'Special Thanks to' 문단은 여기로 합쳤다.
                            좁은 화면이라 두 줄로 쌓는다 - 가로 2단이면 글자가 잘린다. */}
                        <div className="shrink-0 border-t border-slate-800 bg-slate-950/50 px-5 py-4">
                            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 mb-2">Special Thanks</p>
                            <div className="flex flex-col gap-2">
                                <a
                                    href="https://docs.google.com/spreadsheets/d/1xhTjImr4F4adLUUe6ifKkVrnLowTxKEDuTpV1GQonc8/edit?gid=0#gid=0"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 active:bg-emerald-500/20 transition-all"
                                >
                                    <FileSpreadsheet size={22} className="text-emerald-400 shrink-0" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[11px] font-black text-emerald-300 truncate">&apos;망고&apos;님 스프레드시트</span>
                                        <span className="block text-[9px] text-emerald-400/60 truncate">출시 순서 정리</span>
                                    </span>
                                </a>
                                <a
                                    href="https://www.youtube.com/@aerangsu"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 active:bg-rose-500/20 transition-all"
                                >
                                    <Youtube size={22} className="text-rose-400 shrink-0" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[11px] font-black text-rose-300 truncate">&apos;애랑수&apos;님 유튜브</span>
                                        <span className="block text-[9px] text-rose-400/60 truncate">스토리 녹화본</span>
                                    </span>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Selected Node Detail Modal */}
            {/* 큐레이션 노트 시트. 상세 모달은 포스터 중심이라 글만 있는 노트에는 맞지 않는다. */}
            {noteNode && (
                <div
                    className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-center justify-center p-5"
                    onClick={() => setNoteNode(null)}
                >
                    <div
                        className="w-full max-w-md bg-slate-950 border-2 border-amber-500/40 rounded-3xl p-6 max-h-[70vh] overflow-y-auto animate-in zoom-in-95 fade-in duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/10">
                            <Lightbulb size={16} className="text-amber-400" />
                            <span className="text-[11px] font-black text-amber-500 uppercase tracking-[0.3em]">Guide Note</span>
                            <button onClick={() => setNoteNode(null)} className="ml-auto p-1 text-slate-500 active:scale-90">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="text-[15px] text-slate-100 leading-relaxed font-medium whitespace-pre-wrap break-words">
                            <CurationText content={noteNode.data.content} />
                        </div>
                    </div>
                </div>
            )}

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
                            <span className={`text-[10px] px-6 py-2 rounded-full font-black tracking-[0.3em] uppercase shadow-lg backdrop-blur-md border border-white/10 ${selectedDetailNode.data.type === 'main' ? 'bg-blue-600/60 text-white' : selectedDetailNode.data.type === 'theme' || selectedDetailNode.data.type === 'theme_now' ? 'bg-purple-600/60 text-white' : selectedDetailNode.data.type === 'theme_x' ? 'bg-rose-600/60 text-white' : selectedDetailNode.data.type === 'eternal' ? 'bg-emerald-600/60 text-white' : selectedDetailNode.data.type === 'frontier' ? 'bg-orange-600/60 text-white' : selectedDetailNode.data.type === 'annotation' ? 'bg-amber-600/60 text-white' : 'bg-slate-700/60 text-white'}`}>
                                {selectedDetailNode.data.type === 'eternal' ? 'ETERNAL' : selectedDetailNode.data.type === 'annotation' ? 'CURATION' : selectedDetailNode.data.type === 'theme_x' ? 'THEME (재개봉관 준비 중)' : selectedDetailNode.data.type === 'theme_now' ? 'THEME (상영중)' : selectedDetailNode.data.type === 'frontier' ? 'FRONTIER' : selectedDetailNode.data.type}
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

                            <div className="pt-8 w-full px-4 flex flex-col gap-3">
                                {selectedDetailNode.data.youtubeUrl && (
                                    <button
                                        onClick={() => {
                                            const info = getYouTubeInfo(selectedDetailNode.data.youtubeUrl!);
                                            if (info) {
                                                setActiveVideoUrl(selectedDetailNode.data.youtubeUrl!);
                                                setActiveVideoDetails(info);
                                            }
                                        }}
                                        className="flex items-center justify-center gap-3 w-full py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-rose-900/40 transition-all active:scale-95 border border-rose-400/30"
                                    >
                                        <Youtube size={20} />
                                        <span>{selectedDetailNode.data.type === 'theme' || selectedDetailNode.data.type === 'eternal' || selectedDetailNode.data.type === 'theme_x' || selectedDetailNode.data.type === 'theme_now' || selectedDetailNode.data.type === 'frontier' ? 'PV 시청하기' : 'YOUTUBE 시청하기'}</span>
                                    </button>
                                )}
                                {selectedDetailNode.data.fullVideoUrl && (
                                    <button
                                        onClick={() => {
                                            const info = getYouTubeInfo(selectedDetailNode.data.fullVideoUrl!);
                                            if (info) {
                                                setActiveVideoUrl(selectedDetailNode.data.fullVideoUrl!);
                                                setActiveVideoDetails(info);
                                            }
                                        }}
                                        className="flex items-center justify-center gap-3 w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-900/40 transition-all active:scale-95 border border-indigo-400/30"
                                    >
                                        <Youtube size={20} />
                                        <span>전체 다시보기</span>
                                    </button>
                                )}
                            </div>
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
                            {(['main', 'theme', 'etc', 'eternal', 'frontier', 'annotation'] as const).map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => setLibraryCategory(cat)}
                                    className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${libraryCategory === cat
                                        ? 'bg-indigo-600 text-white shadow-lg'
                                        : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                >
                                    {cat === 'main' ? 'Main' : cat === 'theme' ? 'Theme' : cat === 'eternal' ? 'Eternal' : cat === 'frontier' ? 'Frontier' : cat === 'annotation' ? '큐레이션' : 'ETC'}
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
                        ) : masterStories.filter(m => libraryCategory === 'theme' ? (m.type === 'theme' || m.type === 'theme_x' || m.type === 'theme_now') : m.type === libraryCategory).length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500">
                                <Library size={40} className="opacity-20" />
                                <p className="text-sm font-bold opacity-40">이 카테고리에 마스터 노드가 없습니다.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-5 gap-1.5">
                                {masterStories.filter(m => libraryCategory === 'theme' ? (m.type === 'theme' || m.type === 'theme_x' || m.type === 'theme_now') : m.type === libraryCategory).map((m) => (
                                    <button
                                        key={m.id}
                                        onClick={() => handleImportMaster(m)}
                                        className="group relative aspect-[3/4] bg-slate-800 rounded-xl overflow-hidden border border-slate-700 active:scale-95 transition-all shadow-lg"
                                    >
                                        {m.type === 'annotation' ? (
                                            // 큐레이션은 그림이 없다. 이름만으로는 고를 수 없어 본문 앞머리를 보여준다.
                                            <div className="w-full h-full flex flex-col gap-1 p-1.5 bg-amber-500/10 border border-amber-500/20">
                                                <Lightbulb size={14} className="text-amber-400 shrink-0" />
                                                <p className="text-[6px] leading-tight text-amber-100/70 line-clamp-6 text-left">{m.content}</p>
                                            </div>
                                        ) : m.image ? (
                                            <img src={getImageUrl(m.image)} className="w-full h-full object-cover" alt={m.label} loading="lazy" />
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
                        <YouTubeEmbed
                            videoId={activeVideoDetails?.id || ''}
                            startTime={activeVideoDetails?.startTime}
                            endTime={activeVideoDetails?.endTime}
                            className="w-full h-full"
                            onClose={() => {
                                setActiveVideoUrl(null);
                                setActiveVideoDetails(null);
                                window.history.back();
                            }}
                        />
                        <button
                            onClick={() => {
                                setActiveVideoUrl(null);
                                setActiveVideoDetails(null);
                                window.history.back();
                            }}
                            className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white transition-all opacity-15 hover:opacity-100 duration-500 flex items-center gap-2 font-black text-[10px] uppercase tracking-widest"
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
            {/* Developer Update Log Modal */}
            {showUpdateLog && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[600] flex flex-col animate-in fade-in duration-300">
                    <header className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-lime-500/20 rounded-xl text-lime-500 border border-lime-500/20">
                                <Lightbulb size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-100 italic tracking-tight">DEVELOPMENT LOG</h3>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                    Last Updated: {lastUpdateAt ? new Date(lastUpdateAt).toLocaleDateString() : 'N/A'}
                                </p>
                            </div>
                        </div>
                        <button onClick={() => setShowUpdateLog(false)} className="p-2 text-slate-400">
                            <X size={24} />
                        </button>
                    </header>

                    <div className="flex-grow overflow-y-auto min-h-0 p-6 bg-slate-950 custom-scrollbar">
                        {isAdmin ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 mb-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400 text-xs font-bold italic">
                                    <Shield size={14} />
                                    <span>ADMIN EDITOR MODE</span>
                                </div>
                                <textarea
                                    value={updateLogContent}
                                    onChange={(e) => setUpdateLogContent(e.target.value)}
                                    className="w-full h-[300px] bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-[13px] text-slate-300 outline-none focus:ring-2 focus:ring-lime-500/30 resize-none font-mono leading-relaxed"
                                    placeholder="Write update notes here..."
                                />
                            </div>
                        ) : (
                            <div className="text-slate-300 leading-relaxed whitespace-pre-wrap text-[14px] font-medium">
                                {updateLogContent || '업데이트 내역이 아직 없습니다.'}
                            </div>
                        )}
                        <div className="h-20" /> {/* Spacer */}
                    </div>

                    {isAdmin && (
                        <footer className="p-6 bg-slate-900 border-t border-slate-800 grid grid-cols-2 gap-3 pb-10">
                            <button
                                onClick={() => setShowUpdateLog(false)}
                                className="py-4 bg-slate-800 text-slate-400 font-black rounded-2xl text-[11px] uppercase tracking-widest border border-slate-700"
                            >
                                취소
                            </button>
                            <button
                                onClick={async () => {
                                    setIsSavingUpdate(true);
                                    try {
                                        await api.saveUpdateLog(updateLogContent);
                                        alert("업데이트 로그가 저장되었습니다.");
                                        setLastUpdateAt(new Date().toISOString());
                                        setShowUpdateLog(false);
                                    } catch (err) {
                                        console.error(err);
                                        alert(err instanceof Error ? err.message : "오류 발생");
                                    } finally {
                                        setIsSavingUpdate(false);
                                    }
                                }}
                                disabled={isSavingUpdate}
                                className="py-4 bg-lime-500 text-slate-950 font-black rounded-2xl text-[11px] uppercase tracking-widest shadow-lg shadow-lime-900/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                            >
                                {isSavingUpdate ? (
                                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Save size={16} />
                                )}
                                업데이트 저장
                            </button>
                        </footer>
                    )}
                </div>
            )}
        </div>
    );
}
