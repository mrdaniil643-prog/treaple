import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { pop, progress } from "../anim";
import { C, DISPLAY, MONO } from "../theme";
import { Cursor, FloatEmoji, StepChip, Window } from "../ui";

const TOKENS = [
  ["const", C.pink], ["vibe", C.cyan], ["=", C.white], ["await", C.pink], ["ai", C.lime],
  ["(", C.white], ["'magic'", C.orange], [")", C.white], ["if", C.pink], ["(!works)", C.cyan],
  ["return", C.pink], ["retry()", C.lime], ["//", C.dim], ["TODO:", C.orange], ["понять", C.dim],
] as const;

// Детерминированная «случайная» строка кода по номеру.
const codeLine = (n: number) => {
  const len = 3 + ((n * 7) % 5);
  return Array.from({ length: len }, (_, i) => TOKENS[(n * 13 + i * 5) % TOKENS.length]);
};

// «Шаг второй. Код не читаешь. Это личное дело нейросети.»
export const NoRead: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scroll = frame * 26;
  const first = Math.floor(scroll / 52);
  const stamp = pop(frame, fps, 0.9, { damping: 9, stiffness: 260 });
  const lines = Math.round(progress(frame, fps, 0, 2.6) * 3847);
  const cx = interpolate(frame, [1.6 * fps, 2.4 * fps], [900, 600], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cy = interpolate(frame, [1.6 * fps, 2.4 * fps], [1250, 1080], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const accepted = frame >= 2.5 * fps;

  return (
    <AbsoluteFill>
      <StepChip label="ШАГ 2" color={C.cyan} />
      <Window title="startup/src/everything.ts" style={{ top: 320, left: 70, right: 70, height: 860 }}>
        <div style={{ position: "relative", height: 690, overflow: "hidden", padding: "10px 0" }}>
          {Array.from({ length: 15 }, (_, i) => {
            const n = first + i;
            return (
              <div
                key={n}
                style={{
                  position: "absolute",
                  top: n * 52 - scroll + 20,
                  left: 0,
                  display: "flex",
                  gap: 14,
                  fontFamily: MONO,
                  fontWeight: 500,
                  fontSize: 30,
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ width: 90, textAlign: "right", color: "rgba(255,255,255,0.25)" }}>{n + 1}</span>
                <span style={{ width: (n % 4) * 30 }} />
                {codeLine(n).map(([t, c], j) => (
                  <span key={j} style={{ color: c }}>{t}</span>
                ))}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 30px" }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, color: C.lime }}>+{lines.toLocaleString("ru-RU")} строк</div>
          <div
            style={{
              padding: "18px 34px",
              borderRadius: 18,
              background: accepted ? C.lime : C.white,
              color: C.bg,
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontSize: 30,
              scale: accepted ? String(1 + 0.15 * (1 - pop(frame, fps, 2.5))) : "1",
            }}
          >
            {accepted ? "ПРИНЯТО ✓" : "Accept all"}
          </div>
        </div>
      </Window>

      <div
        style={{
          position: "absolute",
          top: 560,
          left: 140,
          padding: "16px 40px",
          border: `10px solid ${C.red}`,
          borderRadius: 26,
          color: C.red,
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontSize: 100,
          rotate: "-12deg",
          scale: String(1 + 2 * (1 - stamp)),
          opacity: stamp,
          background: "rgba(7,6,12,0.75)",
          boxShadow: `0 0 80px ${C.red}66`,
        }}
      >
        НЕ ЧИТАЛ
      </div>

      <FloatEmoji emoji="🙈" x={800} y={230} size={150} delay={0.3} rotate={8} />
      <FloatEmoji emoji="🤖" x={60} y={1050} size={110} delay={1.7} rotate={-10} phase={2} />
      <Cursor x={cx} y={cy} clickAt={2.5} />
    </AbsoluteFill>
  );
};
