import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT, SAFE } from "../theme";

type Props = {
  readonly title: string;
  readonly handle: string;
  readonly accent: string;
};

// Призыв к действию с пульсирующей плашкой.
export const Outro: React.FC<Props> = ({ title, handle, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: `${SAFE.top}px ${SAFE.side}px ${SAFE.bottom}px`,
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          color: "white",
          fontSize: 110,
          fontWeight: 900,
          lineHeight: 1.1,
          opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 64,
          padding: "28px 56px",
          borderRadius: 999,
          backgroundColor: accent,
          color: "white",
          fontSize: 64,
          fontWeight: 800,
          scale: interpolate(frame, [0.4 * fps, 0.9 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 10 }),
          }) * (1 + 0.04 * Math.sin((frame / fps) * Math.PI * 2)),
        }}
      >
        {handle}
      </div>
    </AbsoluteFill>
  );
};
