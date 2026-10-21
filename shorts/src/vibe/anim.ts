import { interpolate, spring, SpringConfig } from "remotion";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Пружина, стартующая через `delay` секунд от начала сцены.
export const pop = (
  frame: number,
  fps: number,
  delay: number,
  config: Partial<SpringConfig> = { damping: 12, stiffness: 180 },
) => spring({ frame: frame - delay * fps, fps, config });

// Линейный прогресс 0→1 между двумя моментами в секундах.
export const progress = (frame: number, fps: number, from: number, to: number) =>
  interpolate(frame, [from * fps, to * fps], [0, 1], CLAMP);

// Плавное покачивание для «парящих» объектов.
export const bob = (frame: number, fps: number, speed = 1, phase = 0) =>
  Math.sin((frame / fps) * Math.PI * speed + phase);

// Тряска экрана: затухает за `length` секунд после `at`.
export const shake = (frame: number, fps: number, at: number, strength = 18, length = 0.35) => {
  const t = frame - at * fps;
  if (t < 0 || t > length * fps) {
    return "0px 0px";
  }
  const k = strength * (1 - t / (length * fps));
  return `${Math.sin(t * 2.7) * k}px ${Math.cos(t * 3.1) * k}px`;
};
