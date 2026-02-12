"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authKeys } from "./auth-queries";

import type { AuthState } from "@neko-master/shared";

interface AuthContextType {
  isAuthenticated: boolean;
  authState: AuthState | null;
  isLoading: boolean;
  login: (token: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_TOKEN_KEY = "neko-master-auth-token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  // Get stored token
  const getStoredToken = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(AUTH_TOKEN_KEY);
  }, []);

  // Store token
  const storeToken = useCallback((token: string) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  }, []);

  // Remove token
  const removeToken = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }, []);

  // Check auth state from server
  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/state");
      if (!response.ok) {
        // If we can't reach the server, assume no auth required
        setAuthState({ enabled: false, hasToken: false });
        setIsAuthenticated(true);
        return;
      }

      const state: AuthState = await response.json();
      setAuthState(state);

      if (!state.enabled) {
        // Auth is not enabled, user is automatically authenticated
        setIsAuthenticated(true);
        return;
      }

      // Auth is enabled, check if we have a valid token
      const token = getStoredToken();
      if (token) {
        // Verify token with server
        const verifyResponse = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (verifyResponse.ok) {
          const verifyResult = await verifyResponse.json();
          if (verifyResult.valid) {
            setIsAuthenticated(true);
            return;
          }
        }
        // Token is invalid, remove it
        removeToken();
      }

      setIsAuthenticated(false);
    } catch (error) {
      console.error("Failed to check auth state:", error);
      // On error, assume no auth required to prevent lockout
      setAuthState({ enabled: false, hasToken: false });
      setIsAuthenticated(true);
    } finally {
      setIsLoading(false);
    }
  }, [getStoredToken, removeToken]);

  // Login with token
  const login = useCallback(
    async (token: string): Promise<boolean> => {
      try {
        const response = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!response.ok) {
          return false;
        }

        const result = await response.json();
        if (result.valid) {
          storeToken(token);
          setIsAuthenticated(true);
          return true;
        }

        return false;
      } catch (error) {
        console.error("Login failed:", error);
        return false;
      }
    },
    [storeToken]
  );

  // Logout
  const logout = useCallback(() => {
    // Only reload if we actually had a token to clear
    // This prevents infinite reload loops on 401 errors when already logged out
    const hadToken = !!localStorage.getItem(AUTH_TOKEN_KEY);
    
    removeToken();
    setIsAuthenticated(false);
    
    if (hadToken) {
      // Force reload to ensure clean state and restart of correct components
      window.location.reload();
    }
  }, [removeToken]);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Listen for storage changes (for multi-tab support)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === AUTH_TOKEN_KEY) {
        if (e.newValue === null) {
          // Token was removed in another tab
          setIsAuthenticated(false);
        } else {
          // Token was added/changed in another tab
          checkAuth();
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [checkAuth]);

  // Listen for unauthorized events from API
  useEffect(() => {
    const handleUnauthorized = () => {
      // Clear local state
      logout();
      // Invalidate queries to ensure fresh state across the app
      queryClient.invalidateQueries({ queryKey: authKeys.state() });
    };

    window.addEventListener("api:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("api:unauthorized", handleUnauthorized);
    };
  }, [logout, queryClient]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        authState,
        isLoading,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Helper function to get auth headers for API requests
export function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}
