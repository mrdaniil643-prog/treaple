import { useMemo } from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import voiceover from "../voiceover/vibecoding.json";
import { pop } from "./anim";
import { BODY, C, DISPLAY, LAYOUT, Speaker, SPEAKERS } from "./theme";

type Word = (typeof voiceover.words)[number];
type Page = { speaker: Speaker; startMs: number; words: Word[] };

const MAX_WORDS = 4;

// Страница субтитров — фраза одного говорящего, длинные режутся по 4 слова.
const toPages = (): Page[] =>
  voiceover.phrases.flatMap((p) => {
    const words = voiceover.words.slice(p.words[0], p.words[1]);
    const pages: Page[] = [];
    for (let i = 0; i < words.length; i += MAX_WORDS) {
      const chunk = words.slice(i, i + MAX_WORDS);
      pages.push({ speaker: p.speaker as Speaker, startMs: chunk[0].startMs, words: chunk });
    }
    return pages;
  });

export const Captions: React.FC = () => {
  const { fps } = useVideoConfig();
  const pages = useMemo(toPages, []);

  return (
    <>
      {pages.map((page, i) => {
        const next = pages[i + 1];
        const from = Math.round((page.startMs / 1000) * fps);
        const lastEnd = page.words[page.words.length - 1].endMs;
        const until = Math.round((Math.min(next ? next.startMs : Infinity, lastEnd + 600) / 1000) * fps);
        return (
          <Sequence key={i} name={`Caption: ${page.words.map((w) => w.text).join(" ")}`} from={from} durationInFrames={until - from} layout="none">
            <CaptionPage page={page} />
          </Sequence>
        );
      })}
    </>
  );
};

// Субтитры в стиле TikTok: текущее слово на плашке цвета говорящего,
// у заказчика и нейросети сверху бейдж с именем.
const CaptionPage: React.FC<{ readonly page: Page }> = ({ page }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = page.startMs + (frame / fps) * 1000;
  const enter = pop(frame, fps, 0, { damping: 14, stiffness: 260 });
  const speaker = SPEAKERS[page.speaker];

  return (
    <AbsoluteFill
      style={{
        top: LAYOUT.captionsTop,
        height: 300,
        padding: `0 ${LAYOUT.side}px`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 14,
        scale: String(0.85 + 0.15 * enter),
      }}
    >
      {speaker.label ? (
        <div
          style={{
            padding: "6px 20px",
            borderRadius: 999,
            border: `3px solid ${speaker.color}`,
            color: speaker.color,
            background: "rgba(22,10,53,0.8)",
            fontFamily: BODY,
            fontWeight: 800,
            fontSize: 30,
          }}
        >
          {speaker.label}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: "6px 14px" }}>
        {page.words.map((w, i) => {
          const active = nowMs >= w.startMs && nowMs < w.endMs;
          return (
            <span
              key={i}
              style={{
                fontFamily: DISPLAY,
                fontWeight: 800,
                fontSize: 64,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                flexShrink: 0,
                color: active ? C.night : C.paper,
                backgroundColor: active ? speaker.color : "transparent",
                padding: "2px 14px",
                borderRadius: 16,
                rotate: active ? "-2deg" : "0deg",
                scale: active ? "1.06" : "1",
                WebkitTextStroke: active ? "0px" : `10px ${C.night}`,
                paintOrder: "stroke fill",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
