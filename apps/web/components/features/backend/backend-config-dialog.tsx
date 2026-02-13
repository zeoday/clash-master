"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Server,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  ShieldAlert,
  CheckCircle2,
  Database,
  HardDrive,
  Trash,
  Settings,
  Radio,
  Eye,
  SlidersHorizontal,
  Globe,
  Shield,
  Lock,
  EyeOff,
  Key,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatBytes, formatNumber } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { BackendVerifyAnimation } from "@/components/features/backend/backend-verify-animation";
import { useSettings, FaviconProvider, getFaviconUrl } from "@/lib/settings";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useAuthState, authKeys } from "@/lib/auth-queries";

// Favicon Provider Preview Component
function FaviconProviderPreview({
  selected,
  onChange,
  t,
}: {
  selected: FaviconProvider;
  onChange: (value: FaviconProvider) => void;
  t: (key: string) => string;
}) {
  // Preview domains for the right side (desktop: 4, mobile: 2)
  const previewDomains = [
    "youtube.com",
    "github.com",
    "instagram.com",
    "chatgpt.com",
  ];

  return (
    <RadioGroup
      value={selected}
      onValueChange={(value) => onChange(value as FaviconProvider)}
      className="space-y-3">
      {/* Google Option */}
      <div
        className={cn(
          "flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 rounded-lg border transition-all cursor-pointer",
          selected === "google"
            ? "border-primary bg-primary/5"
            : "border-border hover:bg-muted/50",
        )}
        onClick={() => onChange("google")}>
        {/* Top row: Radio + Icon + Label */}
        <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
          <RadioGroupItem value="google" id="google" className="shrink-0" />

          {/* Provider Icon - Google */}
          <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center overflow-hidden shrink-0">
            <img
              src="https://www.google.com/favicon.ico"
              alt="Google"
              className="w-6 h-6 object-contain"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>

          {/* Label */}
          <Label
            htmlFor="google"
            className="font-medium cursor-pointer flex-1 min-w-0">
            {t("faviconGoogle")}
          </Label>
        </div>

        {/* Preview Icons - Bottom on mobile, Right on desktop */}
        <div className="flex items-center gap-2 pl-7 sm:pl-0">
          {previewDomains.map((domain) => (
            <div
              key={domain}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
              <img
                src={getFaviconUrl(domain, "google")}
                alt={domain}
                className="w-4 h-4 sm:w-5 sm:h-5 object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Favicon.im Option */}
      <div
        className={cn(
          "flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 rounded-lg border transition-all cursor-pointer",
          selected === "faviconim"
            ? "border-primary bg-primary/5"
            : "border-border hover:bg-muted/50",
        )}
        onClick={() => onChange("faviconim")}>
        {/* Top row: Radio + Icon + Label */}
        <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
          <RadioGroupItem
            value="faviconim"
            id="faviconim"
            className="shrink-0"
          />

          {/* Provider Icon - favicon.im */}
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
            <img
              src="https://favicon.im/favicon.im?larger=true"
              alt="favicon.im"
              className="w-6 h-6 object-contain"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>

          {/* Label */}
          <Label
            htmlFor="faviconim"
            className="font-medium cursor-pointer flex-1 min-w-0">
            {t("faviconIm")}
          </Label>
        </div>

        {/* Preview Icons - Bottom on mobile, Right on desktop */}
        <div className="flex items-center gap-2 pl-7 sm:pl-0">
          {previewDomains.map((domain) => (
            <div
              key={domain}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
              <img
                src={getFaviconUrl(domain, "faviconim")}
                alt={domain}
                className="w-4 h-4 sm:w-5 sm:h-5 object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Off Option */}
      <div
        className={cn(
          "flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 rounded-lg border transition-all cursor-pointer",
          selected === "off"
            ? "border-primary bg-primary/5"
            : "border-border hover:bg-muted/50",
        )}
        onClick={() => onChange("off")}>
        {/* Top row: Radio + Icon + Label */}
        <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
          <RadioGroupItem value="off" id="off" className="shrink-0" />

          {/* Provider Icon - Off */}
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
            <Globe className="w-5 h-5 text-muted-foreground" />
          </div>

          {/* Label */}
          <Label
            htmlFor="off"
            className="font-medium cursor-pointer flex-1 min-w-0">
            {t("faviconOff")}
          </Label>
        </div>

        {/* Preview Icons - Default placeholders */}
        <div className="flex items-center gap-2 pl-7 sm:pl-0">
          {previewDomains.map((domain) => (
            <div
              key={domain}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
              <Globe className="w-4 h-4 text-muted-foreground" />
            </div>
          ))}
        </div>
      </div>
    </RadioGroup>
  );
}

interface Backend {
  id: number;
  name: string;
  url: string;
  host: string;
  port: number;
  token: string;
  enabled: boolean;
  is_active: boolean;
  listening: boolean;
  hasToken?: boolean;
  created_at: string;
}

interface BackendConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isFirstTime?: boolean;
  onConfigComplete?: () => void;
  onBackendChange?: () => void;
}

interface DbStats {
  size: number;
  totalConnectionsCount: number;
}

// Retention presets - inspired by AdGuard Home
const RETENTION_PRESETS = [
  { key: "minimal", days: 3 },
  { key: "standard", days: 7 },
  { key: "extended", days: 30 },
  { key: "maximum", days: 90 },
] as const;

type PresetKey = (typeof RETENTION_PRESETS)[number]["key"];

interface RetentionConfig {
  connectionLogsDays: number;
  hourlyStatsDays: number;
  autoCleanup: boolean;
}

// Parse URL to host and port
function parseUrl(url: string): { host: string; port: string; ssl: boolean } {
  try {
    const urlObj = new URL(url);
    return {
      host: decodeURIComponent(urlObj.hostname),
      port: urlObj.port || (urlObj.protocol === "https:" ? "443" : "80"),
      ssl: urlObj.protocol === "https:",
    };
  } catch {
    return { host: "", port: "9090", ssl: false };
  }
}

// Build URL from host, port, ssl
function buildUrl(host: string, port: string, ssl: boolean): string {
  const protocol = ssl ? "https" : "http";
  return `${protocol}://${host}:${port}`;
}

export function BackendConfigDialog({
  open,
  onOpenChange,
  isFirstTime = false,
  onConfigComplete,
  onBackendChange,
}: BackendConfigDialogProps) {
  const t = useTranslations("backend");
  const commonT = useTranslations("common");

  const [backends, setBackends] = useState<Backend[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<
    "backends" | "database" | "preferences" | "security"
  >("backends");
  const { settings, setSettings } = useSettings();
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [clearingLogs, setClearingLogs] = useState(false);

  // Data retention state
  const [retentionConfig, setRetentionConfig] = useState<RetentionConfig>({
    connectionLogsDays: 7,
    hourlyStatsDays: 30,
    autoCleanup: true,
  });
  const [updatingRetention, setUpdatingRetention] = useState(false);

  // Alert Dialog States
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteBackendId, setDeleteBackendId] = useState<number | null>(null);
  const [clearLogsDialogOpen, setClearLogsDialogOpen] = useState(false);
  const [clearLogsDays, setClearLogsDays] = useState<number>(0);
  const [clearBackendDataDialogOpen, setClearBackendDataDialogOpen] =
    useState(false);
  const [clearDataBackendId, setClearDataBackendId] = useState<number | null>(
    null,
  );

  // Error Alert Dialog State
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Success Alert Dialog State


  // React Query Client
  const queryClient = useQueryClient();

  // Auth State from React Query
  const { data: authState } = useAuthState();
  const authEnabled = authState?.enabled ?? false;
  const isShowcase = authState?.showcaseMode ?? false;

  // Local auth form state
  const [authToken, setAuthToken] = useState("");
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [confirmEnableAuthDialogOpen, setConfirmEnableAuthDialogOpen] = useState(false);
  const [confirmDisableAuthDialogOpen, setConfirmDisableAuthDialogOpen] = useState(false);
  const [changeTokenDialogOpen, setChangeTokenDialogOpen] = useState(false);
  const [changeTokenForm, setChangeTokenForm] = useState({
    current: "",
    new: "",
    confirm: "",
  });

  // Verify Animation State
  const [showVerifyAnimation, setShowVerifyAnimation] = useState(false);
  const [verifyPhase, setVerifyPhase] = useState<
    "pending" | "success" | "error"
  >("pending");
  const [verifyMessage, setVerifyMessage] = useState("");
  const [pendingBackend, setPendingBackend] = useState<{
    name: string;
    url: string;
    token: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    host: "",
    port: "9090",
    ssl: false,
    token: "",
  });

  const [editFormData, setEditFormData] = useState({
    name: "",
    host: "",
    port: "9090",
    ssl: false,
    token: "",
  });

  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (open) {
      loadBackends();
      loadDbStats();
      loadRetentionConfig();
    }
  }, [open]);

  const loadBackends = async () => {
    try {
      const data = await api.getBackends();
      // Parse URL to host/port for display
      const parsedData: Backend[] = data.map((b) => {
        const parsed = parseUrl(b.url);
        return { ...b, host: parsed.host, port: parseInt(parsed.port) || 9090 };
      });
      setBackends(parsedData);
    } catch (error) {
      console.error("Failed to load backends:", error);
    }
  };

  const loadDbStats = async () => {
    try {
      const stats = await api.getDbStats();
      setDbStats(stats);
    } catch (error) {
      console.error("Failed to load DB stats:", error);
    }
  };

  const loadRetentionConfig = async () => {
    try {
      const config = await api.getRetentionConfig();
      setRetentionConfig(config);
    } catch (error) {
      console.error("Failed to load retention config:", error);
    }
  };

  const handleUpdateRetention = async (
    key: keyof RetentionConfig,
    value: number | boolean,
  ) => {
    try {
      setUpdatingRetention(true);
      const newConfig = { ...retentionConfig, [key]: value };
      await api.updateRetentionConfig(newConfig);
      setRetentionConfig(newConfig);
      toast.success(t("retentionUpdated"));
    } catch (error: any) {
      toast.error(error.message || t("retentionUpdateFailed"));
    } finally {
      setUpdatingRetention(false);
    }
  };

  // Check which preset matches current config
  const getActivePreset = (): PresetKey | "custom" => {
    const preset = RETENTION_PRESETS.find(
      (p) => p.days === retentionConfig.connectionLogsDays,
    );
    return preset ? preset.key : "custom";
  };

  // Apply preset
  const applyPreset = async (presetKey: PresetKey) => {
    const preset = RETENTION_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;

    try {
      setUpdatingRetention(true);
      const newConfig = {
        connectionLogsDays: preset.days,
        hourlyStatsDays: Math.min(preset.days * 4, 90), // Hourly stats = 4x detail days, max 90
        autoCleanup: true,
      };
      await api.updateRetentionConfig(newConfig);
      setRetentionConfig(newConfig);
      toast.success(t("retentionUpdated"));
    } catch (error: any) {
      toast.error(error.message || t("retentionUpdateFailed"));
    } finally {
      setUpdatingRetention(false);
    }
  };

  // Apply custom days
  const applyCustomDays = async (days: number) => {
    const validDays = Math.max(1, Math.min(30, days));
    try {
      setUpdatingRetention(true);
      const newConfig = {
        connectionLogsDays: validDays,
        hourlyStatsDays: Math.min(validDays * 4, 90),
        autoCleanup: true,
      };
      await api.updateRetentionConfig(newConfig);
      setRetentionConfig(newConfig);
      toast.success(t("retentionUpdated"));
    } catch (error: any) {
      toast.error(error.message || t("retentionUpdateFailed"));
    } finally {
      setUpdatingRetention(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.name || !formData.host) return;

    const url = buildUrl(formData.host, formData.port, formData.ssl);

    // Show verification animation immediately
    setPendingBackend({ name: formData.name, url, token: formData.token });
    setVerifyPhase("pending");
    setVerifyMessage("");
    setShowVerifyAnimation(true);

    // Perform verification
    try {
      const testResult = await api.testBackend(url, formData.token);

      if (testResult.success) {
        setVerifyPhase("success");
        setVerifyMessage(testResult.message || t("testSuccess"));
      } else {
        setVerifyPhase("error");
        setVerifyMessage(testResult.message || t("testFailed"));
      }
    } catch (error: any) {
      setVerifyPhase("error");
      setVerifyMessage(error.message || t("testFailed"));
    }
  };

  // Called after verification animation completes
  const handleVerifyComplete = async () => {
    if (!pendingBackend) return;

    // Only save if verification was successful
    if (verifyPhase === "success") {
      try {
        const result = await api.createBackend({
          name: pendingBackend.name,
          url: pendingBackend.url,
          token: pendingBackend.token,
        });

        setFormData({
          name: "",
          host: "",
          port: "9090",
          ssl: false,
          token: "",
        });
        setShowAddForm(false);
        setShowVerifyAnimation(false);
        setPendingBackend(null);
        await loadBackends();
        await onBackendChange?.();

        // Show success message for first backend
        if (result.isActive) {
          setTestResult({
            success: true,
            message: t("firstBackendAutoActive"),
          });
          setTimeout(() => setTestResult(null), 3000);
        }

        if (isFirstTime && onConfigComplete) {
          await onConfigComplete();
          onOpenChange(false);
        }
      } catch (error: any) {
        setShowVerifyAnimation(false);
        setPendingBackend(null);
        setErrorMessage(error.message || "Failed to create backend");
        setErrorDialogOpen(true);
      }
    } else {
      // Verification failed, just close animation and reset
      setShowVerifyAnimation(false);
      setPendingBackend(null);
    }
  };

  const handleUpdate = async (id: number) => {
    setLoading(true);
    try {
      const url = buildUrl(
        editFormData.host,
        editFormData.port,
        editFormData.ssl,
      );
      await api.updateBackend(id, {
        name: editFormData.name,
        url,
        token: editFormData.token || undefined,
      });
      setEditingId(null);
      setEditFormData({
        name: "",
        host: "",
        port: "9090",
        ssl: false,
        token: "",
      });
      await loadBackends();
      await onBackendChange?.();
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to update backend");
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  // Open delete confirmation dialog
  const openDeleteDialog = (id: number) => {
    setDeleteBackendId(id);
    setDeleteDialogOpen(true);
  };

  // Handle actual delete
  const handleDelete = async () => {
    if (!deleteBackendId) return;

    setLoading(true);
    try {
      await api.deleteBackend(deleteBackendId);
      await loadBackends();
      await onBackendChange?.();
      setDeleteDialogOpen(false);
      setDeleteBackendId(null);
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to delete backend");
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  // Handle set active backend (for display)
  const handleSetActive = async (id: number) => {
    try {
      await api.setActiveBackend(id);
      // Refresh local backend list to update UI (active state, eye icon)
      await loadBackends();
      // Notify parent to refresh dashboard data
      await onBackendChange?.();
      // Show toast notification
      toast.success(t("switchSuccess"));
    } catch (error: any) {
      toast.error(error.message || t("switchFailed"));
    }
  };

  // Handle toggle listening (data collection)
  const handleToggleListening = async (id: number, listening: boolean) => {
    try {
      await api.setBackendListening(id, listening);
      await loadBackends();
      await onBackendChange?.();
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to update listening state");
      setErrorDialogOpen(true);
    }
  };

  // Open clear backend data dialog
  const openClearBackendDataDialog = (id: number) => {
    setClearDataBackendId(id);
    setClearBackendDataDialogOpen(true);
  };

  // Handle clear backend data
  const handleClearBackendData = async () => {
    if (!clearDataBackendId) return;

    setLoading(true);
    try {
      await api.clearBackendData(clearDataBackendId);
      await loadDbStats();
      await onBackendChange?.();
      setClearBackendDataDialogOpen(false);
      setClearDataBackendId(null);
    } catch (error: any) {
      setErrorMessage(
        error.message ||
          t("clearBackendDataError") ||
          "Failed to clear backend data",
      );
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (backend: Backend) => {
    setTestingId(backend.id);
    setTestResult(null);
    try {
      const result = await api.testBackendById(backend.id);
      setTestResult(result);
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.message || "Test failed",
      });
    } finally {
      setTestingId(null);
    }
  };

  // Open clear logs dialog
  const openClearLogsDialog = (days: number) => {
    setClearLogsDays(days);
    setClearLogsDialogOpen(true);
  };

  // Handle actual clear logs
  const handleClearLogs = async () => {
    setClearingLogs(true);
    try {
      await api.clearLogs(clearLogsDays);
      await loadDbStats();
      setClearLogsDialogOpen(false);
      toast.success(t("logsCleared"));
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to clear logs");
      setErrorDialogOpen(true);
    } finally {
      setClearingLogs(false);
    }
  };

  const [isTokenInvalid, setIsTokenInvalid] = useState(false);
  const tokenInputRef = useRef<HTMLInputElement>(null);

  // Validate token format
  const isValidToken = (token: string): boolean => {
    if (token.length < 6) return false;
    const hasLetter = /[a-zA-Z]/.test(token);
    const hasNumber = /[0-9]/.test(token);
    return hasLetter && hasNumber;
  };

  // Handle enable auth
  const handleEnableAuth = async () => {
    if (!isValidToken(authToken)) {
      // toast.error(t("invalidToken"));
      setIsTokenInvalid(true);
      tokenInputRef.current?.focus();
      return;
    }
    setConfirmEnableAuthDialogOpen(true);
  };

  // Confirm enable auth
  const confirmEnableAuth = async () => {
    setAuthLoading(true);
    try {
      await api.enableAuth(authToken);
      setAuthToken("");
      setConfirmEnableAuthDialogOpen(false);
      // Invalidate auth state cache to trigger refetch
      queryClient.invalidateQueries({ queryKey: authKeys.state() });
      toast.success(t("auth.enabledSuccess"));
    } catch (error: any) {
      toast.error(error.message || t("auth.enableFailed"));
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle disable auth
  const handleDisableAuth = async () => {
    setConfirmDisableAuthDialogOpen(true);
  };
  // Confirm disable auth
  const confirmDisableAuth = async () => {
    setAuthLoading(true);
    try {
      // Cookie is used for authentication
      await api.disableAuth();
      setAuthToken("");
      setConfirmDisableAuthDialogOpen(false);
      // Invalidate auth state cache to trigger refetch
      queryClient.invalidateQueries({ queryKey: authKeys.state() });
      toast.success(t("auth.disabledSuccess"));
    } catch (error: any) {
      toast.error(error.message || t("auth.disableFailed"));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleChangeToken = async () => {
    if (!changeTokenForm.new || changeTokenForm.new.length < 6) {
      toast.error(t("auth.invalidToken"));
      return;
    }
    if (changeTokenForm.new !== changeTokenForm.confirm) {
        toast.error(t("auth.passwordsDoNotMatch")); 
        return;
    }

    setAuthLoading(true);
    try {
        const res = await api.updateToken(changeTokenForm.current, changeTokenForm.new);
        if (res.success) {
            setChangeTokenForm({ current: "", new: "", confirm: "" });
            setChangeTokenDialogOpen(false);
            toast.success(t("auth.tokenUpdated"));
        } else {
            throw new Error(res.message || commonT("error"));
        }
    } catch (error: any) {
        setErrorMessage(error.message || t("auth.updateTokenFailed"));
        setErrorDialogOpen(true);
    } finally {
        setAuthLoading(false);
    }
  };

  const startEdit = (backend: Backend) => {
    setEditingId(backend.id);
    setEditFormData({
      name: backend.name,
      host: backend.host,
      port: String(backend.port || 9090),
      ssl: backend.url.startsWith("https"),
      token: "",
    });
    setShowAddForm(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditFormData({
      name: "",
      host: "",
      port: "9090",
      ssl: false,
      token: "",
    });
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onOpenChange(false);
        }}>
        <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              {isFirstTime ? t("firstTimeTitle") : t("title")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {isFirstTime ? t("firstTimeDescription") : t("description")}
            </p>

            {/* Tabs */}
            <div className="flex gap-2 mt-4 flex-wrap">
              <Button
                variant={activeTab === "backends" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("backends")}>
                <Server className="w-4 h-4 mr-2" />
                {t("backendsTab")}
              </Button>
              <Button
                variant={activeTab === "preferences" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("preferences")}>
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                {t("preferencesTab")}
              </Button>
              <Button
                variant={activeTab === "security" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("security")}>
                <Shield className="w-4 h-4 mr-2" />
                {t("securityTab")}
              </Button>
              <Button
                variant={activeTab === "database" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("database")}>
                <Database className="w-4 h-4 mr-2" />
                {t("databaseTab")}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {activeTab === "backends" ? (
              // Backends Tab
              <div className="space-y-3">
                {backends.map((backend) => (
                  <div
                    key={backend.id}
                    className={cn(
                      "p-4 rounded-lg border transition-all",
                      backend.is_active
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card",
                      !backend.enabled && "opacity-60",
                    )}>
                    {editingId === backend.id ? (
                      // Edit Mode
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium">
                              {t("name")}
                            </label>
                            <Input
                              value={editFormData.name}
                              onChange={(e) =>
                                setEditFormData({
                                  ...editFormData,
                                  name: e.target.value,
                                })
                              }
                              placeholder={t("namePlaceholder")}
                              className="h-9 mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium">
                              {t("host")}
                            </label>
                            <Input
                              value={editFormData.host}
                              onChange={(e) =>
                                setEditFormData({
                                  ...editFormData,
                                  host: e.target.value,
                                })
                              }
                              placeholder="192.168.1.1"
                              className="h-9 mt-1"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs font-medium">
                              {t("port")}
                            </label>
                            <Input
                              value={editFormData.port}
                              onChange={(e) =>
                                setEditFormData({
                                  ...editFormData,
                                  port: e.target.value,
                                })
                              }
                              placeholder="9090"
                              className="h-9 mt-1"
                            />
                          </div>
                          <div className="col-span-2 flex items-center gap-2 pt-5">
                            <Switch
                              checked={editFormData.ssl}
                              onCheckedChange={(checked) =>
                                setEditFormData({
                                  ...editFormData,
                                  ssl: checked,
                                })
                              }
                            />
                            <label className="text-sm">{t("useSsl")}</label>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium">
                            {t("token")}
                          </label>
                          <Input
                            type="password"
                            value={editFormData.token}
                            onChange={(e) =>
                              setEditFormData({
                                ...editFormData,
                                token: e.target.value,
                              })
                            }
                            placeholder={
                              backend.hasToken
                                ? t("tokenKeepPlaceholder")
                                : t("tokenPlaceholder")
                            }
                            className="h-9 mt-1"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelEdit}>
                            <X className="w-4 h-4 mr-1" />
                            {commonT("cancel")}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleUpdate(backend.id)}
                            disabled={loading}>
                            <Check className="w-4 h-4 mr-1" />
                            {commonT("save")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // View Mode
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        {/* Left: Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-base">
                              {backend.name}
                            </span>
                            {!backend.enabled && (
                              <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                                {t("disabled")}
                              </span>
                            )}
                          </div>
                          <div
                            className="text-sm text-muted-foreground mt-1 break-all sm:break-normal sm:truncate"
                            title={`${backend.host}:${backend.port}`}>
                            {backend.host}:{backend.port}
                          </div>
                        </div>

                        {/* Right: Actions */}
                        <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-2 shrink-0">
                          {/* Collect Toggle with Label */}
                          <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-secondary/50">
                            <Switch
                              checked={backend.listening}
                              onCheckedChange={(checked) =>
                                handleToggleListening(backend.id, checked)
                              }
                              className="data-[state=checked]:bg-green-500"
                              disabled={isShowcase}
                            />
                            <span className="text-xs text-muted-foreground hidden sm:inline">
                              {t("collect")}
                            </span>
                          </div>

                          {/* Action Buttons Group */}
                          <div className="flex items-center gap-1 pl-0 border-l-0 sm:pl-2 sm:border-l sm:border-border">
                            {/* Set Active Button - Show placeholder when active to maintain layout */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-8 w-8",
                                backend.is_active &&
                                  "opacity-50 cursor-not-allowed",
                              )}
                              onClick={() =>
                                !backend.is_active &&
                                handleSetActive(backend.id)
                              }
                              disabled={backend.is_active}
                              title={
                                backend.is_active
                                  ? t("displaying")
                                  : t("setActive")
                              }>
                              <Eye
                                className={cn(
                                  "w-4 h-4",
                                  backend.is_active && "text-primary",
                                )}
                              />
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleTest(backend)}
                              disabled={testingId === backend.id}
                              title={t("testConnection")}>
                              <RefreshCw
                                className={cn(
                                  "w-4 h-4",
                                  testingId === backend.id && "animate-spin",
                                )}
                              />
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => startEdit(backend)}
                              title={commonT("edit")}
                              disabled={isShowcase}>
                              <Edit2 className="w-4 h-4" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => openDeleteDialog(backend.id)}
                              title={commonT("delete")}
                              disabled={isShowcase}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Test Result */}
                {testResult && (
                  <div
                    className={cn(
                      "p-3 rounded-lg flex items-center gap-2 text-sm",
                      testResult.success
                        ? "bg-green-500/10 text-green-600 border border-green-500/20"
                        : "bg-destructive/10 text-destructive border border-destructive/20",
                    )}>
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    {testResult.message}
                  </div>
                )}

                {/* Add New Backend */}
                {showAddForm || (isFirstTime && backends.length === 0) ? (
                  <div className="p-4 rounded-lg border border-dashed border-border bg-muted/50">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      {backends.length === 0 && isFirstTime
                        ? t("firstTimeTitle")
                        : t("addNew")}
                    </h4>
                    {isShowcase ? (
                      <div className="text-sm text-muted-foreground italic">
                        {t("showcaseModeAddDisabled") || "Adding backends is disabled in showcase mode"}
                      </div>
                    ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium">
                            {t("name")} *
                          </label>
                          <Input
                            value={formData.name}
                            onChange={(e) =>
                              setFormData({ ...formData, name: e.target.value })
                            }
                            placeholder={t("namePlaceholder")}
                            className="h-9 mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium">
                            {t("host")} *
                          </label>
                          <Input
                            value={formData.host}
                            onChange={(e) =>
                              setFormData({ ...formData, host: e.target.value })
                            }
                            placeholder="192.168.1.1"
                            className="h-9 mt-1"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs font-medium">
                            {t("port")}
                          </label>
                          <Input
                            value={formData.port}
                            onChange={(e) =>
                              setFormData({ ...formData, port: e.target.value })
                            }
                            placeholder="9090"
                            className="h-9 mt-1"
                          />
                        </div>
                        <div className="col-span-2 flex items-center gap-2 pt-5">
                          <Switch
                            checked={formData.ssl}
                            onCheckedChange={(checked) =>
                              setFormData({ ...formData, ssl: checked })
                            }
                          />
                          <label className="text-sm">{t("useSsl")}</label>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium">
                          {t("token")}
                        </label>
                        <Input
                          type="password"
                          value={formData.token}
                          onChange={(e) =>
                            setFormData({ ...formData, token: e.target.value })
                          }
                          placeholder={t("tokenPlaceholder")}
                          className="h-9 mt-1"
                        />
                      </div>
                      <div className="flex gap-2">
                        {backends.length > 0 && (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setShowAddForm(false);
                              setFormData({
                                name: "",
                                host: "",
                                port: "9090",
                                ssl: false,
                                token: "",
                              });
                            }}
                            className="flex-shrink-0">
                            <X className="w-4 h-4 mr-2" />
                            {commonT("cancel")}
                          </Button>
                        )}
                        <Button
                          onClick={handleAdd}
                          disabled={loading || !formData.name || !formData.host}
                          className="flex-1">
                          <Plus className="w-4 h-4 mr-2" />
                          {isFirstTime && backends.length === 0
                            ? t("saveAndContinue")
                            : t("addBackend")}
                        </Button>
                      </div>
                    </div>
                    )}
                  </div>
                ) : backends.length > 0 ? (
                  !isShowcase && (
                  <Button
                    variant="outline"
                    className="w-full border-dashed"
                    onClick={() => {
                      cancelEdit();
                      setShowAddForm(true);
                    }}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t("addNew")}
                  </Button>
                  )
                ) : null}
              </div>
            ) : activeTab === "preferences" ? (
              <div className="space-y-6">
                {/* Favicon Provider */}
                <div className="p-4 rounded-lg border bg-card">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    {t("faviconProvider")}
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t("faviconProviderDescription")}
                  </p>

                  {/* Favicon Preview */}
                  <FaviconProviderPreview
                    selected={settings.faviconProvider}
                    onChange={(value) =>
                      setSettings({ faviconProvider: value })
                    }
                    t={t}
                  />
                </div>
              </div>
            ) : activeTab === "security" ? (
              <div className="space-y-6">
                {authState?.forceAccessControlOff && (
                  <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive dark:bg-destructive/10">
                    <div className="flex items-center gap-2 font-medium">
                      <ShieldAlert className="h-4 w-4" />
                      {t("auth.forceOffWarningTitle") || "Emergency Access Mode Active"}
                    </div>
                    <p className="mt-1 ml-6 text-xs opacity-90">
                      {t("auth.forceOffWarningDescription") || "Authentication is forced off via environment variable. You can reset your password without providing the current one."}
                    </p>
                  </div>
                )}

                {/* Authentication Settings */}
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      <h4 className="text-sm font-medium">{t("auth.title")}</h4>
                    </div>
                    <Switch
                      checked={authEnabled}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          handleEnableAuth();
                        } else {
                          handleDisableAuth();
                        }
                       }}
                       disabled={authLoading || isShowcase}
                    />
                  </div>

                  <p className="text-sm text-muted-foreground mb-4">
                    {t("auth.description")}
                  </p>

                  {/* Show set password UI when auth is disabled OR forced off */}
                  {(!authEnabled || (authState?.forceAccessControlOff && !authEnabled)) && (
                    <div className="space-y-3">
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          ref={tokenInputRef}
                          type={showAuthToken ? "text" : "password"}
                          placeholder={t("auth.tokenPlaceholder")}
                          value={authToken}
                          onChange={(e) => {
                            setAuthToken(e.target.value);
                            setIsTokenInvalid(false);
                          }}
                          className={cn(
                            "pl-10 pr-10 transition-all duration-200",
                            isTokenInvalid && "border-destructive ring-destructive/20 focus-visible:ring-destructive"
                          )}
                          disabled={authLoading || isShowcase}
                        />
                        <button
                          type="button"
                          onClick={() => setShowAuthToken(!showAuthToken)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showAuthToken ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {isTokenInvalid && (
                        <p className="text-xs text-destructive animate-in slide-in-from-top-1 duration-200">
                          {t("auth.tokenRequirements") || "Token must be at least 6 characters and contain both letters and numbers"}
                        </p>
                      )}

                      {!isTokenInvalid && authToken && !isValidToken(authToken) && (
                        <p className="text-xs text-destructive">
                          {t("auth.tokenRequirements")}
                        </p>
                      )}

                      <p className="text-xs text-muted-foreground">
                        {t("auth.tokenHint")}
                      </p>
                    </div>
                  )}

                  {authEnabled && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{t("auth.enabled")}</span>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 bg-background/50 hover:bg-background/80 border-green-500/30 text-green-700 dark:text-green-400"
                        onClick={() => setChangeTokenDialogOpen(true)}
                        disabled={isShowcase}
                      >
                        <Key className="w-3.5 h-3.5 mr-1.5" />
                        {authState?.forceAccessControlOff ? "Reset Password" : t("auth.changeToken")}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Warning when auth is enabled */}
                {authEnabled && !authState?.forceAccessControlOff && (
                  <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
                      <div className="text-sm text-amber-800 dark:text-amber-200">
                        <p className="font-medium">{t("auth.warningTitle")}</p>
                        <p className="mt-1">{t("auth.warningDescription")}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : activeTab === "database" ? (
              // Database Tab
              <div className="space-y-6">
                {/* DB Stats */}
                <div className="p-4 rounded-lg border bg-card">
                  <h4 className="text-sm font-medium mb-4 flex items-center gap-2">
                    <HardDrive className="w-4 h-4" />
                    {t("databaseStats")}
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-muted flex flex-col justify-between h-full">
                      <div className="text-xs text-muted-foreground mb-1">
                        {t("dbSize")}
                      </div>
                      <div className="text-lg font-semibold">
                        {dbStats ? formatBytes(dbStats.size) : "--"}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted flex flex-col justify-between h-full">
                      <div className="text-xs text-muted-foreground mb-1">
                        {t("connectionsCount")}
                      </div>
                      <div className="text-lg font-semibold">
                        {dbStats
                          ? formatNumber(dbStats.totalConnectionsCount)
                          : "--"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Data Retention Settings */}
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Database className="w-4 h-4" />
                      {t("dataRetention")}
                    </h4>
                    <span className="text-sm text-muted-foreground">
                      {t("retentionDays", {
                        days: retentionConfig.connectionLogsDays,
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    {t("dataRetentionDescription")}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {/* Preset Buttons */}
                    {RETENTION_PRESETS.map((preset) => {
                      const isActive = getActivePreset() === preset.key;
                      return (
                        <button
                          key={preset.key}
                          onClick={() => applyPreset(preset.key)}
                          disabled={updatingRetention || isShowcase}
                          className={cn(
                            "px-3 py-1.5 text-sm rounded-md border transition-all",
                            isActive
                              ? "border-primary bg-primary/10 text-primary font-medium"
                              : "border-border hover:bg-muted/50 text-muted-foreground",
                          )}
                          title={t(
                            `retentionPreset${preset.key.charAt(0).toUpperCase() + preset.key.slice(1)}Desc`,
                          )}>
                          {t(
                            `retentionPreset${preset.key.charAt(0).toUpperCase() + preset.key.slice(1)}`,
                          )}
                        </button>
                      );
                    })}

                    {/* Custom Input */}
                    <div
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all",
                        getActivePreset() === "custom"
                          ? "border-primary bg-primary/10"
                          : "border-border",
                      )}>
                      <Input
                        type="number"
                        min={1}
                        max={90}
                        value={retentionConfig.connectionLogsDays}
                        onChange={(e) => {
                          const days = parseInt(e.target.value) || 1;
                          applyCustomDays(Math.min(90, Math.max(1, days)));
                        }}
                        disabled={updatingRetention || isShowcase}
                        className="w-14 h-6 text-sm text-center p-0 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                      <span className="text-xs text-muted-foreground">
                        {commonT("days")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Clear Logs - Dangerous action, placed at the bottom */}
                <div className="p-4 rounded-lg border ">
                  <h4 className="text-sm font-medium mb-4 flex items-center gap-2 text-destructive">
                    <Trash className="w-4 h-4" />
                    {t("clearLogs")}
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t("clearLogsDescription")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openClearLogsDialog(1)}
                      disabled={clearingLogs || isShowcase}>
                      {t("clear1Day")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openClearLogsDialog(7)}
                      disabled={clearingLogs || isShowcase}>
                      {t("clear7Days")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openClearLogsDialog(30)}
                      disabled={clearingLogs || isShowcase}>
                      {t("clear30Days")}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => openClearLogsDialog(0)}
                      disabled={clearingLogs || isShowcase}>
                      {t("clearAll")}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Close button for non-first-time */}
            {!isFirstTime && (
              <div className="flex justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  {commonT("close")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteBackendId(null)}>
              {commonT("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {commonT("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Logs Confirmation Dialog */}
      <AlertDialog
        open={clearLogsDialogOpen}
        onOpenChange={setClearLogsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("clearLogs")}</AlertDialogTitle>
            <AlertDialogDescription>
              {clearLogsDays === 0
                ? t("confirmClearAllLogs")
                : t("confirmClearLogs", { days: clearLogsDays })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{commonT("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearLogs}
              className={
                clearLogsDays === 0
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }>
              {commonT("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Error Alert Dialog */}
      <AlertDialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              {commonT("error") || "Error"}
            </AlertDialogTitle>
            <AlertDialogDescription>{errorMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setErrorDialogOpen(false)}>
              {commonT("ok") || "OK"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



      {/* Confirm Enable Auth Dialog */}
      <AlertDialog
        open={confirmEnableAuthDialogOpen}
        onOpenChange={setConfirmEnableAuthDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-500" />
              {authState?.forceAccessControlOff 
                ? t("auth.emergencyResetTitle")
                : t("auth.confirmEnableTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild className="space-y-2">
              <div className="text-sm text-muted-foreground">
                <p>
                  {authState?.forceAccessControlOff
                    ? t("auth.emergencyResetDescription")
                    : t("auth.confirmEnableDescription")}
                </p>
                <p className="font-medium text-amber-600 dark:text-amber-400">
                  {authState?.forceAccessControlOff
                    ? t("auth.emergencyResetWarning")
                    : t("auth.rememberTokenWarning")}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setConfirmEnableAuthDialogOpen(false)}>
              {commonT("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmEnableAuth}
              className="bg-primary">
              {authState?.forceAccessControlOff ? t("auth.changeToken") : t("auth.confirmEnable")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Disable Auth Dialog */}
      <AlertDialog
        open={confirmDisableAuthDialogOpen}
        onOpenChange={setConfirmDisableAuthDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-destructive" />
              {t("auth.confirmDisableTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("auth.confirmDisableDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setConfirmDisableAuthDialogOpen(false)}>
              {commonT("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDisableAuth}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("auth.confirmDisable")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Token Dialog */}
      <Dialog open={changeTokenDialogOpen} onOpenChange={setChangeTokenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("auth.changeTokenTitle")}</DialogTitle>
            <DialogDescription>
              {t("auth.changeTokenDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!authState?.forceAccessControlOff && (
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("auth.currentToken")}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="password"
                    value={changeTokenForm.current}
                    onChange={(e) => setChangeTokenForm({ ...changeTokenForm, current: e.target.value })}
                    className="pl-9"
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("auth.newToken")}</label>
              <div className="relative">
                <Key className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  type="password"
                  value={changeTokenForm.new}
                  onChange={(e) => setChangeTokenForm({ ...changeTokenForm, new: e.target.value })}
                  className="pl-9"
                />
              </div>
              {changeTokenForm.new && !isValidToken(changeTokenForm.new) && (
                <p className="text-xs text-destructive">{t("auth.tokenRequirements")}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("auth.confirmNewToken")}</label>
              <div className="relative">
                <Key className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  type="password"
                  value={changeTokenForm.confirm}
                  onChange={(e) => setChangeTokenForm({ ...changeTokenForm, confirm: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeTokenDialogOpen(false)}>
              {commonT("cancel")}
            </Button>
            <Button 
                onClick={handleChangeToken} 
                disabled={authLoading || (!authState?.forceAccessControlOff && !changeTokenForm.current) || !changeTokenForm.new || !isValidToken(changeTokenForm.new)}
            >
              {commonT("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verification Animation */}
      <BackendVerifyAnimation
        show={showVerifyAnimation}
        phase={verifyPhase}
        backendName={pendingBackend?.name}
        message={verifyMessage}
        onComplete={handleVerifyComplete}
      />
    </>
  );
}
