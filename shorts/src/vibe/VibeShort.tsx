import { Audio } from "@remotion/media";
import { linearTiming, springTiming, TransitionSeries } from "@remotion/transitions";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { iris } from "@remotion/transitions/iris";
import { pushCut } from "@remotion/transitions/push-cut";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { AbsoluteFill, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import voiceover from "../voiceover/vibecoding.json";
import { Background } from "./Background";
import { Captions } from "./Captions";
import { useFonts } from "./fonts";
import { Call } from "./scenes/Call";
import { Call2 } from "./scenes/Call2";
import { Cta, subscribeClick } from "./scenes/Cta";
import { Deploy, deployClick } from "./scenes/Deploy";
import { Errors, errorTimes } from "./scenes/Errors";
import { NoRead } from "./scenes/NoRead";
import { Prompt } from "./scenes/Prompt";
import { Works } from "./scenes/Works";
import { C } from "./theme";
import { LightLeak as LightLeakLayer } from "./ui";
import { cue, FPS, SceneFrom, SceneId, sceneDuration, sceneStart, TRANSITION_FRAMES } from "./timing";

type Props = {
  readonly handle: string;
  readonly musicVolume: number;
};

const T = TRANSITION_FRAMES;

const Sfx: React.FC<{ readonly name: string; readonly at: number; readonly volume?: number; readonly seconds?: number }> = ({ name, at, volume = 0.5, seconds }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence name={`SFX ${name}`} from={Math.round(at * fps)} durationInFrames={seconds ? Math.round(seconds * fps) : undefined} layout="none">
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );
};

// Сцена в TransitionSeries: знает свой абсолютный старт для аудиобаров.
const scene = (id: SceneId, node: React.ReactNode) => (
  <TransitionSeries.Sequence name={id} durationInFrames={sceneDuration(id)}>
    <SceneFrom.Provider value={sceneStart(id)}>{node}</SceneFrom.Provider>
  </TransitionSeries.Sequence>
);

// Абсолютное время реплики в секундах: для звуков поверх всех сцен.
const at = (id: SceneId, n: number, offset = 0) => sceneStart(id) / FPS + cue(id, n) + offset;
const atScene = (id: SceneId, seconds: number) => sceneStart(id) / FPS + seconds;

const LightLeakAt: React.FC<{ readonly second: number; readonly seed: number; readonly hueShift?: number }> = ({ second, seed, hueShift }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence name={`Light leak ${seed}`} from={Math.round((second - 0.3) * fps)} durationInFrames={Math.round(1.4 * fps)}>
      <LightLeakLayer seed={seed} hueShift={hueShift} />
    </Sequence>
  );
};


export const VibeShort: React.FC<Props> = ({ handle, musicVolume }) => {
  useFonts();
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const alarm = frame >= sceneStart("call2") && frame < sceneStart("call2") + (cue("call2", 2) + 0.2) * fps;

  // Бит приглушается, пока кто-то говорит.
  const speaking = (f: number) => voiceover.phrases.some((p) => f >= (p.startMs / 1000 - 0.1) * fps && f <= (p.endMs / 1000 + 0.15) * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: C.night }}>
      <Background alarm={alarm} />

      <TransitionSeries name="Scenes">
        {scene("call", <Call />)}
        <TransitionSeries.Transition presentation={pushCut({ flashColor: C.butter, flashOpacity: 0.8 })} timing={linearTiming({ durationInFrames: T })} />
        {scene("prompt", <Prompt />)}
        <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={springTiming({ durationInFrames: T, config: { damping: 200 } })} />
        {scene("noread", <NoRead />)}
        <TransitionSeries.Transition presentation={wipe({ direction: "from-top-left" })} timing={linearTiming({ durationInFrames: T })} />
        {scene("errors", <Errors />)}
        <TransitionSeries.Transition presentation={iris({ width, height })} timing={linearTiming({ durationInFrames: T })} />
        {scene("works", <Works />)}
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={springTiming({ durationInFrames: T, config: { damping: 200 } })} />
        {scene("deploy", <Deploy />)}
        <TransitionSeries.Transition presentation={pushCut({ flashColor: C.siren, flashOpacity: 0.9 })} timing={linearTiming({ durationInFrames: T })} />
        {scene("call2", <Call2 />)}
        <TransitionSeries.Transition presentation={clockWipe({ width, height })} timing={linearTiming({ durationInFrames: T })} />
        {scene("cta", <Cta handle={handle} />)}
      </TransitionSeries>

      <LightLeakAt second={at("call", 4)} seed={3} hueShift={20} />
      <LightLeakAt second={at("works", 0)} seed={7} hueShift={120} />
      <LightLeakAt second={at("call2", 3)} seed={11} />

      <Captions />

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: 12,
          width: `${(frame / (durationInFrames - 1)) * 100}%`,
          background: `linear-gradient(90deg, ${C.violet}, ${C.sunset}, ${C.butter})`,
          boxShadow: `0 0 20px ${C.sunset}`,
        }}
      />

      <Audio name="Voiceover" src={staticFile(voiceover.audio)} volume={1} />
      <Audio
        name="Beat"
        src={staticFile("sfx/beat.wav")}
        volume={(f) =>
          musicVolume *
          (speaking(f) ? 0.5 : 1) *
          interpolate(f, [durationInFrames - fps, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
        }
      />

      {voiceover.scenes.slice(1).map((s) => (
        <Sfx key={s.id} name="whoosh" at={sceneStart(s.id as SceneId) / fps} volume={0.3} />
      ))}
      <Sfx name="ring" at={0} volume={0.55} seconds={cue("call", 0) - 0.2} />
      <Sfx name="pop" at={at("call", 0, 0.6)} />
      <Sfx name="pop" at={at("call", 1)} />
      <Sfx name="pop" at={at("call", 2)} />
      <Sfx name="hangup" at={at("call", 3, -0.15)} volume={0.2} seconds={0.8} />
      <Sfx name="boom" at={at("call", 4)} volume={0.55} />
      <Sfx name="pop" at={at("prompt", 3)} />
      <Sfx name="error" at={at("noread", 0, 0.45)} volume={0.6} />
      <Sfx name="click" at={at("noread", 1, 0.9)} />
      {errorTimes().map((t, i) => (
        <Sfx key={i} name="error" at={atScene("errors", t)} volume={0.3} />
      ))}
      <Sfx name="ding" at={at("errors", 2)} volume={0.4} />
      <Sfx name="ding" at={at("works", 0)} />
      <Sfx name="click" at={atScene("deploy", deployClick())} />
      <Sfx name="whoosh" at={atScene("deploy", deployClick() + 0.1)} volume={0.6} />
      <Sfx name="ring" at={atScene("call2", 0.3)} volume={0.55} seconds={cue("call2", 0) - 0.5} />
      <Sfx name="glitch" at={at("call2", 1)} volume={0.45} />
      <Sfx name="hangup" at={at("call2", 2, -0.15)} volume={0.2} seconds={0.8} />
      <Sfx name="boom" at={at("call2", 3)} volume={0.6} />
      <Sfx name="click" at={atScene("cta", subscribeClick())} />
      <Sfx name="ding" at={atScene("cta", subscribeClick() + 0.05)} volume={0.35} />
    </AbsoluteFill>
  );
};
