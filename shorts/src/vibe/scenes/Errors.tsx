import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { pop, progress, shake } from "../anim";
import { BODY, C, DISPLAY, MONO } from "../theme";
import { FloatEmoji } from "../ui";

export const ERRORS = [
  { text: "TypeError: undefined is not a function", x: 60, y: 420, r: -4, at: 0.15 },
  { text: "Cannot read properties of null", x: 120, y: 560, r: 3, at: 0.5 },
  { text: "500 Internal Server Error", x: 40, y: 700, r: -2, at: 0.85 },
  { text: "Module not found: 'vibe'", x: 160, y: 840, r: 5, at: 1.2 },
  { text: "CORS policy: просто нет", x: 80, y: 980, r: -5, at: 1.55 },
] as const;

const FIX = ["почини", "почини!!", "ну почини", "ПОЧИНИ", "почини пж 🙏"];

// «Ошибка? Кидаешь её обратно и пишешь: почини. Сорок раз подряд.»
export const Errors: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const iteration = 1 + Math.round(progress(frame, fps, 2.4, 3.9) * 39);
  const counter = pop(frame, fps, 2.4);
  const offset = ERRORS.reduce((acc, e) => (frame >= e.at * fps ? e.at : acc), -1);

  return (
    <AbsoluteFill style={{ translate: offset >= 0 ? shake(frame, fps, offset, 14, 0.25) : "0px 0px" }}>
      <div
        style={{
          position: "absolute",
          top: 210,
          width: "100%",
          textAlign: "center",
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontSize: 130,
          color: C.red,
          textShadow: `${Math.sin(frame) * 8}px 0 ${C.cyan}, ${-Math.sin(frame) * 8}px 0 ${C.pink}`,
        }}
      >
        ОШИБКА?
      </div>

      {ERRORS.map((e) => {
        const p = pop(frame, fps, e.at, { damping: 11, stiffness: 220 });
        return (
          <div
            key={e.text}
            style={{
              position: "absolute",
              left: e.x,
              top: e.y,
              display: "flex",
              alignItems: "center",
              gap: 18,
              padding: "20px 28px",
              borderRadius: 22,
              background: "rgba(60,8,14,0.92)",
              border: `3px solid ${C.red}`,
              boxShadow: `0 20px 50px rgba(0,0,0,0.5), 0 0 40px ${C.red}55`,
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 30,
              color: "#ffd0d0",
              rotate: `${e.r}deg`,
              scale: String(p),
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: C.red, fontSize: 38 }}>✖</span>
            {e.text}
          </div>
        );
      })}

      {FIX.map((f, i) => (
        <div
          key={f}
          style={{
            position: "absolute",
            right: 50 + (i % 2) * 90,
            top: 470 + i * 120,
            padding: "16px 30px",
            borderRadius: "30px 30px 6px 30px",
            background: C.lime,
            color: C.bg,
            fontFamily: BODY,
            fontWeight: 800,
            fontSize: 38,
            rotate: `${(i % 2 ? 4 : -3)}deg`,
            scale: String(pop(frame, fps, 1.9 + i * 0.22)),
            boxShadow: `0 0 40px ${C.lime}66`,
          }}
        >
          {f}
        </div>
      ))}

      <div
        style={{
          position: "absolute",
          top: 1110,
          left: 70,
          right: 70,
          textAlign: "center",
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontSize: 64,
          color: C.white,
          opacity: counter,
          scale: String(0.6 + 0.4 * counter),
        }}
      >
        ИТЕРАЦИЯ <span style={{ color: C.lime }}>#{iteration}</span>
      </div>
      <FloatEmoji emoji="💀" x={850} y={230} size={120} delay={0.3} rotate={15} />
    </AbsoluteFill>
  );
};
