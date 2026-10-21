import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { bob, pop } from "../anim";
import { BODY, C, DISPLAY } from "../theme";
import { FloatEmoji } from "../ui";

const MARKS = [
  { x: 90, y: 260, s: 120, c: C.cyan }, { x: 860, y: 300, s: 150, c: C.pink },
  { x: 60, y: 760, s: 100, c: C.violet }, { x: 900, y: 720, s: 110, c: C.cyan },
  { x: 220, y: 1040, s: 90, c: C.pink }, { x: 760, y: 1060, s: 130, c: C.lime },
  { x: 480, y: 220, s: 80, c: C.orange },
];

// «Всё заработало. Почему — не знает никто. Даже нейросеть.»
export const Works: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = interpolate(frame, [0.1 * fps, 0.7 * fps], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const check = pop(frame, fps, 0.1, { damping: 9 });
  const why = pop(frame, fps, 1.1);
  const bot = pop(frame, fps, 2.8);

  return (
    <AbsoluteFill>
      {MARKS.map((m, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: m.x,
            top: m.y + bob(frame, fps, 0.8, i) * 30,
            fontFamily: DISPLAY,
            fontWeight: 900,
            fontSize: m.s,
            color: m.c,
            rotate: `${bob(frame, fps, 0.5, i) * 25}deg`,
            scale: String(pop(frame, fps, 1.1 + i * 0.08)),
            textShadow: `0 0 40px ${m.c}`,
          }}
        >
          ?
        </div>
      ))}

      <svg width="420" height="420" viewBox="0 0 120 120" style={{ position: "absolute", left: 330, top: 330, scale: String(check) }}>
        <circle cx="60" cy="60" r="54" fill={`${C.lime}22`} stroke={C.lime} strokeWidth="6" />
        <path d="M34 62 L52 80 L88 42" fill="none" stroke={C.lime} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="100" strokeDashoffset={100 * draw} />
      </svg>

      <div style={{ position: "absolute", top: 790, width: "100%", textAlign: "center", fontFamily: DISPLAY, fontWeight: 900, fontSize: 92, color: C.white }}>
        ВСЁ <span style={{ color: C.lime }}>РАБОТАЕТ</span>
      </div>

      <div style={{ position: "absolute", top: 930, width: "100%", display: "flex", justifyContent: "center", gap: 20, scale: String(why) }}>
        {["тесты: 0/0 ✓", "почему: ¯\\_(ツ)_/¯"].map((t) => (
          <div key={t} style={{ padding: "14px 26px", borderRadius: 999, background: C.glass, border: `2px solid ${C.glassBorder}`, fontFamily: BODY, fontWeight: 700, fontSize: 34, color: C.white }}>
            {t}
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          top: 1060,
          left: 300,
          padding: "18px 30px",
          borderRadius: "30px 30px 30px 6px",
          background: C.white,
          color: C.bg,
          fontFamily: BODY,
          fontWeight: 800,
          fontSize: 36,
          scale: String(bot),
          transformOrigin: "left bottom",
        }}
      >
        я тоже не знаю 🤷
      </div>
      <FloatEmoji emoji="🤖" x={150} y={1050} size={120} delay={2.7} rotate={-8} />
    </AbsoluteFill>
  );
};
