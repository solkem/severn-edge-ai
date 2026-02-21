import { useEffect } from 'react';
import { BADGES } from '../badges/badges';
import type { BadgeId } from '../storage/schema';

interface BadgeToastProps {
  badgeId: BadgeId;
  onClose: () => void;
}

export function BadgeToast({ badgeId, onClose }: BadgeToastProps) {
  const badge = BADGES[badgeId];

  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-4 right-4 z-[999] bg-white border border-slate-200 rounded-xl shadow-2xl p-4 flex items-center gap-3 animate-in slide-in-from-bottom-3 duration-300">
      <span className="text-3xl">{badge.icon}</span>
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Badge Earned
        </p>
        <p className="text-base font-bold text-slate-800">{badge.name}</p>
      </div>
    </div>
  );
}

