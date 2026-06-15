"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { setToken } from "@/lib/auth";

type LoginResponse = { access_token: string; token_type: string };

/** 本地开发默认管理员（与 codes/api/app/scripts/seed.py 一致） */
const DEFAULT_LOGIN_EMAIL = "admin@gmail.com";
const DEFAULT_LOGIN_PASSWORD = "admin1234";

function SpeechBubble({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute whitespace-nowrap rounded-2xl border border-border-subtle bg-surface px-md py-sm font-body text-caption font-medium text-on-surface-variant shadow-sm ring-1 ring-black/[0.03] ${className ?? ""}`}
      aria-hidden
    >
      {children}
    </div>
  );
}

function ShowcaseCard({
  title,
  subtitle,
  body,
  timeText,
  headerTintClass,
  headerIconClass,
  iconName,
  stackClass,
  behindCard,
}: {
  title: string;
  subtitle: string;
  body?: string;
  timeText: string;
  headerTintClass: string;
  headerIconClass: string;
  iconName: string;
  stackClass: string;
  behindCard?: ReactNode;
}) {
  return (
    <div className={`relative w-[min(100%,280px)] ${stackClass}`}>
      {behindCard ? (
        <div className="pointer-events-none absolute -inset-10 z-30 overflow-visible" aria-hidden>
          {behindCard}
        </div>
      ) : null}
      <article className="relative z-10 rounded-xl border border-border-subtle bg-surface p-lg shadow-sm ring-1 ring-black/[0.02]">
        <div className="mb-md flex items-start justify-between gap-md">
          <div className="flex min-w-0 items-center gap-sm">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${headerTintClass}`}
              aria-hidden
            >
              <span
                className={`material-symbols-outlined text-[18px] ${headerIconClass}`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {iconName}
              </span>
            </div>
            <span className="truncate font-overline text-overline tracking-[0.12em] text-on-surface-variant">TIMIA</span>
          </div>
          <span className="shrink-0 font-body text-caption text-outline-variant">{timeText}</span>
        </div>
        <h2 className="font-body text-small font-semibold leading-snug text-on-surface">{title}</h2>
        {subtitle ? <p className="mt-xs font-body text-caption font-medium text-on-surface-variant">{subtitle}</p> : null}
        {body ? (
          <p
            className={`font-body text-small leading-relaxed text-text-secondary ${subtitle ? "mt-sm" : "mt-xs"}`}
          >
            {body}
          </p>
        ) : null}
      </article>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(DEFAULT_LOGIN_EMAIL);
  const [password, setPassword] = useState(DEFAULT_LOGIN_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get("email");
    const sessionExpired = params.get("reason") === "session-expired";

    if (emailParam) setEmail(emailParam);
    if (sessionExpired) {
      setSessionNotice("登录已过期，请重新登录。");
      params.delete("reason");
    }
    if (emailParam) params.delete("email");

    if (sessionExpired || emailParam) {
      const next = params.toString();
      const path = next ? `${window.location.pathname}?${next}` : window.location.pathname;
      window.history.replaceState(null, "", path);
    }
  }, []);

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
        className="relative z-[1] order-2 flex w-full flex-none items-center justify-center overflow-hidden bg-surface-container-low px-container-padding py-5xl md:order-none md:w-1/2 md:min-h-screen md:py-8xl"
        aria-hidden
      >
        <div className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-primary-fixed/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -right-16 bottom-1/4 h-56 w-56 rounded-full bg-secondary-fixed/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute left-[18%] top-[12%] h-10 w-16 rounded-full bg-white/70 shadow-sm" aria-hidden />
        <div className="pointer-events-none absolute right-[22%] top-[38%] h-6 w-11 rounded-full bg-white/60 shadow-sm" aria-hidden />
        <div className="pointer-events-none absolute left-[28%] bottom-[20%] h-7 w-12 rounded-full bg-white/55 shadow-sm" aria-hidden />

        <div className="relative flex w-full max-w-[360px] flex-col items-center gap-2xl md:max-w-[400px]">
          <ShowcaseCard
            title="空腹晨跑锻炼"
            subtitle=""
            body="启动身心开启新的一天。"
            timeText="7:00 AM"
            headerTintClass="bg-warning"
            headerIconClass="text-on-primary"
            iconName="wb_sunny"
            stackClass="md:translate-x-4 md:-rotate-1"
            behindCard={
              <>
                <SpeechBubble className="left-0 top-[55%] -translate-x-[75%] -rotate-6">配速6‘30</SpeechBubble>
                <SpeechBubble className="right-0 top-[28%] translate-x-[75%] rotate-3">8km</SpeechBubble>
                <SpeechBubble className="left-0 top-[12%] -translate-x-[75%] -rotate-2">中山公园</SpeechBubble>
              </>
            }
          />
          <ShowcaseCard
            title="会议与交付物排进同一张视图里，工作安排心中有数。"
            subtitle=""
            body="优先级写清楚，少一次临时救火。"
            timeText="11:00 AM"
            headerTintClass="bg-primary"
            headerIconClass="text-on-primary"
            iconName="coffee"
            stackClass="md:-translate-x-6 md:translate-y-1 md:rotate-1"
            behindCard={
              <>
                <SpeechBubble className="left-0 top-[55%] -translate-x-[75%] -rotate-6">周五交付</SpeechBubble>
                <SpeechBubble className="right-0 top-[28%] translate-x-[75%] rotate-3">对齐会</SpeechBubble>
                <SpeechBubble className="right-0 top-[58%] translate-x-[75%] rotate-3">产品评审</SpeechBubble>
              </>
            }
          />
          <ShowcaseCard
            title="机票、酒店和每日动线对齐放好，旅行计划说走就走。"
            subtitle=""
            body="行前提醒不漏项，路上少分心。"
            timeText="16:00PM"
            headerTintClass="bg-tertiary"
            headerIconClass="text-on-tertiary"
            iconName="flight_takeoff"
            stackClass="md:translate-x-8 md:-translate-y-1 md:-rotate-1"
            behindCard={
              <>
                <SpeechBubble className="left-0 top-[55%] -translate-x-[75%] -rotate-6">行程单</SpeechBubble>
                <SpeechBubble className="right-0 top-[38%] translate-x-[75%] rotate-3">机票已出票</SpeechBubble>
                <SpeechBubble className="left-0 top-[22%] -translate-x-[75%] -rotate-2">签证材料</SpeechBubble>
              </>
            }
          />
        </div>
      </section>

      {/* 右侧：现有登录界面 */}
      <section className="relative z-10 order-1 flex w-full flex-1 flex-col items-center justify-center px-container-padding py-5xl md:order-none md:w-1/2 md:min-h-screen md:py-8xl">
        <div className="w-full max-w-[440px]">
          <div className="mb-8xl flex flex-col items-center">
            <div className="mb-lg flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle bg-white shadow-sm">
                <img alt="Timia 图标" src="/icons/icon-48.png" className="h-6.5 w-6.5 object-contain" />
              </div>
              <span className="font-headline text-subhead tracking-tight text-on-surface">Timia</span>
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

              {sessionNotice && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-md py-sm text-small text-amber-900">
                  {sessionNotice}
                </div>
              )}

              {error && <div className="text-small text-error">{error}</div>}

              <button
                type="submit"
                className="w-full rounded-xl bg-primary py-md font-section-heading text-body text-on-primary shadow-sm transition-all hover:-translate-y-px hover:bg-primary-hover active:scale-95 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? "登录中…" : "登录"}
              </button>

              <p className="text-center text-small text-text-secondary">
                还没有账号？{" "}
                <Link
                  className="font-semibold text-primary underline-offset-4 hover:underline decoration-2"
                  href="/register"
                >
                  注册
                </Link>
              </p>
            </form>
          </div>
        </div>
      </section>

      <footer className="fixed bottom-lg z-20 flex w-full flex-wrap items-center justify-center gap-x-lg gap-y-sm px-container-padding text-overline text-outline-variant">
        <span>© 2026 Timia</span>
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
