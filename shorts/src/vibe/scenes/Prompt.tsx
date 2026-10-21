import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { pop, progress } from "../anim";
import { BODY, C, DISPLAY, MONO } from "../theme";
import { FloatEmoji, StepChip, Window } from "../ui";

const PROMPT = "сделай мне стартап. красиво ✨";
const FILES = ["index.ts", "utils_final_v3.ts", "AbstractFactoryFactory.ts", "package-lock.json (9 МБ)"];

// «Шаг первый. Пишешь нейросети: сделай мне стартап. Красиво.»
export const Prompt: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const typed = Math.round(progress(frame, fps, 0.9, 3.4) * PROMPT.length);
  const thinking = frame > 3.5 * fps && frame < 3.9 * fps;
  const answer = pop(frame, fps, 3.9);
  const win = pop(frame, fps, 0.2, { damping: 15 });

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: 330,
          left: -frame * 9,
          whiteSpace: "nowrap",
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontSize: 230,
          color: "transparent",
          WebkitTextStroke: "3px rgba(255,255,255,0.09)",
        }}
      >
        PROMPT ENGINEERING · PROMPT ENGINEERING
      </div>
      <StepChip label="ШАГ 1" color={C.lime} />

      <Window
        title="vibe.chat — новый диалог"
        style={{ top: 320, left: 70, right: 70, height: 860, scale: String(0.85 + 0.15 * win), opacity: win }}
      >
        <div style={{ padding: 36, display: "flex", flexDirection: "column", gap: 30 }}>
          <div
            style={{
              alignSelf: "flex-end",
              maxWidth: 700,
              padding: "26px 34px",
              borderRadius: "36px 36px 8px 36px",
              background: `linear-gradient(135deg, ${C.violet}, ${C.pink})`,
              fontFamily: BODY,
              fontWeight: 700,
              fontSize: 44,
              color: C.white,
              opacity: frame > 0.8 * fps ? 1 : 0,
            }}
          >
            {PROMPT.slice(0, typed)}
            <span style={{ opacity: Math.floor(frame / 8) % 2 ? 1 : 0 }}>|</span>
          </div>

          {thinking ? (
            <div style={{ display: "flex", gap: 14, padding: "26px 34px", borderRadius: 36, background: C.glass, alignSelf: "flex-start" }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    background: C.white,
                    translate: `0px ${Math.sin(frame / 3 + i) * 8}px`,
                  }}
                />
              ))}
            </div>
          ) : null}

          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: 780,
              padding: "26px 34px",
              borderRadius: "36px 36px 36px 8px",
              background: "rgba(255,255,255,0.1)",
              fontFamily: BODY,
              fontWeight: 700,
              fontSize: 42,
              color: C.white,
              scale: String(answer),
              transformOrigin: "left top",
            }}
          >
            Конечно! 🫡 Вот 4 000 строк кода:
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
              {FILES.map((f, i) => (
                <div
                  key={f}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 14,
                    background: "rgba(0,0,0,0.4)",
                    border: `2px solid ${C.cyan}66`,
                    fontFamily: MONO,
                    fontSize: 26,
                    color: C.cyan,
                    scale: String(pop(frame, fps, 4.1 + i * 0.12)),
                  }}
                >
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Window>
      <FloatEmoji emoji="🧠" x={860} y={1080} size={110} delay={1.0} rotate={10} />
    </AbsoluteFill>
  );
};
