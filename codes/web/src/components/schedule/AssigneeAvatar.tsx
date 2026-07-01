"use client";

type AssigneeAvatarProps = {
  displayName: string;
  size?: "compact" | "default" | "large";
};

export function AssigneeAvatar({ displayName, size = "default" }: AssigneeAvatarProps) {
  const sizeClass =
    size === "compact"
      ? "h-4 w-4 text-[8px]"
      : size === "large"
        ? "h-6 w-6 text-[10px]"
        : "h-5 w-5 text-[9px]";

  return (
    <div
      className={[
        "flex shrink-0 items-center justify-center rounded-full border border-white bg-surface-container font-bold text-on-surface-variant",
        sizeClass,
      ].join(" ")}
      title={displayName}
    >
      {(displayName.trim().slice(0, 1) || "?").toUpperCase()}
    </div>
  );
}
