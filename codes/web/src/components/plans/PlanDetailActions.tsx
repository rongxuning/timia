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
  if (usageKind === "one_shot") {
    return (
      <button type="button" className={PRIMARY_BTN} onClick={onJoin}>
        加入
      </button>
    );
  }
  if (usageKind === "subscription") {
    if (mySubscription) {
      return (
        <button type="button" className={SECONDARY_BTN} onClick={onCancelSubscribe}>
          取消订阅
        </button>
      );
    }
    return (
      <button type="button" className={PRIMARY_BTN} onClick={onSubscribe}>
        订阅
      </button>
    );
  }
  return null;
}
