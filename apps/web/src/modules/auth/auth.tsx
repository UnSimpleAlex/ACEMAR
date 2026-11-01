import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { backend, client } from "../../shared/backend";
import type { Profile } from "../../shared/types";
import { useQueryClient } from "@tanstack/react-query";
interface AuthState {
  profile: Profile | null;
  loading: boolean;
  signedIn: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
const Context = createContext<AuthState | null>(null);
export function AuthProvider({
  children,
  onSessionEnd,
}: {
  children: ReactNode;
  onSessionEnd?: () => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const cache = useQueryClient();
  const refresh = async () => {
    setLoading(true);
    try {
      if (!backend) return;
      const { data, error } = await backend.auth.getCurrentUser();
      if (error || !data?.user) {
        setProfile(null);
        setSignedIn(false);
        return;
      }
      setSignedIn(true);
      const result = await backend.database
        .from("profiles")
        .select("id,name,role,counter")
        .eq("id", data.user.id)
        .maybeSingle();
      if (result.error) throw result.error;
      setProfile(result.data as Profile | null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh().catch(() => {
      setProfile(null);
      setLoading(false);
    });
  }, []);
  const logout = async () => {
    const { error } = await client().auth.signOut();
    if (error) throw new Error("No se pudo cerrar la sesión. Reintenta.");
    setProfile(null);
    setSignedIn(false);
    cache.clear();
    onSessionEnd?.();
  };
  return (
    <Context.Provider value={{ profile, loading, signedIn, refresh, logout }}>
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider ausente");
  return value;
}
