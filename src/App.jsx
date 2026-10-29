import { useEffect, useState } from "react";
import "./styles.css";
import { supabase } from "./lib/supabase";
import { useRoute } from "./lib/router";
import { DataContext, useAppData } from "./lib/data";
import { Svg, Loading } from "./components/ui";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Signals from "./pages/Signals";
import SignalDetail from "./pages/SignalDetail";
import Strategy from "./pages/Strategy";
import Trades from "./pages/Trades";
import Journal from "./pages/Journal";
import Account from "./pages/Account";
import Alerts from "./pages/Alerts";

const TABS = [
  { href: "#/", key: "signals", label: "Signals", icon: "signals", match: (p) => p === "/" || p.startsWith("/signal") },
  { href: "#/trades", key: "trades", label: "Trades", icon: "trade", match: (p) => p.startsWith("/trade") },
  { href: "#/journal", key: "journal", label: "Journal", icon: "journal", match: (p) => p.startsWith("/journal") },
  { href: "#/strategy/grail", key: "strategies", label: "Strategies", icon: "strategies", match: (p) => p.startsWith("/strategy") },
  { href: "#/account", key: "account", label: "Account", icon: "account", match: (p) => p.startsWith("/account") || p.startsWith("/alerts") || p.startsWith("/setup") },
];

function Nav({ path }) {
  return (
    <nav className="nav" aria-label="Main">
      <a className="brand" href="#/"><span className="logo"><Svg name="signals" size={18} color="#fff" /></span>Forex Signal</a>
      <div className="tabs-nav">
        {TABS.map((t) => (
          <a key={t.key} href={t.href} className={t.match(path) ? "on" : ""} aria-current={t.match(path) ? "page" : undefined}>
            <Svg name={t.icon} size={22} /><span>{t.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [aal, setAal] = useState(null);
  const route = useRoute();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) { setAal(null); return; }
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => setAal(data));
  }, [session]);

  const data = useAppData(session && aal && !(aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") ? session : null);

  if (session === undefined) return <Loading />;
  const needsMfa = session && aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2";
  if (!session || needsMfa) return <Login mfa={needsMfa} onMfaDone={() => supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data: d }) => setAal(d))} />;
  if (!data.profile) return <div className="app"><Loading text={data.error || "Loading your account…"} /></div>;

  const p = route.parts;
  let page;
  if (!data.profile.setup_done || p[0] === "setup") page = <Setup />;
  else if (p[0] === "signal" && p[1]) page = <SignalDetail id={p[1]} />;
  else if (p[0] === "strategy") page = <Strategy stratKey={p[1] || "grail"} pairParam={route.query.pair} tfParam={route.query.tf} />;
  else if (p[0] === "trades" || p[0] === "trade") page = <Trades id={p[1]} />;
  else if (p[0] === "journal") page = <Journal />;
  else if (p[0] === "account") page = <Account />;
  else if (p[0] === "alerts") page = <Alerts />;
  else page = <Signals pairParam={route.query.pair} tfParam={route.query.tf} />;

  return (
    <DataContext.Provider value={data}>
      <div className="app">
        {data.profile.setup_done && <Nav path={route.path} />}
        <main className="main">{page}</main>
        <footer className="foot">Educational tool, not financial advice. Backtests are not predictions.</footer>
      </div>
    </DataContext.Provider>
  );
}
