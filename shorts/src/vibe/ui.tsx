import { useCurrentFrame, useVideoConfig } from "remotion";
import { bob, pop } from "./anim";
import { BODY, C, DISPLAY, EMOJI, MONO } from "./theme";

// Стеклянное окно приложения с «светофором» в шапке.
export const Window: React.FC<{
  readonly title: string;
  readonly children: React.ReactNode;
  readonly style?: React.CSSProperties;
}> = ({ title, children, style }) => (
  <div
    style={{
      position: "absolute",
      background: "rgba(18,16,28,0.78)",
      border: `2px solid ${C.glassBorder}`,
      borderRadius: 36,
      boxShadow: "0 40px 120px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)",
      overflow: "hidden",
      ...style,
    }}
  >
    <div
      style={{
        height: 70,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "0 28px",
        borderBottom: `2px solid ${C.glassBorder}`,
        background: "rgba(255,255,255,0.04)",
      }}
    >
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
        <div key={c} style={{ width: 20, height: 20, borderRadius: 10, background: c }} />
      ))}
      <div style={{ marginLeft: 16, fontFamily: MONO, fontWeight: 500, fontSize: 28, color: C.dim }}>{title}</div>
    </div>
    {children}
  </div>
);

// Плашка «ШАГ N» в верхней части сцены.
export const StepChip: React.FC<{ readonly label: string; readonly color: string }> = ({ label, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = pop(frame, fps, 0);
  return (
    <div
      style={{
        position: "absolute",
        top: 190,
        left: "50%",
        translate: `-50% ${(1 - p) * -80}px`,
        opacity: p,
        padding: "14px 34px",
        borderRadius: 999,
        background: color,
        color: C.bg,
        fontFamily: DISPLAY,
        fontWeight: 900,
        fontSize: 40,
        letterSpacing: 2,
        rotate: "-3deg",
        boxShadow: `0 0 60px ${color}88`,
        zIndex: 5,
      }}
    >
      {label}
    </div>
  );
};

// Парящий эмодзи, который «выпрыгивает» в момент `delay`.
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
        top: y + bob(frame, fps, 0.9, phase) * 18,
        fontFamily: EMOJI,
        fontSize: size,
        lineHeight: 1,
        scale: String(p),
        rotate: `${rotate + bob(frame, fps, 0.7, phase) * 8}deg`,
        filter: "drop-shadow(0 20px 30px rgba(0,0,0,0.5))",
      }}
    >
      {emoji}
    </div>
  );
};

// Курсор мыши с анимацией клика.
export const Cursor: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly clickAt: number;
}> = ({ x, y, clickAt }) => {
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
            left: -60 * ripple,
            top: -60 * ripple,
            width: 120 * ripple,
            height: 120 * ripple,
            borderRadius: "50%",
            border: `6px solid ${C.white}`,
            opacity: 1 - ripple,
          }}
        />
      ) : null}
      <svg width="64" height="76" viewBox="0 0 32 38" style={{ scale: pressed ? "0.85" : "1" }}>
        <path d="M2 2 L2 30 L9 23 L14 35 L19 33 L14 21 L24 21 Z" fill="white" stroke="black" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

// Всплывающее уведомление.
export const Toast: React.FC<{
  readonly icon: string;
  readonly title: string;
  readonly text: string;
  readonly color: string;
  readonly style?: React.CSSProperties;
}> = ({ icon, title, text, color, style }) => (
  <div
    style={{
      position: "absolute",
      display: "flex",
      alignItems: "center",
      gap: 22,
      padding: "22px 30px",
      borderRadius: 28,
      background: "rgba(20,18,30,0.92)",
      border: `2px solid ${color}`,
      boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 40px ${color}44`,
      ...style,
    }}
  >
    <div style={{ fontFamily: EMOJI, fontSize: 52 }}>{icon}</div>
    <div>
      <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 30, color }}>{title}</div>
      <div style={{ fontFamily: BODY, fontWeight: 500, fontSize: 32, color: C.white }}>{text}</div>
    </div>
  </div>
);
