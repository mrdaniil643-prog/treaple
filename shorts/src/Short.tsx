import { AbsoluteFill, Sequence, Track, useVideoConfig } from "remotion";
import { ProgressBar } from "./ProgressBar";
import { Hook } from "./scenes/Hook";
import { Outro } from "./scenes/Outro";
import { Point } from "./scenes/Point";

type Props = {
  readonly accent: string;
  readonly background: string;
  readonly handle: string;
};

// Сценарий шортса: хук → три тезиса → призыв к действию (20 секунд).
// Чтобы сделать новый ролик, попросите Claude Code переписать тексты
// и тайминги сцен ниже под свою тему.
export const Short: React.FC<Props> = ({ accent, background, handle }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: background }}>
      <Track name="Scenes">
        <Sequence name="Hook" durationInFrames={3 * fps}>
          <Hook kicker="Claude Code + Remotion" title="Шортс одним промптом" accent={accent} />
        </Sequence>
        <Sequence name="Point 1" from={3 * fps} durationInFrames={4 * fps}>
          <Point
            index={1}
            title="Ставим Remotion"
            text="npx create-video@latest и npx skills add remotion-dev/skills"
            accent={accent}
          />
        </Sequence>
        <Sequence name="Point 2" from={7 * fps} durationInFrames={4 * fps}>
          <Point
            index={2}
            title="Описываем ролик"
            text="Claude пишет React-компоненты: каждый кадр — это код"
            accent={accent}
          />
        </Sequence>
        <Sequence name="Point 3" from={11 * fps} durationInFrames={4 * fps}>
          <Point
            index={3}
            title="Рендерим MP4"
            text="npm run render — и вертикальное видео 1080×1920 готово"
            accent={accent}
          />
        </Sequence>
        <Sequence name="Outro" from={15 * fps} durationInFrames={5 * fps}>
          <Outro title="Подписывайся, будет больше" handle={handle} accent={accent} />
        </Sequence>
      </Track>
      <ProgressBar color={accent} />
    </AbsoluteFill>
  );
};
