import type { ReactNode } from "react";

export type PageMainProps = {
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
};

/** 统一主内容区：水平内边距 + 最大宽度容器 */
export function PageMain({ children, className = "", fullWidth = false }: PageMainProps) {
  return (
    <main className={`px-lg py-lg ${className}`.trim()}>
      <div className={fullWidth ? "w-full" : "max-w-container-max mx-auto"}>{children}</div>
    </main>
  );
}
