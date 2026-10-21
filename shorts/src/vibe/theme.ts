export const C = {
  bg: "#07060c",
  lime: "#c8ff2e",
  pink: "#ff3ea5",
  cyan: "#39d5ff",
  violet: "#8b5cff",
  red: "#ff3b3b",
  orange: "#ff9f1c",
  white: "#ffffff",
  dim: "rgba(255,255,255,0.6)",
  glass: "rgba(255,255,255,0.07)",
  glassBorder: "rgba(255,255,255,0.16)",
};

export const DISPLAY = '"Unbounded", "Inter", sans-serif';
export const BODY = '"Inter", sans-serif';
export const MONO = '"JetBrains Mono", monospace';
// Эмодзи берутся из системного шрифта: Apple на macOS, Segoe на Windows,
// Noto на Linux. Веб-версия Noto Color Emoji в headless Chrome не рисуется.
export const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// Кадр 1080×1920. Сцена занимает верх и центр, субтитры живут ниже,
// а нижние ~420px и правый край перекрывает интерфейс TikTok / Reels.
export const LAYOUT = {
  sceneTop: 170,
  sceneBottom: 1220,
  captionsTop: 1260,
  side: 70,
};
