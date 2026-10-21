import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { pop, progress, shake } from "../anim";
import { BODY, C, DISPLAY, MONO } from "../theme";
import { cue } from "../timing";

const MESSAGES = [
  "TypeError: undefined is not a function",
  "Cannot read properties of null",
  "500 Internal Server Error",
  "Module not found: 'вайб'",
  "CORS: просто нет",
  "Maximum call stack exceeded",
  "Hydration failed",
  "Segmentation fault",
  "npm ERR! peer deps",
  "ReferenceError: amazon",
];

// Моменты появления окон ошибок: сначала по одному, после «сорок раз» — лавиной.
export const errorTimes = () => {
  const slow = [0, 0.35, 0.7, 1.05].map((d) => cue("errors", 0) + d);
  const fast = MESSAGES.slice(slow.length).map((_, i) => cue("errors", 3) + 0.1 + i * 0.16);
  return [...slow, ...fast];
};

// «Ошибка? Пишу: почини.» — «Исправил!» — «И так сорок раз подряд.»
export const Errors: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const times = errorTimes();
  const last = times.reduce((acc, t) => (frame >= t * fps ? t : acc), -1);
  const fixed = pop(frame, fps, cue("errors", 2), { damping: 9, stiffness: 260 });
  const ask = pop(frame, fps, cue("errors", 1));
  const counter = pop(frame, fps, cue("errors", 3));
  const attempt = 2 + Math.round(progress(frame, fps, cue("errors", 3), cue("errors", 3) + 1.2) * 38);

  return (
    <AbsoluteFill style={{ translate: last >= 0 ? shake(frame, fps, last, 12, 0.22) : "0px 0px" }}>
      {MESSAGES.map((m, i) => {
        const p = pop(frame, fps, times[i], { damping: 12, stiffness: 240 });
        return (
          <div
            key={m}
            style={{
              position: "absolute",
              left: 60 + (i % 5) * 34 + Math.floor(i / 5) * 60,
              top: 210 + i * 66,
              width: 760,
              borderRadius: 22,
              overflow: "hidden",
              background: C.paper,
              boxShadow: "0 24px 50px rgba(8,3,24,0.55)",
              scale: String(p),
              opacity: Math.min(1, p * 2),
            }}
          >
            <div style={{ padding: "12px 22px", background: C.siren, color: C.paper, fontFamily: BODY, fontWeight: 800, fontSize: 28, display: "flex", justifyContent: "space-between" }}>
              <span>Ошибка</span>
              <span>✕</span>
            </div>
            <div style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 27, color: C.night }}>{m}</span>
              <span style={{ padding: "6px 22px", borderRadius: 10, border: `3px solid ${C.night}`, fontFamily: BODY, fontWeight: 800, fontSize: 24, color: C.night }}>OK</span>
            </div>
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          right: 60,
          top: 520,
          padding: "22px 34px",
          borderRadius: "40px 40px 10px 40px",
          background: C.butter,
          color: C.night,
          fontFamily: BODY,
          fontWeight: 800,
          fontSize: 50,
          rotate: "4deg",
          scale: String(ask),
          boxShadow: "0 24px 50px rgba(8,3,24,0.5)",
        }}
      >
        почини
      </div>

      <div
        style={{
          position: "absolute",
          right: 80,
          top: 700,
          padding: "16px 36px 22px",
          border: `10px solid ${C.mint}`,
          borderRadius: 26,
          background: "rgba(22,10,53,0.9)",
          color: C.mint,
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: 76,
          rotate: "-8deg",
          scale: String(1 + 1.5 * (1 - fixed)),
          opacity: fixed,
          boxShadow: `0 0 70px ${C.mint}66`,
        }}
      >
        Исправил ✓
      </div>

      <div
        style={{
          position: "absolute",
          top: 1120,
          width: "100%",
          textAlign: "center",
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: 70,
          color: C.paper,
          opacity: counter,
          scale: String(0.6 + 0.4 * counter),
          textShadow: "0 10px 30px rgba(8,3,24,0.8)",
        }}
      >
        Попытка <span style={{ color: C.butter }}>№{attempt}</span>
      </div>
    </AbsoluteFill>
  );
};
