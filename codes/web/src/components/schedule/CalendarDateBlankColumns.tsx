"use client";

type Props = {
  dateKeys: string[];
  onDateBlankClick?: (dateKey: string) => void;
};

const columnBorderClass = (col: number, total: number) =>
  [
    "border-r border-border-subtle",
    col === 0 ? "border-l border-border-subtle" : "",
    col === total - 1 ? "border-r-0" : "",
  ].join(" ");

export function CalendarDateBlankColumns({ dateKeys, onDateBlankClick }: Props) {
  if (!onDateBlankClick) {
    return (
      <div className="pointer-events-none absolute inset-0 z-0 grid grid-cols-7" aria-hidden>
        {dateKeys.map((key, col) => (
          <div key={key} className={columnBorderClass(col, dateKeys.length)} />
        ))}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-0 grid grid-cols-7">
      {dateKeys.map((key, col) => (
        <button
          key={key}
          type="button"
          className={[
            columnBorderClass(col, dateKeys.length),
            "cursor-pointer bg-transparent transition-colors hover:bg-primary/5",
          ].join(" ")}
          onClick={() => onDateBlankClick(key)}
          title="点击添加任务"
          aria-label={`在 ${key} 添加任务`}
        />
      ))}
    </div>
  );
}
