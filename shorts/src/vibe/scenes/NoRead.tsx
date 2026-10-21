import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { pop, progress } from "../anim";
import { C, DISPLAY, MONO } from "../theme";
import { cue } from "../timing";
import { Cursor, FloatEmoji, Window } from "../ui";

const TOKENS = [
  ["const", C.sunset], ["vibe", C.mint], ["=", C.paper], ["await", C.sunset], ["ai", C.butter],
  ["(", C.paper], ["'магия'", C.violet], [")", C.paper], ["if", C.sunset], ["(!works)", C.mint],
  ["return", C.sunset], ["retry()", C.butter], ["//", C.muted], ["TODO:", C.siren], ["понять", C.muted],
] as const;

const codeLine = (n: number) => {
  const len = 3 + ((n * 7) % 5);
  return Array.from({ length: len }, (_, i) => TOKENS[(n * 13 + i * 5) % TOKENS.length]);
};

// «Код я не читаю. Это личное дело нейросети.»
export const NoRead: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scroll = frame * 30;
  const first = Math.floor(scroll / 54);
  const stampAt = cue("noread", 0) + 0.45;
  const stamp = pop(frame, fps, stampAt, { damping: 9, stiffness: 260 });
  const clickAt = cue("noread", 1) + 0.9;
  const lines = Math.round(progress(frame, fps, 0, clickAt) * 4000);
  const cx = interpolate(frame, [(clickAt - 0.7) * fps, (clickAt - 0.1) * fps], [960, 680], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cy = interpolate(frame, [(clickAt - 0.7) * fps, (clickAt - 0.1) * fps], [1260, 1120], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const accepted = frame >= clickAt * fps;

  return (
    <AbsoluteFill>
      <Window title="amazon/src/всё.ts" accent={C.mint} style={{ top: 230, left: 60, right: 60, height: 980 }}>
        <div style={{ position: "relative", height: 790, overflow: "hidden" }}>
          {Array.from({ length: 16 }, (_, i) => {
            const n = first + i;
            return (
              <div key={n} style={{ position: "absolute", top: n * 54 - scroll + 20, left: 0, display: "flex", gap: 14, fontFamily: MONO, fontWeight: 500, fontSize: 31, whiteSpace: "nowrap" }}>
                <span style={{ width: 90, textAlign: "right", color: C.line }}>{n + 1}</span>
                <span style={{ width: (n % 4) * 30 }} />
                {codeLine(n).map(([t, c], j) => (
                  <span key={j} style={{ color: c }}>{t}</span>
                ))}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 30px" }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 32, color: C.mint }}>+{lines.toLocaleString("ru-RU")} строк</div>
          <div
            style={{
              padding: "18px 34px",
              borderRadius: 20,
              background: accepted ? C.mint : C.paper,
              color: C.night,
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: 30,
              scale: accepted ? String(1 + 0.15 * (1 - pop(frame, fps, clickAt))) : "1",
            }}
          >
            {accepted ? "Принято ✓" : "Принять всё"}
          </div>
        </div>
      </Window>

      <div
        style={{
          position: "absolute",
          top: 560,
          left: 150,
          padding: "14px 46px 22px",
          border: `12px solid ${C.siren}`,
          borderRadius: 30,
          color: C.siren,
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: 110,
          rotate: "-11deg",
          scale: String(1 + 2 * (1 - stamp)),
          opacity: stamp,
          background: "rgba(22,10,53,0.85)",
          boxShadow: `0 0 90px ${C.siren}77`,
        }}
      >
        Не читал
      </div>

      <FloatEmoji emoji="🙈" x={810} y={150} size={160} delay={cue("noread", 0)} rotate={8} />
      <Cursor x={cx} y={cy} clickAt={clickAt} />
    </AbsoluteFill>
  );
};
