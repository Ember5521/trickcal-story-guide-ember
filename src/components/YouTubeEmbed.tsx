"use client";

import React, { useEffect, useRef, useState } from 'react';

interface YouTubeEmbedProps {
    videoId: string;
    startTime?: number;
    endTime?: number;
    className?: string;
    onClose?: () => void; // Optional callback
}

declare global {
    interface Window {
        YT: any;
        onYouTubeIframeAPIReady: () => void;
    }
}

export default function YouTubeEmbed({ videoId, startTime = 0, endTime = 0, className, onClose }: YouTubeEmbedProps) {
    const playerRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isApiReady, setIsApiReady] = useState(false);
    const [showWarning, setShowWarning] = useState(false);
    const [ignoreConstraints, setIgnoreConstraints] = useState(false);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // Ref to access current state in interval closure
    const constraintsRef = useRef({ ignore: false, startTime, endTime });

    useEffect(() => {
        constraintsRef.current = { ignore: ignoreConstraints, startTime, endTime };
    }, [ignoreConstraints, startTime, endTime]);

    // Load YouTube API
    useEffect(() => {
        if (!window.YT) {
            const tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

            window.onYouTubeIframeAPIReady = () => {
                setIsApiReady(true);
            };
        } else {
            setIsApiReady(true);
        }

        return () => {
            if (playerRef.current) {
                try {
                    playerRef.current.destroy();
                } catch (e) {
                    console.error("Error destroying player:", e);
                }
            }
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    // Initialize Player
    useEffect(() => {
        if (isApiReady && containerRef.current && !playerRef.current) {
            playerRef.current = new window.YT.Player(containerRef.current, {
                height: '100%',
                width: '100%',
                videoId: videoId,
                playerVars: {
                    autoplay: 1,
                    controls: 1,
                    rel: 0,
                    start: startTime,
                    // We handle end time manually for strict enforcement, 
                    // but end param helps native behavior too.
                    end: endTime > 0 ? endTime : undefined
                },
                events: {
                    onReady: (event: any) => {
                        event.target.playVideo();
                        if (startTime > 0) {
                            event.target.seekTo(startTime);
                        }
                    },
                    onStateChange: (event: any) => {
                        // State 1 = Playing
                        if (event.data === 1) {
                            startMonitoring();
                        } else {
                            stopMonitoring();
                        }
                    }
                }
            });
        } else if (playerRef.current && playerRef.current.loadVideoById) {
            // Handle videoId change if component is recycled
            playerRef.current.loadVideoById({
                videoId: videoId,
                startSeconds: startTime,
                endSeconds: endTime > 0 ? endTime : undefined
            });
        }
    }, [isApiReady, videoId, startTime, endTime]);

    const startMonitoring = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
            if (!playerRef.current || !playerRef.current.getCurrentTime) return;

            const curr = playerRef.current.getCurrentTime();
            const { ignore, startTime: st, endTime: et } = constraintsRef.current;

            if (ignore) return;

            let isOutOfBounds = false;

            // Check Start Time (Buffer of 1s to rely on seek accuracy)
            if (st > 0 && curr < st - 1) {
                isOutOfBounds = true;
            }

            // Check End Time
            if (et > 0 && curr >= et) {
                isOutOfBounds = true;
            }

            if (isOutOfBounds) {
                playerRef.current.pauseVideo();
                setShowWarning(true);
                stopMonitoring();
            }
        }, 500);
    };

    const stopMonitoring = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
    };

    const handleContinue = () => {
        setIgnoreConstraints(true);
        setShowWarning(false);
        if (playerRef.current) playerRef.current.playVideo();
    };

    const handleClose = () => {
        if (onClose) onClose();
    };

    return (
        <div className={`relative ${className}`}>
            <div ref={containerRef} className="w-full h-full" />

            {showWarning && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-300">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center space-y-6">
                        <div className="space-y-2">
                            <h3 className="text-lg font-bold text-white">시청 범위 알림</h3>
                            <p className="text-slate-300 text-sm leading-relaxed">
                                해당 스토리의 내용에서 벗어났습니다.<br />
                                무시하고 계속 시청하시겠습니까?
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={handleContinue}
                                className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors shadow-lg shadow-indigo-900/50"
                            >
                                네 (시청하기)
                            </button>
                            <button
                                onClick={handleClose}
                                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition-colors border border-slate-700"
                            >
                                아니오 (닫기)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
