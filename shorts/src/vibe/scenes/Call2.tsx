import { tvSignalOff } from "@remotion/effects/tv-signal-off";
import { AbsoluteFill, Easing, interpolate, Solid, useCurrentFrame, useVideoConfig } from "remotion";
import { pop } from "../anim";
import { C, DISPLAY, EMOJI } from "../theme";
import { cue } from "../timing";
import { Phone, Sparkle, Window } from "../ui";
import { CallScreen } from "./CallScreen";
import { HoloSticker } from "./Holo";

// Заказчик звонит снова: «Почему на сайте написано undefined?!» — «Это не баг. Это вайб.»
export const Call2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const answer = cue("call2", 0) - 0.2;
  const ringing = frame < answer * fps;
  const leave = cue("call2", 2) - 0.1;
  const out = interpolate(frame, [leave * fps, (leave + 0.4) * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.55, 0, 0.9, 0.4),
  });
  const site = pop(frame, fps, cue("call2", 1), { damping: 12 });
  const notBug = pop(frame, fps, cue("call2", 2), { damping: 12 });
  const vibe = cue("call2", 3);
  const jitter = Math.sin(frame * 1.7) * 10;

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, translate: `${out * -1300}px 0px`, rotate: `${out * -10}deg` }}>
        <Phone
          screen={`linear-gradient(180deg, #5a0b2a, ${C.night})`}
          style={{ translate: ringing ? `${Math.sin(frame * 2.8) * 12}px ${Math.cos(frame * 2.1) * 6}px` : "0px 0px", scale: String(1 - 0.12 * site) }}
        >
          <CallScreen answerAt={answer} accent={C.siren} note="17 пропущенных" />
        </Phone>

        <Window title="amazon-2.ru" accent={C.siren} style={{ left: 60, right: 60, top: 640, height: 470, scale: String(site), rotate: `${4 * site}deg` }}>
          <div style={{ position: "relative", height: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
              <Solid width={960} height={400} color={C.night} effects={[tvSignalOff({ amount: 0.6 })]} />
            </div>
            <div
              style={{
                position: "relative",
                fontFamily: DISPLAY,
                fontWeight: 800,
                fontSize: 120,
                color: C.paper,
                textShadow: `${jitter}px 0 ${C.siren}, ${-jitter}px 0 ${C.mint}`,
              }}
            >
              undefined
            </div>
          </div>
        </Window>
      </div>

      <div
        style={{
          position: "absolute",
          top: 260,
          width: "100%",
          textAlign: "center",
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: 110,
          color: C.paper,
          scale: String(notBug),
          opacity: notBug,
        }}
      >
        Это не баг
      </div>
      <div style={{ position: "absolute", top: 440, width: "100%", textAlign: "center", fontFamily: EMOJI, fontSize: 330, scale: String(pop(frame, fps, vibe, { damping: 7, stiffness: 240 })) }}>😎</div>
      <HoloSticker text="это вайб" delay={vibe + 0.1} fontSize={124} style={{ left: 140, top: 870 }} />
      <Sparkle x={160} y={480} size={120} color={C.butter} delay={vibe + 0.1} />
      <Sparkle x={930} y={560} size={100} color={C.mint} delay={vibe + 0.25} />
      <Sparkle x={880} y={1110} size={130} color={C.sunset} delay={vibe + 0.4} />
    </AbsoluteFill>
  );
};
