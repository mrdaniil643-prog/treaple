import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { pop } from "../anim";
import { C } from "../theme";
import { cue } from "../timing";
import { FloatEmoji, Phone, Sparkle, Sticky } from "../ui";
import { CallScreen } from "./CallScreen";
import { HoloSticker } from "./Holo";

// Заказчик звонит с ТЗ мечты, рассказчик спокойно соглашается.
export const Call: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const answer = cue("call", 0) - 0.25;
  const leave = cue("call", 3) - 0.1;
  const out = interpolate(frame, [leave * fps, (leave + 0.45) * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.55, 0, 0.9, 0.4),
  });
  const ringing = frame < answer * fps;
  const enter = pop(frame, fps, 0, { damping: 14 });

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, translate: `0px ${out * 2100}px`, rotate: `${out * 12}deg` }}>
        <Phone
          screen={`linear-gradient(180deg, ${C.plum}, ${C.night})`}
          style={{
            scale: String(0.7 + 0.3 * enter),
            translate: ringing ? `${Math.sin(frame * 2.2) * 7}px 0px` : "0px 0px",
          }}
        >
          <CallScreen answerAt={answer} accent={C.sunset} note="входящий звонок" />
        </Phone>
        <Sticky text="Сайт как у Амазона" color={C.butter} delay={cue("call", 0) + 0.6} rotate={-8} style={{ left: 20, top: 300 }} />
        <Sticky text="Бюджет: 5 000 ₽" color={C.paper} delay={cue("call", 1)} rotate={7} style={{ right: 10, top: 760, width: 420, whiteSpace: "nowrap" }} />
        <Sticky text="К утру!!!" color={C.sunset} delay={cue("call", 2)} rotate={-5} style={{ left: 30, top: 1010, width: 300 }} />
      </div>

      <FloatEmoji emoji="😎" x={540 - 190} y={330} size={380} delay={cue("call", 3)} />
      <HoloSticker text="вайбкодер" delay={cue("call", 4)} style={{ left: 150, top: 820 }} />
      <Sparkle x={180} y={300} size={110} color={C.butter} delay={cue("call", 4)} />
      <Sparkle x={900} y={420} size={80} color={C.mint} delay={cue("call", 4) + 0.15} />
      <Sparkle x={920} y={1050} size={120} color={C.sunset} delay={cue("call", 4) + 0.3} />
    </AbsoluteFill>
  );
};
