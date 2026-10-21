import { lightLeak } from "@remotion/effects/light-leak";
import { Star } from "@remotion/shapes";
import { interpolate, Solid, useCurrentFrame, useVideoConfig } from "remotion";
import { bob, pop } from "./anim";
import { BODY, C, EMOJI, MONO } from "./theme";

// Окно приложения: плотная тёмная панель с цветной рамкой по смыслу сцены.
export const Window: React.FC<{
  readonly title: string;
  readonly accent: string;
  readonly children: React.ReactNode;
  readonly style?: React.CSSProperties;
}> = ({ title, accent, children, style }) => (
  <div
    style={{
      position: "absolute",
      background: C.panel,
      border: `3px solid ${accent}`,
      borderRadius: 34,
      boxShadow: `0 40px 120px rgba(8,3,24,0.7), 0 0 0 10px ${accent}22`,
      overflow: "hidden",
      ...style,
    }}
  >
    <div style={{ height: 68, display: "flex", alignItems: "center", gap: 12, padding: "0 26px", background: `${accent}22`, borderBottom: `2px solid ${accent}55` }}>
      {[C.siren, C.butter, C.mint].map((c) => (
        <div key={c} style={{ width: 18, height: 18, borderRadius: 9, background: c }} />
      ))}
      <div style={{ marginLeft: 14, fontFamily: MONO, fontWeight: 500, fontSize: 27, color: C.muted }}>{title}</div>
    </div>
    {children}
  </div>
);

// Корпус смартфона: в нём идут оба звонка заказчика.
export const Phone: React.FC<{
  readonly screen: string;
  readonly children: React.ReactNode;
  readonly style?: React.CSSProperties;
}> = ({ screen, children, style }) => (
  <div
    style={{
      position: "absolute",
      left: 540 - 300,
      top: 190,
      width: 600,
      height: 1060,
      borderRadius: 96,
      padding: 18,
      background: "linear-gradient(145deg, #3a2a66, #120828)",
      boxShadow: "0 60px 140px rgba(8,3,24,0.8), inset 0 0 0 3px rgba(255,255,255,0.18)",
      ...style,
    }}
  >
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 80, overflow: "hidden", background: screen }}>
      <div style={{ position: "absolute", top: 22, left: "50%", translate: "-50% 0px", width: 170, height: 46, borderRadius: 23, background: "#05020c", zIndex: 5 }} />
      {children}
    </div>
  </div>
);

// Стикер-заметка с куском скотча: требования заказчика.
export const Sticky: React.FC<{
  readonly text: string;
  readonly color: string;
  readonly delay: number;
  readonly rotate: number;
  readonly style?: React.CSSProperties;
}> = ({ text, color, delay, rotate, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = pop(frame, fps, delay, { damping: 10, stiffness: 200 });
  return (
    <div
      style={{
        position: "absolute",
        padding: "34px 34px 30px",
        width: 360,
        background: color,
        color: C.night,
        fontFamily: BODY,
        fontWeight: 800,
        fontSize: 44,
        lineHeight: 1.1,
        boxShadow: "0 30px 50px rgba(8,3,24,0.5)",
        rotate: `${rotate}deg`,
        scale: String(p),
        opacity: Math.min(1, p * 2),
        ...style,
      }}
    >
      <div style={{ position: "absolute", top: -18, left: "50%", translate: "-50% 0px", width: 130, height: 40, background: "rgba(255,246,232,0.55)", rotate: "-4deg" }} />
      {text}
    </div>
  );
};

// Эмодзи, который выпрыгивает в момент `delay` и потом покачивается.
export const FloatEmoji: React.FC<{
  readonly emoji: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly delay?: number;
  readonly rotate?: number;
  readonly phase?: number;
}> = ({ emoji, x, y, size, delay = 0, rotate = 0, phase = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = pop(frame, fps, delay, { damping: 9, stiffness: 160 });
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y + bob(frame, fps, 0.9, phase) * 16,
        fontFamily: EMOJI,
        fontSize: size,
        lineHeight: 1,
        scale: String(p),
        rotate: `${rotate + bob(frame, fps, 0.7, phase) * 8}deg`,
        filter: "drop-shadow(0 24px 30px rgba(8,3,24,0.55))",
      }}
    >
      {emoji}
    </div>
  );
};

// Курсор мыши с анимацией клика.
export const Cursor: React.FC<{ readonly x: number; readonly y: number; readonly clickAt: number }> = ({ x, y, clickAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame - clickAt * fps;
  const pressed = t >= 0 && t < 0.15 * fps;
  const ripple = t >= 0 ? Math.min(1, t / (0.4 * fps)) : 0;
  return (
    <div style={{ position: "absolute", left: x, top: y, zIndex: 10 }}>
      {ripple > 0 && ripple < 1 ? (
        <div
          style={{
            position: "absolute",
            left: -70 * ripple,
            top: -70 * ripple,
            width: 140 * ripple,
            height: 140 * ripple,
            borderRadius: "50%",
            border: `6px solid ${C.paper}`,
            opacity: 1 - ripple,
          }}
        />
      ) : null}
      <svg width="64" height="76" viewBox="0 0 32 38" style={{ scale: pressed ? "0.85" : "1" }}>
        <path d="M2 2 L2 30 L9 23 L14 35 L19 33 L14 21 L24 21 Z" fill={C.paper} stroke={C.night} strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

// Искра-звезда, которая вспыхивает и гаснет.
export const Sparkle: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly color: string;
  readonly delay: number;
}> = ({ x, y, size, color, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame - delay * fps;
  const life = interpolate(t, [0, 0.25 * fps, 0.9 * fps], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, scale: String(life), rotate: `${t * 3}deg` }}>
      <Star points={4} innerRadius={size * 0.14} outerRadius={size / 2} cornerRadius={4} fill={color} style={{ filter: `drop-shadow(0 0 16px ${color})` }} />
    </div>
  );
};

// Световой блик поверх кадра (WebGL-эффект lightLeak из @remotion/effects).
export const LightLeak: React.FC<{ readonly seed: number; readonly hueShift?: number }> = ({ seed, hueShift = 0 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  return (
    <Solid
      width={width}
      height={height}
      color="#000000"
      style={{ mixBlendMode: "screen", opacity: 0.8 }}
      effects={[
        lightLeak({
          seed,
          hueShift,
          progress: interpolate(frame, [0, durationInFrames - 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }),
      ]}
    />
  );
};
