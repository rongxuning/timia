/**
 * Nomia 标志：怀表圆环、表冠、左侧内弧刻度、中心螺旋状生长线、右侧叶片与底弧末端（品牌紫 #5D327C）。
 */
const BRAND_STROKE = "#5D327C";
const SW = 2.15;

type Props = {
  className?: string;
  /** 像素或任意 CSS 长度 */
  size?: number | string;
};

/** 圆心 (58,52)、半径 22、左弧 128°–232° 上均匀 7 点 */
const DOTS: [number, number][] = [
  [44.46, 34.66],
  [39.91, 39.49],
  [37, 45.45],
  [36, 52],
  [37, 58.55],
  [39.91, 64.51],
  [44.46, 69.34],
];

export function NomiaLogoMark({ className, size = 24 }: Props) {
  const dim = typeof size === "number" ? `${size}px` : size;
  return (
    <svg
      className={className}
      width={dim}
      height={dim}
      viewBox="0 0 128 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      <g
        stroke={BRAND_STROKE}
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M 52 15 h 12 M 58 15 v 7" />
        <circle cx="58" cy="52" r="26" />
        <path
          d="
            M 58 52
            C 62 46 70 46 74 50
            C 78 56 72 64 66 62
            C 58 60 56 50 62 44
            C 70 36 82 40 86 50
            C 90 60 84 72 76 74
            C 68 76 62 68 66 58
            C 70 48 80 44 88 48
            C 96 52 100 42 102 32
          "
        />
        <path d="M 34 73 Q 48 88 96 84" />
      </g>
      {DOTS.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={1.85} fill={BRAND_STROKE} stroke="none" />
      ))}
      <g fill={BRAND_STROKE} stroke="none">
        <path d="M 76 46 Q 80 40 84 44 Q 81 50 76 46" />
        <path d="M 82 42 Q 88 38 92 44 Q 87 50 82 42" />
        <path d="M 88 38 Q 94 34 98 40 Q 93 46 88 38" />
        <path d="M 94 34 Q 100 30 104 36 Q 99 42 94 34" />
        <path d="M 72 54 Q 76 48 81 52 Q 77 58 72 54" />
        <path d="M 78 50 Q 84 46 88 52 Q 83 58 78 50" />
        <path d="M 84 46 Q 90 42 94 48 Q 89 54 84 46" />
        <path d="M 90 42 Q 96 38 100 44 Q 95 50 90 42" />
      </g>
      <ellipse cx="104" cy="84" rx="4" ry="2.6" fill={BRAND_STROKE} />
    </svg>
  );
}
