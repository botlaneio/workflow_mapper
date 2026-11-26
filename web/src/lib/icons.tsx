import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  BellOff,
  Calculator,
  ChartLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCopy,
  ClipboardList,
  Copy,
  Factory,
  FileSpreadsheet,
  HandCoins,
  Headset,
  HeartHandshake,
  Keyboard,
  Link2,
  ListPlus,
  Mail,
  MessageCircleQuestion,
  MessagesSquare,
  NotebookPen,
  PackageCheck,
  PenLine,
  Phone,
  PhoneMissed,
  Plus,
  Receipt,
  RotateCcw,
  Server,
  Sheet,
  Stamp,
  Store,
  Target,
  Trash2,
  Truck,
  UserPlus,
  UserRound,
  Users,
  Workflow,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "phone-missed": PhoneMissed,
  "messages-square": MessagesSquare,
  "bell-off": BellOff,
  keyboard: Keyboard,
  copy: Copy,
  stamp: Stamp,
  "rotate-ccw": RotateCcw,
  "message-circle-question": MessageCircleQuestion,
  sheet: Sheet,
  "chart-line": ChartLine,
  target: Target,
  headset: Headset,
  workflow: Workflow,
  receipt: Receipt,
  "heart-handshake": HeartHandshake,
  factory: Factory,
  plus: Plus,
  "clipboard-copy": ClipboardCopy,
  "trash-2": Trash2,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  "list-plus": ListPlus,
  x: X,
  "user-plus": UserPlus,
  "package-check": PackageCheck,
  truck: Truck,
  "badge-check": BadgeCheck,
  users: Users,
  "pen-line": PenLine,
  "clipboard-list": ClipboardList,
  "hand-coins": HandCoins,
  "user-round": UserRound,
  wrench: Wrench,
  mail: Mail,
  phone: Phone,
  "notebook-pen": NotebookPen,
  "file-spreadsheet": FileSpreadsheet,
  store: Store,
  calculator: Calculator,
  server: Server,
  check: Check,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  link: Link2,
};

export function Icon({ name, size = 16, label }: { name: string; size?: number; label?: string }) {
  const Glyph = ICONS[name] ?? Circle;
  return <Glyph size={size} strokeWidth={1.8} aria-hidden={label ? undefined : true} aria-label={label} />;
}

export function toolIcon(tool: string): string | null {
  const value = tool.toLowerCase();
  if (value.includes("whatsapp")) return "brand:whatsapp";
  if (value.includes("gmail")) return "brand:gmail";
  if (value.includes("sheet")) return "brand:sheets";
  if (value.includes("excel")) return "file-spreadsheet";
  if (value.includes("tally")) return "calculator";
  if (value.includes("indiamart")) return "store";
  if (value.includes("phone")) return "phone";
  if (value.includes("email")) return "mail";
  if (value.includes("paper")) return "notebook-pen";
  if (value.includes("erp") || value.includes("sap")) return "server";
  return null;
}
