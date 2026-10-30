"use client";

import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Gamepad2, Image as ImageIcon, Plus, Save, Shield, Trash2, Upload, X } from 'lucide-react';
import * as api from '../lib/api';
import { imageUrl } from '../lib/api';
import { MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH, normalizeFanGames, safeLink } from '../lib/fanGames.mjs';

const inputClass = 'w-full bg-slate-950/50 border border-slate-800 rounded-xl px-3 py-2 text-base md:text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500/30';

const newFanGame = (): api.FanGame => ({
    id: `fangame-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    url: '',
    description: '',
    image: '',
});

/**
 * 팬게임 링크 모음. PC와 모바일이 같은 창을 쓴다.
 * 목록은 창을 열 때만 받는다. 페이지마다 받으면 Worker 무료 요청 한도만 축난다.
 */
export default function FanGamesModal({ isAdmin, mobile = false, onClose }: { isAdmin: boolean; mobile?: boolean; onClose: () => void }) {
    const [items, setItems] = useState<api.FanGame[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [uploadingId, setUploadingId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        api.fetchFanGames()
            .then(data => { if (!cancelled) setItems(data); })
            .catch(err => {
                console.error('Failed to fetch fan games:', err);
                if (!cancelled) setLoadFailed(true);
            })
            .finally(() => { if (!cancelled) setIsLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const updateItem = (id: string, patch: Partial<api.FanGame>) =>
        setItems(prev => prev.map(item => (item.id === id ? { ...item, ...patch } : item)));

    const moveItem = (index: number, delta: number) =>
        setItems(prev => {
            const next = [...prev];
            [next[index], next[index + delta]] = [next[index + delta], next[index]];
            return next;
        });

    const handleImageUpload = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        setUploadingId(id);
        try {
            updateItem(id, { image: await api.uploadImage(file, 1) });
        } catch (err) {
            console.error('Upload error:', err);
            alert(err instanceof Error ? err.message : '이미지 업로드 실패!');
        } finally {
            setUploadingId(null);
        }
    };

    const save = async () => {
        const { items: clean, error } = normalizeFanGames(items);
        if (error) {
            alert(error);
            return;
        }

        setIsSaving(true);
        try {
            await api.saveFanGames(clean);
            alert('팬게임 목록이 저장되었습니다.');
            onClose();
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : '오류 발생');
        } finally {
            setIsSaving(false);
        }
    };

    const links = items.filter(item => safeLink(item.url));

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className={`bg-slate-900 border border-slate-700 rounded-3xl w-full ${mobile ? 'max-w-sm' : 'max-w-2xl'} shadow-2xl overflow-hidden flex flex-col max-h-[85vh]`}>
                <header className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-800/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400 border border-indigo-500/20">
                            <Gamepad2 size={20} />
                        </div>
                        <h3 className="font-bold text-slate-100">팬게임</h3>
                    </div>
                    <button onClick={onClose} className="p-1 text-slate-500 hover:text-white transition-colors" title="닫기">
                        <X size={24} />
                    </button>
                </header>

                <div className="flex-grow overflow-y-auto min-h-0 p-5 custom-scrollbar">
                    {isLoading ? (
                        <div className="flex justify-center py-10">
                            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : loadFailed ? (
                        <p className="py-10 text-center text-sm text-slate-400">목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
                    ) : isAdmin ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400 text-xs font-bold italic">
                                <Shield size={14} />
                                <span>ADMIN EDITOR MODE</span>
                            </div>
                            {items.map((item, index) => (
                                <div key={item.id} className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-2xl space-y-2">
                                    <div className="flex items-center gap-3">
                                        <div className="relative w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-slate-950/50 border border-slate-800 flex items-center justify-center text-slate-600">
                                            {item.image ? (
                                                <img src={imageUrl(item.image)} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <ImageIcon size={24} />
                                            )}
                                            {uploadingId === item.id && (
                                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col gap-2">
                                            <label className={`py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold flex items-center justify-center gap-2 transition-all ${uploadingId ? 'opacity-50' : 'cursor-pointer hover:bg-slate-700'}`}>
                                                <Upload size={14} />
                                                이미지 업로드
                                                <input
                                                    type="file"
                                                    accept="image/webp,image/png,image/jpeg"
                                                    className="hidden"
                                                    disabled={!!uploadingId}
                                                    onChange={e => handleImageUpload(item.id, e)}
                                                />
                                            </label>
                                            {item.image && (
                                                <button
                                                    onClick={() => updateItem(item.id, { image: '' })}
                                                    className="py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-xs font-bold transition-all"
                                                >
                                                    이미지 빼기
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <input
                                        value={item.title}
                                        onChange={e => updateItem(item.id, { title: e.target.value })}
                                        placeholder="제목"
                                        maxLength={MAX_TITLE_LENGTH}
                                        className={inputClass}
                                    />
                                    <input
                                        value={item.description}
                                        onChange={e => updateItem(item.id, { description: e.target.value })}
                                        placeholder="짧은 설명 (선택)"
                                        maxLength={MAX_DESCRIPTION_LENGTH}
                                        className={inputClass}
                                    />
                                    <input
                                        value={item.url}
                                        onChange={e => updateItem(item.id, { url: e.target.value })}
                                        placeholder="링크 (https://...)"
                                        type="url"
                                        inputMode="url"
                                        className={inputClass}
                                    />
                                    <div className="flex justify-end gap-1">
                                        <button
                                            onClick={() => moveItem(index, -1)}
                                            disabled={index === 0}
                                            className="p-2 text-slate-400 hover:text-white disabled:opacity-25 disabled:hover:text-slate-400 transition-colors"
                                            title="위로"
                                        >
                                            <ArrowUp size={16} />
                                        </button>
                                        <button
                                            onClick={() => moveItem(index, 1)}
                                            disabled={index === items.length - 1}
                                            className="p-2 text-slate-400 hover:text-white disabled:opacity-25 disabled:hover:text-slate-400 transition-colors"
                                            title="아래로"
                                        >
                                            <ArrowDown size={16} />
                                        </button>
                                        <button
                                            onClick={() => setItems(prev => prev.filter(other => other.id !== item.id))}
                                            className="p-2 text-rose-400 hover:text-rose-300 transition-colors"
                                            title="삭제"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            <button
                                onClick={() => setItems(prev => [...prev, newFanGame()])}
                                className="w-full py-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-sm font-bold transition-all flex items-center justify-center gap-2"
                            >
                                <Plus size={16} />
                                팬게임 추가
                            </button>
                        </div>
                    ) : links.length === 0 ? (
                        <p className="py-10 text-center text-sm text-slate-400">아직 등록된 팬게임이 없습니다.</p>
                    ) : (
                        <div className={`grid gap-3 ${mobile ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
                            {links.map(game => (
                                <a
                                    key={game.id}
                                    href={safeLink(game.url) ?? undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group flex flex-col rounded-2xl overflow-hidden bg-slate-800/50 border border-slate-700 hover:border-indigo-500/50 transition-all"
                                >
                                    <div className="aspect-square bg-slate-950/50 flex items-center justify-center text-slate-600 overflow-hidden">
                                        {game.image ? (
                                            <img src={imageUrl(game.image)} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                        ) : (
                                            <Gamepad2 size={28} />
                                        )}
                                    </div>
                                    <div className="p-2.5">
                                        <span className="flex items-start justify-between gap-1.5">
                                            <span className="min-w-0 text-xs font-black text-slate-100 break-words">{game.title}</span>
                                            <ExternalLink size={12} className="text-slate-500 shrink-0 mt-0.5" />
                                        </span>
                                        {game.description && (
                                            <span className="block mt-1 text-[11px] leading-snug text-slate-400 break-words">{game.description}</span>
                                        )}
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </div>

                {isAdmin && (
                    <footer className="p-5 bg-slate-900 border-t border-slate-800 flex justify-end gap-3 shrink-0">
                        <button
                            onClick={onClose}
                            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 font-black rounded-xl transition-all text-[11px] border border-slate-700"
                        >
                            취소
                        </button>
                        {/* 불러오기에 실패한 채 저장하면 기존 목록이 빈 목록으로 덮인다. */}
                        <button
                            onClick={save}
                            disabled={isSaving || isLoading || loadFailed || !!uploadingId}
                            className="px-6 py-3 bg-indigo-500 hover:bg-indigo-400 text-white font-black rounded-xl transition-all text-[11px] flex items-center gap-2 active:scale-95 disabled:opacity-50"
                        >
                            {isSaving ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <Save size={16} />
                            )}
                            목록 저장
                        </button>
                    </footer>
                )}
            </div>
        </div>
    );
}
