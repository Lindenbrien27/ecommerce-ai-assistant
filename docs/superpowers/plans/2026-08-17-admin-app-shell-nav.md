# Admin App Shell Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin section's flat top nav bar with a collapsible left sidebar, mechanically mirroring the customer shell (`Layout.jsx`) while keeping admin's own fixed-dark palette.

**Architecture:** `AdminNav.jsx` restructures from a horizontal top bar + content-below stack into a horizontal flex shell: a collapsible `<aside>` sidebar (brand/collapse toggle, sliding-indicator nav list, pinned account row) beside a content pane rendering `<Outlet />`. New `admin-sidebar-*`/`admin-sidenav-*`/`admin-account-*` CSS classes are added; the old `.admin-nav-bar`/`.admin-nav-link`/`.admin-nav-spacer`/`.admin-nav-email`/`.admin-nav-logout` rules are removed. No other files change.

**Tech Stack:** React 18, react-router-dom (`NavLink`, `Outlet`, `useLocation`), Vitest + Testing Library.

## Global Constraints
- Keep the existing active-link semantics exactly: Orders is active on `/admin` and any `/admin/orders/*` path; the other four links use plain `NavLink` `isActive`.
- Admin keeps its fixed-dark palette (`#171717` background, `#a1a1a1`/`#fafafa` text) — not the theme-aware `--color-*` tokens used by the customer shell's sidebar.
- Do not touch any admin page file's own `<h1>` or the `AdminAuthContext`.
- Collapse behavior: sidebar animates to `width: 0` (not an icon rail) — same idiom as `.storefront-sidebar--collapsed` — and a reopen button (reusing the existing theme-aware `.sidebar-toggle` class) appears in the content pane only while collapsed.

---

### Task 1: Sidebar shell in AdminNav.jsx + CSS

**Files:**
- Modify: `frontend/src/components/AdminNav.jsx` (full rewrite of the component body)
- Modify: `frontend/src/index.css:8347-8406` (replace `.admin-nav-*` bar rules with sidebar rules), `frontend/src/index.css:8792-8794` (`.admin-nav-content` becomes a flex content pane)
- Test: `frontend/src/components/AdminNav.test.jsx` (no code changes expected — used to verify no regression; see Step 5)

**Interfaces:**
- Consumes: `useAdminAuth()` → `{ email, logout }` (from `frontend/src/context/AdminAuthContext.jsx`, unchanged); icon components `BrandMarkIcon`, `GridIcon`, `OrdersIcon`, `ShopIcon`, `PersonIcon`, `TicketIcon`, `LogoutIcon`, `PanelLeftIcon` from `frontend/src/components/icons.jsx` (all already exist, no changes needed).
- Produces: `AdminNav` default sidebar layout — no other file imports from this component besides `App.jsx:8` (`import { AdminNav } from './components/AdminNav.jsx'`), which needs no change since the export name/signature is identical.

- [ ] **Step 1: Run the existing test suite to confirm the current baseline passes**

Run: `cd frontend && npx vitest run src/components/AdminNav.test.jsx`
Expected: PASS (7 tests) — this is the baseline the rewrite must not break.

- [ ] **Step 2: Rewrite `frontend/src/components/AdminNav.jsx`**

```jsx
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import {
  BrandMarkIcon,
  GridIcon,
  OrdersIcon,
  ShopIcon,
  PersonIcon,
  TicketIcon,
  LogoutIcon,
  PanelLeftIcon,
} from './icons.jsx';

// Row height (36px, .admin-sidenav-item) + row gap (4px, .admin-sidenav-list)
// in index.css - the sliding .admin-sidenav-indicator needs this fixed step
// to glide to the right row, same idiom as Layout.jsx's NAV_ROW_STEP.
const ADMIN_NAV_ROW_STEP = 40;

export function AdminNav() {
  const { email, logout } = useAdminAuth();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  // NavLink's own isActive still contributes an "active" class even when
  // className is a plain string (not a function) - it just concatenates.
  // Without `end` here, that internal match is a startsWith("/admin"),
  // which would also match /admin/customers. Keeping `end` pins NavLink's
  // own match to exactly "/admin" - ordersActive below is what extends
  // highlighting to /admin/orders/* detail pages on top of that.
  const ordersActive = pathname === '/admin' || pathname.startsWith('/admin/orders');

  const navIndex = pathname.startsWith('/admin/dashboard')
    ? 0
    : ordersActive
      ? 1
      : pathname.startsWith('/admin/products')
        ? 2
        : pathname.startsWith('/admin/customers')
          ? 3
          : pathname.startsWith('/admin/promo-codes')
            ? 4
            : -1;

  const initial = email ? email[0].toUpperCase() : '?';

  return (
    <div className="admin-nav-root">
      <div className="admin-shell-body">
        <aside className={`admin-sidebar${collapsed ? ' admin-sidebar--collapsed' : ''}`}>
          <div className="admin-sidebar-clip">
            <button
              type="button"
              className="admin-sidebar-brand-button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-pressed={collapsed}
            >
              <span className="admin-sidebar-brand-mark" aria-hidden="true">
                <BrandMarkIcon />
              </span>
              <span className="admin-sidebar-brand-name">Admin</span>
            </button>

            <nav className="admin-sidenav" aria-label="Admin sections">
              <div className="admin-sidenav-list">
                <span
                  className="admin-sidenav-indicator"
                  style={{
                    transform: `translateY(${Math.max(navIndex, 0) * ADMIN_NAV_ROW_STEP}px)`,
                    opacity: navIndex === -1 ? 0 : 1,
                  }}
                  aria-hidden="true"
                />
                <NavLink
                  to="/admin/dashboard"
                  className={({ isActive }) => `admin-sidenav-item${isActive ? ' active' : ''}`}
                >
                  <GridIcon /> <span className="admin-sidenav-label">Dashboard</span>
                </NavLink>
                <NavLink to="/admin" end className={`admin-sidenav-item${ordersActive ? ' active' : ''}`}>
                  <OrdersIcon /> <span className="admin-sidenav-label">Orders</span>
                </NavLink>
                <NavLink
                  to="/admin/products"
                  className={({ isActive }) => `admin-sidenav-item${isActive ? ' active' : ''}`}
                >
                  <ShopIcon /> <span className="admin-sidenav-label">Products</span>
                </NavLink>
                <NavLink
                  to="/admin/customers"
                  className={({ isActive }) => `admin-sidenav-item${isActive ? ' active' : ''}`}
                >
                  <PersonIcon /> <span className="admin-sidenav-label">Customers</span>
                </NavLink>
                <NavLink
                  to="/admin/promo-codes"
                  className={({ isActive }) => `admin-sidenav-item${isActive ? ' active' : ''}`}
                >
                  <TicketIcon /> <span className="admin-sidenav-label">Promo Codes</span>
                </NavLink>
              </div>
            </nav>
          </div>

          <div className="admin-account-row">
            <span className="admin-account-avatar" aria-hidden="true">{initial}</span>
            <span className="admin-account-email">{email}</span>
            <button type="button" className="admin-account-logout" onClick={logout} aria-label="Log out">
              <LogoutIcon />
            </button>
          </div>
        </aside>

        <div className="admin-nav-content">
          {collapsed && (
            <button
              type="button"
              className="sidebar-toggle admin-sidebar-reopen"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
            >
              <PanelLeftIcon open={false} />
            </button>
          )}
          <Outlet />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace the old admin nav bar CSS with sidebar CSS in `frontend/src/index.css`**

Delete the existing block at lines 8347-8406 (`.admin-nav-root` through `.admin-nav-bar :focus-visible`) and replace it with:

```css
.admin-nav-root {
  min-height: 100vh;
  background: var(--color-page-bg);
}

.admin-shell-body {
  display: flex;
  align-items: stretch;
  min-height: 100vh;
}

.admin-sidebar {
  flex-shrink: 0;
  width: 220px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: #171717;
  border-right: 1px solid #434343;
  padding: var(--space-3) var(--space-2);
  overflow: hidden;
  transition: width var(--duration-base) var(--ease-out-bezier);
}

.admin-sidebar--collapsed {
  width: 0;
  padding: var(--space-3) 0;
}

.admin-sidebar-clip {
  display: flex;
  flex-direction: column;
  min-width: 204px;
}

.admin-sidebar-brand-button {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.4rem;
  margin-bottom: var(--space-4);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: #fafafa;
  cursor: pointer;
}

.admin-sidebar-brand-button:hover {
  background: rgba(255, 255, 255, 0.07);
}

.admin-sidebar-brand-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
}

.admin-sidebar-brand-name {
  font-weight: 700;
  letter-spacing: -0.01em;
}

.admin-sidenav-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.admin-sidenav-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 36px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.07);
  transition: transform var(--duration-base) var(--ease-out-bezier), opacity 0.15s ease;
  pointer-events: none;
}

.admin-sidenav-item {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  height: 36px;
  padding: 0 0.7rem;
  border-radius: var(--radius-md);
  color: #a1a1a1;
  font-size: var(--font-size-sm);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.admin-sidenav-item svg {
  flex-shrink: 0;
}

.admin-sidenav-item:hover {
  color: #fafafa;
}

.admin-sidenav-item.active {
  color: #fafafa;
}

.admin-account-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.4rem 0;
  border-top: 1px solid #434343;
  min-width: 204px;
}

.admin-account-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: #fafafa;
  font-size: var(--font-size-sm);
  font-weight: 700;
}

.admin-account-email {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
  color: #a1a1a1;
}

.admin-account-logout {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid #434343;
  border-radius: var(--radius-md);
  background: transparent;
  color: #a1a1a1;
  cursor: pointer;
}

.admin-account-logout:hover {
  color: #fafafa;
  border-color: #a1a1a1;
}

.admin-sidebar :focus-visible,
.admin-account-row :focus-visible {
  outline: 2px solid #fafafa;
  outline-offset: 2px;
}
```

- [ ] **Step 4: Update `.admin-nav-content` to be the content pane**

Replace the rule at `frontend/src/index.css:8792-8794`:

```css
.admin-nav-content {
  padding: 0;
}
```

with:

```css
.admin-nav-content {
  flex: 1;
  min-width: 0;
}

.admin-sidebar-reopen {
  margin: var(--space-3) 0 0 var(--space-3);
}
```

- [ ] **Step 5: Run the test suite again to confirm no regressions**

Run: `cd frontend && npx vitest run src/components/AdminNav.test.jsx`
Expected: PASS (same 7 tests, unchanged assertions — the rewrite keeps every link's visible text, the active-class logic, the Outlet content, and the logout button's accessible name `Log out` via `aria-label`).

If any assertion fails, fix `AdminNav.jsx` (not the test) unless the failure reveals the test was asserting incidental markup (e.g. an exact class list) rather than behavior — in that case update only the specific selector, keeping the same behavioral coverage described in the design spec's Testing section.

- [ ] **Step 6: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS — confirms no other test (e.g. anything asserting on `.admin-nav-bar`/`.admin-nav-link` classes) broke.

Run: `grep -rn "admin-nav-bar\|admin-nav-link\|admin-nav-spacer\|admin-nav-email\b\|admin-nav-logout" frontend/src` to confirm no other file references the removed classes. Expected: no matches.

- [ ] **Step 7: Manual check in the browser**

Run: `cd frontend && npm run dev` (default port 5173), sign in at `/admin/login`, and visually confirm: sidebar renders on the left with Dashboard/Orders/Products/Customers/Promo Codes, the active item is highlighted and the indicator glides between rows on navigation, clicking the brand row collapses the sidebar to width 0, the reopen button appears in the content pane and restores it, and the account row's Log out button signs out.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/AdminNav.jsx frontend/src/index.css
git commit -m "Turn the admin nav bar into a collapsible sidebar app shell"
```
