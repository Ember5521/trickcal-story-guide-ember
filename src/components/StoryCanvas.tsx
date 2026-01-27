"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef, memo } from 'react';
import {
    Plus, Trash2, Settings, User, Youtube, Search,
    ChevronLeft, ChevronRight, Maximize2, Minimize2,
    X, RotateCcw, Home, StickyNote, Info, Monitor, Smartphone,
    Image as ImageIcon, Shield
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import ReactFlow, {
    Background,
    applyEdgeChanges,
    applyNodeChanges,
    Node,
    Edge,
    Connection,
    addEdge,
    NodeChange,
    EdgeChange,
    MarkerType,
    ConnectionLineType,
    ConnectionMode,
    useReactFlow,
    ReactFlowProvider,
    useStore,
    Panel,
    PanOnScrollMode
} from 'reactflow';
import 'reactflow/dist/style.css';

import StoryNode, { StoryNodeData } from './StoryNode';

const nodeTypes = {
    storyNode: StoryNode,
};

const initialNodes: Node<StoryNodeData>[] = [];
const initialEdges: Edge[] = [];
const TABLE_NAME = process.env.NEXT_PUBLIC_STORY_TABLE_NAME || 'story_data';

// Zoom Scale Constants (Internal 0.55 = Display 1.0 for slightly more zoomed-out view)
const SCALE_OUTER = 0.55; // Increased from 0.5 to make view slightly larger at 100%
const toDisplayZoom = (z: number) => z / SCALE_OUTER;
const fromDisplayZoom = (dz: number) => dz * SCALE_OUTER;

const viewportSelector = (state: any) => ({
    x: state.transform[0],
    y: state.transform[1],
    zoom: state.transform[2],
});

function StoryCanvasInner({ onToggleView, isMobileView }: { onToggleView: () => void, isMobileView: boolean }) {
    const { setCenter, screenToFlowPosition, getViewport, setViewport } = useReactFlow();
    // Core State
    const [nodes, setNodes] = useState<Node<StoryNodeData>[]>(initialNodes);
    const [edges, setEdges] = useState<Edge[]>(initialEdges);
    const [isAdmin, setIsAdmin] = useState(false);
    const [season, setSeason] = useState(1);
    const [isLoaded, setIsLoaded] = useState(false);

    // UI State
    const [showForm, setShowForm] = useState(false);
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
    const [isPlayingVideoId, setPlayingVideoId] = useState<string | null>(null);
    const [isModalFullscreen, setIsModalFullscreen] = useState(false);
    const [edgeType, setEdgeType] = useState<'step' | 'straight'>('step');
    const [isUploading, setIsUploading] = useState(false);

    // Memo State
    const [showMemo, setShowMemo] = useState(false);
    const [memoText, setMemoText] = useState('');

    const containerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const edgeClickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isInitialFocusDone = useRef(false);
    const edgesRef = useRef(edges);
    const sessionPassword = useRef<string | null>(null);
    useEffect(() => { edgesRef.current = edges; }, [edges]);

    // YouTube ID Extractor
    const getYouTubeId = (url: string) => {
        if (!url) return null;
        // Strict regex to prevent potential script injection via URL
        const regExp = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regExp);
        return match ? match[1] : null;
    };

    // Filtered Nodes
    const displayNodes = useMemo(() => {
        const query = searchQuery.toLowerCase();
        const isSearchActive = query.length >= 2;

        return nodes.map(node => {
            const isHidden = false;
            const isMatched = isSearchActive && (
                node.data.label.toLowerCase().includes(query) ||
                (node.data.protagonist?.toLowerCase().includes(query))
            );

            return {
                ...node,
                hidden: isHidden,
                data: {
                    ...node.data,
                    isAdmin,
                    highlighted: isMatched && !isHidden,
                    onPlayVideo: (url: string) => {
                        const id = getYouTubeId(url);
                        if (id) setPlayingVideoId(id);
                    }
                }
            };
        });
    }, [nodes, searchQuery, isAdmin]);

    const matchedNodeIds = useMemo(() => {
        return displayNodes.filter(node => node.data.highlighted).map(node => node.id);
    }, [displayNodes]);

    // BFS for Virtual Edges
    const findNextVisible = useCallback((nodeId: string, visibleNodeIds: Set<string>) => {
        const nextVisible: string[] = [];
        const queue = [...edges.filter(e => e.source === nodeId).map(e => e.target)];
        const seenInBranch = new Set<string>();

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (seenInBranch.has(current)) continue;
            seenInBranch.add(current);

            if (visibleNodeIds.has(current)) {
                nextVisible.push(current);
            } else {
                queue.push(...edges.filter(e => e.source === current).map(e => e.target));
            }
        }
        return Array.from(new Set(nextVisible));
    }, [edges]);

    const displayEdges = useMemo(() => {
        const visibleNodeIds = new Set(displayNodes.filter(n => !n.hidden).map(n => n.id));
        const virtualEdges: Edge[] = [];
        const edgeColor = '#cbd5e1';

        const sideUsage = new Map<string, Set<string>>();
        const markUsed = (nodeId: string, side?: string | null) => {
            if (!side) return;
            if (!sideUsage.has(nodeId)) sideUsage.set(nodeId, new Set());
            sideUsage.get(nodeId)!.add(side);
        };

        edges.forEach(edge => {
            if (visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)) {
                markUsed(edge.source, edge.sourceHandle);
                markUsed(edge.target, edge.targetHandle);
            }
        });

        const getSmartHandle = (nodeId: string, preferred?: string) => {
            if (preferred) return preferred;
            const sides = ['top', 'bottom', 'left', 'right'] as const;
            if (!sideUsage.has(nodeId)) sideUsage.set(nodeId, new Set());
            const used = sideUsage.get(nodeId)!;
            for (const side of sides) {
                if (!used.has(side)) {
                    used.add(side);
                    return side;
                }
            }
            return 'top';
        };

        const processEdge = (s: string, t: string, orig: Edge, isV: boolean) => ({
            ...orig,
            id: isV ? `v_${s}_${t}` : orig.id,
            source: s,
            target: t,
            type: isV ? 'step' : (orig.type || 'step'),
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor, width: 10, height: 10 },
            style: { strokeWidth: 6, stroke: edgeColor },
            sourceHandle: isV ? getSmartHandle(s) : (orig.sourceHandle || 'bottom'),
            targetHandle: isV ? getSmartHandle(t) : (orig.targetHandle || 'top'),
        });

        edges.forEach(edge => {
            if (!visibleNodeIds.has(edge.source)) return;
            if (visibleNodeIds.has(edge.target)) {
                virtualEdges.push(processEdge(edge.source, edge.target, edge, false));
            } else {
                const targets = findNextVisible(edge.target, visibleNodeIds);
                targets.forEach(t => virtualEdges.push(processEdge(edge.source, t, edge, true)));
            }
        });

        const uniqueMap = new Map();
        virtualEdges.forEach(e => {
            const key = `${e.source}_${e.sourceHandle}_${e.target}_${e.targetHandle}`;
            if (!uniqueMap.has(key)) uniqueMap.set(key, e);
        });
        return Array.from(uniqueMap.values());
    }, [edges, displayNodes, findNextVisible]);

    // Canvas Bounds (Requirement: Restrict movement based on nodes)
    const translateExtent = useMemo(() => {
        // Allow infinite movement in Admin mode for free node placement
        if (isAdmin || nodes.length === 0) return undefined;

        const minX = Math.min(...nodes.map(n => n.position.x));
        const maxX = Math.max(...nodes.map(n => n.position.x + (n.width || 256)));
        const minY = Math.min(...nodes.map(n => n.position.y));
        const maxY = Math.max(...nodes.map(n => n.position.y + (n.height || 350)));

        const padX = 1500; // Extra space for horizontal scrolling
        const padY = 1000; // Extra space for vertical scrolling

        return [
            [minX - padX, minY - padY],
            [maxX + padX, maxY + padY]
        ] as [[number, number], [number, number]];
    }, [nodes, isAdmin]);

    // Navigation & Camera
    const focusNodeXOnly = useCallback((nodeId: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            const { y, zoom: currentZoom } = getViewport();
            const nodeW = node.width || 256;
            const nextZoom = fromDisplayZoom(1.0);

            // Calculate world Y center to preserve visual vertical position during zoom change
            const worldYCenter = (window.innerHeight / 2 - y) / currentZoom;

            // Goal: Center the node horizontally and set zoom to 100%
            const nextX = (window.innerWidth / 2) - (node.position.x + nodeW / 2) * nextZoom;
            const nextY = (window.innerHeight / 2) - worldYCenter * nextZoom;

            setViewport({ x: nextX, y: nextY, zoom: nextZoom }, { duration: 700 });
        }
    }, [nodes, getViewport, setViewport]);

    useEffect(() => {
        if (matchedNodeIds.length > 0) {
            setCurrentSearchIndex(0);
            focusNodeXOnly(matchedNodeIds[0]);
        }
    }, [matchedNodeIds, focusNodeXOnly]);

    const navigateSearch = (dir: 'next' | 'prev') => {
        if (matchedNodeIds.length === 0) return;
        let idx = dir === 'next' ? currentSearchIndex + 1 : currentSearchIndex - 1;
        if (idx >= matchedNodeIds.length) idx = 0;
        if (idx < 0) idx = matchedNodeIds.length - 1;
        setCurrentSearchIndex(idx);
        focusNodeXOnly(matchedNodeIds[idx]);
    };

    // Sub-component for Central Divider to isolate re-renders
    const CentralDivider = memo(() => {
        const [tX, tY, tZoom] = useStore(state => state.transform);
        return (
            <div
                className="absolute left-0 w-full pointer-events-none z-0"
                style={{
                    top: tY + 250 * tZoom,
                    height: Math.max(1, 1.5 * tZoom),
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 10%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.05) 90%, transparent 100%)',
                    boxShadow: `0 0 ${20 * tZoom}px rgba(99, 102, 241, 0.2)`
                }}
            >
                <div
                    className="absolute left-10 -top-10 flex flex-col gap-1 opacity-20 transition-opacity active:opacity-40"
                    style={{ transform: `scale(${tZoom})`, transformOrigin: 'left bottom' }}
                >
                    <span className="text-[25px] font-black tracking-[0.4em] text-white uppercase whitespace-nowrap">메인 스토리 & 테마극장 관련</span>
                    <div className="h-px w-48 bg-gradient-to-r from-white/60 to-transparent" />
                </div>
                <div
                    className="absolute left-10 top-2 flex flex-col gap-1 opacity-20 transition-opacity active:opacity-40"
                    style={{ transform: `scale(${tZoom})`, transformOrigin: 'left top' }}
                >
                    <div className="h-px w-48 bg-gradient-to-r from-white/60 to-transparent" />
                    <span className="text-[25px] font-black tracking-[0.4em] text-white uppercase whitespace-nowrap">사복 스토리 & 기타</span>
                </div>
            </div>
        );
    });

    // Sub-component for Zoom Control to isolate re-renders
    const ZoomControl = memo(({ onReset }: { onReset: () => void }) => {
        const tZoom = useStore(state => state.transform[2]);
        const { getViewport, setViewport } = useReactFlow();
        const currentDisplayZoom = toDisplayZoom(tZoom);

        const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const nextDisplayZoom = parseFloat(e.target.value);
            const { x, y, zoom: currentZoom } = getViewport();
            const nextZoom = fromDisplayZoom(nextDisplayZoom);
            const worldXCenter = (window.innerWidth / 2 - x) / currentZoom;
            const worldYCenter = (window.innerHeight / 2 - y) / currentZoom;
            const nextX = (window.innerWidth / 2) - worldXCenter * nextZoom;
            const nextY = (window.innerHeight / 2) - worldYCenter * nextZoom;
            setViewport({ x: nextX, y: nextY, zoom: nextZoom }, { duration: 0 });
        };

        return (
            <div className="flex items-center gap-4 bg-slate-800/90 p-3 pr-5 rounded-3xl backdrop-blur-md border border-slate-700 shadow-2xl">
                <button onClick={onReset} className="bg-slate-700/50 hover:bg-slate-600 text-white p-2 rounded-2xl transition-all flex items-center gap-2 group">
                    <RotateCcw size={18} />
                    <span className="text-xs font-bold">확대/축소 초기화</span>
                </button>
                <div className="h-6 w-px bg-slate-700 mx-1" />
                <div className="flex items-center gap-4">
                    <span className="text-xs font-mono font-bold text-indigo-400">{Math.round(currentDisplayZoom * 100)}%</span>
                    <input type="range" min="0.6" max="1.5" step="0.01" value={currentDisplayZoom} onChange={onChange} className="w-40 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                </div>
            </div>
        );
    });

    const initialFocus = useCallback(() => {
        // Find the leftmost node (Requirement: Start from the very left)
        const sortedNodes = [...nodes].sort((a, b) => a.position.x - b.position.x);
        const targetNode = sortedNodes[0];

        if (targetNode) {
            const nodeW = targetNode.width || 256;
            const nextZoom = fromDisplayZoom(1.0);

            // X position: Left node at 1/3 of screen
            const nextX = (window.innerWidth / 3) - (targetNode.position.x + nodeW / 2) * nextZoom;

            // Y position: Unified with resetView logic (centralized with offset)
            const minY = Math.min(...nodes.map(n => n.position.y));
            const maxY = Math.max(...nodes.map(n => n.position.y + (n.height || 350)));
            const worldYCenter = (minY + maxY) / 2;
            const nextY = (window.innerHeight / 2) - ((worldYCenter + 60) * nextZoom); // Offset to slightly raise nodes

            setViewport({ x: nextX, y: nextY, zoom: nextZoom }, { duration: 1000 });
        }
    }, [nodes, setViewport]);

    const resetView = useCallback(() => {
        if (nodes.length > 0) {
            const { x, zoom } = getViewport();

            // Calculate world Y center of all visible nodes
            const minY = Math.min(...nodes.map(n => n.position.y));
            const maxY = Math.max(...nodes.map(n => n.position.y + (n.height || 350)));
            const worldYCenter = (minY + maxY) / 2;

            // Core Logic: Preserve current X world center point on screen
            const worldXCenter = (window.innerWidth / 2 - x) / zoom;

            const nextZoom = fromDisplayZoom(1.0);
            const nextX = (window.innerWidth / 2) - (worldXCenter * nextZoom);
            // Synchronized with initialFocus (Increased to 300) to keep Y position consistent across reset/initial focus
            const nextY = (window.innerHeight / 2) - ((worldYCenter + 60) * nextZoom);

            setViewport({ x: nextX, y: nextY, zoom: nextZoom }, { duration: 800 });
        }
    }, [nodes, getViewport, setViewport]);

    // Zoom Control logic moved to ZoomControl sub-component

    // Persistence
    const saveLocal = useCallback((n: Node<StoryNodeData>[], e: Edge[]) => {
        try {
            localStorage.setItem(`stories_s${season}`, JSON.stringify(n));
            localStorage.setItem(`edges_s${season}`, JSON.stringify(e));
        } catch (err) {
            // If quota exceeded, just log it. Cloud will handle the source of truth.
            console.warn("Local storage quota exceeded. Relying on cloud sync.", err);
        }
    }, [season]);

    const syncToCloud = async (n: Node<StoryNodeData>[], e: Edge[]) => {
        if (!supabase || !isAdmin) return false;

        // Use the prompt to get password if somehow not stored, but here we can assume 
        // they are in admin mode. In a real app, you might store the session password in a ref.
        // For now, we'll need the password used for login. 
        // Let's add a state to keep track of the session password.
        if (!sessionPassword.current) return false;

        try {
            const { error } = await supabase.rpc('save_story_data', {
                p_season: season,
                p_nodes: n,
                p_edges: e,
                p_password: sessionPassword.current
            });
            return !error;
        } catch { return false; }
    };

    // Wheel Handler
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const handleWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaY) > 0 || Math.abs(e.deltaX) > 0) {
                e.preventDefault();
                e.stopPropagation();
                const { x, y, zoom } = getViewport();
                const moveAmount = (e.deltaY !== 0 ? e.deltaY : e.deltaX) * 1.5;

                let nextX = x - moveAmount;
                let nextY = y;

                // Clamp movement based on translateExtent to prevent infinite scrolling
                // Only for users to keep focus, admins can move freely
                if (!isAdmin && translateExtent) {
                    const [[minX, minY], [maxX, maxY]] = translateExtent;
                    const xLimitMin = window.innerWidth - maxX * zoom;
                    const xLimitMax = -minX * zoom;
                    const yLimitMin = window.innerHeight - maxY * zoom;
                    const yLimitMax = -minY * zoom;

                    nextX = Math.max(xLimitMin, Math.min(xLimitMax, nextX));
                    nextY = Math.max(yLimitMin, Math.min(yLimitMax, nextY));
                }

                setViewport({ x: nextX, y: nextY, zoom }, { duration: 0 });
            }
        };

        const flowEl = el.querySelector('.react-flow__renderer');
        const target = flowEl || el;
        target.addEventListener('wheel', handleWheel as any, { passive: false, capture: true });
        return () => target.removeEventListener('wheel', handleWheel as any, { capture: true });
    }, [getViewport, setViewport, isAdmin, nodes]);

    // Arrow Key Fine Movement (1px)
    useEffect(() => {
        if (!isAdmin) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const isArrowKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
            if (!isArrowKey) return;

            // Ignore if typing in an input/textarea
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;

            setNodes(nds => {
                const anySelected = nds.some(n => n.selected);
                if (!anySelected) return nds;

                const nextNodes = nds.map(node => {
                    if (node.selected) {
                        let { x, y } = node.position;
                        if (e.key === 'ArrowUp') y -= step;
                        if (e.key === 'ArrowDown') y += step;
                        if (e.key === 'ArrowLeft') x -= step;
                        if (e.key === 'ArrowRight') x += step;
                        return { ...node, position: { x, y } };
                    }
                    return node;
                });

                saveLocal(nextNodes, edgesRef.current);
                return nextNodes;
            });
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isAdmin, setNodes, saveLocal]);



    // Load Data Effect
    useEffect(() => {
        const load = async () => {
            // Clear current data immediately when switching seasons to avoid mixed view
            setNodes([]);
            setEdges([]);
            setIsLoaded(false);

            try {
                const sn = localStorage.getItem(`stories_s${season}`);
                const se = localStorage.getItem(`edges_s${season}`);
                if (sn) setNodes(JSON.parse(sn).map((n: any) => ({ ...n, data: { ...n.data, isAdmin } })));
                if (se) setEdges(JSON.parse(se));

                if (supabase) {
                    const { data, error } = await supabase.from(TABLE_NAME).select('*').eq('season', season).single();
                    if (data && !error) {
                        const cloudNodes = data.nodes.map((n: any) => ({ ...n, data: { ...n.data, isAdmin } }));
                        if (!isAdmin) {
                            const histStr = localStorage.getItem(`watched_history_s${season}`) || '{}';
                            const hist = JSON.parse(histStr);
                            setNodes(cloudNodes.map((n: any) => ({ ...n, data: { ...n.data, watched: !!hist[n.id] } })));
                        } else {
                            setNodes(cloudNodes);
                        }
                        setEdges(data.edges);
                        try {
                            localStorage.setItem(`stories_s${season}`, JSON.stringify(data.nodes));
                            localStorage.setItem(`edges_s${season}`, JSON.stringify(data.edges));
                        } catch (e) {
                            console.warn("Failed to update local cache due to quota limit.", e);
                        }
                    }
                }
            } catch (err) {
                console.error("Data load error:", err);
                setNodes([]);
                setEdges([]);
            } finally {
                setIsLoaded(true);
            }
        };
        load();

        // Load Memo (Requirement: Persist user notes)
        const savedMemo = localStorage.getItem('user_story_memo');
        if (savedMemo) setMemoText(savedMemo);
    }, [season, isAdmin]);

    // Save Memo automatically whenever it changes
    useEffect(() => {
        try {
            localStorage.setItem('user_story_memo', memoText);
        } catch (e) {
            console.warn("Failed to save memo to local storage.", e);
        }
    }, [memoText]);

    // Admin Cloud Sync (Debounced with isLoaded Guard)
    useEffect(() => {
        if (!isAdmin || !isLoaded) return;
        const timer = setTimeout(() => {
            syncToCloud(nodes, edges);
        }, 2000); // Sync after 2 seconds of inactivity
        return () => clearTimeout(timer);
    }, [nodes, edges, isAdmin, isLoaded]);

    // Independent Initial Focus Trigger
    useEffect(() => {
        if (nodes.length > 0 && !isInitialFocusDone.current) {
            isInitialFocusDone.current = true;
            // Small delay to ensure ReactFlow has rendered the nodes
            setTimeout(initialFocus, 300);
        }
    }, [nodes, initialFocus]);

    // Admin Persistence & Auth
    const toggleAdmin = async () => {
        if (isAdmin) {
            const ok = await syncToCloud(nodes, edges);
            if (ok) alert("저장되었습니다.");
            else if (!confirm("저장 실패. 무시하고 나갈까요?")) return;
            setIsAdmin(false);
            setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, isAdmin: false } })));
        } else {
            const pw = prompt("비밀번호");
            if (!pw) return;

            // Verify password via Supabase RPC (Database Function)
            // This is secure because the password comparison happens inside the database
            if (!supabase) { alert("DB 연결 실패"); return; }

            const { data: isValid, error } = await supabase.rpc('verify_admin_password', {
                input_password: pw
            });

            if (error) {
                console.error("Auth error:", error);
                alert("인증 오류가 발생했습니다.");
                return;
            }

            if (isValid) {
                sessionPassword.current = pw;
                setIsAdmin(true);
                setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, isAdmin: true } })));
            } else {
                alert("권한이 없습니다.");
            }
        }
    };

    // Flow Callbacks
    const onNodesChange = useCallback((c: NodeChange[]) => {
        setNodes(nds => {
            const up = applyNodeChanges(c, nds) as Node<StoryNodeData>[];
            if (isAdmin) saveLocal(up, edges);
            return up;
        });
    }, [edges, isAdmin, saveLocal]);

    const onEdgesChange = useCallback((c: EdgeChange[]) => {
        setEdges(eds => {
            const up = applyEdgeChanges(c, eds);
            if (isAdmin) saveLocal(nodes, up);
            return up;
        });
    }, [nodes, isAdmin, saveLocal]);

    const onConnect = useCallback((p: Connection) => {
        const edgeColor = '#cbd5e1';
        const newEdge = {
            ...p, id: `e_${Date.now()}`, type: edgeType, animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor, width: 10, height: 10 },
            style: { strokeWidth: 6, stroke: edgeColor }
        };
        const up = addEdge(newEdge, edges);
        setEdges(up);
        saveLocal(nodes, up);
    }, [nodes, edges, edgeType, saveLocal]);

    const onEdgeClick = useCallback((ev: React.MouseEvent, e: Edge) => {
        if (!isAdmin || e.id.startsWith('v_')) return;
        ev.stopPropagation();
        if (edgeClickTimeoutRef.current) {
            clearTimeout(edgeClickTimeoutRef.current);
            edgeClickTimeoutRef.current = null;
            return;
        }
        edgeClickTimeoutRef.current = setTimeout(() => {
            const newT = e.type === 'step' ? 'straight' : 'step';
            setEdges(eds => {
                const up = eds.map(x => x.id === e.id ? { ...x, type: newT } : x);
                saveLocal(nodes, up);
                return up;
            });
            edgeClickTimeoutRef.current = null;
        }, 250);
    }, [isAdmin, nodes, saveLocal]);

    const onEdgeDoubleClick = useCallback((ev: React.MouseEvent, e: Edge) => {
        if (!isAdmin || e.id.startsWith('v_')) return;
        ev.stopPropagation();
        if (edgeClickTimeoutRef.current) { clearTimeout(edgeClickTimeoutRef.current); edgeClickTimeoutRef.current = null; }
        if (confirm("삭제할까요?")) {
            setEdges(eds => {
                const up = eds.filter(x => x.id !== e.id);
                saveLocal(nodes, up);
                return up;
            });
        }
    }, [isAdmin, nodes, saveLocal]);

    // Admin Form Node Logic
    const [formData, setFormData] = useState<StoryNodeData>({ label: '', type: 'main', image: '', youtubeUrl: '', protagonist: '', importance: 1 });

    const handleSaveNode = () => {
        if (!formData.label) { alert("제목 입력!"); return; }

        const getDimensions = () => {
            if (formData.type === 'main') return { w: 260, h: 380 };
            if (formData.type === 'theme') return { w: 320, h: 200 };

            // For 'etc', use the detected image ratio if available
            const tempW = (formData as any)._tempW;
            const tempH = (formData as any)._tempH;
            if (formData.type === 'etc' && tempW && tempH) {
                const baseW = 320;
                return { w: baseW, h: (tempH / tempW) * baseW };
            }
            return { w: 300, h: 200 }; // Fallback for etc without image detection
        };

        const { w, h } = getDimensions();

        if (editingNodeId) {
            const up = nodes.map(n => {
                if (n.id === editingNodeId) {
                    // Preserve existing dimensions if it was manually resized, 
                    // otherwise use default if it's a type change (optional logic)
                    const finalW = n.width || w;
                    const finalH = n.height || h;
                    return { ...n, width: finalW, height: finalH, data: { ...n.data, ...formData } };
                }
                return n;
            });
            setNodes(up);
            saveLocal(up, edges);
        } else {
            const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
            const newNode: Node<StoryNodeData> = {
                id: `n_${Date.now()}`, position: { x: center.x - w / 2, y: center.y - h / 2 },
                data: { ...formData, watched: false, isAdmin } as StoryNodeData,
                type: 'storyNode', width: w, height: h
            };
            const up = [...nodes, newNode];
            setNodes(up);
            saveLocal(up, edges);
        }
        setShowForm(false);
        setEditingNodeId(null);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !supabase) return;

        setIsUploading(true);
        try {
            // 1. Upload to Supabase Storage
            const fileExt = file.name.split('.').pop();
            const fileName = `${season}/${Date.now()}.${fileExt}`;
            const filePath = `nodes/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('story-images')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            // 2. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('story-images')
                .getPublicUrl(filePath);

            // 3. Pre-calculate dimensions and update formData
            const img = new Image();
            img.onload = () => {
                setFormData(prev => ({
                    ...prev,
                    image: publicUrl,
                    _tempW: img.width,
                    _tempH: img.height
                } as any));
                setIsUploading(false);
            };
            img.src = publicUrl;

        } catch (err) {
            console.error("Upload error:", err);
            alert("이미지 업로드 실패!");
            setIsUploading(false);
        }
    };

    const toggleWatch = (id: string) => {
        setNodes(nds => nds.map(n => {
            if (n.id === id) {
                const nw = !n.data.watched;
                if (!isAdmin) {
                    const h = JSON.parse(localStorage.getItem(`watched_history_s${season}`) || '{}');
                    h[id] = nw;
                    try {
                        localStorage.setItem(`watched_history_s${season}`, JSON.stringify(h));
                    } catch (e) {
                        console.warn("Failed to save watch history due to quota limit.", e);
                    }
                }
                return { ...n, data: { ...n.data, watched: nw } };
            }
            return n;
        }));
    };

    const isProd = process.env.NODE_ENV === 'production';
    const basePath = isProd ? '/trickcal-story-guide-ember' : '';

    return (
        <div ref={containerRef} className="relative flex flex-col h-screen overflow-hidden bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500/30">
            <div
                className="absolute inset-0 pointer-events-none z-0"
                style={{
                    backgroundImage: `url(${basePath}/images/background.jpg)`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    opacity: 0.2
                }}
            />

            <header className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 p-2 md:p-4 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4 z-50">
                <div className="flex items-center justify-between w-full md:w-auto gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="group relative flex items-center justify-center">
                            <div className="p-2 rounded-xl bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-indigo-400 cursor-help transition-all border border-slate-700/50">
                                <Info size={18} />
                            </div>
                            <div className="absolute top-full left-0 mt-2 w-64 p-3 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100] scale-95 group-hover:scale-100 origin-top-left pointer-events-none">
                                <p className="text-xs leading-relaxed text-slate-300">
                                    <b>가이드 안내</b><br />
                                    • 본 스토리 가이드는 공식 가이드가 아닙니다.<br />
                                    • 극장 개편에 따라 기존 출시 순서와 인게임 내 실제 접근 가능한 순서를 종합적으로 고려하여 정리된 순서로, 일부 어색한 부분이 있을 수 있습니다.<br />
                                    • 본 사이트는 문제가 발생할 경우 즉시 운영을 중단할 수 있으며, 모든 영상 및 이미지에 대한 저작권은 Epid Games에 귀속됩니다.
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={onToggleView}
                            className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-indigo-400 rounded-xl border border-slate-700/50 transition-all text-xs font-bold shrink-0"
                        >
                            <Smartphone size={18} />
                            <span>Mobile View</span>
                        </button>
                    </div>

                    <div className="flex md:hidden items-center gap-2">
                        <select value={season} onChange={e => setSeason(Number(e.target.value))} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-bold outline-none font-mono">
                            <option value={1}>S1</option>
                            <option value={2}>S2</option>
                            <option value={3}>S3</option>
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto md:absolute md:left-1/2 md:-translate-x-1/2">
                    <div className="flex-1 md:flex-none flex items-center bg-slate-800/80 rounded-full px-4 border border-slate-700 transition-all backdrop-blur-sm group overflow-hidden">
                        <Search className="text-slate-400 group-focus-within:text-indigo-400 shrink-0" size={18} />
                        <input type="text" placeholder="제목/주인공 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-transparent border-none py-2 px-3 outline-none w-full md:w-64 lg:w-80 text-xs md:text-sm" />
                        {searchQuery && <button onClick={() => setSearchQuery('')} className="text-slate-500 hover:text-white mr-1">✕</button>}
                    </div>
                    {matchedNodeIds.length > 0 && (
                        <div className="flex items-center bg-slate-800/80 rounded-full px-3 py-1 border border-slate-700 text-[10px] md:text-xs font-medium gap-2 shrink-0">
                            <span>{currentSearchIndex + 1}/{matchedNodeIds.length}</span>
                            <div className="flex gap-1 border-l border-slate-700 pl-2">
                                <button onClick={() => navigateSearch('prev')}><ChevronLeft size={14} /></button>
                                <button onClick={() => navigateSearch('next')}><ChevronRight size={14} /></button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="hidden md:flex items-center gap-3">
                    <button
                        onClick={() => setShowMemo(true)}
                        className={`p-2.5 rounded-xl transition-all shadow-xl active:scale-95 border-2 ${memoText.trim()
                            ? 'bg-indigo-600 border-white text-white shadow-[0_0_25px_rgba(99,102,241,1)]'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-indigo-400'
                            }`}
                        title="메모장 열기"
                    >
                        <StickyNote size={20} />
                    </button>
                    <select value={season} onChange={e => setSeason(Number(e.target.value))} className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm font-bold outline-none">
                        <option value={1}>Season 1</option>
                        <option value={2}>Season 2</option>
                        <option value={3}>Season 3</option>
                    </select>
                </div>

                <div className="md:hidden fixed bottom-24 right-6 z-[60]">
                    <button
                        onClick={() => setShowMemo(true)}
                        className={`p-4 rounded-full shadow-2xl active:scale-95 border-2 ${memoText.trim()
                            ? 'bg-indigo-600 border-white text-white shadow-lg'
                            : 'bg-slate-800 border-slate-700 text-slate-400 shadow-lg'
                            }`}
                    >
                        <StickyNote size={24} />
                    </button>
                </div>
            </header >

            <main className="flex-grow bg-transparent z-10 relative">
                <ReactFlow
                    nodes={displayNodes} edges={displayEdges}
                    onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
                    onConnect={onConnect} onEdgeClick={onEdgeClick} onEdgeDoubleClick={onEdgeDoubleClick}
                    nodeTypes={nodeTypes}
                    onNodeClick={(e, node) => isAdmin ? (setEditingNodeId(node.id), setFormData({ ...node.data }), setShowForm(true)) : toggleWatch(node.id)}
                    minZoom={fromDisplayZoom(0.6)} maxZoom={fromDisplayZoom(1.5)}
                    panOnScroll={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false}
                    preventScrolling={true}
                    deleteKeyCode={isAdmin ? "Delete" : null}
                    snapToGrid={true}
                    snapGrid={[20, 20]}
                    connectionLineType={ConnectionLineType.Step}
                    connectionMode={ConnectionMode.Loose}
                    nodesDraggable={isAdmin}
                    translateExtent={translateExtent}
                >
                    <Background color="#1e293b" gap={20} />

                    <CentralDivider />

                    <Panel position="bottom-left" className="mb-6 ml-6 flex flex-col gap-3">
                        <ZoomControl onReset={resetView} />
                    </Panel>
                </ReactFlow>
            </main>

            {
                isPlayingVideoId && (
                    <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
                        <div className="fixed top-8 right-8 z-[220] flex gap-4">
                            <button onClick={() => setIsModalFullscreen(!isModalFullscreen)} className="bg-white/10 p-3 rounded-xl border border-white/20 text-white">
                                {isModalFullscreen ? <Minimize2 size={24} /> : <Maximize2 size={24} />}
                            </button>
                            <button onClick={() => (setPlayingVideoId(null), setIsModalFullscreen(false))} className="bg-rose-600/80 p-3 rounded-xl border border-rose-400/30 text-white">
                                <X size={24} />
                            </button>
                        </div>
                        <div className={`relative bg-black shadow-2xl overflow-hidden transition-all duration-500 ${isModalFullscreen ? 'w-full h-full' : 'w-full max-w-5xl aspect-video rounded-3xl border border-white/10'}`}>
                            <iframe src={`https://www.youtube.com/embed/${isPlayingVideoId}?autoplay=1&rel=0`} className="w-full h-full" allowFullScreen />
                        </div>
                        {!isModalFullscreen && <div className="absolute inset-0 -z-10" onClick={() => setPlayingVideoId(null)} />}
                    </div>
                )
            }

            {/* Admin Form Modal */}
            {
                showForm && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                        <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                            <header className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
                                <div className="flex items-center gap-2 text-indigo-400 font-bold">
                                    <Shield size={20} />
                                    <span>{editingNodeId ? '노드 데이터 수정' : '새 스토리 노드 추가'}</span>
                                </div>
                                <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-white transition-colors">
                                    <X size={24} />
                                </button>
                            </header>

                            <div className="p-6 flex flex-col gap-5 max-h-[80vh] overflow-y-auto custom-scrollbar text-slate-200">
                                {/* Always visible: Type & Title */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 ml-1">스토리 타입</label>
                                        <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-bold">
                                            <option value="main">메인스토리</option>
                                            <option value="theme">테마극장</option>
                                            <option value="etc">사복/기타</option>
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 ml-1">스토리 제목</label>
                                        <input type="text" value={formData.label} onChange={e => setFormData({ ...formData, label: e.target.value })}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-bold"
                                            placeholder="제목 입력" />
                                    </div>
                                </div>

                                {/* Always visible: Image Attachment Section */}
                                <div className="flex flex-col gap-2 p-4 bg-slate-800/50 border border-slate-700 rounded-2xl">
                                    <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">이미지 설정</label>
                                    <div className="flex items-center gap-4">
                                        <div className="w-24 h-32 bg-slate-800 border-2 border-dashed border-slate-700 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 group relative shadow-inner">
                                            {formData.image ? (
                                                <img src={formData.image.startsWith('http') || formData.image.startsWith('data:') ? formData.image : `/images/${formData.image}`} className="w-full h-full object-cover" alt="Preview" />
                                            ) : (
                                                <ImageIcon className="text-slate-600" size={32} />
                                            )}
                                            {isUploading && (
                                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                    <div className="w-6 h-6 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                                </div>
                                            )}
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[11px] font-black text-white"
                                            >
                                                배경 변경
                                            </button>
                                        </div>
                                        <div className="flex-grow flex flex-col gap-3">
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                onChange={handleImageUpload}
                                                className="hidden"
                                                accept="image/*"
                                            />
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={isUploading}
                                                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 text-sm"
                                            >
                                                <ImageIcon size={18} /> {isUploading ? '업로드 중...' : '이미지 업로드'}
                                            </button>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={formData.image}
                                                    onChange={e => setFormData({ ...formData, image: e.target.value })}
                                                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500/50 text-[10px] font-mono pr-12 text-slate-400"
                                                    placeholder="파일명 또는 데이터 URL"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-bold text-slate-600 uppercase">Path</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Always visible: Bottom info label (partLabel) */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 ml-1">하단 표시 정보 (회차, 부제 등)</label>
                                    <input type="text" value={formData.partLabel || ''} onChange={e => setFormData({ ...formData, partLabel: e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                                        placeholder="예: 제 1화, 시온의 장난 등" />
                                </div>



                                {/* Conditional Fields: MAIN */}
                                {formData.type === 'main' && (
                                    <>

                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 ml-1">분할 레이아웃 설정</label>
                                            <select value={formData.splitType || 'none'} onChange={e => setFormData({ ...formData, splitType: e.target.value as any })}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all">
                                                <option value="none">설정 없음 (전체 크기)</option>
                                                <option value="part1">이미지 왼쪽만 표시 (Part 1)</option>
                                                <option value="part2">이미지 오른쪽만 표시 (Part 2)</option>
                                            </select>
                                        </div>
                                    </>
                                )}

                                {/* Conditional Fields: THEME */}
                                {formData.type === 'theme' && (
                                    <>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 ml-1">주요 등장인물</label>
                                            <input type="text" value={formData.protagonist || ''} onChange={e => setFormData({ ...formData, protagonist: e.target.value })}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                                                placeholder="아멜리아, 네르 등" />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 ml-1">유튜브(PV) 링크</label>
                                            <input type="text" value={formData.youtubeUrl || ''} onChange={e => setFormData({ ...formData, youtubeUrl: e.target.value })}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-mono text-xs"
                                                placeholder="https://youtu.be/..." />
                                        </div>
                                    </>
                                )}

                                {/* Conditional Fields: ETC */}
                                {formData.type === 'etc' && (
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 ml-1">유튜브 링크</label>
                                        <input type="text" value={formData.youtubeUrl || ''} onChange={e => setFormData({ ...formData, youtubeUrl: e.target.value })}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-mono text-xs"
                                            placeholder="https://youtu.be/..." />
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="flex gap-3 mt-4">
                                    {editingNodeId && (
                                        <button
                                            onClick={() => {
                                                if (confirm("이 노드를 삭제하시겠습니까?")) {
                                                    const up = nodes.filter(n => n.id !== editingNodeId);
                                                    setNodes(up);
                                                    saveLocal(up, edges);
                                                    setShowForm(false);
                                                    setEditingNodeId(null);
                                                }
                                            }}
                                            className="bg-rose-600/20 hover:bg-rose-600 text-rose-500 hover:text-white border border-rose-500/30 font-bold py-3 px-6 rounded-2xl transition-all flex items-center gap-2"
                                        >
                                            <Trash2 size={18} /> 삭제
                                        </button>
                                    )}
                                    <button onClick={handleSaveNode} className="flex-grow bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-all">
                                        {editingNodeId ? '수정 사항 저장' : '새 노드 생성'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Memo Modal */}
            {
                showMemo && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
                        <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                            <header className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
                                <div className="flex items-center gap-2 text-indigo-400">
                                    <StickyNote size={20} />
                                    <span className="font-bold">메모장</span>
                                </div>
                                <button onClick={() => setShowMemo(false)} className="text-slate-500 hover:text-white transition-colors">
                                    <X size={24} />
                                </button>
                            </header>
                            <div className="p-6">
                                <textarea
                                    value={memoText}
                                    onChange={(e) => setMemoText(e.target.value)}
                                    placeholder="필요한 메모를 작성하세요... (자동 저장됩니다)"
                                    className="w-full h-80 bg-slate-800/50 border border-slate-700 rounded-2xl p-4 text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none font-sans text-sm leading-relaxed"
                                />
                                <div className="mt-4 flex justify-end">
                                    <button
                                        onClick={() => setShowMemo(false)}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg active:scale-95 text-sm"
                                    >
                                        닫기
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            <div className="fixed bottom-6 right-6 z-50 opacity-[0.05] hover:opacity-100 transition-opacity">
                <button onClick={toggleAdmin} className="p-2 rounded-xl bg-slate-800/50 text-slate-400 border border-slate-700 shadow-lg hover:bg-slate-700 transition-all"><Shield size={18} /></button>
            </div>

            {
                isAdmin && (
                    <div className="fixed bottom-24 right-6 pt-2 z-[60]">
                        <button onClick={() => (setEditingNodeId(null), setFormData({ label: '', type: 'main', image: '', youtubeUrl: '', protagonist: '', importance: 1 }), setShowForm(true))} className="bg-green-600 text-white px-6 py-3 rounded-full shadow-xl hover:bg-green-700 flex items-center gap-2">
                            <Plus size={20} /> 새 노드
                        </button>
                    </div>
                )
            }
        </div >
    );
}

export default function StoryCanvas(props: { onToggleView: () => void, isMobileView: boolean }) {
    return (
        <ReactFlowProvider>
            <StoryCanvasInner {...props} />
        </ReactFlowProvider>
    );
}
