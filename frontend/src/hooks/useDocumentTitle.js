import { useEffect } from 'react';

// A full page navigation updates the tab/window title from each page's own
// <title>; client-side routing doesn't touch document.title at all, so
// without this every route - and every browser-history/tab-list entry -
// stays "Order Support Assistant" regardless of which page is actually
// showing. Pair with useFocusOnMount, which solves the equivalent problem
// for keyboard/screen-reader focus.
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Order Support Assistant` : 'Order Support Assistant';
  }, [title]);
}
