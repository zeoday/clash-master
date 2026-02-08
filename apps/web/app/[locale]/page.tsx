"use client";

import { useEffect, useState, useCallback, useRef, memo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useTheme } from "next-themes";
import {
  Globe,
  MapPin,
  Server,
  Route,
  Activity,
  RefreshCw,
  Radio,
  ChevronDown,
  Pause,
  Settings,
  Moon,
  Sun,
  Monitor,
  Info,
  MoreVertical,
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { Navigation } from "@/components/navigation";
import { StatsCards } from "@/components/stats-cards";
import { OverviewTab } from "@/components/overview";
import { TopDomainsChart } from "@/components/top-domains-chart";
import { ProxyStatsChart } from "@/components/proxy-stats-chart";
import { InteractiveProxyStats } from "@/components/interactive-proxy-stats";
import { InteractiveRuleStats } from "@/components/interactive-rule-stats";
import { RuleChainChart } from "@/components/rule-chain-chart";
import { WorldTrafficMap } from "@/components/world-traffic-map";
import { CountryTrafficList } from "@/components/country-traffic-list";
import { DomainsTable } from "@/components/domains-table";
import { IPsTable } from "@/components/ips-table";
import { BackendConfigDialog } from "@/components/backend-config-dialog";
import { AboutDialog } from "@/components/about-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  api,
  getPresetTimeRange,
  type TimeRange,
  type Backend,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { StatsSummary, CountryStats } from "@clashmaster/shared";

function formatTimeAgo(date: Date, t: any): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) return t("justNow");
  if (seconds < 60) return t("secondsAgo", { seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("minutesAgo", { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { hours });
  return t("daysAgo", { days: Math.floor(hours / 24) });
}

const NAV_ITEMS = [
  { id: "overview", label: "overview" },
  { id: "domains", label: "domains" },
  { id: "countries", label: "countries" },
  { id: "proxies", label: "proxies" },
  { id: "rules", label: "rules" },
];

// Memoized tab content components to prevent unnecessary re-renders
const OverviewContent = memo(function OverviewContent({
  data,
  countryData,
  error,
  activeBackendId,
  onNavigate,
}: {
  data: StatsSummary | null;
  countryData: CountryStats[];
  error: string | null;
  activeBackendId?: number;
  onNavigate?: (tab: string) => void;
}) {
  return (
    <div className="space-y-6">
      <StatsCards data={data} error={error} />
      <OverviewTab
        domains={data?.topDomains || []}
        proxies={data?.proxyStats || []}
        countries={countryData}
        activeBackendId={activeBackendId}
        onNavigate={onNavigate}
      />
    </div>
  );
});

const DomainsContent = memo(function DomainsContent({
  data,
  activeBackendId,
}: {
  data: StatsSummary | null;
  activeBackendId?: number;
}) {
  const t = useTranslations("domains");
  return (
    <div className="space-y-6">
      <TopDomainsChart activeBackendId={activeBackendId} />
      <Tabs defaultValue="domains" className="w-full">
        <TabsList className="glass">
          <TabsTrigger value="domains">{t("domainList")}</TabsTrigger>
          <TabsTrigger value="ips">{t("ipList")}</TabsTrigger>
        </TabsList>
        <TabsContent value="domains" className="overflow-hidden">
          <DomainsTable activeBackendId={activeBackendId} />
        </TabsContent>
        <TabsContent value="ips" className="overflow-hidden">
          <IPsTable activeBackendId={activeBackendId} />
        </TabsContent>
      </Tabs>
    </div>
  );
});

const CountriesContent = memo(function CountriesContent({
  countryData,
}: {
  countryData: CountryStats[];
}) {
  const t = useTranslations("countries");
  return (
    <div className="space-y-6">
      <WorldTrafficMap data={countryData} />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            {t("details")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CountryTrafficList data={countryData} />
        </CardContent>
      </Card>
    </div>
  );
});

const ProxiesContent = memo(function ProxiesContent({
  data,
  activeBackendId,
}: {
  data: StatsSummary | null;
  activeBackendId?: number;
}) {
  return (
    <div className="space-y-6">
      <InteractiveProxyStats
        data={data?.proxyStats || []}
        activeBackendId={activeBackendId}
      />
    </div>
  );
});

const RulesContent = memo(function RulesContent({
  data,
  activeBackendId,
}: {
  data: StatsSummary | null;
  activeBackendId?: number;
}) {
  return (
    <div className="space-y-6">
      <InteractiveRuleStats
        data={data?.ruleStats || []}
        activeBackendId={activeBackendId}
      />
    </div>
  );
});

const NetworkContent = memo(function NetworkContent() {
  const t = useTranslations("network");
  return (
    <div className="space-y-6">
      <div className="p-12 text-center text-muted-foreground border rounded-xl">
        <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>{t("comingSoon")}</p>
      </div>
    </div>
  );
});

export default function DashboardPage() {
  const t = useTranslations("nav");
  const dashboardT = useTranslations("dashboard");
  const backendT = useTranslations("backend");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("overview");
  const [data, setData] = useState<StatsSummary | null>(null);
  const [countryData, setCountryData] = useState<CountryStats[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [timeRange] = useState<TimeRange>(getPresetTimeRange("24h"));
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showBackendDialog, setShowBackendDialog] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [backends, setBackends] = useState<Backend[]>([]);
  const [activeBackend, setActiveBackend] = useState<Backend | null>(null);
  const [listeningBackends, setListeningBackends] = useState<Backend[]>([]);
  const initialLoaded = useRef(false);
  const lastDataRef = useRef<string>("");

  // Check if backend is configured
  const checkBackend = useCallback(async () => {
    try {
      const backendsData = await api.getBackends();
      setBackends(backendsData);

      if (backendsData.length === 0) {
        setIsFirstTime(true);
        setShowBackendDialog(true);
      } else {
        // Find active backend
        const active = backendsData.find((b) => b.is_active) || backendsData[0];
        setActiveBackend(active);

        // Find listening backends
        const listening = backendsData.filter((b) => b.listening);
        setListeningBackends(listening);
      }
    } catch (err) {
      console.error("Failed to check backends:", err);
    }
  }, []);

  // Load stats with deduplication
  const loadStats = useCallback(
    async (showLoading = false) => {
      if (showLoading) setIsLoading(true);

      try {
        // Get active backend ID if available
        const activeBackendData = await api.getActiveBackend();

        // If no active backend, skip stats loading
        if ("error" in activeBackendData) {
          setData(null);
          setCountryData([]);
          setError(null);
          return;
        }

        const backendId = activeBackendData.id;

        const [stats, countries] = await Promise.all([
          api.getSummary(backendId, timeRange),
          api.getCountries(backendId, 50, timeRange),
        ]);

        // Always update data on successful fetch
        setData(stats);
        setCountryData(countries);
        setLastUpdated(new Date());
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (showLoading) setIsLoading(false);
      }
    },
    [timeRange],
  );

  // Switch active backend
  const handleSwitchBackend = async (backendId: number) => {
    try {
      await api.setActiveBackend(backendId);
      await checkBackend();
      await loadStats(true);
    } catch (err) {
      console.error("Failed to switch backend:", err);
    }
  };

  // Handle backend configuration changes
  const handleBackendChange = useCallback(async () => {
    await checkBackend();
    await loadStats(true);
  }, [checkBackend, loadStats]);

  // Initial load
  useEffect(() => {
    if (!initialLoaded.current) {
      checkBackend();
      loadStats(true);
      initialLoaded.current = true;
    }
  }, [loadStats, checkBackend]);

  // Background polling - every 5 seconds without loading state (only when autoRefresh is on)
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadStats(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [loadStats, autoRefresh]);

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <OverviewContent
            data={data}
            countryData={countryData}
            error={error}
            activeBackendId={activeBackend?.id}
            onNavigate={setActiveTab}
          />
        );
      case "domains":
        return <DomainsContent data={data} activeBackendId={activeBackend?.id} />;
      case "countries":
        return <CountriesContent countryData={countryData} />;
      case "proxies":
        return (
          <ProxiesContent data={data} activeBackendId={activeBackend?.id} />
        );
      case "rules":
        return <RulesContent data={data} activeBackendId={activeBackend?.id} />;
      case "network":
        return <NetworkContent />;
      default:
        return (
          <OverviewContent
            data={data}
            countryData={countryData}
            error={error}
            activeBackendId={activeBackend?.id}
            onNavigate={setActiveTab}
          />
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onBackendChange={handleBackendChange}
      />

      <main className="flex-1 min-w-0 lg:ml-0">
        <header className="sticky top-0 z-40 lg:static border-b border-border/40 bg-background/80 backdrop-blur-md">
          <div className="flex items-center justify-between h-14 px-4 lg:px-6">
            <div className="flex items-center gap-3">
              {/* Mobile: Logo, Desktop: Page Title */}
              <div className="flex items-center gap-2">
                <div className="lg:hidden w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden">
                  <Image
                    src="/clash-master.png"
                    alt="Clash Master"
                    width={32}
                    height={32}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h2 className="hidden lg:block font-semibold">
                  {t(activeTab)}
                </h2>
              </div>

              {/* Backend Selector */}
              {backends.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 px-2 sm:px-3">
                      <Server className="w-4 h-4" />
                      <span className="max-w-[80px] sm:max-w-[120px] truncate">
                        {activeBackend?.name || backendT("selectBackend")}
                      </span>
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel>
                      {backendT("backendsTab")}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {backends.map((backend) => (
                      <DropdownMenuItem
                        key={backend.id}
                        onClick={() => handleSwitchBackend(backend.id)}
                        className="flex items-center justify-between">
                        <span
                          className={cn(
                            "truncate",
                            backend.is_active && "font-medium",
                          )}>
                          {backend.name}
                        </span>
                        <div className="flex items-center gap-1">
                          {!!backend.is_active && (
                            <Badge
                              variant="default"
                              className="text-[10px] h-5">
                              {backendT("displaying")}
                            </Badge>
                          )}
                          {!!backend.listening && !backend.is_active && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] h-5 gap-1">
                              <Radio className="w-2 h-2" />
                              {backendT("collecting")}
                            </Badge>
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowBackendDialog(true)}>
                      <Settings className="w-4 h-4 mr-2" />
                      {backendT("manageBackends")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Listening Indicators */}
              {listeningBackends.length > 0 && (
                <div className="hidden md:flex items-center gap-1">
                  {listeningBackends.slice(0, 3).map((backend) => (
                    <Badge
                      key={backend.id}
                      variant="outline"
                      className="text-[10px] h-5 gap-1 px-1.5 border-green-500/30 text-green-600">
                      <Radio className="w-2 h-2" />
                      {backend.name}
                    </Badge>
                  ))}
                  {listeningBackends.length > 3 && (
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                      +{listeningBackends.length - 3}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {/* Desktop: Auto refresh toggle */}
              <div className="hidden sm:flex items-center gap-2 mr-2">
                <Switch
                  id="auto-refresh"
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                  className="data-[state=checked]:bg-emerald-500"
                />
                <label
                  htmlFor="auto-refresh"
                  className="text-sm text-muted-foreground cursor-pointer select-none flex items-center gap-1.5">
                  {autoRefresh ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600">
                        {dashboardT("autoRefresh")}
                      </span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>{dashboardT("paused")}</span>
                    </>
                  )}
                </label>
              </div>

              {/* Desktop: Language & Theme */}
              <div className="hidden sm:flex items-center gap-1">
                <LanguageSwitcher />
                <ThemeToggle />
              </div>

              {/* Mobile: More Options Dropdown */}
              <div className="sm:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9">
                      <MoreVertical className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {/* Auto Refresh Toggle -->
                    <DropdownMenuLabel className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4" />
                      {dashboardT("refresh")}
                    </DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setAutoRefresh(!autoRefresh)}>
                      <div className="flex items-center justify-between w-full">
                        <span>{autoRefresh ? dashboardT("autoRefresh") : dashboardT("paused")}</span>
                        <Switch checked={autoRefresh} className="data-[state=checked]:bg-emerald-500 ml-2" />
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    
                    {/* Theme Selection */}
                    <DropdownMenuLabel className="flex items-center gap-2">
                      {theme === "dark" ? (
                        <Moon className="w-4 h-4" />
                      ) : (
                        <Sun className="w-4 h-4" />
                      )}
                      Theme
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => setTheme("light")}
                      className={theme === "light" ? "bg-muted" : ""}>
                      <Sun className="w-4 h-4 mr-2 text-amber-500" />
                      Light {theme === "light" && "✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setTheme("dark")}
                      className={theme === "dark" ? "bg-muted" : ""}>
                      <Moon className="w-4 h-4 mr-2 text-indigo-500" />
                      Dark {theme === "dark" && "✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setTheme("system")}
                      className={theme === "system" ? "bg-muted" : ""}>
                      <Monitor className="w-4 h-4 mr-2 text-slate-500" />
                      System {theme === "system" && "✓"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />

                    {/* Language Selection */}
                    <DropdownMenuLabel className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      Language
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => {
                        const newPathname = pathname.replace(
                          `/${locale}`,
                          "/en",
                        );
                        router.push(newPathname);
                      }}
                      className={locale === "en" ? "bg-muted" : ""}>
                      English {locale === "en" && "✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const newPathname = pathname.replace(
                          `/${locale}`,
                          "/zh",
                        );
                        router.push(newPathname);
                      }}
                      className={locale === "zh" ? "bg-muted" : ""}>
                      中文 {locale === "zh" && "✓"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />

                    {/* Settings */}
                    <DropdownMenuItem
                      onClick={() => setShowBackendDialog(true)}>
                      <Settings className="w-4 h-4 mr-2" />
                      {backendT("manageBackends")}
                    </DropdownMenuItem>

                    {/* About */}
                    <DropdownMenuItem onClick={() => setShowAboutDialog(true)}>
                      <Info className="w-4 h-4 mr-2 text-primary" />
                      About
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Refresh Button - Both Desktop & Mobile */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => loadStats(true)}
                disabled={isLoading}
                className="h-9 w-9">
                <RefreshCw
                  className={cn("w-4 h-4", isLoading && "animate-spin")}
                />
              </Button>
            </div>
          </div>
        </header>

        <div className="p-4 lg:p-6 pb-24 lg:pb-6 max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>

      {/* Backend Configuration Dialog */}
      <BackendConfigDialog
        open={showBackendDialog}
        onOpenChange={setShowBackendDialog}
        isFirstTime={isFirstTime}
        onConfigComplete={() => {
          setIsFirstTime(false);
          handleBackendChange();
        }}
        onBackendChange={handleBackendChange}
      />

      {/* About Dialog */}
      <AboutDialog open={showAboutDialog} onOpenChange={setShowAboutDialog} />
    </div>
  );
}
