"use client";

import { useRef, useEffect } from "react";
import { Download, Upload, Globe, Activity, Server, Route } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion, useSpring, useTransform, useMotionValue } from "framer-motion";
import { formatBytes, cn } from "@/lib/utils";
import type { StatsSummary } from "@neko-master/shared";

interface StatsCardsProps {
  data: StatsSummary | null;
  error?: string | null;
  backendStatus?: "healthy" | "unhealthy" | "unknown";
  isLoading?: boolean;
}

// ---------- Animated number display ----------

const springConfig = { stiffness: 80, damping: 20, mass: 0.5 };

function AnimatedValue({
  value,
  formatter,
  className,
  title,
}: {
  value: number;
  formatter: (n: number) => string;
  className?: string;
  title?: string;
}) {
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, springConfig);
  const display = useTransform(spring, (v) => formatter(Math.round(v)));
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      // Jump to initial value instantly (no animation on mount)
      motionValue.jump(value);
      isFirstRender.current = false;
    } else {
      motionValue.set(value);
    }
  }, [value, motionValue]);

  return (
    <motion.span className={className} title={title}>
      {display}
    </motion.span>
  );
}

// ---------- Animated Stat Card (for numeric values) ----------

function AnimatedStatCard({
  value,
  formatter,
  label,
  subvalue,
  icon: Icon,
  color,
}: {
  value: number;
  formatter: (n: number) => string;
  label: string;
  subvalue?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="rounded-xl p-3.5 border bg-card shadow-xs flex flex-col">
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center mb-2.5"
        style={{ backgroundColor: `${color}15` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1">
        <p className="text-muted-foreground text-[11px] uppercase tracking-[0.14em] font-medium truncate">
          {label}
        </p>
        <AnimatedValue
          value={value}
          formatter={formatter}
          className="text-lg leading-none font-semibold mt-2.5 tabular-nums truncate block"
          title={formatter(value)}
        />
        {subvalue && (
          <p className="text-base text-muted-foreground mt-1.5 truncate">
            {subvalue}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- Main ----------

export function StatsCards({ data, backendStatus, isLoading }: StatsCardsProps) {
  const t = useTranslations("stats");
  const summaryIsZero =
    !data ||
    ((data.totalDownload || 0) === 0 &&
      (data.totalUpload || 0) === 0 &&
      (data.totalConnections || 0) === 0 &&
      (data.totalDomains || 0) === 0 &&
      (data.totalRules || 0) === 0);

  const showUnavailablePlaceholder = backendStatus === "unhealthy" && summaryIsZero;

  const PlaceholderStatCard = ({
    icon: Icon,
    label,
    color,
    shimmer = false,
  }: {
    icon: React.ElementType;
    label: string;
    color: string;
    shimmer?: boolean;
  }) => (
    <div className="rounded-xl p-3.5 border bg-card shadow-xs flex flex-col">
      <div
        className={cn("w-8 h-8 rounded-md flex items-center justify-center mb-2.5", shimmer && "animate-pulse")}
        style={{ backgroundColor: `${color}15` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1">
        <p className="text-muted-foreground text-[11px] uppercase tracking-[0.14em] font-medium truncate">
          {label}
        </p>
        {shimmer ? (
          <div className="h-5 w-24 bg-muted/50 rounded mt-2.5 mb-1 animate-pulse" />
        ) : (
          <p className="text-lg leading-none font-semibold mt-2.5 tabular-nums text-muted-foreground">
            --
          </p>
        )}
        {shimmer ? (
           <div className="h-3 w-12 bg-muted/30 rounded mt-1.5 animate-pulse" />
        ) : (
          <p className="text-[11px] text-muted-foreground mt-1.5 truncate">
            {t("unavailable")}
          </p>
        )}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <PlaceholderStatCard icon={Download} label={t("totalDownload")} color="#3B82F6" shimmer />
          <PlaceholderStatCard icon={Upload} label={t("totalUpload")} color="#8B5CF6" shimmer />
          <PlaceholderStatCard icon={Server} label={t("total")} color="#EC4899" shimmer />
          <PlaceholderStatCard icon={Activity} label={t("totalConnections")} color="#10B981" shimmer />
          <PlaceholderStatCard icon={Globe} label={t("domains")} color="#06B6D4" shimmer />
          <PlaceholderStatCard icon={Route} label={t("rules")} color="#F59E0B" shimmer />
      </div>
    );
  }

  return (
    <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      {showUnavailablePlaceholder ? (
        <>
          <PlaceholderStatCard icon={Download} label={t("totalDownload")} color="#3B82F6" />
          <PlaceholderStatCard icon={Upload} label={t("totalUpload")} color="#8B5CF6" />
          <PlaceholderStatCard icon={Server} label={t("total")} color="#EC4899" />
          <PlaceholderStatCard icon={Activity} label={t("totalConnections")} color="#10B981" />
          <PlaceholderStatCard icon={Globe} label={t("domains")} color="#06B6D4" />
          <PlaceholderStatCard icon={Route} label={t("rules")} color="#F59E0B" />
        </>
      ) : (
        <>
          <AnimatedStatCard
            value={data?.totalDownload || 0}
            formatter={formatBytes}
            icon={Download}
            label={t("totalDownload")}
            color="#3B82F6"
          />
          <AnimatedStatCard
            value={data?.totalUpload || 0}
            formatter={formatBytes}
            icon={Upload}
            label={t("totalUpload")}
            color="#8B5CF6"
          />
          <AnimatedStatCard
            value={(data?.totalDownload || 0) + (data?.totalUpload || 0)}
            formatter={formatBytes}
            label={t("total")}
            icon={Server}
            color="#EC4899"
          />
          <AnimatedStatCard
            value={data?.totalConnections || 0}
            formatter={(n) => n.toLocaleString()}
            label={t("totalConnections")}
            icon={Activity}
            color="#10B981"
          />
          <AnimatedStatCard
            value={data?.totalDomains || 0}
            formatter={(n) => n.toLocaleString()}
            label={t("domains")}
            icon={Globe}
            color="#06B6D4"
          />
          <AnimatedStatCard
            value={data?.totalRules || 0}
            formatter={(n) => n.toLocaleString()}
            label={t("rules")}
            icon={Route}
            color="#F59E0B"
          />
        </>
      )}
    </div>
  );
}
