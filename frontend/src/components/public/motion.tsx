import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useInView, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

export function useLiteMotion() {
  const reduced = useReducedMotion();
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return { reduced: Boolean(reduced), lite: Boolean(reduced) || narrow };
}

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { lite } = useLiteMotion();
  if (lite) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8% 0px' }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function CountUp({
  to,
  suffix = '',
  prefix = '',
  decimals = 0,
}: {
  to: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? to : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setValue(to);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 1100);
      const eased = 1 - (1 - progress) ** 3;
      setValue(to * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduced, to]);

  return (
    <span ref={ref}>
      {prefix}
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export function DrawPath({ d, className }: { d: string; className?: string }) {
  const ref = useRef<SVGPathElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduced = useReducedMotion();

  return (
    <motion.path
      ref={ref}
      d={d}
      className={className}
      fill="none"
      strokeWidth="1.6"
      strokeLinecap="round"
      initial={{ pathLength: reduced ? 1 : 0, opacity: reduced ? 1 : 0.4 }}
      animate={inView ? { pathLength: 1, opacity: 1 } : undefined}
      transition={{ duration: reduced ? 0 : 1.4, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

/** Desktop follow-cursor. Off on touch, narrow screens, and reduced motion. */
export function PublicCursor() {
  const reduced = useReducedMotion();
  const x = useMotionValue(-40);
  const y = useMotionValue(-40);
  const springX = useSpring(x, { stiffness: 280, damping: 28, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 280, damping: 28, mass: 0.4 });
  const [active, setActive] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)');
    if (reduced || !fine.matches) return;
    setActive(true);
    document.documentElement.classList.add('pub-cursor');
    const move = (event: MouseEvent) => {
      x.set(event.clientX);
      y.set(event.clientY);
    };
    window.addEventListener('mousemove', move, { passive: true });
    return () => {
      window.removeEventListener('mousemove', move);
      document.documentElement.classList.remove('pub-cursor');
    };
  }, [reduced, x, y]);

  if (!active) return null;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[90]"
      style={{ x: springX, y: springY }}
    >
      <div className="h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#c8f542]/80" />
    </motion.div>
  );
}
