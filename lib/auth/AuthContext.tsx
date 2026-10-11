"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { SafeUser } from "@/lib/db/schema";
import { deriveAccountCodeSync } from "@/lib/storage/account";
import { localWorkspaceManager, type AccountWorkspace } from "@/lib/storage/workspace";

export type AuthContextValue = {
  user: SafeUser | null;
  accountCode: string | null;
  workspace: AccountWorkspace | null;
  features: Record<string, boolean>;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  hasFeature: (toolId: string) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialUser = null,
  initialFeatures = {},
}: {
  children: ReactNode;
  initialUser?: SafeUser | null;
  initialFeatures?: Record<string, boolean>;
}) {
  const [user, setUser] = useState<SafeUser | null>(initialUser);
  const [accountCode, setAccountCode] = useState<string | null>(() => {
    return initialUser ? deriveAccountCodeSync(initialUser.id, initialUser.email) : null;
  });
  const [workspace, setWorkspace] = useState<AccountWorkspace | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>(initialFeatures);
  const [loading, setLoading] = useState<boolean>(!initialUser && Object.keys(initialFeatures).length === 0);

  // Initialize and open local workspace (authenticated or local device guest)
  useEffect(() => {
    const userId = user ? user.id : "local-device";
    const email = user ? user.email : "device@local.storage";
    const code = deriveAccountCodeSync(userId, email);
    setAccountCode(code);
    let active = true;
    void localWorkspaceManager.openWorkspace(code, userId, email).then((ws) => {
      if (active) setWorkspace(ws);
    });

    // Request persistent storage from browser so OPFS/IndexedDB is never purged
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      void navigator.storage.persist().catch(() => null);
    }

    return () => {
      active = false;
    };
  }, [user]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setFeatures(data.features || {});
      } else {
        setUser(null);
      }
    } catch {
      // keep fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialUser !== undefined) {
      setUser(initialUser);
    }
  }, [initialUser]);

  useEffect(() => {
    void refresh();
    const handleFocus = () => void refresh();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      await localWorkspaceManager.closeActiveWorkspace();
      setUser(null);
      setAccountCode(null);
      setWorkspace(null);
      void refresh();
      window.location.href = "/";
    }
  }, [refresh]);

  const hasFeature = useCallback(
    (toolId: string) => {
      // If feature isn't explicitly defined, default to true
      if (features[toolId] === undefined) return true;
      return features[toolId];
    },
    [features]
  );

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        accountCode,
        workspace,
        features,
        loading,
        isAdmin,
        isSuperAdmin,
        hasFeature,
        refresh,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      user: null,
      accountCode: null,
      workspace: null,
      features: {},
      loading: false,
      isAdmin: false,
      isSuperAdmin: false,
      hasFeature: () => true,
      refresh: async () => {},
      logout: async () => {},
    };
  }
  return ctx;
}

