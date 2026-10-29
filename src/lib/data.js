import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";

export const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

// Loads everything the signed-in trader owns and keeps it fresh.
export function useAppData(session) {
  const uid = session?.user?.id;
  const [profile, setProfile] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [trades, setTrades] = useState([]);
  const [signals, setSignals] = useState([]);
  const [cursors, setCursors] = useState([]);
  const [error, setError] = useState(null);

  const loadProfile = useCallback(async () => {
    if (!uid) return;
    const { data, error: e } = await supabase.from("profiles").select("*").eq("user_id", uid).maybeSingle();
    if (e) setError(e.message); else setProfile(data);
  }, [uid]);
  const loadAlerts = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from("alert_settings").select("*").eq("user_id", uid).maybeSingle();
    setAlerts(data);
  }, [uid]);
  const loadTrades = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from("trades").select("*").order("opened_at", { ascending: false }).limit(500);
    setTrades(data || []);
  }, [uid]);
  const loadSignals = useCallback(async () => {
    if (!uid) return;
    const since = new Date(Date.now() - 30 * 86400e3).toISOString();
    const [{ data }, { data: cur }] = await Promise.all([
      supabase.from("signals").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(300),
      supabase.from("scan_cursor").select("*"),
    ]);
    setSignals(data || []); setCursors(cur || []);
  }, [uid]);

  useEffect(() => {
    if (!uid) { setProfile(null); return undefined; }
    loadProfile(); loadAlerts(); loadTrades(); loadSignals();
    const id = setInterval(() => { loadSignals(); loadTrades(); }, 30000);
    return () => clearInterval(id);
  }, [uid, loadProfile, loadAlerts, loadTrades, loadSignals]);

  return {
    uid, email: session?.user?.email, profile, alerts, trades, signals, cursors, error,
    loadProfile, loadAlerts, loadTrades, loadSignals, setProfile, setAlerts,
  };
}
