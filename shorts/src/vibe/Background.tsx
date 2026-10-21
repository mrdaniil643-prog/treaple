import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { bob } from "./anim";
import { C } from "./theme";

const BEAT = 0.5455;

// Ночное небо с закатным солнцем, которое дышит в такт биту.
export const Background: React.FC<{ readonly alarm: boolean }> = ({ alarm }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const pulse = Math.exp(-((t % BEAT) / BEAT) * 5);
  const sun = alarm ? C.siren : C.sunset;

  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${C.night} 0%, ${C.night} 35%, ${C.plum} 100%)`, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: 540 - 650,
          top: 1180 - 650 + bob(frame, fps, 0.15) * 40,
          width: 1300,
          height: 1300,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${alarm ? C.siren : C.butter}cc 0%, ${sun}88 28%, ${sun}00 68%)`,
          scale: String(1 + 0.04 * pulse),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -300 + bob(frame, fps, 0.1, 1) * 120,
          top: -250,
          width: 1000,
          height: 1000,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.violet}77 0%, ${C.violet}00 65%)`,
        }}
      />
      {Array.from({ length: 40 }, (_, i) => {
        const x = (i * 263) % 1080;
        const y = (i * 151) % 1100;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: i % 5 === 0 ? 5 : 3,
              height: i % 5 === 0 ? 5 : 3,
              borderRadius: 3,
              background: C.paper,
              opacity: 0.25 + 0.35 * (0.5 + 0.5 * bob(frame, fps, 0.6, i)),
            }}
          />
        );
      })}
      <AbsoluteFill style={{ opacity: 0.1, mixBlendMode: "overlay" }}>
        <svg width="1080" height="1920">
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={3} />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(8,3,24,0.7) 100%)" }} />
    </AbsoluteFill>
  );
};
