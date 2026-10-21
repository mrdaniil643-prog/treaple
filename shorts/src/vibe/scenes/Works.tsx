import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { bob, pop } from "../anim";
import { BODY, C, DISPLAY, EMOJI } from "../theme";
import { cue } from "../timing";
import { Sparkle } from "../ui";
import { VoiceBars } from "../VoiceBars";

const MARKS = [
  { x: 90, y: 230, s: 130, c: C.butter }, { x: 850, y: 260, s: 160, c: C.sunset },
  { x: 50, y: 720, s: 110, c: C.violet }, { x: 900, y: 700, s: 120, c: C.butter },
  { x: 160, y: 1000, s: 90, c: C.sunset }, { x: 820, y: 1000, s: 130, c: C.violet },
  { x: 470, y: 170, s: 90, c: C.mint },
];

// «Всё заработало. Почему, не знает никто.» — «Я тоже не знаю.»
export const Works: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = cue("works", 0);
  const draw = interpolate(frame, [start * fps, (start + 0.5) * fps], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const check = pop(frame, fps, start - 0.1, { damping: 9 });
  const why = cue("works", 1);
  const bot = pop(frame, fps, cue("works", 2) - 0.1);

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
            fontWeight: 800,
            fontSize: m.s,
            color: m.c,
            rotate: `${bob(frame, fps, 0.5, i) * 25}deg`,
            scale: String(pop(frame, fps, why + i * 0.07)),
            textShadow: `0 0 40px ${m.c}`,
          }}
        >
          ?
        </div>
      ))}

      <svg width="440" height="440" viewBox="0 0 120 120" style={{ position: "absolute", left: 320, top: 300, scale: String(check) }}>
        <circle cx="60" cy="60" r="54" fill={`${C.mint}26`} stroke={C.mint} strokeWidth="6" />
        <path d="M34 62 L52 80 L88 42" fill="none" stroke={C.mint} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="100" strokeDashoffset={100 * draw} />
      </svg>
      <Sparkle x={300} y={330} size={120} color={C.butter} delay={start + 0.3} />
      <Sparkle x={790} y={380} size={90} color={C.paper} delay={start + 0.45} />
      <Sparkle x={760} y={720} size={110} color={C.mint} delay={start + 0.6} />

      <div style={{ position: "absolute", top: 790, width: "100%", textAlign: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 96, color: C.paper }}>
        Работает
      </div>
      <div style={{ position: "absolute", top: 920, width: "100%", textAlign: "center", fontFamily: BODY, fontWeight: 700, fontSize: 38, color: C.muted, opacity: pop(frame, fps, why) }}>
        тесты: 0 из 0 прошли
      </div>

      <div
        style={{
          position: "absolute",
          top: 1030,
          left: 170,
          right: 170,
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "18px 30px",
          borderRadius: 999,
          background: C.panel,
          border: `3px solid ${C.mint}`,
          scale: String(bot),
        }}
      >
        <div style={{ fontFamily: EMOJI, fontSize: 60 }}>🤖</div>
        <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 40, color: C.paper, flex: 1 }}>я тоже не знаю 🤷</div>
        <VoiceBars speaker="ai" color={C.mint} bars={8} height={60} barWidth={9} />
      </div>
    </AbsoluteFill>
  );
};
