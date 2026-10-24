import {
  LayoutGrid,
  UploadCloud,
  Layers,
  ListChecks,
  History,
  Library,
  Gauge,
  Coins,
  Users,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import type { NavIcon } from "@/lib/data/nav";

export const NAV_ICON: Record<NavIcon, typeof LayoutGrid> = {
  overview: LayoutGrid,
  upload: UploadCloud,
  batches: Layers,
  queue: ListChecks,
  history: History,
  collections: Library,
  evaluation: Gauge,
  costs: Coins,
  assist: Users,
  settings: Settings,
  admin: SlidersHorizontal,
};
