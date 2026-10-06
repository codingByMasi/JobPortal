// Who is logged in (if anyone) and what they are: employer or admin.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../../shared/data';

const AuthContext = createContext(null);

/** Keeps `user` and `profile` up to date and offers signIn / signUp / signOut. */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, profile: null });

  const refresh = useCallback(async () => {
    try {
      const user = await api.getSession();
      const profile = user ? await api.getProfile(user.id) : null;
      setState({ status: 'ready', user, profile });
    } catch {
      setState({ status: 'ready', user: null, profile: null });
    }
  }, []);

  useEffect(() => {
    refresh();
    return api.onAuthChange(() => refresh());
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      isAdmin: state.profile?.role === 'admin',
      isLoggedIn: Boolean(state.user),
      async signIn(details) {
        await api.signIn(details);
        await refresh();
      },
      async signUp(details) {
        const result = await api.signUp(details);
        await refresh();
        return result;
      },
      async signOut() {
        await api.signOut();
        await refresh();
      },
    }),
    [state, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
