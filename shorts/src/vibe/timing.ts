import { createContext, useContext } from "react";
import voiceover from "../voiceover/vibecoding.json";

export type SceneId = (typeof voiceover.scenes)[number]["id"];

export const FPS = 30;
export const TRANSITION_FRAMES = 9;
export const TAIL_SECONDS = 1.5;
export const TOTAL_FRAMES = Math.ceil((voiceover.durationMs / 1000 + TAIL_SECONDS) * FPS);

const index = (id: SceneId) => voiceover.scenes.findIndex((s) => s.id === id);

// Сцена начинается на длину перехода раньше голоса: переход заканчивается
// ровно тогда, когда звучит первая фраза.
export const sceneStart = (id: SceneId) => {
  const i = index(id);
  return i === 0 ? 0 : Math.round((voiceover.scenes[i].startMs / 1000) * FPS) - TRANSITION_FRAMES;
};

// Длительность сцены внутри TransitionSeries: переход перекрывает соседние
// сцены, поэтому к каждой, кроме последней, добавляется его длина.
export const sceneDuration = (id: SceneId) => {
  const i = index(id);
  const next = voiceover.scenes[i + 1];
  return next
    ? sceneStart(next.id as SceneId) - sceneStart(id) + TRANSITION_FRAMES
    : TOTAL_FRAMES - sceneStart(id);
};

// Момент начала n-й фразы сцены в секундах от начала сцены. Сцены
// анимируются по этим «репликам», поэтому после правки текста и новой
// озвучки анимация сама подстраивается под голос.
export const cue = (id: SceneId, n: number) => {
  const phrases = voiceover.phrases.filter((p) => p.scene === id);
  return phrases[n].startMs / 1000 - sceneStart(id) / FPS;
};

export const cueEnd = (id: SceneId, n: number) => {
  const phrases = voiceover.phrases.filter((p) => p.scene === id);
  return phrases[n].endMs / 1000 - sceneStart(id) / FPS;
};

// Абсолютный кадр начала текущей сцены: нужен аудиобарам, которые читают
// общую дорожку голоса.
export const SceneFrom = createContext(0);
export const useSceneFrom = () => useContext(SceneFrom);
