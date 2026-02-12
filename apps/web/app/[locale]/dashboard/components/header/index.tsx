"use client";

import {
  Server,
  Radio,
  RefreshCw,
  ChevronDown,
  AlertTriangle,
  Settings,
  Globe,
  Moon,
  Sun,
  Monitor,
  MoreVertical,
  Info,
  LogOut,
  ShieldAlert,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { TimeRangePicker, LanguageSwitcher, ThemeToggle, ClientOnly } from "@/components/common";
import { cn } from "@/lib/utils";
import type { TimeRange } from "@/lib/api";
import type { BackendStatus, TimePreset } from "@/lib/types/dashboard";

interface Backend {
  id: number;
  name: string;
  is_active: boolean;
  listening: boolean;
}

import { useAuth } from "@/lib/auth";
import { useAuthState } from "@/lib/auth-queries"; // Added
import { useTranslations } from "next-intl"; // Added

interface HeaderProps {
  // Backend data
  backends: Backend[];
  activeBackend: Backend | null;
  listeningBackends: Backend[];
  backendStatus: BackendStatus;
  backendStatusHint: string | null;

  // Time range
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange, preset: TimePreset) => void;

  // Auto refresh
  autoRefresh: boolean;
  autoRefreshTick: number;
  onAutoRefreshToggle: () => void;

  // Actions
  onSwitchBackend: (backendId: number) => void;
  onOpenBackendDialog: () => void;
  onRefresh: () => void;
  onOpenAboutDialog: () => void;

  // Theme
  theme: string | undefined;
  onThemeChange: (theme: string) => void;

  // Locale/Router
  locale: string;
  pathname: string;
  onNavigate: (path: string) => void;

  // Loading states
  isLoading: boolean;

  // Translations
  backendT: (key: string) => string;
  dashboardT: (key: string) => string;
}

export function Header({
  backends,
  activeBackend,
  listeningBackends,
  backendStatus,
  backendStatusHint,
  timeRange,
  onTimeRangeChange,
  autoRefresh,
  autoRefreshTick,
  onAutoRefreshToggle,
  onSwitchBackend,
  onOpenBackendDialog,
  onRefresh,
  onOpenAboutDialog,
  theme,
  onThemeChange,
  locale,
  pathname,
  onNavigate,
  isLoading,
  backendT,
  dashboardT,
}: HeaderProps) {
  const { logout, authState } = useAuth();
  const { data: authQueryState } = useAuthState(); // Added
  const isShowcase = authQueryState?.showcaseMode ?? false; // Added
  const navT = useTranslations("nav"); // Added

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="flex items-center justify-between h-14 px-4 lg:px-6">
        <div className="flex items-center gap-3">
          {/* Mobile: Logo */}
          <div className="flex items-center gap-2">
            <div className="lg:hidden w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden">
              <Image
                src="/logo.png"
                alt="Neko Master"
                width={32}
                height={32}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Backend Selector */}
          {backends.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 px-2 sm:px-3"
                >
                  <Server className="w-4 h-4" />
                  <span className="max-w-[80px] sm:max-w-[120px] truncate">
                    {activeBackend?.name || backendT("selectBackend")}
                  </span>
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>{backendT("backendsTab")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {backends.map((backend) => (
                  <DropdownMenuItem
                    key={backend.id}
                    onClick={() => onSwitchBackend(backend.id)}
                    className="flex items-center justify-between"
                  >
                    <span
                      className={cn(
                        "truncate",
                        backend.is_active && "font-medium"
                      )}
                    >
                      {backend.name}
                    </span>
                    <div className="flex items-center gap-1">
                      {!!backend.is_active && (
                        <Badge
                          variant="default"
                          className="text-[10px] h-5"
                        >
                          {backendT("displaying")}
                        </Badge>
                      )}
                      {!!backend.listening && !backend.is_active && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-5 gap-1"
                        >
                          <Radio className="w-2 h-2" />
                          {backendT("collecting")}
                        </Badge>
                      )}
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onOpenBackendDialog}>
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
                  className="text-[10px] h-5 gap-1 px-1.5 border-green-500/30 text-green-600"
                >
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
          {/* Desktop: Compact auto-refresh toggle */}
          <div className="hidden sm:flex items-center mr-1">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onAutoRefreshToggle}
                    aria-label={
                      autoRefresh
                        ? dashboardT("autoRefresh")
                        : dashboardT("paused")
                    }
                    className={cn(
                      "h-9 w-9 rounded-full transition-colors",
                      autoRefresh
                        ? "text-emerald-600 hover:bg-emerald-500/10"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <RefreshCw
                      className={cn(
                        "w-4 h-4",
                        autoRefresh && "text-emerald-500"
                      )}
                      style={
                        autoRefresh
                          ? {
                              transform: `rotate(${autoRefreshTick * 360}deg)`,
                              transition: "transform 650ms linear",
                            }
                          : undefined
                      }
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="font-medium">
                    {autoRefresh
                      ? dashboardT("autoRefresh")
                      : dashboardT("paused")}
                  </p>
                  <p className="opacity-80">
                    {autoRefresh
                      ? dashboardT("clickToPause")
                      : dashboardT("clickToResume")}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Desktop: Language & Theme */}
          <div className="hidden sm:flex items-center gap-1">
            <ClientOnly fallback={<div className="h-9 w-[152px] bg-secondary/45 rounded-xl" />}>
              <TimeRangePicker
                value={timeRange}
                onChange={onTimeRangeChange}
                showcaseMode={isShowcase}
              />
            </ClientOnly>
            <LanguageSwitcher />

            <ThemeToggle />
            {authState?.enabled && (
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                title={dashboardT("logout")}
                className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Mobile: Time range picker */}
          <div className="sm:hidden">
            <ClientOnly fallback={<div className="h-9 w-[122px] bg-secondary/45 rounded-xl" />}>
              <TimeRangePicker
                value={timeRange}
                onChange={onTimeRangeChange}
                className="w-[122px]"
                showcaseMode={isShowcase}
              />
            </ClientOnly>
          </div>

          {/* Mobile: Backend warning in top actions */}
          {backendStatus === "unhealthy" && (
            <div className="sm:hidden">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={dashboardT("backendUnavailable")}
                    className="relative h-9 w-9 text-rose-500 hover:bg-rose-500/10 hover:text-rose-500"
                  >
                    <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping [animation-duration:900ms]" />
                    <AlertTriangle className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  side="bottom"
                  className="w-[240px] p-3"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
                        {dashboardT("backendUnavailable")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {backendStatusHint ||
                          dashboardT("backendUnavailableHint")}
                      </p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Mobile: More Options Dropdown */}
          <div className="sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {/* Showcase Mode Indicator */}
                {isShowcase && (
                  <>
                    <DropdownMenuLabel className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      <ShieldAlert className="w-4 h-4" />
                      {navT("showcaseMode")}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                  </>
                )}

                {/* Auto Refresh Toggle */}
                <DropdownMenuLabel className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  {dashboardT("refresh")}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    onAutoRefreshToggle();
                  }}
                >
                  <div className="flex items-center justify-between w-full">
                    <span>
                      {autoRefresh
                        ? dashboardT("autoRefresh")
                        : dashboardT("paused")}
                    </span>
                    <Switch
                      checked={autoRefresh}
                      onCheckedChange={onAutoRefreshToggle}
                      onClick={(event) => event.stopPropagation()}
                      className="data-[state=checked]:bg-emerald-500 ml-2"
                    />
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
                  onClick={() => onThemeChange("light")}
                  className={theme === "light" ? "bg-muted" : ""}
                >
                  <Sun className="w-4 h-4 mr-2 text-amber-500" />
                  Light {theme === "light" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onThemeChange("dark")}
                  className={theme === "dark" ? "bg-muted" : ""}
                >
                  <Moon className="w-4 h-4 mr-2 text-indigo-500" />
                  Dark {theme === "dark" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onThemeChange("system")}
                  className={theme === "system" ? "bg-muted" : ""}
                >
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
                      "/en"
                    );
                    onNavigate(newPathname);
                  }}
                  className={locale === "en" ? "bg-muted" : ""}
                >
                  English {locale === "en" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const newPathname = pathname.replace(
                      `/${locale}`,
                      "/zh"
                    );
                    onNavigate(newPathname);
                  }}
                  className={locale === "zh" ? "bg-muted" : ""}
                >
                  中文 {locale === "zh" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />

                {/* Settings */}
                <DropdownMenuItem onClick={onOpenBackendDialog}>
                  <Settings className="w-4 h-4 mr-2" />
                  {backendT("manageBackends")}
                </DropdownMenuItem>

                {/* About */}
                <DropdownMenuItem onClick={onOpenAboutDialog}>
                  <Info className="w-4 h-4 mr-2 text-primary" />
                  About
                </DropdownMenuItem>
                {authState?.enabled && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                      <LogOut className="w-4 h-4 mr-2" />
                      {dashboardT("logout")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Refresh Button - show when auto refresh is off or backend is unhealthy */}
          {(!autoRefresh || backendStatus === "unhealthy") && (
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-9 w-9"
            >
              <RefreshCw
                className={cn("w-4 h-4", isLoading && "animate-spin")}
              />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
