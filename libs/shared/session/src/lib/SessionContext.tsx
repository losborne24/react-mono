// Shared session state for the playlist -> image -> mosaic flow. Replaces the
// prop-drilling that previously threaded ~8 setters through every route.
import { createContext, useMemo, useState, ReactNode } from 'react';
import { Track } from '@org/models';

export interface SessionState {
  tracks: Track[];
  setTracks: (t: Track[]) => void;
  uniqueItems: any[];
  setUniqueItems: (items: any[]) => void;
  imageSrc: string | null;
  setImageSrc: (src: string | null) => void;
  fetchMoreUrl: string | null;
  setFetchMoreUrl: (url: string | null) => void;
  // True when the user came back to re-pick a playlist from the mosaic view,
  // so the next selection should return straight to the mosaic.
  returnToMosaic: boolean;
  setReturnToMosaic: (v: boolean) => void;
}

export const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [uniqueItems, setUniqueItems] = useState<any[]>([]);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [fetchMoreUrl, setFetchMoreUrl] = useState<string | null>(null);
  const [returnToMosaic, setReturnToMosaic] = useState<boolean>(false);

  const value = useMemo(
    () => ({
      tracks,
      setTracks,
      uniqueItems,
      setUniqueItems,
      imageSrc,
      setImageSrc,
      fetchMoreUrl,
      setFetchMoreUrl,
      returnToMosaic,
      setReturnToMosaic,
    }),
    [tracks, uniqueItems, imageSrc, fetchMoreUrl, returnToMosaic]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
