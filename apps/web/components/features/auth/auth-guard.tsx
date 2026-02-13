"use client";

import { useRequireAuth, useAuth } from "@/lib/auth";
import { LoginDialog } from "./login-dialog";

export function AuthGuard() {
  const { showLogin } = useRequireAuth();
  const { login, confirmLogin } = useAuth();
  
  const handleLogin = async (token: string) => {
    const success = await login(token, false);
    if (success) {
      setTimeout(() => {
        confirmLogin();
      }, 2500);
      return true;
    }
    return false;
  };

  if (!showLogin) return null;

  return (
    <LoginDialog 
      open={true} 
      onOpenChange={() => {}} 
      onLogin={handleLogin}
    />
  );
}
