import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT, SAFE } from "../theme";

type Props = {
  readonly index: number;
  readonly title: string;
  readonly text: string;
  readonly accent: string;
};

// Один тезис = одна сцена: большая цифра, заголовок, короткое пояснение.
export const Point: React.FC<Props> = ({ index, title, text, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        padding: `${SAFE.top}px ${SAFE.side}px ${SAFE.bottom}px`,
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          color: accent,
          fontSize: 280,
          fontWeight: 900,
          lineHeight: 1,
          scale: interpolate(frame, [0, 0.5 * fps], [0.4, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 12 }),
          }),
          transformOrigin: "left center",
        }}
      >
        {index}
      </div>
      <div
        style={{
          color: "white",
          fontSize: 96,
          fontWeight: 900,
          lineHeight: 1.1,
          marginTop: 24,
          opacity: interpolate(frame, [0.2 * fps, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [0.2 * fps, 0.6 * fps], ["-60px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: "rgba(255,255,255,0.75)",
          fontSize: 52,
          fontWeight: 500,
          lineHeight: 1.3,
          marginTop: 32,
          opacity: interpolate(frame, [0.6 * fps, 1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
