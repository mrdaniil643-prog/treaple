import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { pop, progress } from "../anim";
import { C, DISPLAY, EMOJI } from "../theme";
import { FloatEmoji, Toast } from "../ui";

// «Я стал сеньором за один вечер. Рассказываю как.»
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const senior = pop(frame, fps, 0.5, { damping: 8, stiffness: 200 });
  const evening = pop(frame, fps, 1.2, { damping: 10 });
  const toast = pop(frame, fps, 0.1);
  const lvl = progress(frame, fps, 0.4, 1.8);
  const how = pop(frame, fps, 2.1);

  return (
    <AbsoluteFill>
      <Toast
        icon="🎉"
        title="LinkedIn · сейчас"
        text="Новая должность: Senior Vibe Engineer"
        color={C.cyan}
        style={{ top: 190, left: 70, right: 70, translate: `0px ${(1 - toast) * -300}px` }}
      />

      <div style={{ position: "absolute", top: 440, left: 70, right: 70, fontFamily: DISPLAY, fontWeight: 900 }}>
        <div style={{ fontSize: 110, color: C.white, lineHeight: 1 }}>Я СТАЛ</div>
        <div
          style={{
            fontSize: 118,
            color: C.lime,
            lineHeight: 1.1,
            scale: String(senior),
            transformOrigin: "left center",
            textShadow: `0 0 60px ${C.lime}88`,
          }}
        >
          СЕНЬОРОМ
        </div>
        <div
          style={{
            display: "inline-block",
            marginTop: 16,
            padding: "10px 30px",
            background: C.pink,
            color: C.white,
            fontSize: 76,
            borderRadius: 20,
            rotate: `${-4 * evening}deg`,
            scale: String(evening),
            boxShadow: `0 0 60px ${C.pink}88`,
          }}
        >
          ЗА 1 ВЕЧЕР
        </div>
      </div>

      <div style={{ position: "absolute", top: 1010, left: 70, right: 70 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: DISPLAY, fontWeight: 800, fontSize: 30, color: C.dim }}>
          <span>JUNIOR</span>
          <span style={{ color: lvl >= 1 ? C.lime : C.dim }}>SENIOR {lvl >= 1 ? "✓" : ""}</span>
        </div>
        <div style={{ marginTop: 14, height: 34, borderRadius: 17, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
          <div
            style={{
              width: `${lvl * 100}%`,
              height: "100%",
              borderRadius: 17,
              background: `linear-gradient(90deg, ${C.cyan}, ${C.lime})`,
              boxShadow: `0 0 30px ${C.lime}`,
            }}
          />
        </div>
      </div>

      <FloatEmoji emoji="😎" x={780} y={430} size={170} delay={0.6} rotate={12} />
      <FloatEmoji emoji="🚀" x={820} y={760} size={120} delay={0.9} rotate={-20} phase={2} />
      <FloatEmoji emoji="☕" x={640} y={830} size={90} delay={1.3} phase={4} />
      <FloatEmoji emoji="✨" x={60} y={370} size={70} delay={0.7} phase={1} />

      <div
        style={{
          position: "absolute",
          top: 1110,
          width: "100%",
          textAlign: "center",
          fontFamily: EMOJI,
          fontSize: 80,
          opacity: how,
          translate: `0px ${Math.abs(Math.sin((frame / fps) * 6)) * 20}px`,
        }}
      >
        👇
      </div>
    </AbsoluteFill>
  );
};
