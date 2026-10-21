import { Composition } from "remotion";
import { Short } from "./Short";
import { TOTAL_FRAMES } from "./vibe/timing";
import { VibeShort } from "./vibe/VibeShort";

// Вертикальный формат для Shorts / Reels / TikTok: 1080×1920, 30 fps.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Short"
        component={Short}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={20 * 30}
        defaultProps={{
          accent: "#ff5c39",
          background: "#0e0e12",
          handle: "@treaple",
        }}
      />
      <Composition
        id="VibeCoding"
        component={VibeShort}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={TOTAL_FRAMES}
        defaultProps={{
          handle: "@treaple",
          musicVolume: 0.12,
        }}
      />
    </>
  );
};
