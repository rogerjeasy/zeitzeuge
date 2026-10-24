"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { CaseFile } from "@/lib/data/editor";
import type { FieldState } from "./field-row";
import { EditorHeader } from "./editor-header";
import { ViewerPane } from "./viewer-pane";
import { RecordPane } from "./record-pane";
import { ContextPanel } from "./context-panel";
import { SteerPanel } from "./steer-panel";
import { EditorFooter, type ExportFormat } from "./editor-footer";
import { ExampleBanner } from "@/components/investigation/example-banner";

function initialStates(record: CaseFile): Record<string, FieldState> {
  return Object.fromEntries(
    record.fields.map((field) => [
      field.key,
      { verdict: "pending" as const, value: field.value ?? "", edited: false },
    ]),
  );
}

/**
 * The Case File (§9.2 #6) — the screen the queue's "open in editor" leads to.
 *
 * Three panes, one shared highlight: pointing at a claim anywhere lights up the
 * pixels it rests on everywhere. Everything else on the screen exists to keep
 * that link reachable — which is why the viewer and the context rail stay put
 * on a wide screen while the record scrolls between them, and why on a phone
 * the record comes first and the rest follows underneath it.
 */
export function EditorScreen({ record }: { record: CaseFile }) {
  const locale = useLocale();
  const t = useTranslations("investigation.example");

  const [states, setStates] = useState(() => initialStates(record));
  const [hovered, setHovered] = useState<string[]>([]);
  const [showHorizon, setShowHorizon] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [approved, setApproved] = useState(false);
  const [steerOpen, setSteerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<ExportFormat | null>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const decided = useMemo(
    () =>
      record.fields.filter((field) => {
        const state = states[field.key];
        return state.verdict !== "pending" || state.edited;
      }).length,
    [record.fields, states],
  );

  // Anything a human touched is unsaved until it is written down.
  const dirty = useMemo(
    () =>
      !saved &&
      record.fields.some((field) => {
        const state = states[field.key];
        return state.verdict !== "pending" || state.edited;
      }),
    [record.fields, states, saved],
  );

  function change(key: string, next: FieldState) {
    setStates((all) => ({ ...all, [key]: next }));
    setSaved(false);
  }

  function save() {
    setSaving(true);
    timers.current.push(
      setTimeout(() => {
        setSaving(false);
        setSaved(true);
      }, 700),
    );
  }

  function exportAs(format: ExportFormat) {
    setExporting(true);
    setExported(null);
    timers.current.push(
      setTimeout(() => {
        setExporting(false);
        setExported(format);
      }, 850),
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[104rem] flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6">
      <ExampleBanner message={t("editor")} href="/batches" cta={t("toBatches")} />
      <EditorHeader
        record={record}
        decided={decided}
        total={record.fields.length}
        locale={locale}
      />

      {/*
        One column on a phone and on an iPad in portrait. From a landscape
        tablet up the record takes a full-height column of its own and the
        viewer and the context rail stack beside it — the record is the tallest
        thing on the screen, so giving it the second column is what keeps the
        first one from ending in half a page of nothing. Three side-by-side
        columns only above 1536 px, where the record still has room for its own
        action buttons; below that they would wrap under the value and the row
        would stop being decidable at a glance.
      */}
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,0.78fr)]">
        <ViewerPane
          record={record}
          activeEvidence={hovered}
          onHoverEvidence={(id) => setHovered(id ? [id] : [])}
          showHorizon={showHorizon}
          onToggleHorizon={setShowHorizon}
          className="2xl:sticky 2xl:top-[4.5rem]"
        />

        <RecordPane
          fields={record.fields}
          states={states}
          onChange={change}
          activeEvidence={hovered}
          onHoverEvidence={setHovered}
          className="lg:row-span-2 2xl:row-span-1"
        />

        <ContextPanel
          record={record}
          showHorizon={showHorizon}
          onToggleHorizon={setShowHorizon}
          className="2xl:sticky 2xl:top-[4.5rem]"
        />
      </div>

      {steerOpen && <SteerPanel onApplied={() => setSaved(false)} />}

      <EditorFooter
        decided={decided}
        total={record.fields.length}
        dirty={dirty}
        saving={saving}
        saved={saved}
        approved={approved}
        steerOpen={steerOpen}
        exporting={exporting}
        exported={exported}
        onToggleSteer={() => setSteerOpen((v) => !v)}
        onSave={save}
        onApprove={() => setApproved(true)}
        onExport={exportAs}
      />
    </div>
  );
}
