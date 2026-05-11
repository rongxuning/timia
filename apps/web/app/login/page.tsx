"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { setToken } from "@/lib/auth";

type LoginResponse = { access_token: string; token_type: string };

function ShowcaseCard({
  title,
  subtitle,
  body,
  headerTintClass,
  iconName,
  iconTintClass,
  stackClass,
  iconPositionClass,
}: {
  title: string;
  subtitle: string;
  body: string;
  headerTintClass: string;
  iconName: string;
  iconTintClass: string;
  stackClass: string;
  iconPositionClass: string;
}) {
  return (
    <div className={`relative w-[min(100%,280px)] ${stackClass}`}>
      <div
        className={`pointer-events-none absolute z-0 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface shadow-sm ring-1 ring-border-subtle ${iconPositionClass}`}
        aria-hidden
      >
        <span className={`material-symbols-outlined text-[32px] ${iconTintClass}`}>{iconName}</span>
      </div>
      <article
        className="relative z-10 rounded-xl border border-border-subtle bg-surface p-lg shadow-sm ring-1 ring-black/[0.02]"
        aria-hidden
      >
        <div className="mb-md flex items-start justify-between gap-md">
          <div className="flex min-w-0 items-center gap-sm">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${headerTintClass}`}
              aria-hidden
            >
              <span className="material-symbols-outlined text-[18px] text-on-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                {iconName}
              </span>
            </div>
            <span className="truncate font-overline text-overline tracking-[0.12em] text-on-surface-variant">NOMIA</span>
          </div>
          <span className="shrink-0 font-body text-caption text-outline-variant">现在</span>
        </div>
        <h2 className="font-section-heading text-small font-semibold leading-snug text-on-surface">{title}</h2>
        <p className="mt-xs font-body text-small font-semibold text-on-surface">{subtitle}</p>
        <p className="mt-sm font-body text-small leading-relaxed text-text-secondary">{body}</p>
      </article>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@nomia.com");
  const [password, setPassword] = useState("admin1234");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(res.access_token);
      router.push("/my/schedule");
    } catch (err: any) {
      setError(err?.message ?? "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden md:flex-row">
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-60" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-surface-container-low/50 via-transparent to-primary-container/5"
        aria-hidden
      />

      {/* 左侧：纯展示任务卡片（方案 B：轻微错位浮动） */}
      <section
        className="relative z-[1] flex w-full flex-none items-center justify-center overflow-hidden bg-surface-container-low px-container-padding py-5xl md:w-1/2 md:min-h-screen md:py-8xl"
        aria-label="产品展示"
      >
        <div className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-primary-fixed/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -right-16 bottom-1/4 h-56 w-56 rounded-full bg-secondary-fixed/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute left-[18%] top-[12%] h-10 w-16 rounded-full bg-white/70 shadow-sm" aria-hidden />
        <div className="pointer-events-none absolute right-[22%] top-[38%] h-6 w-11 rounded-full bg-white/60 shadow-sm" aria-hidden />
        <div className="pointer-events-none absolute left-[28%] bottom-[20%] h-7 w-12 rounded-full bg-white/55 shadow-sm" aria-hidden />

        <div className="relative flex w-full max-w-[360px] flex-col items-center gap-2xl md:max-w-[400px]" aria-hidden>
          <ShowcaseCard
            title="早上任务"
            subtitle="示例公司"
            body="用清晰的安排开启新的一天。"
            headerTintClass="bg-warning"
            iconName="wb_sunny"
            iconTintClass="text-warning"
            stackClass="md:translate-x-4 md:-rotate-1"
            iconPositionClass="-left-2 -top-3 md:-left-4 md:-top-4"
          />
          <ShowcaseCard
            title="工作任务"
            subtitle="示例公司"
            body="把注意力放在今日最重要的事情上。"
            headerTintClass="bg-primary"
            iconName="coffee"
            iconTintClass="text-primary"
            stackClass="md:-translate-x-6 md:translate-y-1 md:rotate-1"
            iconPositionClass="-right-2 -top-3 md:-right-5 md:-top-2"
          />
          <ShowcaseCard
            title="晚上任务"
            subtitle="示例公司"
            body="回顾今天的进展，并为明天做好准备。"
            headerTintClass="bg-primary-fixed-dim"
            iconName="bedtime"
            iconTintClass="text-primary-fixed-variant"
            stackClass="md:translate-x-8 md:-translate-y-1 md:-rotate-1"
            iconPositionClass="-left-1 -top-3 md:-left-3 md:-top-5"
          />
        </div>
      </section>

      {/* 右侧：现有登录界面 */}
      <section className="relative z-10 flex w-full flex-1 flex-col items-center justify-center px-container-padding py-5xl md:w-1/2 md:min-h-screen md:py-8xl">
        <div className="w-full max-w-[440px]">
          <div className="mb-8xl flex flex-col items-center">
            <div className="mb-lg flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle bg-white shadow-sm">
                <img alt="Nomia 图标" src="/icons/icon-48.png" className="h-6.5 w-6.5 object-contain" />
              </div>
              <span className="font-headline text-subhead tracking-tight text-on-surface">Nomia</span>
            </div>
            <p className="mt-sm text-center font-body text-text-secondary">全天候管理你的日程</p>
          </div>

          <div className="rounded-xl border border-border-subtle bg-surface p-3xl shadow-sm transition-shadow duration-300 hover:shadow-md">
            <form onSubmit={onSubmit} className="space-y-xl">
              <div className="space-y-xs">
                <label className="font-body text-small font-medium text-on-surface-variant" htmlFor="email">
                  邮箱
                </label>
                <div className="group relative">
                  <input
                    id="email"
                    className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="name@company.com"
                    type="email"
                  />
                  <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant transition-colors group-focus-within:text-primary">
                    mail
                  </span>
                </div>
              </div>

              <div className="space-y-xs">
                <label className="font-body text-small font-medium text-on-surface-variant" htmlFor="password">
                  密码
                </label>
                <div className="group relative">
                  <input
                    id="password"
                    className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                  />
                  <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant transition-colors group-focus-within:text-primary">
                    lock
                  </span>
                </div>
              </div>

              {error && <div className="text-small text-error">{error}</div>}

              <button
                type="submit"
                className="w-full rounded-xl bg-primary py-md font-section-heading text-body text-on-primary shadow-sm transition-all hover:-translate-y-px hover:bg-primary-hover active:scale-95 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? "登录中…" : "登录"}
              </button>
            </form>
          </div>
        </div>
      </section>

      <footer className="fixed bottom-lg z-20 flex w-full flex-wrap items-center justify-center gap-x-lg gap-y-sm px-container-padding text-overline text-outline-variant">
        <span>© 2026 Nomia</span>
        <div className="flex flex-wrap justify-center gap-lg">
          <a className="transition-colors hover:text-text-secondary" href="#">
            隐私
          </a>
          <a className="transition-colors hover:text-text-secondary" href="#">
            条款
          </a>
          <a className="transition-colors hover:text-text-secondary" href="#">
            安全
          </a>
        </div>
      </footer>
    </main>
  );
}
