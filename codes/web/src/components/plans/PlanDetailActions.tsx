"use client";

type Props = {
  usageKind: string;
  mySubscription?: { id: string } | null;
  onJoin?: () => void;
  onSubscribe?: () => void;
  onCancelSubscribe?: () => void;
};

const PRIMARY_BTN =
  "rounded-xl bg-primary px-4 py-2 text-small text-on-primary disabled:opacity-50";
const SECONDARY_BTN =
  "rounded-xl border border-border-subtle bg-white px-4 py-2 text-small text-text-secondary hover:bg-gray-50";

export function PlanDetailActions({
  usageKind,
  mySubscription,
  onJoin,
  onSubscribe,
  onCancelSubscribe,
}: Props) {
  if (usageKind === "plan_mode") {
    return (
      <button type="button" className={PRIMARY_BTN} onClick={onJoin}>
        导入
      </button>
    );
  }
  if (usageKind === "subscription_mode") {
    if (mySubscription) {
      return (
        <button type="button" className={SECONDARY_BTN} onClick={onCancelSubscribe}>
          取消订阅
        </button>
      );
    }
    return (
      <button type="button" className={PRIMARY_BTN} onClick={onSubscribe}>
        开启订阅
      </button>
    );
  }
  return null;
}
