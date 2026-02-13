"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { api, getPresetTimeRange, type TimeRange } from "@/lib/api";
import type {
  BackendStatus,
  TabId,
  TimePreset,
} from "@/lib/types/dashboard";
import {
  getCountriesQueryKey,
  getDevicesQueryKey,
  getSummaryQueryKey,
} from "@/lib/stats-query-keys";
import { useStableTimeRange } from "@/lib/hooks/use-stable-time-range";
import { useStatsWebSocket } from "@/lib/websocket";
import { useRequireAuth } from "@/lib/auth";
import type {
  StatsSummary,
  CountryStats,
} from "@neko-master/shared";

export type { BackendStatus, TabId, TimePreset };

type RollingTimePreset = Exclude<TimePreset, "custom">;

const SUMMARY_WS_MIN_PUSH_MS = 3000;

function isRollingTimePreset(preset: TimePreset): preset is RollingTimePreset {
  return preset !== "custom";
}

export interface UseDashboardReturn {
  // State
  activeTab: TabId;
  timeRange: TimeRange;
  timePreset: TimePreset;
  autoRefresh: boolean;
  isManualRefreshing: boolean;
  showBackendDialog: boolean;
  showAboutDialog: boolean;
  isFirstTime: boolean;
  autoRefreshTick: number;

  // Data
  data: StatsSummary | null;
  countryData: CountryStats[];
  backends: Awaited<ReturnType<typeof api.getBackends>>;
  activeBackend: Awaited<ReturnType<typeof api.getBackends>>[0] | null;
  listeningBackends: Awaited<ReturnType<typeof api.getBackends>>;
  activeBackendId: number | undefined;
  backendStatus: BackendStatus;
  backendStatusHint: string | null;
  queryError: string | null;
  wsConnected: boolean;
  wsRealtimeActive: boolean;
  isLoading: boolean;
  isTransitioning: boolean;

  // Actions
  setActiveTab: (tab: TabId) => void;
  setAutoRefresh: (value: boolean | ((prev: boolean) => boolean)) => void;
  setShowBackendDialog: (value: boolean) => void;
  setShowAboutDialog: (value: boolean) => void;
  handleTimeRangeChange: (range: TimeRange, preset: TimePreset) => void;
  handleSwitchBackend: (backendId: number) => Promise<void>;
  handleBackendChange: () => Promise<void>;
  refreshNow: (showLoading?: boolean) => Promise<void>;

  // Theme
  theme: string | undefined;
  setTheme: (theme: string) => void;

  // Locale/Router
  locale: string;
  router: ReturnType<typeof useRouter>;
  pathname: string;

  // Translations
  t: ReturnType<typeof useTranslations>;
  dashboardT: ReturnType<typeof useTranslations>;
  backendT: ReturnType<typeof useTranslations>;
}

export function useDashboard(): UseDashboardReturn {
  const t = useTranslations("nav");
  const dashboardT = useTranslations("dashboard");
  const backendT = useTranslations("backend");
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();

  // Get locale from pathname (e.g., /en/dashboard -> en)
  const locale = useMemo(() => {
    const match = pathname.match(/^\/([^/]+)/);
    return match ? match[1] : "en";
  }, [pathname]);

  // UI State
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [timeRange, setTimeRange] = useState<TimeRange>(getPresetTimeRange("24h"));
  const [timePreset, setTimePreset] = useState<TimePreset>("24h");
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoRefreshTick, setAutoRefreshTick] = useState(0);
  const [showBackendDialog, setShowBackendDialog] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);

  const stableTimeRange = useStableTimeRange(timeRange);
  const isWsSummaryTab = activeTab === "overview" || activeTab === "countries";
  
  // Auth check
  const { showLogin, isLoading: isAuthLoading } = useRequireAuth();
  const shouldFetch = !showLogin && !isAuthLoading;

  // Backends Query
  const backendsQuery = useQuery({
    queryKey: ["backends"],
    queryFn: () => api.getBackends(),
    refetchInterval: autoRefresh ? 5000 : false,
    refetchIntervalInBackground: true,
    enabled: shouldFetch,
  });

  const backends = backendsQuery.data ?? [];
  const activeBackend = useMemo(
    () => backends.find((backend) => backend.is_active) || backends[0] || null,
    [backends]
  );
  const listeningBackends = useMemo(
    () => backends.filter((backend) => backend.listening),
    [backends]
  );
  const activeBackendId = activeBackend?.id;

  // WebSocket
  const wsEnabled = autoRefresh && isWsSummaryTab && !!activeBackendId;
  const { status: wsStatus, lastMessage: wsSummary } = useStatsWebSocket({
    backendId: activeBackendId,
    range: stableTimeRange,
    minPushIntervalMs: SUMMARY_WS_MIN_PUSH_MS,
    enabled: wsEnabled,
    onMessage: useCallback(
      (stats: StatsSummary) => {
        if (!activeBackendId) return;
        setAutoRefreshTick((tick) => tick + 1);
        queryClient.setQueryData(
          getSummaryQueryKey(activeBackendId, stableTimeRange),
          (previous) => ({
            ...(typeof previous === "object" && previous ? previous : {}),
            ...stats,
          })
        );
        if (stats.countryStats) {
          queryClient.setQueryData(
            getCountriesQueryKey(activeBackendId, 50, stableTimeRange),
            stats.countryStats
          );
        }
        if (stats.deviceStats) {
          queryClient.setQueryData(
            getDevicesQueryKey(activeBackendId, 50, stableTimeRange),
            stats.deviceStats
          );
        }
      },
      [activeBackendId, queryClient, stableTimeRange]
    ),
  });

  const wsConnected = wsStatus === "connected";
  const wsRealtimeActive = wsEnabled && wsConnected;
  const shouldReducePolling = wsRealtimeActive;
  const hasWsCountries =
    wsRealtimeActive &&
    !!wsSummary?.countryStats &&
    (activeTab === "overview" || activeTab === "countries");

  const needsCountries = activeTab === "overview" || activeTab === "countries";

  // Stats Queries
  const summaryQuery = useQuery({
    queryKey: getSummaryQueryKey(activeBackendId, stableTimeRange),
    queryFn: () => api.getSummary(activeBackendId, stableTimeRange),
    enabled: !!activeBackendId && !(wsEnabled && wsConnected),
    placeholderData: keepPreviousData,
  });

  const countriesQuery = useQuery({
    queryKey: getCountriesQueryKey(activeBackendId, 50, stableTimeRange),
    queryFn: () => api.getCountries(activeBackendId, 50, stableTimeRange),
    enabled: !!activeBackendId && needsCountries && !hasWsCountries,
    placeholderData: keepPreviousData,
  });

  const data: StatsSummary | null =
    (wsEnabled && wsConnected && wsSummary) || summaryQuery.data || null;
  const countryData: CountryStats[] =
    (hasWsCountries ? wsSummary?.countryStats : countriesQuery.data) ?? [];

  // Errors
  const summaryError = useMemo(() => {
    if (!summaryQuery.error) return null;
    return summaryQuery.error instanceof Error
      ? summaryQuery.error.message
      : "Unknown error";
  }, [summaryQuery.error]);
  const effectiveSummaryError = wsEnabled && wsConnected ? null : summaryError;

  const countriesError = useMemo(() => {
    if (!countriesQuery.error) return null;
    return countriesQuery.error instanceof Error
      ? countriesQuery.error.message
      : "Unknown error";
  }, [countriesQuery.error]);
  const effectiveCountriesError = hasWsCountries ? null : countriesError;

  const queryError = effectiveSummaryError ?? effectiveCountriesError;

  // Backend Status
  const backendStatus: BackendStatus = useMemo(() => {
    if (!activeBackend) return "unknown";
    if (effectiveSummaryError) return "unhealthy";
    if (activeBackend.listening) return "healthy";
    return "unhealthy";
  }, [activeBackend, effectiveSummaryError]);

  const backendStatusHint = useMemo(() => {
    if (effectiveSummaryError) return effectiveSummaryError;
    if (activeBackend && !activeBackend.listening)
      return dashboardT("backendUnavailableHint");
    return null;
  }, [effectiveSummaryError, activeBackend, dashboardT]);

  // Actions
  const refreshNow = useCallback(
    async (showLoading = false) => {
      if (showLoading) {
        setIsManualRefreshing(true);
      }
      try {
        if (isRollingTimePreset(timePreset)) {
          setTimeRange(getPresetTimeRange(timePreset));
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["stats"] }),
          queryClient.invalidateQueries({ queryKey: ["backends"] }),
        ]);
      } finally {
        if (showLoading) {
          setIsManualRefreshing(false);
        }
      }
    },
    [queryClient, timePreset]
  );

  const handleTimeRangeChange = useCallback(
    (range: TimeRange, preset: TimePreset) => {
      setTimePreset(preset);
      setTimeRange(range);
    },
    []
  );

  const handleSwitchBackend = useCallback(
    async (backendId: number) => {
      try {
        await api.setActiveBackend(backendId);
        await backendsQuery.refetch();
        await refreshNow(true);
      } catch (err) {
        console.error("Failed to switch backend:", err);
      }
    },
    [backendsQuery.refetch, refreshNow]
  );

  const handleBackendChange = useCallback(async () => {
    await backendsQuery.refetch();
    await refreshNow(true);
  }, [backendsQuery.refetch, refreshNow]);

  // Effects

  // Open setup dialog automatically when no backend is configured
  useEffect(() => {
    // Don't open backend dialog if we need to login
    if (showLogin) return;
    
    if (backendsQuery.isError) return;
    // Strictly check if data is present to avoid "empty" state during initial loading/idle
    if (!backendsQuery.data && !backendsQuery.isSuccess) return;
    if (backendsQuery.isLoading || backendsQuery.isFetching) return;
    
    if (backends.length === 0) {
      setIsFirstTime(true);
      setShowBackendDialog(true);
      return;
    }
    if (isFirstTime) {
      setIsFirstTime(false);
    }
  }, [
    backends.length,
    backendsQuery.isError,
    backendsQuery.isFetching,
    backendsQuery.isLoading,
    isFirstTime,
    showLogin,
  ]);

  // Rolling presets: keep the time window moving
  useEffect(() => {
    if (!autoRefresh || !isRollingTimePreset(timePreset)) return;
    const intervalMs =
      activeTab === "rules" ? 30000 : shouldReducePolling ? 30000 : 5000;
    const interval = setInterval(() => {
      setAutoRefreshTick((tick) => tick + 1);
      setTimeRange(getPresetTimeRange(timePreset));
    }, intervalMs);
    return () => clearInterval(interval);
  }, [activeTab, autoRefresh, shouldReducePolling, timePreset]);

  // Fixed presets: keep HTTP polling only when WS realtime is not active
  useEffect(() => {
    if (!autoRefresh || isRollingTimePreset(timePreset) || wsRealtimeActive)
      return;
    const intervalMs = 5000;
    const interval = setInterval(() => {
      setAutoRefreshTick((tick) => tick + 1);
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    }, intervalMs);
    return () => clearInterval(interval);
  }, [autoRefresh, queryClient, wsRealtimeActive, timePreset]);

  return {
    // State
    activeTab,
    timeRange,
    timePreset,
    autoRefresh,
    isManualRefreshing,
    showBackendDialog,
    showAboutDialog,
    isFirstTime,
    autoRefreshTick,

    // Data
    data,
    countryData,
    backends,
    activeBackend,
    listeningBackends,
    activeBackendId,
    backendStatus,
    backendStatusHint,
    queryError,
    wsConnected,
    wsRealtimeActive,
    isLoading: summaryQuery.isLoading || (backendsQuery.isLoading && !backends.length),
    isTransitioning: summaryQuery.isPlaceholderData === true || summaryQuery.isLoading,

    // Actions
    setActiveTab,
    setAutoRefresh,
    setShowBackendDialog,
    setShowAboutDialog,
    handleTimeRangeChange,
    handleSwitchBackend,
    handleBackendChange,
    refreshNow,

    // Theme
    theme,
    setTheme,

    // Locale/Router
    locale,
    router,
    pathname,

    // Translations
    t,
    dashboardT,
    backendT,
  };
}
