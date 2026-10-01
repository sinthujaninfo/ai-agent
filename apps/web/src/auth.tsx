import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  api,
  clearSession,
  getStoredUser,
  setSession,
  type User,
} from "./lib/api";

interface AuthState {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredUser());

  const value = useMemo<AuthState>(
    () => ({
      user,
      async login(email, password) {
        const data = await api<{ user: User; accessToken: string; refreshToken: string }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setSession(data);
        setUser(data.user);
      },
      async register(email, password, name) {
        const data = await api<{ user: User; accessToken: string; refreshToken: string }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password, name }),
        });
        setSession(data);
        setUser(data.user);
      },
      logout() {
        clearSession();
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
