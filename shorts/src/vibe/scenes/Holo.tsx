import { useCurrentFrame, useVideoConfig } from "remotion";
import { pop } from "../anim";
import { C, DISPLAY } from "../theme";

// Голографическая наклейка с белой высечкой: главный акцент панчлайнов.
export const HoloSticker: React.FC<{
  readonly text: string;
  readonly delay: number;
  readonly fontSize?: number;
  readonly style?: React.CSSProperties;
}> = ({ text, delay, fontSize = 112, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = pop(frame, fps, delay, { damping: 8, stiffness: 220 });
  return (
    <div
      style={{
        position: "absolute",
        padding: "18px 44px 26px",
        borderRadius: 40,
        background: C.paper,
        boxShadow: "0 30px 70px rgba(8,3,24,0.6)",
        scale: String(p),
        rotate: `${-6 + (1 - p) * 30}deg`,
        ...style,
      }}
    >
      <div
        style={{
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize,
          lineHeight: 1.05,
          whiteSpace: "nowrap",
          backgroundImage: `linear-gradient(100deg, ${C.violet}, ${C.mint}, ${C.butter}, ${C.sunset}, ${C.violet})`,
          backgroundSize: "300% 100%",
          backgroundPosition: `${frame * 6}px 0px`,
          WebkitBackgroundClip: "text",
          color: "transparent",
        }}
      >
        {text}
      </div>
    </div>
  );
};
