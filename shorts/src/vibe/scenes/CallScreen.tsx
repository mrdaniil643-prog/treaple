import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { pop } from "../anim";
import { BODY, C, DISPLAY, EMOJI } from "../theme";
import { VoiceBars } from "../VoiceBars";

type Props = {
  // Секунда, когда трубку берут: до неё телефон звонит.
  readonly answerAt: number;
  readonly accent: string;
  readonly note: string;
};

// Экран звонка от заказчика: входящий, потом разговор с живой волной голоса.
export const CallScreen: React.FC<Props> = ({ answerAt, accent, note }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const answered = frame >= answerAt * fps;
  const inCall = pop(frame, fps, answerAt, { damping: 16 });
  const seconds = Math.max(0, Math.floor(frame / fps - answerAt));
  const ring = (frame / fps) % 1.2;

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 140 }}>
      <div style={{ position: "relative", width: 230, height: 230, scale: String(1 - 0.35 * inCall), marginBottom: -60 * inCall }}>
        {!answered
          ? [0, 0.4].map((d) => {
              const k = ((ring + d) % 1.2) / 1.2;
              return (
                <div
                  key={d}
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    border: `6px solid ${accent}`,
                    scale: String(1 + k * 0.9),
                    opacity: 1 - k,
                  }}
                />
              );
            })
          : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `linear-gradient(140deg, ${accent}, ${C.violet})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: EMOJI,
            fontSize: 130,
          }}
        >
          🤑
        </div>
      </div>
      <div style={{ marginTop: 40, fontFamily: DISPLAY, fontWeight: 800, fontSize: 60, color: C.paper }}>Заказчик</div>
      <div style={{ marginTop: 10, fontFamily: BODY, fontWeight: 700, fontSize: 34, color: answered ? C.mint : C.muted }}>
        {answered ? `00:${String(seconds).padStart(2, "0")}` : note}
      </div>

      <div style={{ marginTop: 70, height: 200, opacity: inCall }}>
        <VoiceBars speaker="client" color={accent} bars={18} height={200} barWidth={16} />
      </div>

      <div style={{ position: "absolute", bottom: 90, left: 0, right: 0, display: "flex", justifyContent: answered ? "center" : "space-between", padding: "0 80px" }}>
        {!answered ? (
          <div style={{ width: 130, height: 130, borderRadius: 65, background: C.siren, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: EMOJI, fontSize: 60, rotate: "135deg" }}>📞</div>
        ) : null}
        <div
          style={{
            width: 130,
            height: 130,
            borderRadius: 65,
            background: answered ? C.siren : C.mint,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: EMOJI,
            fontSize: 60,
            rotate: answered ? "135deg" : `${interpolate(Math.sin(frame / 2), [-1, 1], [-12, 12])}deg`,
          }}
        >
          📞
        </div>
      </div>
    </div>
  );
};
