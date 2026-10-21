import { Audio } from "@remotion/media";
import { AbsoluteFill, interpolate, Sequence, staticFile, Track, useCurrentFrame, useVideoConfig } from "remotion";
import voiceover from "../voiceover/vibecoding.json";
import { Background } from "./Background";
import { Captions } from "./Captions";
import { useFonts } from "./fonts";
import { Crash } from "./scenes/Crash";
import { Cta } from "./scenes/Cta";
import { Deploy } from "./scenes/Deploy";
import { ERRORS, Errors } from "./scenes/Errors";
import { Hook } from "./scenes/Hook";
import { NoRead } from "./scenes/NoRead";
import { Prompt } from "./scenes/Prompt";
import { Works } from "./scenes/Works";
import { C } from "./theme";

type Props = {
  readonly handle: string;
  readonly musicVolume: number;
};

type SceneId = (typeof voiceover.scenes)[number]["id"];

// Картинка появляется чуть раньше голоса, чтобы глаз успел зацепиться.
const LEAD_SECONDS = 0.15;
export const TAIL_SECONDS = 1.5;

// Тайминги сцен берутся из озвучки (scripts/voiceover.py), поэтому при
// изменении текста сцены сами подстраиваются под длину фраз.
const useSceneTiming = () => {
  const { fps, durationInFrames } = useVideoConfig();
  const starts = voiceover.scenes.map((s, i) =>
    i === 0 ? 0 : Math.round((s.startMs / 1000 - LEAD_SECONDS) * fps),
  );
  return (id: SceneId) => {
    const i = voiceover.scenes.findIndex((s) => s.id === id);
    const from = starts[i];
    const until = i + 1 < starts.length ? starts[i + 1] : durationInFrames;
    return { from, durationInFrames: until - from };
  };
};

// Быстрый «наезд» камеры при смене сцены.
const SceneIn: React.FC<{ readonly children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(frame, [0, 4], [0, 1], { extrapolateRight: "clamp" }),
        scale: String(interpolate(frame, [0, 6], [1.08, 1], { extrapolateRight: "clamp" })),
        filter: `blur(${interpolate(frame, [0, 5], [12, 0], { extrapolateRight: "clamp" })}px)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const Sfx: React.FC<{ readonly name: string; readonly at: number; readonly volume?: number }> = ({ name, at, volume = 0.5 }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence name={`SFX ${name}`} from={Math.round(at * fps)} layout="none">
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );
};

export const VibeShort: React.FC<Props> = ({ handle, musicVolume }) => {
  useFonts();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const at = useSceneTiming();
  const sec = (id: SceneId, offset: number) => at(id).from / fps + offset;
  const crash = at("crash");
  const isCrash = frame >= crash.from && frame < crash.from + 2 * fps;

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <Background colors={isCrash ? [C.red, "#7a0010", C.orange] : [C.violet, C.cyan, C.pink]} />

      <Track name="Scenes">
        <Sequence name="Hook" {...at("hook")}><SceneIn><Hook /></SceneIn></Sequence>
        <Sequence name="Prompt" {...at("prompt")}><SceneIn><Prompt /></SceneIn></Sequence>
        <Sequence name="No read" {...at("noread")}><SceneIn><NoRead /></SceneIn></Sequence>
        <Sequence name="Errors" {...at("errors")}><SceneIn><Errors /></SceneIn></Sequence>
        <Sequence name="Works" {...at("works")}><SceneIn><Works /></SceneIn></Sequence>
        <Sequence name="Deploy" {...at("deploy")}><SceneIn><Deploy /></SceneIn></Sequence>
        <Sequence name="Crash" {...crash}><SceneIn><Crash /></SceneIn></Sequence>
        <Sequence name="CTA" {...at("cta")}><SceneIn><Cta handle={handle} /></SceneIn></Sequence>
      </Track>

      <Captions captions={voiceover.captions} />

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: 12,
          width: `${(frame / (durationInFrames - 1)) * 100}%`,
          background: `linear-gradient(90deg, ${C.cyan}, ${C.lime}, ${C.pink})`,
          boxShadow: `0 0 20px ${C.lime}`,
        }}
      />

      <Audio name="Voiceover" src={staticFile(voiceover.audio)} volume={1} />
      <Audio
        name="Beat"
        src={staticFile("sfx/beat.wav")}
        volume={(f) =>
          musicVolume *
          interpolate(f, [durationInFrames - fps, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
        }
      />

      {voiceover.scenes.slice(1).map((s) => (
        <Sfx key={s.id} name="whoosh" at={sec(s.id, 0)} volume={0.35} />
      ))}
      <Sfx name="pop" at={sec("hook", 0.5)} />
      <Sfx name="pop" at={sec("hook", 1.2)} />
      <Sfx name="pop" at={sec("prompt", 3.9)} />
      <Sfx name="error" at={sec("noread", 0.9)} volume={0.6} />
      <Sfx name="click" at={sec("noread", 2.5)} />
      {ERRORS.map((e) => (
        <Sfx key={e.text} name="error" at={sec("errors", e.at)} volume={0.35} />
      ))}
      <Sfx name="ding" at={sec("works", 0.1)} />
      <Sfx name="click" at={sec("deploy", 2.75)} />
      <Sfx name="whoosh" at={sec("deploy", 2.85)} volume={0.6} />
      <Sfx name="alarm" at={sec("crash", 0)} volume={0.3} />
      <Sfx name="ding" at={sec("crash", 2.0)} volume={0.4} />
      <Sfx name="pop" at={sec("cta", 3.3)} />
    </AbsoluteFill>
  );
};
