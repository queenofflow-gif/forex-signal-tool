import { useEffect, useRef } from "react";
import { createChart, CrosshairMode } from "lightweight-charts";
import { PAIRS } from "../engine/engine";

const fmtTime = (t) => new Date(t * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const tick = (t, type) => {
  const d = new Date(t * 1000);
  return type < 3 ? d.toLocaleDateString([], { month: "short", day: "numeric" }) : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

// candles: [{t,o,h,l,c}] · markers: [{t, dir, win, label}] · lines: [{price, color, title, dashed}]
export default function PriceChart({ pair, candles, markers = [], lines = [], live, height = 320, bars = 160 }) {
  const box = useRef(null), chartRef = useRef(null), seriesRef = useRef(null), linesRef = useRef([]), fitted = useRef(false);

  useEffect(() => {
    const el = box.current;
    const chart = createChart(el, {
      height, width: el.clientWidth,
      layout: { background: { color: "#FFFFFF" }, textColor: "#3D4652", fontFamily: "Inter, system-ui, sans-serif", fontSize: 11 },
      grid: { vertLines: { color: "#F1F3F5" }, horzLines: { color: "#F1F3F5" } },
      rightPriceScale: { borderColor: "#E4E7EB" },
      timeScale: { borderColor: "#E4E7EB", timeVisible: true, secondsVisible: false, tickMarkFormatter: tick },
      localization: { timeFormatter: fmtTime },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const cfg = PAIRS[pair];
    seriesRef.current = chart.addCandlestickSeries({
      upColor: "#2563EB", downColor: "#A3ABB5", borderVisible: false, wickUpColor: "#2563EB", wickDownColor: "#A3ABB5",
      priceFormat: { type: "price", precision: cfg.digits, minMove: cfg.pip / 10 },
    });
    chartRef.current = chart; fitted.current = false;
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null; linesRef.current = []; };
  }, [pair, height]);

  useEffect(() => {
    const s = seriesRef.current;
    if (!s || !candles?.length) return;
    const data = candles.map((c) => ({ time: Math.floor(c.t / 1000), open: c.o, high: c.h, low: c.l, close: c.c }));
    if (live && data.length) {
      const last = data[data.length - 1];
      last.close = live; last.high = Math.max(last.high, live); last.low = Math.min(last.low, live);
    }
    s.setData(data);
    if (!fitted.current) {
      chartRef.current.timeScale().setVisibleLogicalRange({ from: Math.max(0, data.length - bars), to: data.length + 3 });
      fitted.current = true;
    }
  }, [candles, live, bars]);

  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    const first = candles?.length ? candles[0].t : 0;
    s.setMarkers(markers.filter((m) => m.t >= first).sort((a, b) => a.t - b.t).map((m) => ({
      time: Math.floor(m.t / 1000), position: m.dir === "buy" ? "belowBar" : "aboveBar",
      color: m.win == null ? "#1F2328" : m.win ? "#2563EB" : "#B45309",
      shape: m.dir === "buy" ? "arrowUp" : "arrowDown", text: m.label || "",
    })));
  }, [markers, candles]);

  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    linesRef.current.forEach((l) => s.removePriceLine(l));
    linesRef.current = lines.filter((l) => l.price != null).map((l) => s.createPriceLine({
      price: Number(l.price), color: l.color, lineWidth: 1, lineStyle: l.dashed === false ? 0 : 2, axisLabelVisible: true, title: l.title,
    }));
  }, [lines, candles]);

  return <div ref={box} className="chart" style={{ height }} role="img" aria-label={`${PAIRS[pair].label} price chart`} />;
}
