import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { bob, pop, progress, shake } from "../anim";
import { BODY, C, DISPLAY, EMOJI, MONO } from "../theme";
import { Toast } from "../ui";

const VIBE_AT = 2.0;

const MESSAGES = [
  { icon: "🔥", title: "#incidents", text: "@channel ВСЁ УПАЛО", at: 0.5 },
  { icon: "💸", title: "CTO", text: "кто деплоил в пятницу?", at: 0.9 },
  { icon: "🤡", title: "Клиент", text: "сайт показывает «undefined»", at: 1.3 },
];

// Точки графика аптайма: ровно, потом обрыв.
const points = (cut: number) =>
  Array.from({ length: 21 }, (_, i) => {
    const x = i * 40;
    const y = i / 20 < cut ? 40 + Math.sin(i * 1.7) * 10 : 200;
    return `${x},${y}`;
  }).join(" ");

// «Итог: продакшен упал, но вайб был отличный.»
export const Crash: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flash = interpolate(frame, [0, 0.15 * fps, 0.5 * fps], [0, 0.55, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cut = interpolate(progress(frame, fps, 0.3, 0.9), [0, 1], [1, 0.55]);
  const vibe = pop(frame, fps, VIBE_AT, { damping: 10 });
  const meter = progress(frame, fps, VIBE_AT + 0.2, VIBE_AT + 1.1);
  const panic = 1 - progress(frame, fps, VIBE_AT - 0.1, VIBE_AT + 0.3);

  return (
    <AbsoluteFill style={{ translate: shake(frame, fps, 0.4, 22, 0.6) }}>
      <AbsoluteFill style={{ background: C.red, opacity: flash }} />

      <div style={{ opacity: panic }}>
        <div
          style={{
            position: "absolute",
            top: 200,
            width: "100%",
            textAlign: "center",
            fontFamily: DISPLAY,
            fontWeight: 900,
            fontSize: 104,
            color: Math.floor(frame / 6) % 2 ? C.red : C.white,
          }}
        >
          PROD DOWN
        </div>
        <div style={{ position: "absolute", top: 350, left: 70, right: 70, padding: 30, borderRadius: 30, background: "rgba(20,18,30,0.9)", border: `2px solid ${C.glassBorder}` }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, color: C.dim }}>uptime · последние 5 минут</div>
          <svg width="860" height="230" viewBox="0 0 800 220">
            <polyline points={points(cut)} fill="none" stroke={cut < 1 ? C.red : C.lime} strokeWidth="8" strokeLinejoin="round" />
          </svg>
        </div>
        {MESSAGES.map((m, i) => (
          <Toast
            key={m.title}
            icon={m.icon}
            title={m.title}
            text={m.text}
            color={C.red}
            style={{ top: 720 + i * 150, left: 70 + (i % 2) * 60, right: 70 - (i % 2) * 40, scale: String(pop(frame, fps, m.at)) }}
          />
        ))}
      </div>

      <div style={{ position: "absolute", top: 260, width: "100%", textAlign: "center", fontFamily: EMOJI, fontSize: 300, scale: String(vibe), rotate: `${bob(frame, fps, 1.2) * 8}deg` }}>
        😎
      </div>
      <div
        style={{
          position: "absolute",
          top: 640,
          left: 60,
          right: 60,
          textAlign: "center",
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontSize: 100,
          lineHeight: 1.1,
          backgroundImage: `linear-gradient(90deg, ${C.lime}, ${C.cyan}, ${C.violet}, ${C.pink}, ${C.lime})`,
          backgroundSize: "200% 100%",
          backgroundPosition: `${frame * 4}px 0px`,
          WebkitBackgroundClip: "text",
          color: "transparent",
          scale: String(vibe),
        }}
      >
        НО ВАЙБ БЫЛ ОТЛИЧНЫЙ
      </div>
      <div style={{ position: "absolute", top: 1010, left: 120, right: 120, opacity: vibe }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: DISPLAY, fontWeight: 800, fontSize: 32, color: C.white }}>
          <span>VIBE</span>
          <span style={{ color: C.lime }}>{Math.round(meter * 100)}%</span>
        </div>
        <div style={{ marginTop: 12, height: 36, borderRadius: 18, background: "rgba(255,255,255,0.12)" }}>
          <div style={{ width: `${meter * 100}%`, height: "100%", borderRadius: 18, background: `linear-gradient(90deg, ${C.pink}, ${C.lime})`, boxShadow: `0 0 40px ${C.lime}` }} />
        </div>
        <div style={{ marginTop: 12, fontFamily: BODY, fontWeight: 700, fontSize: 28, color: C.dim, textAlign: "center" }}>uptime 0% · настроение 100%</div>
      </div>
    </AbsoluteFill>
  );
};
