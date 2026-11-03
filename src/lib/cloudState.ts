import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const readLocal = <T,>(key: string, def: T, merge: boolean): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return def;
    const v = JSON.parse(raw);
    return merge && v && typeof v === "object" && !Array.isArray(v) ? { ...def, ...v } : v;
  } catch { return def; }
};

const getRetryDelay = (attempt: number) => Math.min(60_000, 5_000 * 2 ** Math.min(attempt, 4));

/**
 * State is always kept locally and, when signed in, synced to the user's account
 * through user_workspace. A failed remote sync never discards the local copy or
 * reports the account as synced; the initial sync retries with bounded backoff.
 */
export function useCloudState<T>(key: string, def: T, opts: { merge?: boolean } = {}): [T, Dispatch<SetStateAction<T>>, boolean] {
  const merge = !!opts.merge;
  const { user } = useAuth();
  const [value, setValue] = useState<T>(() => readLocal(key, def, merge));
  const [synced, setSynced] = useState(false);
  const ready = useRef(false);
  const fromServer = useRef(false);
  const lastValue = useRef(value);
  const saveVersion = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const dirtyKey = `${key}:unsaved`;

  // Pull from the account first. If local edits were pending, preserve and upload
  // them instead of replacing them with the older server copy.
  useEffect(() => {
    ready.current = false;
    setSynced(false);
    if (!user) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryAttempt = 0;

    const sync = async () => {
      if (cancelled) return;
      try {
        const { data, error } = await supabase
          .from("user_workspace")
          .select("value")
          .eq("user_id", user.id)
          .eq("key", key)
          .maybeSingle();

        if (cancelled) return;
        if (error) throw error;

        const hasPendingLocalEdits = localStorage.getItem(dirtyKey) === user.id;
        if (data && hasPendingLocalEdits) {
          const local = readLocal(key, def, merge);
          const { error: saveError } = await supabase.from("user_workspace").upsert({
            user_id: user.id,
            key,
            value: local as never,
            updated_at: new Date().toISOString(),
          });
          if (saveError) throw saveError;
          localStorage.removeItem(dirtyKey);
        } else if (data) {
          const serverValue = data.value as T;
          const next = merge && serverValue && typeof serverValue === "object" && !Array.isArray(serverValue)
            ? ({ ...def, ...(serverValue as object) } as T)
            : serverValue;
          setValue((previous) => {
            if (Object.is(previous, next)) return previous;
            fromServer.current = true;
            return next;
          });
          localStorage.setItem(key, JSON.stringify(next));
        } else {
          const local = readLocal(key, def, merge);
          const { error: seedError } = await supabase.from("user_workspace").upsert({
            user_id: user.id,
            key,
            value: local as never,
          });
          if (seedError) throw seedError;
          localStorage.removeItem(dirtyKey);
        }

        if (cancelled) return;
        ready.current = true;
        retryAttempt = 0;
        setSynced(true);
      } catch (error) {
        if (cancelled) return;
        ready.current = false;
        setSynced(false);
        const message = error instanceof Error ? error.message : "Unknown cloud sync error";
        console.warn("Cloud workspace sync failed; local data is preserved.", message);

        const delay = getRetryDelay(retryAttempt);
        retryAttempt += 1;
        retryTimer = setTimeout(() => { void sync(); }, delay);
      }
    };

    void sync();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
    // The data defaults and merge mode are expected to remain stable for a given key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key]);

  // Persist locally immediately. Once the initial remote sync succeeds, serialize
  // debounced writes so a slow older request cannot overwrite a newer edit.
  useEffect(() => {
    const changed = !Object.is(lastValue.current, value);
    lastValue.current = value;
    localStorage.setItem(key, JSON.stringify(value));

    // Invalidate queued saves whenever the value, user, or key changes.
    const currentSaveVersion = ++saveVersion.current;

    if (fromServer.current) {
      fromServer.current = false;
      return;
    }
    if (!user) return;

    if (!ready.current) {
      // Do not mark the first render as dirty. Only edits made while sync is
      // unavailable should win over the server snapshot on the next retry.
      if (changed) localStorage.setItem(dirtyKey, user.id);
      return;
    }

    localStorage.setItem(dirtyKey, user.id);
    setSynced(false);
    const timer = setTimeout(() => {
      saveQueue.current = saveQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (currentSaveVersion !== saveVersion.current) return;

          const { error } = await supabase.from("user_workspace").upsert({
            user_id: user.id,
            key,
            value: value as never,
            updated_at: new Date().toISOString(),
          });
          if (error) throw error;

          if (currentSaveVersion === saveVersion.current) {
            localStorage.removeItem(dirtyKey);
            setSynced(true);
          }
        })
        .catch((error: unknown) => {
          if (currentSaveVersion !== saveVersion.current) return;
          const message = error instanceof Error ? error.message : "Unknown cloud save error";
          console.warn("Cloud save failed; local data is preserved for retry.", message);
          setSynced(false);
        });
    }, 800);

    return () => clearTimeout(timer);
  }, [value, key, user]);

  return [value, setValue, synced];
}
