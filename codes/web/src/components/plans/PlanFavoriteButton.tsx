"use client";

type PlanFavoriteButtonProps = {
  isFavorite: boolean;
  disabled?: boolean;
  onToggle: () => void;
  className?: string;
};

export function PlanFavoriteButton({
  isFavorite,
  disabled = false,
  onToggle,
  className = "",
}: PlanFavoriteButtonProps) {
  return (
    <button
      type="button"
      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50/40 text-primary transition-colors hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50 ${className}`}
      title={isFavorite ? "取消收藏" : "收藏规划"}
      aria-label={isFavorite ? "取消收藏" : "收藏规划"}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
    >
      <span
        className="material-symbols-outlined text-[17px]"
        style={isFavorite ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        favorite
      </span>
    </button>
  );
}
