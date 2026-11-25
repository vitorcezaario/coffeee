import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

interface LoadingScreenProps {
  onComplete: () => void;
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [frame, setFrame] = useState<0 | 1>(0);
  const [dots, setDots] = useState(1);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      const quickTimer = window.setTimeout(onComplete, 350);
      return () => window.clearTimeout(quickTimer);
    }

    // Choppy stop-motion boil effect (~4fps like Flipnote / MS Paint)
    const frameInterval = window.setInterval(() => {
      setFrame((prev) => (prev === 0 ? 1 : 0));
    }, 240);

    const dotInterval = window.setInterval(() => {
      setDots((prev) => (prev % 3) + 1);
    }, 360);

    const finishTimer = window.setTimeout(onComplete, 1950);

    return () => {
      window.clearInterval(frameInterval);
      window.clearInterval(dotInterval);
      window.clearTimeout(finishTimer);
    };
  }, [onComplete]);

  return (
    <motion.div
      role="status"
      aria-label="Carregando coffee"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      className="fixed inset-0 z-50 bg-[#F7F7F5] text-[#111111] flex flex-col items-center justify-center px-6 select-none"
    >
      <div className="flex flex-col items-center">
        {/* Raw amateur MS Paint / shaky pen 2-frame boiling doodle of a coffee cup */}
        <svg
          width="148"
          height="148"
          viewBox="0 0 140 140"
          fill="none"
          aria-hidden="true"
          className="mb-3 overflow-visible"
        >
          {frame === 0 ? (
            <g strokeLinecap="round" strokeLinejoin="round">
              {/* Messy brown crayon scribble slightly going outside the cup */}
              <path
                d="M34 59 L46 53 L39 67 L58 55 L48 73 L69 57 L57 77 L77 60 L66 80 L81 67 L74 83 L43 85 L37 74"
                stroke="#5C3A21"
                strokeWidth="5.5"
                opacity="0.72"
              />

              {/* Crooked shaky cup walls (overshooting corners like a trackpad doodle) */}
              <path
                d="M29 48 L33 67 L35 84 L41 97 L57 99 L76 96 L81 80 L85 57 L84 47"
                stroke="#111111"
                strokeWidth="3.2"
              />

              {/* Wonky top oval that doesn't close properly */}
              <path
                d="M28 50 L36 44 L55 42 L74 44 L86 48 L80 54 L61 56 L40 55 L31 52"
                stroke="#111111"
                strokeWidth="3"
              />

              {/* Clumsy oversized ear handle sticking out awkwardly */}
              <path
                d="M84 56 L99 54 L109 61 L111 73 L104 83 L92 86 L80 83"
                stroke="#111111"
                strokeWidth="3.2"
              />

              {/* Tiny uneven inner hole of handle */}
              <path
                d="M86 64 L96 63 L101 69 L98 76 L86 76"
                stroke="#111111"
                strokeWidth="2.4"
              />

              {/* Crooked table / saucer scratch underneath */}
              <path
                d="M17 104 L42 106 L74 103 L98 105"
                stroke="#111111"
                strokeWidth="2.6"
              />

              {/* Shaky jagged steam scribbles */}
              <path
                d="M44 38 L40 31 L47 24 L42 16"
                stroke="#111111"
                strokeWidth="2.6"
              />
              <path
                d="M59 35 L64 28 L57 20 L63 11"
                stroke="#111111"
                strokeWidth="2.6"
              />
              <path
                d="M73 39 L70 33 L76 27 L72 21"
                stroke="#111111"
                strokeWidth="2.4"
              />

              {/* Handwritten messy "coffee" scribble below */}
              <path
                d="M36 121 L30 121 L29 128 L36 128 M42 121 L47 121 L47 128 L41 128 L42 121 M55 129 L55 117 L61 117 M53 123 L59 123 M67 129 L67 117 L73 117 M65 123 L71 123 M78 124 L85 124 L85 121 L78 121 L78 128 L85 128 M91 124 L98 124 L98 121 L91 121 L91 128 L98 128"
                stroke="#111111"
                strokeWidth="2.3"
              />
            </g>
          ) : (
            <g strokeLinecap="round" strokeLinejoin="round">
              {/* Frame 2: slightly shifted shaky vertices for genuine stop-motion wobble */}
              <path
                d="M35 60 L47 52 L41 68 L59 54 L49 74 L70 56 L58 78 L78 61 L67 81 L80 68 L73 84 L42 84 L38 73"
                stroke="#5C3A21"
                strokeWidth="5.5"
                opacity="0.72"
              />

              <path
                d="M30 49 L32 68 L36 85 L42 96 L58 98 L75 97 L82 81 L84 56 L85 48"
                stroke="#111111"
                strokeWidth="3.2"
              />

              <path
                d="M29 51 L37 43 L56 43 L75 43 L85 49 L79 55 L60 55 L39 56 L30 51"
                stroke="#111111"
                strokeWidth="3"
              />

              <path
                d="M84 55 L100 55 L110 62 L110 74 L103 84 L91 85 L81 84"
                stroke="#111111"
                strokeWidth="3.2"
              />

              <path
                d="M86 63 L97 64 L100 70 L97 77 L85 75"
                stroke="#111111"
                strokeWidth="2.4"
              />

              <path
                d="M18 103 L43 107 L73 104 L97 104"
                stroke="#111111"
                strokeWidth="2.6"
              />

              <path
                d="M43 36 L46 29 L40 22 L45 14"
                stroke="#111111"
                strokeWidth="2.6"
              />
              <path
                d="M60 34 L57 26 L63 18 L59 9"
                stroke="#111111"
                strokeWidth="2.6"
              />
              <path
                d="M72 37 L76 31 L71 25 L75 19"
                stroke="#111111"
                strokeWidth="2.4"
              />

              <path
                d="M36 120 L31 121 L30 128 L37 127 M42 122 L48 121 L47 129 L41 128 L42 122 M56 128 L55 116 L62 117 M53 122 L60 123 M68 128 L67 116 L74 117 M65 122 L72 123 M78 125 L85 123 L85 120 L78 121 L79 128 L86 128 M91 125 L98 123 L98 120 L91 121 L92 128 L99 128"
                stroke="#111111"
                strokeWidth="2.3"
              />
            </g>
          )}
        </svg>

        <p className="font-mono text-xs text-[#666662] tabular-nums">
          carregando{'.'.repeat(dots)}
        </p>
      </div>
    </motion.div>
  );
}
