// This app's icon set, now backed by lucide-react - each export below is a
// thin wrapper that pins the exact default size/stroke-width this app was
// already using at that icon's call sites (many of them render with no
// size props at all, relying entirely on the component's own default), so
// swapping the underlying render library didn't silently resize anything
// across the app. Callers pass the same names and props as before; only
// the SVG paths themselves changed.
import {
  Armchair,
  Bell,
  Cable,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  Grid,
  Headphones,
  Headset,
  Heart,
  Home,
  Keyboard,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Monitor,
  Moon,
  CircleHelp,
  PackageOpen,
  Plus,
  Printer,
  Search,
  Send,
  ShoppingBag,
  ShoppingCart,
  Settings,
  Sparkle,
  Store,
  Sun,
  Ticket,
  Undo2,
  User,
  X,
} from 'lucide-react';

// The app's own logo mark (Brand.jsx/MessageBubble.jsx) - brand identity,
// not a generic UI icon, so it stays hand-rolled rather than becoming a
// stock library glyph.
export function BrandMarkIcon(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

export function OrdersIcon(props) {
  return <ShoppingBag width="18" height="18" strokeWidth={2} {...props} />;
}

export function EmptyOrdersIcon(props) {
  return <PackageOpen width="48" height="48" strokeWidth={1.5} {...props} />;
}

export function SendIcon(props) {
  return <Send width="17" height="17" strokeWidth={2} {...props} />;
}

export function SparkleIcon(props) {
  return <Sparkle width="20" height="20" fill="currentColor" stroke="none" {...props} />;
}

export function ChatIcon(props) {
  return <MessageCircle width="18" height="18" strokeWidth={2} {...props} />;
}

export function LogoutIcon(props) {
  return <LogOut width="16" height="16" strokeWidth={2} {...props} />;
}

export function HamburgerIcon(props) {
  return <Menu width="20" height="20" strokeWidth={2} {...props} />;
}

export function SearchIcon(props) {
  return <Search width="16" height="16" strokeWidth={2} {...props} />;
}

export function BellIcon(props) {
  return <Bell width="18" height="18" strokeWidth={2} {...props} />;
}

export function CartIcon(props) {
  return <ShoppingCart width="18" height="18" strokeWidth={2} {...props} />;
}

export function PersonIcon(props) {
  return <User width="18" height="18" strokeWidth={2} {...props} />;
}

export function DownloadIcon(props) {
  return <Download width="15" height="15" strokeWidth={2} {...props} />;
}

export function ChevronDownIcon(props) {
  return <ChevronDown width="14" height="14" strokeWidth={2} {...props} />;
}

export function ChevronRightIcon(props) {
  return <ChevronRight width="14" height="14" strokeWidth={2} {...props} />;
}

export function HeartIcon(props) {
  return <Heart width="16" height="16" strokeWidth={2} {...props} />;
}

export function PinIcon(props) {
  return <MapPin width="16" height="16" strokeWidth={2} {...props} />;
}

export function CardIcon(props) {
  return <CreditCard width="18" height="18" strokeWidth={2} {...props} />;
}

export function LockIcon(props) {
  return <Lock width="16" height="16" strokeWidth={2} {...props} />;
}

export function HomeIcon(props) {
  return <Home width="18" height="18" strokeWidth={2} {...props} />;
}

export function ShopIcon(props) {
  return <Store width="18" height="18" strokeWidth={2} {...props} />;
}

export function PlusIcon(props) {
  return <Plus width="16" height="16" strokeWidth={2.5} {...props} />;
}

export function GridIcon(props) {
  return <Grid width="18" height="18" strokeWidth={2} {...props} />;
}

export function HeadsetIcon(props) {
  return <Headset width="20" height="20" strokeWidth={2} {...props} />;
}

export function CheckIcon(props) {
  return <Check width="15" height="15" strokeWidth={2.5} {...props} />;
}

export function ClockIcon(props) {
  return <Clock width="13" height="13" strokeWidth={2.5} {...props} />;
}

export function MailIcon(props) {
  return <Mail width="15" height="15" strokeWidth={2} {...props} />;
}

export function PrinterIcon(props) {
  return <Printer width="15" height="15" strokeWidth={2} {...props} />;
}

export function XIcon(props) {
  return <X width="13" height="13" strokeWidth={2.5} {...props} />;
}

export function UndoIcon(props) {
  return <Undo2 width="13" height="13" strokeWidth={2.5} {...props} />;
}

export function TicketIcon(props) {
  return <Ticket width="18" height="18" strokeWidth={2} {...props} />;
}

export function QuestionIcon(props) {
  return <CircleHelp width="18" height="18" strokeWidth={2} {...props} />;
}

export function SettingsIcon(props) {
  return <Settings width="18" height="18" strokeWidth={2} {...props} />;
}

export function SunIcon(props) {
  return <Sun width="18" height="18" strokeWidth={2} {...props} />;
}

export function MoonIcon(props) {
  return <Moon width="18" height="18" strokeWidth={2} {...props} />;
}

// Product icons - the fallback ProductImage.jsx renders when a product has
// no real photo mapped (see its own PRODUCT_PHOTOS). Real Wikimedia Commons
// photos are the primary path now; these stay as the degrade-gracefully
// case.
export function HeadphonesIcon(props) {
  return <Headphones strokeWidth={1.5} {...props} />;
}

export function CableIcon(props) {
  return <Cable strokeWidth={1.5} {...props} />;
}

export function KeyboardIcon(props) {
  return <Keyboard strokeWidth={1.5} {...props} />;
}

export function ChairIcon(props) {
  return <Armchair strokeWidth={1.5} {...props} />;
}

export function MonitorIcon(props) {
  return <Monitor strokeWidth={1.5} {...props} />;
}

// Keyed by the order's own product_icon column (see
// migrations/1785095226496_add-order-pricing-and-product-icon.sql) - not
// derived from product_name, which is free text.
export const PRODUCT_ICONS = {
  headphones: HeadphonesIcon,
  cable: CableIcon,
  keyboard: KeyboardIcon,
  chair: ChairIcon,
  monitor: MonitorIcon,
};
