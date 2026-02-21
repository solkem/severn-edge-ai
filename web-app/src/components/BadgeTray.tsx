import { BADGES } from '../badges/badges';
import type { BadgeId } from '../storage/schema';

interface BadgeTrayProps {
  badgeIds: BadgeId[];
}

export function BadgeTray({ badgeIds }: BadgeTrayProps) {
  if (badgeIds.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {badgeIds.map((id) => {
        const badge = BADGES[id];
        return (
          <span
            key={id}
            title={badge.criteria}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800"
          >
            <span>{badge.icon}</span>
            <span>{badge.name}</span>
          </span>
        );
      })}
    </div>
  );
}

