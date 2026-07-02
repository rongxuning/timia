"use client";

import { useId } from "react";

type TimiaLogoProps = {
  size?: number;
  className?: string;
  title?: string;
};

export function TimiaLogo({ size = 24, className = "", title = "Timia" }: TimiaLogoProps) {
  const gradId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="36 35 129 129"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
          <stop offset="100%" stopColor="#a5b4fc" stopOpacity={1} />
        </linearGradient>
      </defs>
      <rect x="40" y="40" width="120" height="120" rx="30" fill="white" stroke={`url(#${gradId})`} strokeWidth={8} />
      <path
        d="M70 75H130M100 75V135"
        stroke={`url(#${gradId})`}
        strokeWidth={12}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="150" cy="50" r="15" fill="#6366f1" />
    </svg>
  );
}
