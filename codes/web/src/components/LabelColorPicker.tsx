"use client";

export const LABEL_COLOR_PALETTE = [
  "#FFFFFF",
  "#F4F4F5",
  "#E7E5E4",
  "#E2E8F0",
  "#FEE2E2",
  "#FFEDD5",
  "#FEF3C7",
  "#FEF9C3",
  "#ECFCCB",
  "#DCFCE7",
  "#D1FAE5",
  "#CCFBF1",
  "#CFFAFE",
  "#E0F2FE",
  "#DBEAFE",
  "#E0E7FF",
  "#EDE9FE",
  "#F3E8FF",
  "#FAE8FF",
  "#FCE7F3",
  "#FFE4E6",
  "#FED7AA",
  "#BFDBFE",
  "#C4B5FD",
] as const;

type Props = {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
};

export function LabelColorPicker({ value, onChange, disabled = false }: Props) {
  const normalizedValue = value.toUpperCase();

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-on-surface-variant">标签颜色</legend>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-bright p-3">
        {LABEL_COLOR_PALETTE.map((color) => {
          const selected = normalizedValue === color;
          return (
            <button
              key={color}
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-lg outline-none transition-transform hover:scale-110 focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`选择颜色 ${color}`}
              aria-pressed={selected}
              title={color === "#FFFFFF" ? "白色（默认）" : color}
              onClick={() => onChange(color)}
              disabled={disabled}
            >
              <span
                className={`h-[18px] w-[18px] rounded-[5px] border shadow-sm ${
                  selected
                    ? "border-primary ring-2 ring-primary/30 ring-offset-1"
                    : "border-border-subtle"
                }`}
                style={{ backgroundColor: color }}
                aria-hidden
              />
            </button>
          );
        })}
        <label className="ml-auto flex items-center gap-2 pl-2 text-caption text-text-secondary">
          自定义
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="h-8 w-10 cursor-pointer rounded-lg border border-border-subtle bg-white p-1 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
          />
        </label>
      </div>
    </fieldset>
  );
}
