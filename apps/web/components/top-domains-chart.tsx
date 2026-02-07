"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { useTranslations } from "next-intl";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Favicon } from "@/components/favicon";
import { formatBytes } from "@/lib/utils";
import type { DomainStats } from "@clashmaster/shared";

interface TopDomainsChartProps {
  data: DomainStats[];
}

const TOP_OPTIONS = [10, 20, 50, 100] as const;
type TopOption = (typeof TOP_OPTIONS)[number];

// Dynamic height configuration based on topN
const CHART_CONFIG = {
  10: { height: 350, barSize: 32, showAllLabels: true },
  20: { height: 450, barSize: 24, showAllLabels: true },
  50: { height: 700, barSize: 18, showAllLabels: true },
  100: { height: 1200, barSize: 14, showAllLabels: true },
} as const;

// Vibrant color palette for bars
const COLORS = [
  "#3B82F6", // Blue
  "#8B5CF6", // Purple
  "#06B6D4", // Cyan
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#EC4899", // Pink
  "#6366F1", // Indigo
  "#14B8A6", // Teal
  "#F97316", // Orange
];

// Custom label renderer to prevent text wrapping in SVG
function renderCustomBarLabel(props: any) {
  const { x, y, width, value, height } = props;
  return (
    <text
      x={x + width + 5}
      y={y + height / 2}
      fill="currentColor"
      fontSize={10}
      dominantBaseline="central"
      textAnchor="start"
      style={{ fontVariantNumeric: "tabular-nums" }}>
      {formatBytes(value, 0)}
    </text>
  );
}

export function TopDomainsChart({ data }: TopDomainsChartProps) {
  const t = useTranslations("domains");
  const commonT = useTranslations("stats");
  const [topN, setTopN] = useState<TopOption>(10);
  // Track whether this is the initial render to only animate on first load
  const hasRenderedRef = useRef(false);
  // Track container width to hide labels on small screens
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Show labels only when container is wide enough (> 400px)
  const showLabels = containerWidth > 400;

  // Get chart configuration based on topN
  const config = CHART_CONFIG[topN];

  const chartData = useMemo(() => {
    if (!data) return [];
    const result = data.slice(0, topN).map((domain, index) => ({
      name: domain.domain,
      fullDomain: domain.domain,
      total: domain.totalDownload + domain.totalUpload,
      download: domain.totalDownload,
      upload: domain.totalUpload,
      color: COLORS[index % COLORS.length],
    }));
    // After first data load, mark as rendered so subsequent updates skip animation
    if (result.length > 0) {
      setTimeout(() => {
        hasRenderedRef.current = true;
      }, 800);
    }
    return result;
  }, [data, topN]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-background border border-border p-3 rounded-lg shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <Favicon domain={item.fullDomain} size="sm" />
            <span className="font-medium text-sm text-foreground">
              {item.fullDomain}
            </span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{commonT("total")}:</span>
              <span className="font-medium text-foreground">
                {formatBytes(item.total)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-blue-500">{commonT("download")}:</span>
              <span className="text-foreground">
                {formatBytes(item.download)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-purple-500">{commonT("upload")}:</span>
              <span className="text-foreground">
                {formatBytes(item.upload)}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              {t("topDomainsByTraffic")}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {t("mostBandwidthConsuming")}
            </p>
          </div>
          <Tabs
            value={topN.toString()}
            onValueChange={(v) => setTopN(parseInt(v) as TopOption)}>
            <TabsList className="h-8">
              {TOP_OPTIONS.map((n) => (
                <TabsTrigger
                  key={n}
                  value={n.toString()}
                  className="text-xs px-3">
                  Top {n}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent ref={containerRef}>
        <div 
          className="w-full min-w-0 overflow-hidden sm:overflow-visible transition-all duration-500 ease-in-out"
          style={{ height: `${config.height}px` }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{
                top: 10,
                right: showLabels ? 60 : 10,
                left: 0,
                bottom: 10,
              }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#888888"
                opacity={0.2}
                horizontal={false}
              />
              <XAxis
                type="number"
                tickFormatter={(value) => formatBytes(value, 0)}
                tick={{ fill: "#888888", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={180}
                tick={{ fontSize: 11, fill: "currentColor" }}
                tickLine={false}
                axisLine={false}
                interval={0}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "rgba(128, 128, 128, 0.1)" }}
              />
              <Bar
                dataKey="total"
                radius={[0, 4, 4, 0]}
                maxBarSize={config.barSize}
                isAnimationActive={!hasRenderedRef.current}
                animationDuration={600}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
                {showLabels && (
                  <LabelList
                    dataKey="total"
                    position="right"
                    content={renderCustomBarLabel}
                  />
                )}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
