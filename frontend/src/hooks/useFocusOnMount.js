import { useEffect, useRef } from 'react';

// A full page navigation resets browser focus to the top of the document;
// client-side routing doesn't, so without this, assistive tech has no cue
// that a new "page" was just shown. Attach the returned ref to each page's
// <h1 tabIndex={-1}> to move focus there on mount.
export function useFocusOnMount() {
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return ref;
}
