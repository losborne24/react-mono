import { useContext } from 'react';
import { SessionContext, SessionState } from './SessionContext.js';

// Access shared session state. Throws if used outside <SessionProvider>.
export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
