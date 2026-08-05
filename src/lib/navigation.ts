import {
  Gauge,
  PieChart,
  Plus,
  FileText,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** A nav item is active for its href and any nested route. */
  match: (pathname: string) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: Gauge,
    match: (p) => p.startsWith("/dashboard"),
  },
  {
    label: "Birth Charts",
    href: "/charts",
    icon: PieChart,
    match: (p) => p.startsWith("/charts") && !p.startsWith("/charts/new") && !p.includes("/report"),
  },
  {
    label: "New Chart",
    href: "/charts/new",
    icon: Plus,
    match: (p) => p.startsWith("/charts/new"),
  },
  {
    label: "Reports",
    href: "/reports",
    icon: FileText,
    match: (p) => p.startsWith("/reports") || p.includes("/report"),
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    match: (p) => p.startsWith("/settings"),
  },
];

/** The seeded demo chart every top-level section falls back to. */
export const PRIMARY_CHART_ID = "chart-clara-mercer";
