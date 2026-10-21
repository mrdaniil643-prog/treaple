import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT, SAFE } from "../theme";

type Props = {
  readonly kicker: string;
  readonly title: string;
  readonly accent: string;
};

// Первые 2–3 секунды решают, досмотрят ли ролик: крупный заголовок
// с резким появлением и подсветкой ключевого слова.
export const Hook: React.FC<Props> = ({ kicker, title, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = title.split(" ");

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
          fontSize: 48,
          fontWeight: 800,
          letterSpacing: 4,
          textTransform: "uppercase",
          marginBottom: 32,
          opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {kicker}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0 28px" }}>
        {words.map((word, i) => {
          const start = 0.2 * fps + i * 0.12 * fps;
          return (
            <span
              key={i}
              style={{
                color: i === words.length - 1 ? accent : "white",
                fontSize: 132,
                fontWeight: 900,
                lineHeight: 1.05,
                opacity: interpolate(frame, [start, start + 0.25 * fps], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                translate: interpolate(frame, [start, start + 0.4 * fps], ["0px 80px", "0px 0px"], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
