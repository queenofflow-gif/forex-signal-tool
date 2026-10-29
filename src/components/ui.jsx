import { PAIRS, fmtPrice } from "../engine/engine";

export const Icon = {
  signals: <path d="M3 17l6-6 4 4 8-8M14 7h7v7" />,
  trade: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>,
  journal: <><path d="M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2z" /><path d="M8 9h6M8 13h6" /></>,
  strategies: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  account: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  back: <path d="M15 6l-6 6 6 6" />,
  check: <path d="M5 12l5 5 9-10" />,
  warn: <><path d="M12 8v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  chevron: <path d="M9 6l6 6-6 6" />,
};
export function Svg({ name, size = 20, color = "currentColor", width = 2 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{Icon[name]}</svg>;
}

export function Head({ title, sub, back, right }) {
  return (
    <header className="head">
      {back && <a className="iconbtn" href={back} aria-label="Back"><Svg name="back" /></a>}
      <div className="head-text">{sub && <span className="sub">{sub}</span>}<h1>{title}</h1></div>
      {right && <div className="head-right">{right}</div>}
    </header>
  );
}

export const Card = ({ children, className = "", ...p }) => <div className={`card ${className}`} {...p}>{children}</div>;

export function Meter({ value, max, tone = "win", mark }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="meter" role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={Math.round(max)}>
      <span className={`meter-fill ${tone}`} style={{ width: `${pct}%` }} />
      {mark != null && <span className="meter-mark" style={{ left: `${Math.min(100, mark)}%` }} />}
    </div>
  );
}

export function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="row toggle">
      <span className="grow"><span>{label}</span>{hint && <span className="hint">{hint}</span>}</span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function NumField({ label, hint, value, onChange, step = "any", prefix, suffix, min }) {
  return (
    <label className="row field">
      <span className="grow"><span>{label}</span>{hint && <span className="hint">{hint}</span>}</span>
      {prefix && <span className="muted">{prefix}</span>}
      <input type="number" inputMode="decimal" value={value ?? ""} step={step} min={min} onChange={(e) => onChange(e.target.value)} />
      {suffix && <span className="muted unit">{suffix}</span>}
    </label>
  );
}

export function Stat({ label, value, tone }) {
  return <div className="stat"><span className="muted small">{label}</span><span className={`mono big ${tone || ""}`}>{value}</span></div>;
}

export const Verdict = ({ v, children }) => <div className={`verdict ${v === "ok" ? "ok" : "warn"}`}>{children}</div>;

export function VerdictChip({ v }) {
  const map = { ok: ["Holds up", "ok"], low: ["Low sample", "warn"], bad: ["Loses money", "warn"], thin: ["Thin edge", "warn"], overfit: ["Overfit", "warn"] };
  const [t, c] = map[v] || ["–", "warn"];
  return <span className={`chip ${c}`}>{t}</span>;
}

export const Loading = ({ text = "Loading…" }) => <div className="loading" role="status">{text}</div>;
export const ErrorNote = ({ children }) => children ? <div className="note warn" role="alert">{children}</div> : null;
export const Note = ({ children, tone = "info" }) => <div className={`note ${tone}`}>{children}</div>;

export const money = (v, digits = 0) => (v == null || !isFinite(v) ? "–" : `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`);
export const pct = (v) => (v == null || !isFinite(v) ? "–" : `${Math.round(v * 100)}%`);
export const price = fmtPrice;
export const pairLabel = (p) => PAIRS[p]?.label || p;
export const dirLabel = (d) => (d === "buy" ? "Buy" : "Sell");
export const when = (ts) => new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function EquityCurve({ values, height = 110 }) {
  if (!values?.length) return <div className="muted small">No trades on unseen data yet.</div>;
  const pts = [0, ...values], min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1, w = 300;
  let peak = -Infinity;
  const bars = pts.slice(1).map((v, i) => { peak = Math.max(peak, pts[i], v); return { v, dd: v < peak }; });
  const bw = w / bars.length;
  const y = (v) => height - 4 - ((v - min) / span) * (height - 8);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label="Equity curve">
      <line x1="0" x2={w} y1={y(0)} y2={y(0)} stroke="#D5D9DE" strokeDasharray="3 3" />
      {bars.map((b, i) => {
        const top = Math.min(y(b.v), y(0)), h = Math.max(1.5, Math.abs(y(b.v) - y(0)));
        return <rect key={i} x={i * bw + 0.5} y={top} width={Math.max(1, bw - 1)} height={h} fill={b.dd || b.v < 0 ? "#B45309" : "#2563EB"} rx="1" />;
      })}
    </svg>
  );
}
