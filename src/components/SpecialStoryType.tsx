import type { ComponentType } from 'react';
import { Aperture, Cog, Egg, Sparkles, Sprout } from 'lucide-react';

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number }>;

function WorldTreeIcon({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2.5c-2.2 0-4 1.3-4.7 3.2C4.9 5.9 3 7.9 3 10.3c0 2.8 2.3 5 5.1 5h7.8c2.8 0 5.1-2.2 5.1-5 0-2.4-1.9-4.4-4.3-4.6C16 3.8 14.2 2.5 12 2.5Z" />
            <path d="M12 6v10M12 9 8.5 7M12 11l3.5-2.5" />
            <path d="M12 14.5c0 3.1-2.1 4.1-5 6M12 16.5c0 2.2 0 3.2-1 5M12 14.5c0 3.1 2.1 4.1 5 6M12 16.5c0 2.2 0 3.2 1 5" />
        </svg>
    );
}

const SPECIAL_STORY_TYPES = {
    eternal: {
        label: '영원살이', icon: Sprout,
        border: 'border-lime-400', mobileBorder: 'border-lime-400/60', ring: 'ring-lime-400/50',
        badge: 'bg-lime-500 text-white shadow-[0_0_18px_rgba(132,204,22,0.95)]',
        pill: 'bg-lime-500/20 text-lime-300', glow: 'shadow-[0_0_8px_rgba(132,204,22,0.18)]',
    },
    frontier: {
        label: '프론티어', icon: Cog,
        border: 'border-orange-500', mobileBorder: 'border-orange-500/60', ring: 'ring-orange-500/50',
        badge: 'bg-orange-500 text-white shadow-[0_0_18px_rgba(249,115,22,0.95)]',
        pill: 'bg-orange-500/20 text-orange-300', glow: 'shadow-[0_0_8px_rgba(249,115,22,0.18)]',
    },
    unwanted_exam: {
        label: '원치않는 시험', icon: WorldTreeIcon,
        border: 'border-green-700', mobileBorder: 'border-green-700/70', ring: 'ring-green-700/60',
        badge: 'bg-green-800 text-white shadow-[0_0_18px_rgba(21,128,61,0.95)]',
        pill: 'bg-green-800/30 text-green-300', glow: 'shadow-[0_0_8px_rgba(21,128,61,0.2)]',
    },
    flickering_light: {
        label: '깜빡이는 빛무리', icon: Sparkles,
        border: 'border-yellow-400', mobileBorder: 'border-yellow-400/55', ring: 'ring-yellow-400/50',
        badge: 'bg-yellow-400 text-slate-950 shadow-[0_0_18px_rgba(250,204,21,0.95)]',
        pill: 'bg-yellow-400/20 text-yellow-300', glow: 'shadow-[0_0_8px_rgba(250,204,21,0.18)]',
    },
    dimension_ruler: {
        label: '차원의 패자', icon: Aperture,
        border: 'border-purple-500', mobileBorder: 'border-purple-500/60', ring: 'ring-purple-500/50',
        badge: 'bg-purple-600 text-white shadow-[0_0_18px_rgba(147,51,234,0.95)]',
        pill: 'bg-purple-500/20 text-purple-300', glow: 'shadow-[0_0_8px_rgba(147,51,234,0.18)]',
    },
    silver_life: {
        label: '은은히 빛나는 은생', icon: Egg,
        border: 'border-slate-300', mobileBorder: 'border-slate-300/60', ring: 'ring-slate-200/50',
        badge: 'bg-slate-300 text-slate-950 shadow-[0_0_18px_rgba(226,232,240,0.9)]',
        pill: 'bg-slate-300/20 text-slate-200', glow: 'shadow-[0_0_8px_rgba(226,232,240,0.18)]',
    },
} satisfies Record<string, {
    label: string; icon: IconComponent; border: string; mobileBorder: string; ring: string;
    badge: string; pill: string; glow: string;
}>;

export type SpecialStoryType = keyof typeof SPECIAL_STORY_TYPES;

export const getSpecialStoryType = (type?: string) =>
    type && type in SPECIAL_STORY_TYPES ? SPECIAL_STORY_TYPES[type as SpecialStoryType] : null;

export const isSpecialStoryType = (type?: string): type is SpecialStoryType => !!getSpecialStoryType(type);

export function SpecialStoryIcon({ type, compact = false }: { type?: string; compact?: boolean }) {
    const special = getSpecialStoryType(type);
    if (!special) return null;

    const Icon = special.icon;
    return (
        <div
            className={`absolute z-30 border-white/90 rounded-xl ${special.badge} ${compact ? 'top-1 left-1 p-1 border' : 'top-3 left-3 p-2.5 border-2'}`}
            style={compact ? { boxShadow: '0 0 4px rgb(255 255 255 / 0.18)' } : undefined}
            title={special.label}
            aria-label={special.label}
        >
            <Icon size={compact ? 14 : 28} strokeWidth={3} />
        </div>
    );
}
