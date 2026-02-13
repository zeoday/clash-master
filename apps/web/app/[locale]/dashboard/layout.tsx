"use client";

import { ReactNode, useEffect } from "react";
import { authKeys } from "@/lib/auth-queries";
import { useRequireAuth, useAuth } from "@/lib/auth";
import { LoginDialog } from "@/components/features/auth";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = useTranslations("auth");
  const queryClient = useQueryClient();
  const { showLogin, isLoading, authEnabled, error } = useRequireAuth();
  const { login, confirmLogin } = useAuth();
  
  // ...

  const handleLogin = async (token: string): Promise<boolean> => {
    try {
      // Don't update state immediately to allow success animation to play
      const success = await login(token, false);
      
      if (success) {
        // Wait for animation to finish (2.5s matches LoginDialog animation)
        setTimeout(() => {
          confirmLogin();
          // Invalidate auth state to trigger re-check
          queryClient.invalidateQueries({ queryKey: authKeys.state() });
        }, 2500);
        return true;
      } else {
        toast.error(t("invalidToken"));
        return false;
      }
    } catch (error) {
      toast.error(t("invalidToken"));
      return false;
    }
  };

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-muted-foreground">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <LoginDialog
        open={showLogin}
        onOpenChange={(open) => {
          // Prevent closing the dialog when auth is required
          if (!open && showLogin) {
            return;
          }
        }}
        onLogin={handleLogin}
      />
    </>
  );
}
