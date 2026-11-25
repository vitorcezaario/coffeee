import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

interface LoadingScreenProps {
  onComplete: () => void;
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setProgress(100);
      const quickTimer = window.setTimeout(onComplete, 250);
      return () => window.clearTimeout(quickTimer);
    }

    const duration = 1450;
    const start = performance.now();
    let frameId = 0;
    let doneTimer = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const ratio = Math.min(elapsed / duration, 1);
      // Smooth cubic ease-out progress
      const eased = 1 - Math.pow(1 - ratio, 3);
      setProgress(Math.round(eased * 100));

      if (ratio < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        doneTimer = window.setTimeout(onComplete, 280);
      }
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      window.clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <motion.div
      role="status"
      aria-label="Carregando arquivo coffee"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] } }}
      className="fixed inset-0 z-50 bg-[#F7F7F5] text-[#111111] flex flex-col items-center justify-center px-6 select-none"
    >
      <div className="flex flex-col items-center">
        {/* Geometric minimalist animated coffee emblem */}
        <svg
          width="56"
          height="56"
          viewBox="0 0 56 56"
          fill="none"
          aria-hidden="true"
          className="mb-6"
        >
          {/* Outer frame draws in */}
          <motion.rect
            x="4"
            y="4"
            width="48"
            height="48"
            stroke="#111111"
            strokeWidth="2"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          />
          {/* Minimal architectural C / vessel cut */}
          <motion.path
            d="M36 20H18V36H36"
            stroke="#111111"
            strokeWidth="2.5"
            strokeLinecap="square"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.65, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
          />
          {/* Cobalt accent block popping cleanly into center-right */}
          <motion.rect
            x="31"
            y="25"
            width="6"
            height="6"
            fill="#1A3AFF"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35, delay: 0.62, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: '34px 28px' }}
          />
        </svg>

        {/* Masked wordmark reveal */}
        <div className="overflow-hidden">
          <motion.span
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            transition={{ duration: 0.55, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="block font-display text-2xl font-bold tracking-[-0.04em] text-[#111111]"
          >
            coffee
          </motion.span>
        </div>

        {/* Hairline progress bar + mono tabular counter */}
        <div className="mt-8 w-44">
          <div className="h-[1px] w-full bg-[#DCDCD4] overflow-hidden">
            <div
              className="h-full bg-[#111111] origin-left transition-transform duration-75"
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </div>
          <div className="mt-2.5 flex items-center justify-between font-mono text-[11px] text-[#666662] tabular-nums">
            <span>arquivo</span>
            <span>{String(progress).padStart(3, '0')}%</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
