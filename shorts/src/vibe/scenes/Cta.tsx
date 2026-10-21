import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { bob, pop, progress } from "../anim";
import { BODY, C, DISPLAY, EMOJI } from "../theme";
import { FloatEmoji } from "../ui";

const TEXT = "ну пожалуйста 🙏 почини прод";

// «Подпишись, пока я чиню прод промптом: ну пожалуйста.»
export const Cta: React.FC<{ readonly handle: string }> = ({ handle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const title = pop(frame, fps, 0.05, { damping: 9 });
  const input = pop(frame, fps, 0.8);
  const chars = [...TEXT];
  const typed = Math.round(progress(frame, fps, 1.9, 3.2) * chars.length);
  const pill = pop(frame, fps, 3.3, { damping: 8 });

  return (
    <AbsoluteFill>
      {Array.from({ length: 9 }, (_, i) => {
        const t = ((frame / fps + i * 0.45) % 3) / 3;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 80 + ((i * 113) % 900),
              top: 1200 - t * 1000,
              fontFamily: EMOJI,
              fontSize: 50 + (i % 3) * 20,
              opacity: Math.sin(t * Math.PI),
              rotate: `${bob(frame, fps, 1, i) * 20}deg`,
            }}
          >
            ❤️
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          top: 300,
          width: "100%",
          textAlign: "center",
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontSize: 116,
          color: C.lime,
          scale: String(title),
          textShadow: `0 0 80px ${C.lime}88`,
        }}
      >
        ПОДПИШИСЬ
      </div>
      <FloatEmoji emoji="🔔" x={840} y={190} size={120} delay={0.2} rotate={bob(frame, fps, 6) * 20} />

      <div
        style={{
          position: "absolute",
          top: 560,
          left: 70,
          right: 70,
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "26px 26px 26px 40px",
          borderRadius: 40,
          background: "rgba(20,18,30,0.9)",
          border: `3px solid ${C.violet}`,
          boxShadow: `0 0 60px ${C.violet}66`,
          scale: String(input),
        }}
      >
        <div style={{ flex: 1, fontFamily: BODY, fontWeight: 700, fontSize: 42, color: typed ? C.white : C.dim }}>
          {typed ? chars.slice(0, typed).join("") : "Спросите что-нибудь…"}
          <span style={{ opacity: Math.floor(frame / 8) % 2 ? 1 : 0 }}>|</span>
        </div>
        <div style={{ width: 84, height: 84, borderRadius: 42, background: C.violet, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontSize: 44, color: C.white }}>↑</div>
      </div>

      <div style={{ position: "absolute", top: 760, width: "100%", textAlign: "center", fontFamily: BODY, fontWeight: 700, fontSize: 40, color: C.dim, opacity: input }}>
        пока я чиню прод промптом
      </div>

      <div
        style={{
          position: "absolute",
          top: 900,
          left: "50%",
          translate: "-50% 0px",
          padding: "26px 60px",
          borderRadius: 999,
          background: `linear-gradient(90deg, ${C.pink}, ${C.violet})`,
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontSize: 60,
          color: C.white,
          scale: String(pill * (1 + 0.04 * bob(frame, fps, 3))),
          boxShadow: `0 0 80px ${C.pink}88`,
          whiteSpace: "nowrap",
        }}
      >
        {handle}
      </div>
    </AbsoluteFill>
  );
};
