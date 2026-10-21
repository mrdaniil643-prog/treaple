import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { bob, pop, progress } from "../anim";
import { BODY, C, DISPLAY, EMOJI } from "../theme";
import { cue, cueEnd } from "../timing";
import { Cursor } from "../ui";

const TEXT = "ну пожалуйста 🙏 почини прод";

export const subscribeClick = () => cue("cta", 0) + 0.35;

// «Подпишись, пока я чиню прод промптом: ну пожалуйста.»
export const Cta: React.FC<{ readonly handle: string }> = ({ handle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const click = subscribeClick();
  const subscribed = frame >= click * fps;
  const btn = pop(frame, fps, cue("cta", 0) - 0.2, { damping: 10 });
  const input = pop(frame, fps, cue("cta", 1) - 0.2);
  const chars = [...TEXT];
  const typed = Math.round(progress(frame, fps, cue("cta", 1) + 0.3, cueEnd("cta", 2)) * chars.length);
  const pill = pop(frame, fps, cueEnd("cta", 2), { damping: 8 });
  const cx = interpolate(frame, [0, (click - 0.05) * fps], [900, 640], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cy = interpolate(frame, [0, (click - 0.05) * fps], [700, 420], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      {Array.from({ length: 10 }, (_, i) => {
        const t = ((frame / fps + i * 0.41) % 3) / 3;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 60 + ((i * 113) % 920),
              top: 1250 - t * 1100,
              fontFamily: EMOJI,
              fontSize: 50 + (i % 3) * 22,
              opacity: subscribed ? Math.sin(t * Math.PI) : 0,
              rotate: `${bob(frame, fps, 1, i) * 20}deg`,
            }}
          >
            {i % 3 === 0 ? "🔔" : "❤️"}
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          top: 300,
          left: 130,
          right: 130,
          padding: "40px 0",
          borderRadius: 999,
          textAlign: "center",
          background: subscribed ? C.panel : C.siren,
          border: `4px solid ${subscribed ? C.mint : C.siren}`,
          color: subscribed ? C.mint : C.paper,
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: 62,
          scale: String(btn * (subscribed ? 0.95 + 0.05 * pop(frame, fps, click) : 1)),
          boxShadow: `0 0 80px ${subscribed ? C.mint : C.siren}88`,
        }}
      >
        {subscribed ? "Вы подписаны ✓" : "Подписаться"}
      </div>
      <Cursor x={cx} y={cy} clickAt={click} />

      <div
        style={{
          position: "absolute",
          top: 620,
          left: 60,
          right: 60,
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "26px 26px 26px 40px",
          borderRadius: 44,
          background: C.panel,
          border: `3px solid ${C.violet}`,
          boxShadow: `0 0 60px ${C.violet}66`,
          scale: String(input),
        }}
      >
        <div style={{ flex: 1, fontFamily: BODY, fontWeight: 700, fontSize: 44, color: typed ? C.paper : C.muted }}>
          {typed ? chars.slice(0, typed).join("") : "Спросите что-нибудь…"}
          <span style={{ opacity: Math.floor(frame / 8) % 2 ? 1 : 0 }}>|</span>
        </div>
        <div style={{ width: 86, height: 86, borderRadius: 43, background: C.violet, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontSize: 44, color: C.paper }}>↑</div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 900,
          left: "50%",
          translate: "-50% 0px",
          padding: "26px 64px",
          borderRadius: 999,
          background: C.paper,
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: 62,
          color: C.night,
          scale: String(pill * (1 + 0.04 * bob(frame, fps, 3))),
          rotate: "-3deg",
          whiteSpace: "nowrap",
          boxShadow: "0 30px 70px rgba(8,3,24,0.6)",
        }}
      >
        {handle}
      </div>
    </AbsoluteFill>
  );
};
