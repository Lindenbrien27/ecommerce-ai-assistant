import { useEffect } from 'react';

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Order Support Assistant` : 'Order Support Assistant';
  }, [title]);
}
