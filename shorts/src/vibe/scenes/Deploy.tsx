import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { bob, pop, progress } from "../anim";
import { BODY, C, DISPLAY, EMOJI, MONO } from "../theme";
import { cue } from "../timing";
import { Cursor } from "../ui";

export const deployClick = () => cue("deploy", 1) + 0.15;

// «Деплой в пятницу вечером. Принять всё.»
export const Deploy: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const click = deployClick();
  const cal = pop(frame, fps, cue("deploy", 0), { damping: 10 });
  const seconds = 50 + Math.min(9, Math.floor(frame / (0.25 * fps)));
  const btn = pop(frame, fps, cue("deploy", 0) + 0.6);
  const clicked = frame >= click * fps;
  const launch = progress(frame, fps, click + 0.1, click + 0.9);
  const glow = 0.5 + 0.5 * bob(frame, fps, 4);
  const cx = interpolate(frame, [(click - 0.7) * fps, (click - 0.1) * fps], [980, 640], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cy = interpolate(frame, [(click - 0.7) * fps, (click - 0.1) * fps], [1260, 930], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: 230,
          left: 90,
          width: 440,
          borderRadius: 40,
          overflow: "hidden",
          background: C.paper,
          rotate: `${-7 * cal}deg`,
          scale: String(cal),
          boxShadow: "0 40px 80px rgba(8,3,24,0.55)",
          textAlign: "center",
        }}
      >
        <div style={{ background: C.siren, color: C.paper, fontFamily: DISPLAY, fontWeight: 800, fontSize: 48, padding: "18px 0" }}>Пятница</div>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 104, color: C.night, padding: "18px 0 0" }}>18:59</div>
        <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 36, color: C.siren, paddingBottom: 22 }}>:{seconds}</div>
      </div>

      <div style={{ position: "absolute", top: 300, left: 590, width: 420, opacity: cal, fontFamily: BODY, fontWeight: 700, fontSize: 36, color: C.paper, lineHeight: 1.5 }}>
        <div>тесты <span style={{ color: C.siren }}>пропущены</span></div>
        <div>ревью <span style={{ color: C.butter }}>«вайб ок»</span></div>
        <div>бэкап <span style={{ color: C.muted }}>а что это</span></div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 820,
          left: 120,
          right: 120,
          padding: "44px 0",
          borderRadius: 999,
          textAlign: "center",
          background: clicked ? C.paper : `linear-gradient(90deg, ${C.sunset}, ${C.butter})`,
          color: C.night,
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: 66,
          scale: String(btn * (clicked ? 0.94 + 0.06 * pop(frame, fps, click) : 1)),
          boxShadow: `0 0 ${50 + 70 * glow}px ${C.sunset}`,
        }}
      >
        Принять всё
      </div>

      <div
        style={{
          position: "absolute",
          left: 460,
          top: 980 - launch * 1300,
          fontFamily: EMOJI,
          fontSize: 150,
          rotate: "-45deg",
          opacity: clicked ? 1 : 0,
          filter: `drop-shadow(0 ${50 * launch}px 30px ${C.sunset})`,
        }}
      >
        🚀
      </div>
      <Cursor x={cx} y={cy} clickAt={click} />
    </AbsoluteFill>
  );
};
