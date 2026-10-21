import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

// Полоса прогресса сверху удерживает внимание: зритель видит, сколько осталось.
export const ProgressBar: React.FC<{ readonly color: string }> = ({ color }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        height: 14,
        backgroundColor: color,
        width: `${interpolate(frame, [0, durationInFrames - 1], [0, 100])}%`,
      }}
    />
  );
};
