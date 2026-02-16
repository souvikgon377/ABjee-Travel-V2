'use client';
import { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';


export default function TextGenerateEffect({
  words,
  className = '',
}: {
  words: string;
  className?: string;
}) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));
  const displayText = useTransform(rounded, (latest) => words.slice(0, latest));

  useEffect(() => {
    let stopped = false;
    function loopAnimation() {
      if (stopped) return;
      animate(count, words.length, {
        type: 'tween',
        duration: 8,
        ease: 'easeInOut',
        onComplete: () => {
          if (!stopped) {
            count.set(0);
            loopAnimation();
          }
        },
      });
    }
    loopAnimation();
    return () => { stopped = true; };
  }, [words]);

  return <motion.span className={className}>{displayText}</motion.span>;
}