"use client";

import { useTranslations } from "next-intl";
import { Toggle } from "@/components/ui/toggle";
import { NOTIFICATION_EVENTS } from "@/lib/data/settings";
import { useSettingsForm } from "@/hooks/use-settings-form";
import { SettingCard } from "./setting-primitives";
import { SaveBar } from "./save-bar";

type Prefs = Record<string, { email: boolean; inApp: boolean }>;

const initial: Prefs = Object.fromEntries(
  NOTIFICATION_EVENTS.map((e) => [e.id, { email: e.email, inApp: e.inApp }]),
);

/**
 * A matrix of event × channel. The column headers are real `<th>`s so a screen
 * reader announces "Weekly report, Email, on" rather than a bare switch.
 */
export function NotificationsSection() {
  const t = useTranslations("settings.notifications");
  const form = useSettingsForm<{ prefs: Prefs }>({ prefs: initial });

  const toggle = (id: string, channel: "email" | "inApp", next: boolean) =>
    form.set("prefs", {
      ...form.values.prefs,
      [id]: { ...form.values.prefs[id], [channel]: next },
    });

  return (
    <>
      <SettingCard title={t("title")} description={t("desc")}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-2.5 font-mono text-[0.5625rem] font-normal uppercase tracking-[0.12em] text-muted-2 sm:px-5">
                  <span className="sr-only">{t("title")}</span>
                </th>
                <th scope="col" className="w-24 px-3 py-2.5 text-center font-mono text-[0.5625rem] font-normal uppercase tracking-[0.12em] text-muted-2">
                  {t("colEmail")}
                </th>
                <th scope="col" className="w-24 px-3 py-2.5 text-center font-mono text-[0.5625rem] font-normal uppercase tracking-[0.12em] text-muted-2">
                  {t("colInApp")}
                </th>
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_EVENTS.map((event) => (
                <tr key={event.id} className="border-b border-line/60 last:border-0">
                  <th scope="row" className="px-4 py-3.5 font-normal sm:px-5">
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[0.8125rem] font-medium text-foreground">
                        {t(`events.${event.id}`)}
                      </span>
                      <span className="max-w-[46ch] text-[0.75rem] leading-snug text-muted">
                        {t(`events.${event.id}Desc`)}
                      </span>
                    </span>
                  </th>
                  <td className="px-3 py-3.5 text-center">
                    <Toggle
                      label={`${t(`events.${event.id}`)} — ${t("colEmail")}`}
                      checked={form.values.prefs[event.id].email}
                      onChange={(next) => toggle(event.id, "email", next)}
                    />
                  </td>
                  <td className="px-3 py-3.5 text-center">
                    <Toggle
                      label={`${t(`events.${event.id}`)} — ${t("colInApp")}`}
                      checked={form.values.prefs[event.id].inApp}
                      onChange={(next) => toggle(event.id, "inApp", next)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingCard>

      <SaveBar
        dirty={form.dirty}
        saving={form.saving}
        saved={form.saved}
        onSave={form.save}
        onDiscard={form.discard}
      />
    </>
  );
}
