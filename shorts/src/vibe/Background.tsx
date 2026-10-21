import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { bob } from "./anim";
import { C } from "./theme";

type Props = {
  readonly colors: readonly [string, string, string];
};

// Живой фон: три размытых цветовых пятна, сетка и зерно.
export const Background: React.FC<Props> = ({ colors }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const blob = (color: string, x: number, y: number, size: number, phase: number) => (
    <div
      style={{
        position: "absolute",
        left: x + bob(frame, fps, 0.23, phase) * 120,
        top: y + bob(frame, fps, 0.17, phase + 1) * 160,
        width: size,
        height: size,
        // Радиальный градиент вместо filter: blur — выглядит так же, рендерится в разы быстрее.
        background: `radial-gradient(circle, ${color} 0%, ${color}00 70%)`,
        opacity: 0.6,
      }}
    />
  );

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, overflow: "hidden" }}>
      {blob(colors[0], -450, -100, 1200, 0)}
      {blob(colors[1], 300, 500, 1150, 2)}
      {blob(colors[2], -300, 1100, 1100, 4)}
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "90px 90px",
          backgroundPosition: `0px ${(frame * 1.5) % 90}px`,
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
        }}
      />
      <AbsoluteFill style={{ opacity: 0.12, mixBlendMode: "overlay" }}>
        <svg width="1080" height="1920">
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={3} />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
