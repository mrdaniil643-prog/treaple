// Палитра «ночной созвон»: индиго-ночь, закат и три цвета по говорящим.
export const C = {
  night: "#160a35",
  plum: "#2b1260",
  violet: "#6c4dff",
  sunset: "#ff7a45",
  butter: "#ffd84d",
  mint: "#3ef0b0",
  siren: "#ff2d55",
  paper: "#fff6e8",
  muted: "rgba(255,246,232,0.62)",
  line: "rgba(255,246,232,0.16)",
  panel: "rgba(22,10,53,0.82)",
};

export const DISPLAY = '"Unbounded", sans-serif';
export const BODY = '"Golos Text", sans-serif';
export const MONO = '"JetBrains Mono", monospace';
// Эмодзи берутся из системного шрифта: Apple на macOS, Segoe на Windows,
// Noto на Linux. Веб-версия Noto Color Emoji в headless Chrome не рисуется.
export const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// У каждого голоса свой цвет: он красит подсветку субтитров и аудиобары.
export const SPEAKERS = {
  narrator: { color: C.butter, label: null },
  client: { color: C.sunset, label: "📞 Заказчик" },
  ai: { color: C.mint, label: "🤖 Нейросеть" },
} as const;

export type Speaker = keyof typeof SPEAKERS;

// Кадр 1080×1920. Сцена занимает верх и центр, субтитры живут ниже,
// а нижние ~420px и правый край перекрывает интерфейс TikTok / Reels.
export const LAYOUT = {
  captionsTop: 1290,
  side: 70,
};
