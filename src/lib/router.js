import { useEffect, useState } from "react";

// Hash routes work on GitHub Pages without server rewrites: #/signal/12?pair=EUR_USD
function parse() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, qs] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  return { path: "/" + parts.join("/"), parts, query: Object.fromEntries(new URLSearchParams(qs || "")) };
}

export function useRoute() {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => { setR(parse()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return r;
}

export function go(to) { window.location.hash = to; }
