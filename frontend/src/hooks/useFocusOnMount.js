import { useEffect, useRef } from 'react';

export function useFocusOnMount() {
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return ref;
}
