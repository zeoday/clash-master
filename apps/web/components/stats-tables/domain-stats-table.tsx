"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Loader2, Rows3, ArrowUpDown, ArrowDown, ArrowUp, Globe, ChevronDown, ChevronUp, Server } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatBytes, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Favicon } from "@/components/favicon";
import { 
  PAGE_SIZE_OPTIONS, 
  getIPGradient, 
  getPageNumbers,
  type PageSize,
  type DomainSortKey,
  type SortOrder,
} from "@/lib/stats-utils";
import type { DomainStats } from "@clashmaster/shared";

interface DomainStatsTableProps {
  domains: DomainStats[];
  loading?: boolean;
  title?: string;
  showHeader?: boolean;
}

export function DomainStatsTable({ 
  domains, 
  loading = false,
  title,
  showHeader = true,
}: DomainStatsTableProps) {
  const t = useTranslations("domains");
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<DomainSortKey>("totalDownload");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);

  // Sort handler
  const handleSort = (key: DomainSortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
    setPage(1);
  };

  // Toggle expand
  const toggleExpand = (domain: string) => {
    setExpandedDomain(expandedDomain === domain ? null : domain);
  };

  // Sort icon component
  const SortIcon = ({ column }: { column: DomainSortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3 text-primary" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 text-primary" />
    );
  };

  // Filter and sort
  const filteredDomains = useMemo(() => {
    let result = [...domains];
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(d => d.domain.toLowerCase().includes(lower));
    }
    result.sort((a, b) => {
      const aVal = a[sortKey] ?? "";
      const bVal = b[sortKey] ?? "";
      if (sortOrder === "asc") {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    });
    return result;
  }, [domains, search, sortKey, sortOrder]);

  // Paginate
  const paginatedDomains = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredDomains.slice(start, start + pageSize);
  }, [filteredDomains, page, pageSize]);

  const totalPages = Math.ceil(filteredDomains.length / pageSize);

  return (
    <Card>
      {/* Header with search */}
      {showHeader && (
        <div className="p-4 border-b border-border/50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">{title || t("associatedDomains")}</h3>
              <p className="text-sm text-muted-foreground">
                {filteredDomains.length} {t("domainsCount")}
              </p>
            </div>
            <div className="relative">
              <Input
                placeholder={t("search")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-full sm:w-[240px] bg-secondary/50 border-0"
              />
            </div>
          </div>
        </div>
      )}

      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredDomains.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {search ? t("noResults") : t("noData")}
          </div>
        ) : (
          <>
            {/* Desktop Table Header */}
            <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-3 bg-secondary/30 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <div 
                className="col-span-4 flex items-center cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleSort("domain")}
              >
                {t("domain")}
                <SortIcon column="domain" />
              </div>
              <div 
                className="col-span-2 flex items-center justify-end cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleSort("totalDownload")}
              >
                {t("download")}
                <SortIcon column="totalDownload" />
              </div>
              <div 
                className="col-span-2 flex items-center justify-end cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleSort("totalUpload")}
              >
                {t("upload")}
                <SortIcon column="totalUpload" />
              </div>
              <div 
                className="col-span-2 flex items-center justify-end cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleSort("totalConnections")}
              >
                {t("conn")}
                <SortIcon column="totalConnections" />
              </div>
              <div className="col-span-2 flex items-center justify-end">
                {t("ipCount")}
              </div>
            </div>

            {/* Mobile Sort Bar */}
            <div className="sm:hidden flex items-center gap-2 px-4 py-2 bg-secondary/30 overflow-x-auto scrollbar-hide">
              {([
                { key: "domain" as DomainSortKey, label: t("domain") },
                { key: "totalDownload" as DomainSortKey, label: t("download") },
                { key: "totalUpload" as DomainSortKey, label: t("upload") },
                { key: "totalConnections" as DomainSortKey, label: t("conn") },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  className={cn(
                    "flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                    sortKey === key
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => handleSort(key)}
                >
                  {label}
                  {sortKey === key && (
                    sortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                </button>
              ))}
            </div>

            {/* Domain List */}
            <div className="divide-y divide-border/30">
              {paginatedDomains.map((domain, index) => {
                const isExpanded = expandedDomain === domain.domain;
                
                return (
                  <div key={domain.domain} className="group">
                    {/* Desktop Row */}
                    <div
                      className={cn(
                        "hidden sm:grid grid-cols-12 gap-3 px-5 py-4 items-center hover:bg-secondary/20 transition-colors cursor-pointer",
                        isExpanded && "bg-secondary/10"
                      )}
                      style={{ animationDelay: `${index * 50}ms` }}
                      onClick={() => toggleExpand(domain.domain)}
                    >
                      {/* Domain with Favicon */}
                      <div className="col-span-4 flex items-center gap-3 min-w-0">
                        <Favicon domain={domain.domain} size="sm" className="shrink-0" />
                        <span className="font-medium text-sm truncate" title={domain.domain}>
                          {domain.domain}
                        </span>
                      </div>

                      {/* Download */}
                      <div className="col-span-2 text-right tabular-nums text-sm">
                        <span className="text-blue-500">{formatBytes(domain.totalDownload)}</span>
                      </div>

                      {/* Upload */}
                      <div className="col-span-2 text-right tabular-nums text-sm">
                        <span className="text-purple-500">{formatBytes(domain.totalUpload)}</span>
                      </div>

                      {/* Connections */}
                      <div className="col-span-2 flex items-center justify-end">
                        <span className="px-2 py-0.5 rounded-full bg-secondary text-xs font-medium">
                          {formatNumber(domain.totalConnections)}
                        </span>
                      </div>

                      {/* IP Count - Clickable */}
                      <div className="col-span-2 flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-7 px-2 gap-1 text-xs font-medium transition-all",
                            isExpanded 
                              ? "bg-primary/10 text-primary hover:bg-primary/20" 
                              : "bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(domain.domain);
                          }}
                        >
                          <Server className="h-3 w-3" />
                          {domain.ips?.length || 0}
                          {isExpanded ? (
                            <ChevronUp className="h-3 w-3 ml-0.5" />
                          ) : (
                            <ChevronDown className="h-3 w-3 ml-0.5" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Mobile Row - Card-style layout */}
                    <div
                      className={cn(
                        "sm:hidden px-4 py-3 hover:bg-secondary/20 transition-colors cursor-pointer",
                        isExpanded && "bg-secondary/10"
                      )}
                      onClick={() => toggleExpand(domain.domain)}
                    >
                      {/* Top: Favicon + Domain + Expand */}
                      <div className="flex items-center gap-2.5 mb-2">
                        <Favicon domain={domain.domain} size="sm" className="shrink-0" />
                        <span className="font-medium text-sm truncate flex-1" title={domain.domain}>
                          {domain.domain}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-7 px-2 gap-1 text-xs font-medium shrink-0",
                            isExpanded 
                              ? "bg-primary/10 text-primary" 
                              : "bg-secondary/50 text-muted-foreground"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(domain.domain);
                          }}
                        >
                          <Server className="h-3 w-3" />
                          {domain.ips?.length || 0}
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                      </div>

                      {/* Bottom: Stats row */}
                      <div className="flex items-center justify-between text-xs pl-[30px]">
                        <span className="text-blue-500 tabular-nums">↓ {formatBytes(domain.totalDownload)}</span>
                        <span className="text-purple-500 tabular-nums">↑ {formatBytes(domain.totalUpload)}</span>
                        <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
                          {formatNumber(domain.totalConnections)} {t("conn")}
                        </span>
                      </div>
                    </div>

                    {/* Expanded Details: Associated IPs */}
                    {isExpanded && domain.ips && domain.ips.length > 0 && (
                      <div className="px-4 sm:px-5 pb-4 bg-secondary/5">
                        <div className="pt-3">
                          <div className="px-1">
                            <p className="text-xs font-medium text-muted-foreground mb-2.5 flex items-center gap-1.5">
                              <Globe className="h-3 w-3" />
                              {t("associatedIPs")}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {domain.ips.map((ip) => {
                                const gradient = getIPGradient(ip);
                                return (
                                  <div
                                    key={ip}
                                    className="flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg bg-card border border-border/50 hover:border-primary/30 hover:shadow-sm transition-all"
                                  >
                                    <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
                                      <Server className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
                                    </div>
                                    <code className="text-xs font-mono break-all">{ip}</code>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {filteredDomains.length > 0 && (
              <div className="p-3 border-t border-border/50 bg-secondary/20">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground">
                          <Rows3 className="h-4 w-4" />
                          <span>{pageSize} / {t("page")}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {PAGE_SIZE_OPTIONS.map((size) => (
                          <DropdownMenuItem
                            key={size}
                            onClick={() => {
                              setPageSize(size);
                              setPage(1);
                            }}
                            className={pageSize === size ? "bg-primary/10" : ""}
                          >
                            {size} / {t("page")}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <span className="text-sm text-muted-foreground">
                      {t("total")} {filteredDomains.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                      {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredDomains.length)} / {filteredDomains.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      {getPageNumbers(page, totalPages).map((p, idx) => (
                        p === '...' ? (
                          <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground text-xs">...</span>
                        ) : (
                          <Button
                            key={p}
                            variant={page === p ? "default" : "ghost"}
                            size="sm"
                            className="h-8 w-8 px-0 text-xs"
                            onClick={() => setPage(p as number)}
                          >
                            {p}
                          </Button>
                        )
                      ))}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
