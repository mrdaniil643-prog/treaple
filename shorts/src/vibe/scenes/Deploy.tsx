import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { bob, pop, progress } from "../anim";
import { C, DISPLAY, EMOJI, MONO } from "../theme";
import { Cursor, StepChip } from "../ui";

const CLICK = 2.75;

// «Шаг третий. Деплой в пятницу вечером. Принять всё.»
export const Deploy: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cal = pop(frame, fps, 0.8, { damping: 10 });
  const seconds = 52 + Math.min(7, Math.floor(frame / (0.3 * fps)));
  const btn = pop(frame, fps, 1.6);
  const clicked = frame >= CLICK * fps;
  const launch = progress(frame, fps, CLICK + 0.1, CLICK + 0.9);
  const glow = 0.5 + 0.5 * bob(frame, fps, 4);
  const cx = interpolate(frame, [1.9 * fps, 2.6 * fps], [980, 640], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cy = interpolate(frame, [1.9 * fps, 2.6 * fps], [1250, 960], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <StepChip label="ШАГ 3" color={C.pink} />

      <div
        style={{
          position: "absolute",
          top: 330,
          left: 90,
          width: 430,
          borderRadius: 36,
          overflow: "hidden",
          background: C.white,
          rotate: `${-6 * cal}deg`,
          scale: String(cal),
          boxShadow: "0 40px 80px rgba(0,0,0,0.5)",
          textAlign: "center",
        }}
      >
        <div style={{ background: C.red, color: C.white, fontFamily: DISPLAY, fontWeight: 900, fontSize: 46, padding: "16px 0" }}>ПЯТНИЦА</div>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 96, color: C.bg, padding: "20px 0 4px" }}>18:59</div>
        <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 34, color: C.red, paddingBottom: 22 }}>:{seconds}</div>
      </div>

      <div style={{ position: "absolute", top: 380, left: 600, width: 400, fontFamily: DISPLAY, fontWeight: 900, fontSize: 52, color: C.white, lineHeight: 1.2, opacity: cal }}>
        ДЕПЛОЙ<br />
        <span style={{ color: C.pink }}>В ПРОД</span>
        <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 28, color: C.dim, marginTop: 12 }}>тесты: пропущены<br />ревью: «вайб ок»</div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 860,
          left: 140,
          right: 140,
          padding: "40px 0",
          borderRadius: 999,
          textAlign: "center",
          background: clicked ? C.white : C.lime,
          color: C.bg,
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontSize: 64,
          scale: String(btn * (clicked ? 0.94 + 0.06 * pop(frame, fps, CLICK) : 1)),
          boxShadow: `0 0 ${60 + 60 * glow}px ${C.lime}`,
        }}
      >
        ПРИНЯТЬ ВСЁ ✓
      </div>

      <div
        style={{
          position: "absolute",
          left: 470,
          top: 1050 - launch * 1300,
          fontFamily: EMOJI,
          fontSize: 140,
          rotate: "-45deg",
          opacity: clicked ? 1 : 0,
          filter: `drop-shadow(0 ${40 * launch}px 30px ${C.orange})`,
        }}
      >
        🚀
      </div>
      <Cursor x={cx} y={cy} clickAt={CLICK} />
    </AbsoluteFill>
  );
};
