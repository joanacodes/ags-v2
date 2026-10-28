import {
  Briefcase,
  Coins,
  Compass,
  Heart,
  Home,
  Lock,
  MessageCircle,
  ScrollText,
  Sprout,
  Star,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  user: User,
  home: Home,
  lock: Lock,
  heart: Heart,
  briefcase: Briefcase,
  users: Users,
  message: MessageCircle,
  coins: Coins,
  sprout: Sprout,
  star: Star,
  compass: Compass,
  scroll: ScrollText,
};

export function readingIcon(name: string): LucideIcon {
  return ICONS[name] ?? ScrollText;
}
