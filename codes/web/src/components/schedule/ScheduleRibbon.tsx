export function ScheduleRibbon({ label }: { label: string }) {
  return (
    <h2 className="inline-flex max-w-full items-center bg-primary py-1 pl-3 pr-5 font-display text-[13px] font-semibold leading-none tracking-wide text-on-primary [clip-path:polygon(0_0,calc(100%-12px)_0,100%_50%,calc(100%-12px)_100%,0_100%)]">
      <span className="truncate">{label}</span>
    </h2>
  );
}
