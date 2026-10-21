import { useWindowedAudioData, visualizeAudio } from "@remotion/media-utils";
import { staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import voiceover from "../voiceover/vibecoding.json";
import { Speaker } from "./theme";
import { useSceneFrom } from "./timing";

type Props = {
  readonly speaker: Speaker;
  readonly color: string;
  readonly bars?: number;
  readonly height?: number;
  readonly barWidth?: number;
};

// Живая звуковая волна по дорожке конкретного говорящего:
// пляшет, только когда говорит именно он.
export const VoiceBars: React.FC<Props> = ({ speaker, color, bars = 20, height = 120, barWidth = 12 }) => {
  const frame = useCurrentFrame() + useSceneFrom();
  const { fps } = useVideoConfig();
  const { audioData, dataOffsetInSeconds } = useWindowedAudioData({
    src: staticFile(voiceover.stems[speaker]),
    frame,
    fps,
    windowInSeconds: 10,
  });

  const values = audioData
    ? visualizeAudio({ fps, frame, audioData, numberOfSamples: 64, optimizeFor: "speed", dataOffsetInSeconds }).slice(1, bars + 1)
    : new Array(bars).fill(0);

  // Низкие частоты в центр, высокие к краям — получается симметричная волна.
  const half = values.slice(0, Math.ceil(bars / 2));
  const mirrored = [...[...half].reverse(), ...half];

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: barWidth * 0.6, height }}>
      {mirrored.map((v, i) => (
        <div
          key={i}
          style={{
            width: barWidth,
            height: Math.max(barWidth, Math.min(1, Math.sqrt(v) * 2.4) * height),
            borderRadius: barWidth,
            background: color,
            boxShadow: `0 0 18px ${color}88`,
          }}
        />
      ))}
    </div>
  );
};
