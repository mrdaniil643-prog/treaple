import "@fontsource/unbounded/700.css";
import "@fontsource/unbounded/800.css";
import "@fontsource/golos-text/500.css";
import "@fontsource/golos-text/700.css";
import "@fontsource/golos-text/800.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";

const SAMPLE = "Аа Яя Zz 0123456789 ✓→₽";

// Держит рендер, пока не загрузятся шрифты, иначе первые кадры
// отрисуются запасным шрифтом.
export const useFonts = () => {
  const [handle] = useState(() => delayRender("Загрузка шрифтов"));

  useEffect(() => {
    Promise.all([
      document.fonts.load('700 100px "Unbounded"', SAMPLE),
      document.fonts.load('800 100px "Unbounded"', SAMPLE),
      document.fonts.load('500 40px "Golos Text"', SAMPLE),
      document.fonts.load('700 40px "Golos Text"', SAMPLE),
      document.fonts.load('800 40px "Golos Text"', SAMPLE),
      document.fonts.load('500 40px "JetBrains Mono"', SAMPLE),
      document.fonts.load('700 40px "JetBrains Mono"', SAMPLE),
    ]).then(() => continueRender(handle));
  }, [handle]);
};
