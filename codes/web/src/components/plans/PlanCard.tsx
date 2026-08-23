"use client";

import Link from "next/link";
import type { PlanCardOut } from "@/lib/api/plans";
import {
  PLAN_PERIOD_LABEL,
  PLAN_USAGE_LABEL,
  PLAN_VISIBILITY_LABEL,
  planLabel,
} from "./planLabels";
import { PlanFavoriteButton } from "./PlanFavoriteButton";

export type PlanCardProps = {
  plan: PlanCardOut;
  favoriting?: boolean;
  onFavoriteToggle?: (plan: PlanCardOut, next: boolean) => void;
};

export function PlanCard({ plan, favoriting = false, onFavoriteToggle }: PlanCardProps) {
  const tags = plan.tags ?? [];
  const isFavorite = Boolean(plan.is_favorite);

  return (
    <div className="relative flex h-full min-h-[160px] flex-col overflow-hidden rounded-xl border border-border-subtle bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
      {onFavoriteToggle ? (
        <div className="absolute right-3 top-3 z-[1]">
          <PlanFavoriteButton
            isFavorite={isFavorite}
            disabled={favoriting}
            onToggle={() => onFavoriteToggle(plan, !isFavorite)}
          />
        </div>
      ) : null}
      <Link
        href={`/plans/${plan.id}`}
        className="flex min-h-0 flex-1 flex-col outline-none focus-visible:ring-4 focus-visible:ring-primary/10"
      >
        <h2
          className={`truncate font-subhead text-lg font-bold text-text-primary ${onFavoriteToggle ? "pr-10" : ""}`}
          title={plan.title}
        >
          {plan.title}
        </h2>
        <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-caption text-text-secondary">
          <span>{planLabel(PLAN_USAGE_LABEL, plan.usage_kind)}</span>
          <span aria-hidden>·</span>
          <span>{planLabel(PLAN_PERIOD_LABEL, plan.period_kind)}</span>
          <span aria-hidden>·</span>
          <span>{planLabel(PLAN_VISIBILITY_LABEL, plan.visibility)}</span>
        </p>
        <p className="mt-2 truncate text-caption text-text-secondary">{plan.creator.display_name}</p>
        {tags.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full border border-border-subtle bg-surface-bright px-2 py-0.5 text-caption text-text-secondary"
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-auto pt-3 text-caption text-neutral-muted">{plan.use_count} 次使用</p>
      </Link>
    </div>
  );
}
