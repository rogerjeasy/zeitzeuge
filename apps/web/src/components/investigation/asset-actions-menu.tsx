"use client";

import { useTranslations } from "next-intl";
import { CheckCheck, FileSpreadsheet, MoreHorizontal, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import type { Capabilities } from "@/lib/investigation/permissions";

export type AssetAction = "accept" | "rerun" | "export" | "withdraw" | "restore";

/**
 * The per-row overflow menu: the bulk actions for one photo, filtered by
 * role. Nothing to offer means no trigger at all (the guest, the reader).
 */
export function AssetActionsMenu({
  name,
  can,
  finished,
  withdrawn,
  onAction,
}: {
  name: string;
  can: Capabilities;
  /** The photo has a record «Bestätigen» can act on. */
  finished: boolean;
  withdrawn: boolean;
  onAction: (action: AssetAction) => void;
}) {
  const t = useTranslations("investigation.manage");

  const items: { action: AssetAction; icon: React.ReactNode; label: string; danger?: boolean }[] = [];
  if (withdrawn) {
    if (can.canApprove) {
      items.push({ action: "restore", icon: <RotateCcw aria-hidden className="size-4" strokeWidth={2} />, label: t("restore") });
    }
  } else {
    if (can.canReview && finished) {
      items.push({ action: "accept", icon: <CheckCheck aria-hidden className="size-4" strokeWidth={2} />, label: t("accept") });
    }
    if (can.canWrite) {
      items.push({ action: "rerun", icon: <RotateCw aria-hidden className="size-4" strokeWidth={2} />, label: t("rerun") });
    }
    if (can.canWrite) {
      items.push({ action: "export", icon: <FileSpreadsheet aria-hidden className="size-4" strokeWidth={2} />, label: t("exportOne") });
    }
    if (can.canApprove) {
      items.push({ action: "withdraw", icon: <Trash2 aria-hidden className="size-4" strokeWidth={2} />, label: t("withdraw"), danger: true });
    }
  }
  if (items.length === 0) return null;

  return (
    <Menu
      label={t("rowMenu", { name })}
      trigger={({ toggle, ...aria }) => (
        <button
          type="button"
          data-menu-trigger
          onClick={toggle}
          aria-label={t("rowMenu", { name })}
          {...aria}
          className="grid size-8 place-items-center rounded-lg border border-line-strong bg-surface text-muted transition-colors hover:border-evidence hover:text-evidence"
        >
          <MoreHorizontal aria-hidden className="size-4" strokeWidth={2} />
        </button>
      )}
    >
      {(close) =>
        items.map((item, i) => (
          <div key={item.action}>
            {item.danger && i > 0 && <MenuSeparator />}
            <MenuItem
              icon={item.icon}
              className={item.danger ? "text-refuted" : undefined}
              onClick={() => {
                close();
                onAction(item.action);
              }}
            >
              {item.label}
            </MenuItem>
          </div>
        ))
      }
    </Menu>
  );
}
