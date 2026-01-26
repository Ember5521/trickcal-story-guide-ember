"use client";

import { useState, useEffect } from "react";
import StoryCanvas from "../components/StoryCanvas";
import MobileCanvas from "../components/MobileCanvas";

export default function Home() {
    const [isMobile, setIsMobile] = useState<boolean | null>(null);

    useEffect(() => {
        const checkDevice = () => {
            const savedMode = localStorage.getItem("view_mode");
            if (savedMode) {
                setIsMobile(savedMode === "mobile");
                return;
            }
            const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
            const isMobileUA = mobileRegex.test(navigator.userAgent);
            const isSmallScreen = window.innerWidth < 1024;
            setIsMobile(isMobileUA || isSmallScreen);
        };

        checkDevice();
        window.addEventListener("resize", checkDevice);
        return () => window.removeEventListener("resize", checkDevice);
    }, []);

    const toggleView = () => {
        const next = !isMobile;
        setIsMobile(next);
        localStorage.setItem("view_mode", next ? "mobile" : "pc");
    };

    if (isMobile === null) {
        return <div className="bg-slate-900 h-screen w-screen" />;
    }

    return (
        <main className="h-screen w-screen overflow-hidden relative">
            {isMobile ? (
                <MobileCanvas onToggleView={toggleView} isMobileView={true} />
            ) : (
                <StoryCanvas onToggleView={toggleView} isMobileView={false} />
            )}
        </main>
    );
}
