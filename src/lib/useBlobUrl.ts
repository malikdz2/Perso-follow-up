import { useEffect, useMemo } from 'react';

/** URL d'objet pour un Blob, libérée automatiquement. */
export function useBlobUrl(blob?: Blob | null): string | undefined {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}
