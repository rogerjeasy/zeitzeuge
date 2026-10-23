"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Local edit state for a settings section: current values, whether they differ
 * from what was loaded, and a save that resets the baseline.
 *
 * No persistence yet — `save` is where the PATCH goes once the API exists. The
 * dirty comparison is structural, so reverting a field by hand correctly clears
 * the unsaved state rather than leaving the bar stuck open.
 */
export function useSettingsForm<T extends object>(initial: T) {
  const [baseline, setBaseline] = useState(initial);
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(baseline),
    [values, baseline],
  );

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setSaved(false);
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const discard = useCallback(() => {
    setValues(baseline);
    setSaved(false);
  }, [baseline]);

  const save = useCallback(async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 700));
    setBaseline(values);
    setSaving(false);
    setSaved(true);
  }, [values]);

  return { values, set, dirty, saving, saved, save, discard };
}
