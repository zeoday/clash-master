"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Loader2, BarChart3, Link2, Smartphone, Monitor, Tablet, HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, Cell as BarCell, LabelList } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBytes, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Favicon } from "@/components/favicon";
import { DomainStatsTable, IPStatsTable } from "@/components/stats-tables";
import { COLORS } from "@/lib/stats-utils";
import type { DeviceStats, DomainStats, IPStats } from "@clashmaster/shared";

interface InteractiveDeviceStatsProps {
  data: DeviceStats[];
  activeBackendId?: number;
}



function renderCustomBarLabel(props: any) {
  const { x, y, width, value, height } = props;
  return (
    <text x={x + width + 6} y={y + height / 2} fill="currentColor" fontSize={11} dominantBaseline="central" textAnchor="start" style={{ fontVariantNumeric: "tabular-nums" }}>
      {formatBytes(value, 0)}
    </text>
  );
}

export function InteractiveDeviceStats({ data, activeBackendId }: InteractiveDeviceStatsProps) {
  const t = useTranslations("devices");
  const domainsT = useTranslations("domains");
  
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [deviceDomains, setDeviceDomains] = useState<DomainStats[]>([]);
  const [deviceIPs, setDeviceIPs] = useState<IPStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("domains");
  const [showDomainBarLabels, setShowDomainBarLabels] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const update = () => setShowDomainBarLabels(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((device, index) => ({
      name: device.sourceIP,
      rawName: device.sourceIP,
      value: device.totalDownload + device.totalUpload,
      download: device.totalDownload,
      upload: device.totalUpload,
      connections: device.totalConnections,
      color: COLORS[index % COLORS.length],
      rank: index,
    }));
  }, [data]);

  const totalTraffic = useMemo(() => chartData.reduce((sum, item) => sum + item.value, 0), [chartData]);
  const topDevices = useMemo(() => [...chartData].sort((a, b) => b.value - a.value).slice(0, 4), [chartData]);
  const maxTotal = useMemo(() => chartData.length ? Math.max(...chartData.map(d => d.value)) : 1, [chartData]);

  const loadDeviceDetails = useCallback(async (sourceIP: string) => {
    setLoading(true);
    try {
      const [domains, ips] = await Promise.all([
        api.getDeviceDomains(sourceIP, activeBackendId),
        api.getDeviceIPs(sourceIP, activeBackendId),
      ]);
      setDeviceDomains(domains);
      setDeviceIPs(ips);
    } catch (err) {
      console.error(`Failed to load details for ${sourceIP}:`, err);
      setDeviceDomains([]);
      setDeviceIPs([]);
    } finally {
      setLoading(false);
    }
  }, [activeBackendId]);

  useEffect(() => {
    if (chartData.length > 0 && !selectedDevice) {
      const firstDevice = chartData[0].rawName;
      setSelectedDevice(firstDevice);
      loadDeviceDetails(firstDevice);
    }
  }, [chartData, selectedDevice, loadDeviceDetails]);

  const handleDeviceClick = useCallback((rawName: string) => {
    if (selectedDevice !== rawName) {
      setSelectedDevice(rawName);
      loadDeviceDetails(rawName);
    }
  }, [selectedDevice, loadDeviceDetails]);

  const selectedDeviceData = useMemo(() => chartData.find(d => d.rawName === selectedDevice), [chartData, selectedDevice]);

  const domainChartData = useMemo(() => {
    return [...deviceDomains]
      .sort((a, b) => (b.totalDownload + b.totalUpload) - (a.totalDownload + a.totalUpload))
      .slice(0, 10)
      .map((d, i) => ({
        name: d.domain.length > 25 ? d.domain.slice(0, 22) + "..." : d.domain,
        fullName: d.domain,
        total: d.totalDownload + d.totalUpload,
        download: d.totalDownload,
        upload: d.totalUpload,
        connections: d.totalConnections,
        color: COLORS[i % COLORS.length],
      }));
  }, [deviceDomains]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>{t("noData")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Pie Chart */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t("title")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-2 pb-4">
            <div className="h-[165px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                    {chartData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                  </Pie>
                  <RechartsTooltip content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload;
                      return (<div className="bg-background border border-border p-3 rounded-lg shadow-lg"><p className="font-medium text-sm mb-1">{item.name}</p><p className="text-xs text-muted-foreground">{formatBytes(item.value)}</p></div>);
                    }
                    return null;
                  }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {topDevices.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider text-center">Top 4</p>
                <div className="mt-1 space-y-1.5">
                  {topDevices.map((item, idx) => {
                    const rankBadgeClass = idx === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : idx === 1 ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" : idx === 2 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" : "bg-muted text-muted-foreground";
                    return (
                      <div key={item.rawName} title={item.name} className="flex items-center gap-1.5 min-w-0">
                        <span className={cn("w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center shrink-0", rankBadgeClass)}>
                          {idx + 1}
                        </span>
                        <div className="px-1.5 py-0.5 rounded-md text-[10px] font-medium text-white/90 truncate min-w-0 max-w-full flex items-center gap-1" style={{ backgroundColor: item.color }}>
                          <span className="truncate">{item.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Device List */}
        <Card className="lg:col-span-4">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t("title")}</CardTitle></CardHeader>
          <CardContent className="p-3">
            <ScrollArea className="h-[280px] pr-3">
              <div className="space-y-2">
                {chartData.map((item) => {
                  const percentage = totalTraffic > 0 ? (item.value / totalTraffic) * 100 : 0;
                  const barPercent = (item.value / maxTotal) * 100;
                  const isSelected = selectedDevice === item.rawName;
                  const badgeColor = item.rank === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : item.rank === 1 ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" : item.rank === 2 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-muted text-muted-foreground";
                  return (
                    <button key={item.rawName} onClick={() => handleDeviceClick(item.rawName)} className={cn("w-full p-2.5 rounded-xl border text-left transition-all duration-200", isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border/50 bg-card/50 hover:bg-card hover:border-primary/30")}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={cn("w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center shrink-0", badgeColor)}>{item.rank + 1}</span>
                        <span className="flex-1 text-sm font-medium truncate" title={item.name}>{item.name}</span>
                        <span className="text-sm font-bold tabular-nums shrink-0">{formatBytes(item.value)}</span>
                      </div>
                      <div className="pl-7 space-y-1">
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden flex">
                          <div className="h-full bg-blue-500 dark:bg-blue-400" style={{ width: `${(item.download / item.value) * barPercent}%` }} />
                          <div className="h-full bg-purple-500 dark:bg-purple-400" style={{ width: `${(item.upload / item.value) * barPercent}%` }} />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <span className="text-blue-500 dark:text-blue-400">↓ {formatBytes(item.download)}</span>
                            <span className="text-purple-500 dark:text-purple-400">↑ {formatBytes(item.upload)}</span>
                            <span className="flex items-center gap-1 tabular-nums"><Link2 className="w-3 h-3" />{formatNumber(item.connections)}</span>
                          </div>
                          <span className="tabular-nums">{percentage.toFixed(1)}%</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Top Domains Chart */}
        <Card className="lg:col-span-5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><BarChart3 className="h-4 w-4" />{domainsT("title")}</CardTitle>
              {selectedDeviceData && (<span className="text-xs text-muted-foreground">{selectedDeviceData.name}</span>)}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (<div className="h-[280px] flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : domainChartData.length === 0 ? (<div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">{domainsT("noData")}</div>
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={domainChartData} layout="vertical" margin={{ left: 0, right: showDomainBarLabels ? 60 : 10, top: 5, bottom: 5 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <RechartsTooltip content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload;
                        return (<div className="bg-background border border-border p-3 rounded-lg shadow-lg min-w-[160px]"><div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/50"><Favicon domain={item.fullName} size="sm" /><span className="font-medium text-sm truncate max-w-[180px]" title={item.fullName}>{item.fullName}</span></div><div className="space-y-2 text-xs"><div className="flex justify-between items-center"><span className="text-muted-foreground">Total</span><span className="font-semibold">{formatBytes(item.total)}</span></div><div className="flex justify-between items-center"><span className="text-blue-500">Download</span><span>{formatBytes(item.download)}</span></div><div className="flex justify-between items-center"><span className="text-purple-500">Upload</span><span>{formatBytes(item.upload)}</span></div><div className="flex justify-between items-center pt-1 border-t border-border/50"><span className="text-emerald-500">Connections</span><span>{formatNumber(item.connections)}</span></div></div></div>);
                      }
                      return null;
                    }} cursor={{ fill: "rgba(128, 128, 128, 0.1)" }} />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={24}>
                      {domainChartData.map((entry, index) => (<BarCell key={`cell-${index}`} fill={entry.color} />))}
                      {showDomainBarLabels && (<LabelList dataKey="total" position="right" content={renderCustomBarLabel} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom: Tabs with shared table components */}
      {selectedDevice && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="glass">
            <TabsTrigger value="domains">{domainsT("domainList")}</TabsTrigger>
            <TabsTrigger value="ips">IP Addresses</TabsTrigger>
          </TabsList>
          <TabsContent value="domains" className="mt-4">
            <DomainStatsTable domains={deviceDomains} loading={loading} />
          </TabsContent>
          <TabsContent value="ips" className="mt-4">
            <IPStatsTable ips={deviceIPs} loading={loading} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
