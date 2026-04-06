import { useEffect, useState } from 'react';

/**
 * Hook to detect high refresh rate displays and optimize animation timings
 * For 120Hz+ and 144Hz+ displays, provides optimized transition durations
 */
export function useSmoothAnimation() {
  const [refreshRate, setRefreshRate] = useState(60);
  const [isHighRefreshRate, setIsHighRefreshRate] = useState(false);

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    let frameCount = 0;
    const frameTimes: number[] = [];

    const measureRefreshRate = () => {
      const currentTime = performance.now();
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      if (deltaTime > 0) {
        frameTimes.push(1000 / deltaTime);
        frameCount++;

        // After collecting 60 frames, calculate average refresh rate
        if (frameCount >= 60) {
          const averageRefreshRate =
            frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
          setRefreshRate(Math.round(averageRefreshRate));
          setIsHighRefreshRate(averageRefreshRate >= 100);
          return; // Stop measuring
        }
      }

      animationFrameId = requestAnimationFrame(measureRefreshRate);
    };

    animationFrameId = requestAnimationFrame(measureRefreshRate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  // Return optimized duration multiplier
  const getDurationMultiplier = () => {
    if (refreshRate >= 140) return 0.9; // 144Hz - slightly faster
    if (refreshRate >= 100) return 0.95; // 120Hz - slightly faster
    return 1; // 60Hz - standard
  };

  return {
    refreshRate,
    isHighRefreshRate,
    durationMultiplier: getDurationMultiplier(),
    getOptimizedDuration: (baseDuration: number) =>
      baseDuration * getDurationMultiplier(),
  };
}
