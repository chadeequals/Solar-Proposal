"use client";

/**
 * Sundial v2 — Realtime hook for the admin dashboard.
 *
 * Subscribes to changes on:
 *   - sundial_sessions       (INSERT / UPDATE)
 *   - aurora_credit_usage    (INSERT)
 *   - gate_configs           (INSERT — new versions saved)
 *
 * Returns a "connection status" so the UI can show a live indicator,
 * plus the row payloads via callbacks. The hook is deliberately
 * callback-based (instead of returning state) so the consuming
 * component can merge into its own state shape without an extra render.
 */

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserSupabase } from "./supabase-browser";

export type RealtimeStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "disabled"
  | "error";

type SessionRow = Record<string, unknown> & { id: string };
type UsageRow = Record<string, unknown> & { id: string };
type GateRow = Record<string, unknown> & { version: number };

type Options = {
  enabled: boolean;
  onSessionInsert?: (row: SessionRow) => void;
  onSessionUpdate?: (row: SessionRow) => void;
  onUsageInsert?: (row: UsageRow) => void;
  onGateConfigInsert?: (row: GateRow) => void;
};

export function useSundialRealtime(opts: Options): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  // Stash callbacks in a ref so the channel doesn't tear down when the
  // parent re-renders with new closures.
  const cbsRef = useRef(opts);
  cbsRef.current = opts;

  useEffect(() => {
    if (!opts.enabled) return;
    const client = getBrowserSupabase();
    if (!client) {
      setStatus("disabled");
      return;
    }

    setStatus("connecting");

    const channel: RealtimeChannel = client
      .channel("sundial-admin")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sundial_sessions" },
        (payload) => cbsRef.current.onSessionInsert?.(payload.new as SessionRow)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sundial_sessions" },
        (payload) => cbsRef.current.onSessionUpdate?.(payload.new as SessionRow)
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "aurora_credit_usage" },
        (payload) => cbsRef.current.onUsageInsert?.(payload.new as UsageRow)
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "gate_configs" },
        (payload) =>
          cbsRef.current.onGateConfigInsert?.(payload.new as GateRow)
      )
      .subscribe((s) => {
        // Realtime status strings: SUBSCRIBED, TIMED_OUT, CHANNEL_ERROR, CLOSED
        if (s === "SUBSCRIBED") setStatus("live");
        else if (s === "CHANNEL_ERROR") setStatus("error");
        else if (s === "TIMED_OUT" || s === "CLOSED") setStatus("reconnecting");
      });

    return () => {
      client.removeChannel(channel);
    };
  }, [opts.enabled]);

  return status;
}
