# Admin app shell nav — design

## Goal
Replace the admin section's flat top nav bar (`AdminNav.jsx`) with a collapsible left sidebar, mechanically mirroring the customer shell (`Layout.jsx`) — collapse-on-brand-click, sliding active indicator, icon+label rows — while keeping the admin section's own fixed-dark visual palette (not the theme-aware customer palette) and not touching per-page headers.

## Scope
- **In**: `AdminNav.jsx` restructured into a sidebar shell; new dedicated `admin-sidebar-*` CSS (not reused from `storefront-*`, since admin is fixed-dark regardless of light/dark theme and has no cart/AI-panel/badge concerns); `AdminNav.test.jsx` updated for the new markup.
- **Out**: per-page `<h1>` / page-header centralization (each admin page keeps its own heading, untouched); theme toggle in admin (admin has no light/dark toggle today, none added); any change to admin routes, auth, or page components beyond the nav shell itself.

## Structure

`admin-nav-root` becomes a horizontal flex shell: sidebar + content pane, replacing the current vertical stack (bar on top, content below).

**Sidebar** (`admin-sidebar`, dark `#171717`, collapsible via CSS width transition like `.storefront-sidebar--collapsed`):
- Header row: `BrandMarkIcon` + "Admin" label, whole row is a button that toggles collapse (`admin-sidebar-brand-button`), same pattern as `storefront-brand-button`.
- Nav list (`admin-sidenav`): Dashboard (`GridIcon`), Orders (`OrdersIcon`), Products (`ShopIcon`), Customers (`PersonIcon`), Promo Codes (`TicketIcon`) — each an `admin-sidenav-item` (icon + label), with a sliding `admin-sidenav-indicator` behind the active row (same translateY-by-fixed-row-height mechanic as `storefront-sidenav-indicator`). Active-link logic unchanged from today: `ordersActive = pathname === '/admin' || pathname.startsWith('/admin/orders')`; other four use plain `NavLink` `isActive`.
- Account row pinned to the sidebar's bottom (`admin-account-row`): avatar-initial circle (first letter of email, same idiom as `ProfileMenu`'s `storefront-avatar`) + email text + inline logout icon-button (`LogoutIcon`, no popover — direct click calls `logout()`). Email/logout text hidden when collapsed, same as sidenav labels; icon-only remains reachable.

**Content pane** (`admin-nav-content`, existing class kept): renders `<Outlet />`. Gets a small `admin-sidebar-toggle` button (reuses `PanelLeftIcon`) that only shows when the sidebar is collapsed, so collapsing is always reversible without hunting for the shrunk sidebar — same reachability reasoning as `Layout.jsx`'s `sidebar-toggle`.

## State
One new piece of local state in `AdminNav`: `sidebarCollapsed` (boolean, `useState(false)`), toggled by both the brand button and the content-pane toggle button. No persistence (resets on reload, matching customer shell's current behavior).

## Testing
`AdminNav.test.jsx` keeps the same behavioral assertions (nav links present, correct link marked `.active` per route including the orders-detail-page special case, Outlet renders routed content, logout button fires `POST /api/admin/auth/logout`) — only selectors change if markup/roles shift (e.g. logout becomes an icon-button — assert via `aria-label` rather than visible text if the label moves to `aria-label`).
