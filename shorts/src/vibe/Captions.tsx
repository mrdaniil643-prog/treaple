import { Caption } from "@remotion/captions";
import { useMemo } from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { pop } from "./anim";
import { C, DISPLAY, LAYOUT } from "./theme";

type Props = {
  readonly captions: Caption[];
};

type Page = {
  text: string;
  startMs: number;
  tokens: { text: string; fromMs: number; toMs: number }[];
};

// Слова одной фразы идут встык, между фразами есть пауза: по ней и режем
// субтитры на страницы, чтобы страница не перескакивала через смену сцены.
const toPages = (captions: Caption[]): Page[] => {
  const pages: Page[] = [];
  captions.forEach((c, i) => {
    const token = { text: c.text, fromMs: c.startMs, toMs: c.endMs };
    if (i === 0 || c.startMs - captions[i - 1].endMs > 50) {
      pages.push({ text: c.text, startMs: c.startMs, tokens: [token] });
    } else {
      const page = pages[pages.length - 1];
      page.text += c.text;
      page.tokens.push(token);
    }
  });
  return pages;
};

// Субтитры в стиле TikTok: фраза целиком, текущее слово на плашке.
export const Captions: React.FC<Props> = ({ captions }) => {
  const { fps } = useVideoConfig();
  const pages = useMemo(() => toPages(captions), [captions]);

  return (
    <>
      {pages.map((page, i) => {
        const next = pages[i + 1];
        const from = Math.round((page.startMs / 1000) * fps);
        const until = next ? Math.round((next.startMs / 1000) * fps) : from + 2 * fps;
        return (
          <Sequence key={i} name={`Caption ${page.text.trim()}`} from={from} durationInFrames={until - from} layout="none">
            <CaptionPage tokens={page.tokens} startMs={page.startMs} />
          </Sequence>
        );
      })}
    </>
  );
};

const CaptionPage: React.FC<{
  readonly tokens: { text: string; fromMs: number; toMs: number }[];
  readonly startMs: number;
}> = ({ tokens, startMs }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = startMs + (frame / fps) * 1000;
  const enter = pop(frame, fps, 0, { damping: 14, stiffness: 260 });

  return (
    <AbsoluteFill
      style={{
        top: LAYOUT.captionsTop,
        height: 260,
        padding: `0 ${LAYOUT.side}px`,
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        alignContent: "center",
        gap: "8px 18px",
        scale: String(0.8 + 0.2 * enter),
      }}
    >
      {tokens.map((t, i) => {
        const active = nowMs >= t.fromMs && nowMs < t.toMs;
        return (
          <span
            key={i}
            style={{
              fontFamily: DISPLAY,
              fontWeight: 900,
              fontSize: 68,
              textTransform: "uppercase",
              color: active ? C.bg : C.white,
              backgroundColor: active ? C.lime : "transparent",
              padding: "4px 16px",
              whiteSpace: "nowrap",
              flexShrink: 0,
              borderRadius: 18,
              rotate: active ? "-2deg" : "0deg",
              scale: active ? "1.08" : "1",
              WebkitTextStroke: active ? "0px" : "3px #000",
              paintOrder: "stroke fill",
              textShadow: active ? "none" : "0 6px 0 rgba(0,0,0,0.6)",
            }}
          >
            {t.text.trim()}
          </span>
        );
      })}
    </AbsoluteFill>
  );
};
