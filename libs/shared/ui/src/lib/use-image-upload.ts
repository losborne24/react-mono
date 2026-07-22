import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseImageUploadResult {
  /** Currently selected file, or null. */
  file: File | null;
  /** Object URL for the current file, or null. Revoked automatically. */
  url: string | null;
  /** Validate + accept a file (ignores non-images). */
  setFile: (file: File) => void;
  /** Clear the current file, revoke its URL, and reset the bound file input. */
  clear: () => void;
  /**
   * Attach to the `<input type="file">`. Lets `clear()` reset the input value
   * so re-picking the same file still fires a change event.
   */
  inputRef: React.RefObject<HTMLInputElement | null>;
}

/**
 * Manages a single image upload: object-URL lifecycle, image-type validation,
 * and cleanup on unmount. UI-agnostic — pair with `UploadZone` or use directly.
 *
 * `onChange` fires with the accepted file and its object URL (both null when
 * cleared), so callers can derive a value synchronously without a follow-up effect.
 */
export function useImageUpload(
  onChange?: (file: File | null, url: string | null) => void,
): UseImageUploadResult {
  const [file, setFileState] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const setFile = useCallback(
    (next: File) => {
      if (!next.type.startsWith('image/')) return;
      const nextUrl = URL.createObjectURL(next);
      setUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return nextUrl;
      });
      setFileState(next);
      onChange?.(next, nextUrl);
    },
    [onChange],
  );

  const clear = useCallback(() => {
    setUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFileState(null);
    // Reset the input so re-picking the same file re-fires `onChange`.
    if (inputRef.current) inputRef.current.value = '';
    onChange?.(null, null);
  }, [onChange]);

  // Revoke the last URL on unmount.
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  return { file, url, setFile, clear, inputRef };
}
