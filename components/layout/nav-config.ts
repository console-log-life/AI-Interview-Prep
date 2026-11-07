import {
  Activity,
  BarChart3,
  Braces,
  Bot,
  Brain,
  CalendarClock,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Map as MapIcon,
  MessageSquareHeart,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Exact match only — prevents /interview highlighting on /interview/new. */
  exact?: boolean;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

/** Single source of truth for navigation, shared by sidebar and mobile menu. */
export const MAIN_NAV: NavSection[] = [
  {
    title: "Practise",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/interview", label: "Interviews", icon: Bot },
      { href: "/assessments", label: "Assessments", icon: ClipboardList },
      { href: "/coding", label: "Coding", icon: Braces },
    ],
  },
  {
    title: "Prepare",
    items: [
      { href: "/coach", label: "AI coach", icon: MessageSquareHeart },
      { href: "/roadmap", label: "Roadmap", icon: MapIcon },
      { href: "/practice", label: "Review", icon: CalendarClock },
      { href: "/resume", label: "Resume", icon: FileText },
      { href: "/job-description", label: "Job matching", icon: Target },
    ],
  },
  {
    title: "Analyse",
    items: [
      { href: "/skills", label: "Skills", icon: Brain },
      { href: "/progress", label: "Progress", icon: BarChart3 },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/profile", label: "Profile", icon: User },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const ADMIN_NAV: NavSection = {
  title: "Admin",
  items: [
    { href: "/admin", label: "Overview", icon: ShieldCheck, exact: true },
    { href: "/admin/questions", label: "Questions", icon: ClipboardList },
    { href: "/admin/content-studio", label: "Content studio", icon: Sparkles },
    { href: "/admin/observability", label: "AI observability", icon: Activity },
    { href: "/admin/assessments", label: "Assessments", icon: FileText },
    { href: "/admin/interviews", label: "Interviews", icon: Bot },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  ],
};

export function isNavActive(
  pathname: string,
  item: NavItem,
): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
