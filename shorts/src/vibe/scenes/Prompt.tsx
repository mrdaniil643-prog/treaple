import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { pop, progress } from "../anim";
import { BODY, C, DISPLAY, EMOJI, MONO } from "../theme";
import { cue, cueEnd } from "../timing";
import { FloatEmoji, Window } from "../ui";
import { VoiceBars } from "../VoiceBars";

const ASK = "Сделай Амазон.";
const NICE = " Красиво ✨";
const FILES = ["index.ts", "amazon_clone_final_v3.ts", "AbstractFactoryFactory.ts", "utils2.ts", "package-lock.json · 9 МБ"];

// «Пишу нейросети: сделай Амазон. Красиво.» — «Конечно! Вот 4 000 строк кода.»
export const Prompt: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const typed = Math.round(progress(frame, fps, cue("prompt", 1), cueEnd("prompt", 1)) * ASK.length);
  const nice = frame >= cue("prompt", 2) * fps;
  const thinking = frame > cueEnd("prompt", 2) * fps && frame < cue("prompt", 3) * fps;
  const answer = pop(frame, fps, cue("prompt", 3), { damping: 13 });
  const win = pop(frame, fps, 0, { damping: 15 });

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: 150,
          left: 200 - frame * 7,
          whiteSpace: "nowrap",
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: 200,
          color: "transparent",
          WebkitTextStroke: `3px ${C.line}`,
        }}
      >
        промпт-инженер промпт-инженер
      </div>

      <Window title="vibe.chat" accent={C.violet} style={{ top: 260, left: 60, right: 60, height: 960, scale: String(0.85 + 0.15 * win), opacity: win }}>
        <div style={{ padding: 36, display: "flex", flexDirection: "column", gap: 30 }}>
          <div
            style={{
              alignSelf: "flex-end",
              maxWidth: 760,
              padding: "26px 36px",
              borderRadius: "40px 40px 10px 40px",
              background: `linear-gradient(135deg, ${C.sunset}, ${C.siren})`,
              fontFamily: BODY,
              fontWeight: 800,
              fontSize: 52,
              color: C.paper,
              opacity: frame > (cue("prompt", 1) - 0.1) * fps ? 1 : 0,
            }}
          >
            {ASK.slice(0, typed)}
            {nice ? NICE : ""}
            <span style={{ opacity: Math.floor(frame / 8) % 2 ? 1 : 0 }}>|</span>
          </div>

          {thinking ? (
            <div style={{ alignSelf: "flex-start", display: "flex", gap: 14, padding: "28px 34px", borderRadius: 40, background: "rgba(62,240,176,0.15)" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: 22, height: 22, borderRadius: 11, background: C.mint, translate: `0px ${Math.sin(frame / 3 + i) * 8}px` }} />
              ))}
            </div>
          ) : null}

          <div style={{ alignSelf: "flex-start", display: "flex", gap: 20, scale: String(answer), transformOrigin: "left top" }}>
            <div style={{ width: 96, height: 96, flexShrink: 0, borderRadius: 48, background: C.mint, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: EMOJI, fontSize: 56 }}>🤖</div>
            <div style={{ maxWidth: 740, padding: "26px 34px", borderRadius: "10px 40px 40px 40px", background: "rgba(62,240,176,0.14)", border: `3px solid ${C.mint}` }}>
              <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 46, color: C.paper }}>Конечно! Вот 4 000 строк кода:</div>
              <div style={{ margin: "14px 0", height: 70, display: "flex", justifyContent: "flex-start" }}>
                <VoiceBars speaker="ai" color={C.mint} bars={22} height={70} barWidth={10} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {FILES.map((f, i) => (
                  <div
                    key={f}
                    style={{
                      padding: "8px 18px",
                      borderRadius: 14,
                      background: C.night,
                      border: `2px solid ${C.mint}88`,
                      fontFamily: MONO,
                      fontSize: 26,
                      color: C.mint,
                      scale: String(pop(frame, fps, cue("prompt", 3) + 0.35 + i * 0.14)),
                    }}
                  >
                    {f}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Window>
      <FloatEmoji emoji="🧠" x={850} y={1110} size={120} delay={cue("prompt", 0)} rotate={10} />
    </AbsoluteFill>
  );
};
