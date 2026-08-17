import Link from "next/link";
import type { PlanRunItemOut } from "@/lib/api/plans";

export function planItemHref(workspaceId: string, projectId: string, itemId: string): string {
  return `/workspace/${workspaceId}/projects/${projectId}/items/${itemId}`;
}

type Props = {
  items: PlanRunItemOut[];
  workspaceId: string;
  projectId: string;
};

export function PlanRunItems({ items, workspaceId, projectId }: Props) {
  if (items.length === 0) {
    return <p className="text-caption text-neutral-muted">暂无任务</p>;
  }
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.id} className="text-small text-text-primary">
          {item.deleted || !workspaceId || !projectId ? (
            <span>
              {item.title}
              {item.deleted ? <span className="text-neutral-muted">（已删除）</span> : null}
            </span>
          ) : (
            <Link
              href={planItemHref(workspaceId, projectId, item.id)}
              className="text-indigo-700 hover:underline"
            >
              {item.title}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
