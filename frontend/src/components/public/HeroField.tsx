import { useRef, type MouseEvent, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { useLiteMotion } from './motion';

/** Layered radar. Pointer parallax on desktop; a still graphic on mobile and reduced motion. */
export function HeroField() {
  const { lite } = useLiteMotion();
  const root = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 50, damping: 18 });
  const sy = useSpring(py, { stiffness: 50, damping: 18 });

  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    if (lite || !root.current) return;
    const box = root.current.getBoundingClientRect();
    px.set((event.clientX - box.left) / box.width - 0.5);
    py.set((event.clientY - box.top) / box.height - 0.5);
  };

  return (
    <div
      ref={root}
      onMouseMove={onMove}
      className="relative h-[420px] w-full md:h-[520px]"
      aria-hidden
    >
      <Layer lite={lite} x={sx} y={sy} depth={18} className="absolute inset-0">
        <div className="absolute inset-[8%] rounded-full border border-white/10" />
        <div className="absolute inset-[22%] rounded-full border border-[#3ee0ff]/25" />
        <div className="absolute inset-[38%] rounded-full border border-[#c8f542]/30" />
        <div className="absolute left-1/2 top-[8%] h-[84%] w-px -translate-x-1/2 bg-white/10" />
        <div className="absolute left-[8%] top-1/2 h-px w-[84%] -translate-y-1/2 bg-white/10" />
      </Layer>
      <Layer lite={lite} x={sx} y={sy} depth={36} className="absolute inset-0">
        <svg viewBox="0 0 400 400" className="h-full w-full">
          <path
            d="M40 250 C 90 180, 140 210, 180 150 S 280 80, 360 120"
            fill="none"
            stroke="#3ee0ff"
            strokeWidth="1.4"
            opacity="0.75"
          />
          <path
            d="M60 300 C 130 260, 170 280, 220 220 S 300 180, 350 210"
            fill="none"
            stroke="#c8f542"
            strokeWidth="1.4"
            opacity="0.9"
          />
          <path
            d="M80 90 L 150 140 L 210 110 L 260 170 L 330 150"
            fill="none"
            stroke="#8b7cff"
            strokeWidth="1.2"
            opacity="0.75"
          />
          {[
            [180, 150],
            [220, 220],
            [260, 170],
            [150, 140],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.2" fill="#e7eef8" />
          ))}
        </svg>
      </Layer>
      <Layer lite={lite} x={sx} y={sy} depth={8} className="absolute inset-[22%] overflow-hidden rounded-full">
        <div className="pub-scan absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-[#c8f542]/25 to-transparent" />
      </Layer>
    </div>
  );
}

function Layer({
  lite,
  x,
  y,
  depth,
  className,
  children,
}: {
  lite: boolean;
  x: MotionValue<number>;
  y: MotionValue<number>;
  depth: number;
  className?: string;
  children: ReactNode;
}) {
  const mx = useTransform(x, (value) => value * depth);
  const my = useTransform(y, (value) => value * depth);
  if (lite) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} style={{ x: mx, y: my }}>
      {children}
    </motion.div>
  );
}
