import Link from "next/link";
import type { PlanCardOut } from "@/lib/api/plans";

const USAGE_LABEL: Record<string, string> = {
  one_shot: "加入",
  subscription: "订阅",
};

const PERIOD_LABEL: Record<string, string> = {
  day: "日",
  week: "周",
  month: "月",
  year: "年",
};

const VISIBILITY_LABEL: Record<string, string> = {
  private: "私有",
  public: "公开",
};

function labelOf(map: Record<string, string>, value: string) {
  return map[value] ?? value;
}

export function PlanCard({ plan }: { plan: PlanCardOut }) {
  const tags = plan.tags ?? [];

  return (
    <Link
      href={`/plans/${plan.id}`}
      className="flex h-full min-h-[160px] flex-col overflow-hidden rounded-xl border border-border-subtle bg-white p-4 outline-none transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] focus-visible:ring-4 focus-visible:ring-primary/10"
    >
      <h2 className="truncate font-subhead text-lg font-bold text-text-primary" title={plan.title}>
        {plan.title}
      </h2>
      <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-caption text-text-secondary">
        <span>{labelOf(USAGE_LABEL, plan.usage_kind)}</span>
        <span aria-hidden>·</span>
        <span>{labelOf(PERIOD_LABEL, plan.period_kind)}</span>
        <span aria-hidden>·</span>
        <span>{labelOf(VISIBILITY_LABEL, plan.visibility)}</span>
      </p>
      <p className="mt-2 truncate text-caption text-text-secondary">
        {plan.creator.display_name}
      </p>
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
  );
}
