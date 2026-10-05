// Tracks whether an ad's picture loaded, so a broken link falls back to a drawn poster or a plain message.
import { useEffect, useState } from 'react';

/** Returns { src, failed, onError }. `failed` is true when there is no link or the picture would not load. */
export function useAdImage(fileUrl) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [fileUrl]);

  return { src: fileUrl || '', failed: !fileUrl || broken, onError: () => setBroken(true) };
}
