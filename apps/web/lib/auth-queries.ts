"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { AuthState } from "@neko-master/shared";

const AUTH_TOKEN_KEY = "neko-master-auth-token";

// API functions
async function fetchAuthState(): Promise<AuthState> {
  const response = await fetch("/api/auth/state");
  if (!response.ok) {
    throw new Error("Failed to fetch auth state");
  }
  return response.json();
}

async function verifyToken(token: string): Promise<boolean> {
  const response = await fetch("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    return false;
  }
  const result = await response.json();
  return result.valid;
}

// Storage helpers
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function storeToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function removeToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const token = getStoredToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

// Query keys
export const authKeys = {
  all: ["auth"] as const,
  state: () => [...authKeys.all, "state"] as const,
};

// React Query hooks
export function useAuthState() {
  return useQuery({
    queryKey: authKeys.state(),
    queryFn: fetchAuthState,
    // Don't set initialData - let it load from server
    // If error occurs, we need to know about it
    retry: (failureCount, error) => {
      // Don't retry on 401/403
      if ((error as any)?.status === 401 || (error as any)?.message?.includes('401')) return false;
      return failureCount < 3;
    },
    // Refetch on window focus to keep auth state in sync
    refetchOnWindowFocus: true,
    // Refetch when reconnecting
    refetchOnReconnect: true,
    // Stale time - consider data fresh for 5 minutes
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (token: string) => {
      const isValid = await verifyToken(token);
      if (!isValid) {
        throw new Error("Invalid token");
      }
      storeToken(token);
      return true;
    },
    onSuccess: () => {
      // Invalidate auth state to trigger a refetch
      queryClient.invalidateQueries({ queryKey: authKeys.state() });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    removeToken();
    // Invalidate and refetch auth state
    queryClient.invalidateQueries({ queryKey: authKeys.state() });
  }, [queryClient]);
}

// Hook to check if user is authenticated
export function useIsAuthenticated() {
  const { data: authState, isLoading, error } = useAuthState();
  const token = getStoredToken();

  // If still loading, return loading state
  if (isLoading) {
    return { isAuthenticated: false, isLoading: true };
  }

  // If error occurred (e.g., 401), check if it's an auth error
  // If the error is 401, it means auth is enabled but we don't have valid token
  if (error) {
    // Check if it's a 401 error
    const isAuthError = (error as any)?.message?.includes("401") || 
                        (error as any)?.status === 401;
    
    if (isAuthError) {
      // Auth is enabled but we need to login
      return { isAuthenticated: !!token, isLoading: false };
    }
    
    // Other errors, assume no auth required to prevent lockout
    return { isAuthenticated: true, isLoading: false };
  }

  // If auth is not enabled, user is authenticated
  if (!authState?.enabled) {
    return { isAuthenticated: true, isLoading: false };
  }

  // Auth is enabled, check if we have a token
  // The token will be verified by the API on each request
  return { isAuthenticated: !!token, isLoading: false };
}

// Hook to determine if login dialog should be shown
export function useRequireAuth() {
  const { data: authState, isLoading, error } = useAuthState();
  const { isAuthenticated } = useIsAuthenticated();
  const token = getStoredToken();

  // Check if error is 401 (auth required)
  const isAuthError = error && (
    (error as any)?.message?.includes("401") || 
    (error as any)?.status === 401
  );

  // If we got 401 on auth state check, auth is definitely enabled
  const authEnabled = authState?.enabled || isAuthError;

  // Show login if:
  // 1. Not loading
  // 2. Auth is enabled (from state or from 401 error)
  // 3. User is not authenticated (no valid token)
  const showLogin = !isLoading && authEnabled && !isAuthenticated && !token;

  return {
    showLogin,
    isLoading: isLoading || (!authState && !error), // Still loading if no data and no error
    authEnabled,
    error,
  };
}
