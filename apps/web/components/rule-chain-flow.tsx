"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  getStraightPath,
  useReactFlow,
  type Node,
  type Edge,
  type EdgeProps,
  Position,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Workflow, Loader2, Server, Layers, Eye, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatBytes, formatNumber } from "@/lib/utils";
import { useTheme } from "next-themes";
import { api } from "@/lib/api";
import { resolveActiveChains, type ActiveChainInfo } from "@/lib/active-chain";
import { useTranslations } from "next-intl";

// ---------- Types ----------

interface MergedChainNode {
  name: string;
  layer: number;
  nodeType: "rule" | "group" | "proxy";
  totalUpload: number;
  totalDownload: number;
  totalConnections: number;
  rules: string[];
}

interface AllChainFlowData {
  nodes: MergedChainNode[];
  links: Array<{ source: number; target: number; rules: string[] }>;
  rulePaths: Record<string, { nodeIndices: number[]; linkIndices: number[] }>;
  maxLayer: number;
}

interface UnifiedRuleChainFlowProps {
  selectedRule: string | null;
  activeBackendId?: number;
}

// ---------- Layout constants ----------

const COLUMN_WIDTH = 280;
const NODE_HEIGHT = 95;
const OTHER_NODES_OFFSET = 130;

// ---------- Custom Edge ----------

function MergedAnimatedFlowEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps) {
  const edgeData = data as
    | {
        isToProxy?: boolean;
        dimmed?: boolean;
        showAll?: boolean;
        _zeroTraffic?: boolean;
      }
    | undefined;
  const isToProxy = edgeData?.isToProxy;
  const dimmed = edgeData?.dimmed;
  const showAll = edgeData?.showAll;
  const zeroTraffic = edgeData?._zeroTraffic;
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  const dotColor = zeroTraffic ? "#9CA3AF" : isToProxy ? "#34d399" : "#a5b4fc";
  const trackColor = zeroTraffic
    ? "rgba(156, 163, 175, 0.1)"
    : isToProxy
      ? "rgba(16, 185, 129, 0.12)"
      : "rgba(129, 140, 248, 0.12)";
  const lineColor = zeroTraffic
    ? "rgba(156, 163, 175, 0.25)"
    : isToProxy
      ? "rgba(16, 185, 129, 0.3)"
      : "rgba(129, 140, 248, 0.3)";

  // Particles only when actively highlighted (not dimmed, not showAll overview, and not zero-traffic)
  const showParticles = !dimmed && !showAll && !zeroTraffic;

  return (
    <g
      style={{
        opacity: dimmed ? 0.12 : zeroTraffic ? 0.5 : 1,
        transition: "opacity 0.4s ease",
      }}>
      <path
        d={edgePath}
        fill="none"
        stroke={trackColor}
        strokeWidth={10}
        strokeLinecap="round"
      />
      <path
        d={edgePath}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {showParticles && (
        <>
          <circle r="3.5" fill={dotColor} opacity="0.9">
            <animateMotion
              dur="2s"
              repeatCount="indefinite"
              path={edgePath}
              begin="0s"
            />
          </circle>
          <circle r="2.5" fill={dotColor} opacity="0.5">
            <animateMotion
              dur="2s"
              repeatCount="indefinite"
              path={edgePath}
              begin="0.66s"
            />
          </circle>
          <circle r="1.5" fill={dotColor} opacity="0.25">
            <animateMotion
              dur="2s"
              repeatCount="indefinite"
              path={edgePath}
              begin="1.33s"
            />
          </circle>
        </>
      )}
    </g>
  );
}

// ---------- Custom Node ----------

function MergedChainNodeComponent({
  data,
}: {
  data: MergedChainNode & { dimmed?: boolean; _zeroTraffic?: boolean };
}) {
  const dimmed = data.dimmed;
  const zeroTraffic = (data as any)._zeroTraffic;
  const wrapStyle: React.CSSProperties = {
    opacity: dimmed ? 0.12 : zeroTraffic ? 0.5 : 1,
    filter: zeroTraffic ? "grayscale(100%)" : undefined,
    transition: "opacity 0.4s ease, filter 0.4s ease",
  };

  // PROXY node - green theme with PROXY badge
  if (data.nodeType === "proxy") {
    return (
      <div className="relative" style={wrapStyle}>
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-semibold tracking-wider z-10 shadow-sm">
          PROXY
        </div>
        <div className="relative px-5 py-3.5 rounded-xl border border-emerald-400/50 bg-gradient-to-br from-emerald-50 to-teal-50/50 dark:from-emerald-500/15 dark:to-emerald-500/5 min-w-[170px] shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/10">
          <Handle
            type="target"
            position={Position.Left}
            className="!w-2.5 !h-2.5 !bg-emerald-400 !border-emerald-500"
          />
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-sm">
              <Server className="h-4 w-4" />
            </div>
            <span className="text-xs font-semibold truncate flex-1 text-emerald-800 dark:text-emerald-200 max-w-[120px]">
              {data.name}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-emerald-600 dark:text-emerald-400">
              ↓ {formatBytes(data.totalDownload)}
            </span>
            <span className="text-emerald-500/70 dark:text-emerald-400/60">
              ↑ {formatBytes(data.totalUpload)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Rule node - violet theme with connection count badge
  if (data.nodeType === "rule") {
    return (
      <div className="relative" style={wrapStyle}>
        <div className="relative px-5 py-3.5 rounded-xl border border-violet-300/50 dark:border-violet-500/30 bg-gradient-to-br from-violet-50 to-white dark:from-violet-500/15 dark:to-violet-900/20 min-w-[170px] shadow-sm">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white bg-violet-500 shadow-sm">
              <Workflow className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium truncate flex-1 max-w-[120px]">
              {data.name}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="text-blue-500">
              ↓ {formatBytes(data.totalDownload)}
            </span>
            <span className="text-purple-500">
              ↑ {formatBytes(data.totalUpload)}
            </span>
          </div>
          <div className="absolute -top-2.5 -right-2.5 px-1.5 py-0.5 rounded-full bg-violet-500 text-white text-[10px] font-medium shadow-sm">
            {formatNumber(data.totalConnections)}
          </div>
          <Handle
            type="source"
            position={Position.Right}
            className="!w-2 !h-2 !bg-indigo-300 !border-indigo-400"
          />
        </div>
      </div>
    );
  }

  // Group node - blue/indigo theme
  return (
    <div className="relative" style={wrapStyle}>
      <div className="relative px-5 py-3.5 rounded-xl border border-blue-300/40 dark:border-blue-500/30 bg-gradient-to-br from-blue-50/80 to-white dark:from-blue-500/15 dark:to-blue-900/20 min-w-[170px] shadow-sm">
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2 !h-2 !bg-indigo-300 !border-indigo-400"
        />
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white bg-blue-500 shadow-sm">
            <Layers className="h-4 w-4" />
          </div>
          <span className="text-xs font-medium truncate flex-1 max-w-[120px]">
            {data.name}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="text-blue-500">
            ↓ {formatBytes(data.totalDownload)}
          </span>
          <span className="text-purple-500">
            ↑ {formatBytes(data.totalUpload)}
          </span>
        </div>
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2 !h-2 !bg-indigo-300 !border-indigo-400"
        />
      </div>
    </div>
  );
}

// ---------- Registered types (defined outside component to avoid re-creation) ----------

const nodeTypes = { mergedChainNode: MergedChainNodeComponent };
const edgeTypes = { mergedAnimatedFlow: MergedAnimatedFlowEdge };

// ---------- Compute a structure fingerprint for detecting structural vs data-only changes ----------

function computeStructureKey(data: AllChainFlowData): string {
  const nodeNames = data.nodes.map((n) => n.name).join("|");
  const linkKeys = data.links.map((l) => `${l.source}-${l.target}`).join("|");
  return `${nodeNames}::${linkKeys}`;
}

// ---------- Inner renderer (needs ReactFlowProvider context) ----------

function FlowRenderer({
  data,
  selectedRule,
  showAll,
}: {
  data: AllChainFlowData;
  selectedRule: string | null;
  showAll: boolean;
}) {
  const { fitView } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const isFirstRender = useRef(true);
  const reactFlowReady = useRef(false);
  const pendingFitViewRef = useRef<(() => void) | null>(null);
  const prevStructureKeyRef = useRef<string>("");
  const prevSelectedRuleRef = useRef<string | null>(null);
  const prevShowAllRef = useRef<boolean>(false);

  // Active chain indices
  const activeIndices = useMemo(() => {
    if (!selectedRule || !data.rulePaths[selectedRule]) return null;
    return data.rulePaths[selectedRule];
  }, [selectedRule, data]);

  // Structure key to detect structural vs data-only changes
  const structureKey = useMemo(() => computeStructureKey(data), [data]);

  // Compute layout & trigger viewport animation
  useEffect(() => {
    if (data.nodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Detect if this is a data-only update (same structure, same selection, same showAll)
    const isDataOnlyUpdate =
      structureKey === prevStructureKeyRef.current &&
      selectedRule === prevSelectedRuleRef.current &&
      showAll === prevShowAllRef.current &&
      !isFirstRender.current;

    prevStructureKeyRef.current = structureKey;
    prevSelectedRuleRef.current = selectedRule;
    prevShowAllRef.current = showAll;

    // For data-only updates: update node data in-place without re-layout or fitView
    if (isDataOnlyUpdate) {
      setNodes((prev) =>
        prev.map((node) => {
          const idx = Number(node.id);
          const freshNode = data.nodes[idx];
          if (!freshNode) return node;
          const activeNodeSet = activeIndices
            ? new Set(activeIndices.nodeIndices)
            : null;
          return {
            ...node,
            data: {
              ...freshNode,
              dimmed: activeNodeSet ? !activeNodeSet.has(idx) : false,
            },
          };
        }),
      );
      return;
    }

    const activeNodeSet = activeIndices
      ? new Set(activeIndices.nodeIndices)
      : null;

    // Group nodes by layer, sort by traffic within each layer
    const layerGroups = new Map<number, number[]>();
    data.nodes.forEach((node, idx) => {
      if (!layerGroups.has(node.layer)) layerGroups.set(node.layer, []);
      layerGroups.get(node.layer)!.push(idx);
    });
    for (const [, indices] of layerGroups) {
      indices.sort((a, b) => {
        const at = data.nodes[a].totalUpload + data.nodes[a].totalDownload;
        const bt = data.nodes[b].totalUpload + data.nodes[b].totalDownload;
        return bt - at;
      });
    }

    // ----- Position computation -----
    const positions = new Map<number, { x: number; y: number }>();

    if (activeNodeSet && !showAll) {
      // FOCUSED MODE: selected chain nodes centered, fanned out per layer
      // Group active nodes by layer (handles multiple proxies in same layer)
      const activeByLayer = new Map<number, number[]>();
      for (const nodeIdx of activeIndices!.nodeIndices) {
        const layer = data.nodes[nodeIdx].layer;
        if (!activeByLayer.has(layer)) activeByLayer.set(layer, []);
        activeByLayer.get(layer)!.push(nodeIdx);
      }

      // Position active nodes: single → y=0, multiple → fanned vertically around y=0
      for (const [layer, indices] of activeByLayer) {
        indices.sort((a, b) => {
          const at = data.nodes[a].totalUpload + data.nodes[a].totalDownload;
          const bt = data.nodes[b].totalUpload + data.nodes[b].totalDownload;
          return bt - at;
        });
        const count = indices.length;
        const totalHeight = count * NODE_HEIGHT;
        indices.forEach((nodeIdx, posInLayer) => {
          positions.set(nodeIdx, {
            x: layer * COLUMN_WIDTH,
            y: posInLayer * NODE_HEIGHT - totalHeight / 2 + NODE_HEIGHT / 2,
          });
        });
      }

      // Non-active nodes below: offset from the lowest active node
      let maxActiveY = 0;
      for (const pos of positions.values()) {
        maxActiveY = Math.max(maxActiveY, pos.y);
      }
      for (const [layer, indices] of layerGroups) {
        const others = indices.filter((i) => !activeNodeSet.has(i));
        others.forEach((nodeIdx, posInLayer) => {
          positions.set(nodeIdx, {
            x: layer * COLUMN_WIDTH,
            y: maxActiveY + OTHER_NODES_OFFSET + posInLayer * NODE_HEIGHT,
          });
        });
      }
    } else {
      // SHOW-ALL / no selection: natural column layout, vertically centered
      for (const [layer, indices] of layerGroups) {
        const layerHeight = indices.length * NODE_HEIGHT;
        indices.forEach((nodeIdx, posInLayer) => {
          positions.set(nodeIdx, {
            x: layer * COLUMN_WIDTH,
            y: posInLayer * NODE_HEIGHT - layerHeight / 2,
          });
        });
      }
    }

    // ----- Build flow nodes -----
    const flowNodes: Node[] = data.nodes.map((node, idx) => ({
      id: String(idx),
      type: "mergedChainNode",
      position: positions.get(idx) || { x: 0, y: 0 },
      data: {
        ...node,
        dimmed: activeNodeSet ? !activeNodeSet.has(idx) : false,
        _zeroTraffic: !!(node as any)._zeroTraffic,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    }));

    // ----- Build flow edges -----
    const activeLinkSet = activeIndices
      ? new Set(activeIndices.linkIndices)
      : null;
    const flowEdges: Edge[] = data.links.map((link, idx) => {
      const targetNode = data.nodes[link.target];
      const sourceNode = data.nodes[link.source];
      const isToProxy = targetNode?.nodeType === "proxy";
      const isDimmed = activeLinkSet ? !activeLinkSet.has(idx) : false;
      const isZeroTraffic = !!(
        (sourceNode as any)?._zeroTraffic || (targetNode as any)?._zeroTraffic
      );
      return {
        id: `e-${link.source}-${link.target}`,
        source: String(link.source),
        target: String(link.target),
        type: "mergedAnimatedFlow",
        data: {
          isToProxy,
          dimmed: isDimmed,
          showAll,
          _zeroTraffic: isZeroTraffic,
        },
      };
    });

    setNodes(flowNodes);
    setEdges(flowEdges);

    // ----- Animate viewport -----
    const duration = isFirstRender.current ? 0 : 400;
    isFirstRender.current = false;

    const doFitView = () => {
      if (showAll || !activeIndices) {
        fitView({ duration, padding: 0.15 });
      } else {
        fitView({
          nodes: activeIndices.nodeIndices.map((i) => ({
            id: String(i),
          })),
          duration,
          padding: 0.15,
        });
      }
    };

    // If ReactFlow hasn't initialized yet, defer fitView to onInit callback
    if (!reactFlowReady.current) {
      pendingFitViewRef.current = doFitView;
      return;
    }

    // Use double rAF to ensure container resize + React commit + ReactFlow
    // internal ResizeObserver have all completed before computing the viewport.
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        doFitView();
      });
    });

    return () => {
      cancelled = true;
    };
  }, [data, activeIndices, showAll, structureKey, setNodes, setEdges, fitView]);

  // Called when ReactFlow instance is ready — execute any pending fitView
  const handleInit = useCallback(() => {
    reactFlowReady.current = true;
    if (pendingFitViewRef.current) {
      const pending = pendingFitViewRef.current;
      pendingFitViewRef.current = null;
      // Still use rAF to let the first paint with nodes complete
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          pending();
        });
      });
    }
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onInit={handleInit}
      colorMode={isDark ? "dark" : "light"}
      attributionPosition="bottom-right"
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      zoomOnScroll={true}
      panOnScroll={false}
      zoomOnDoubleClick={true}
      className="chain-flow-graph">
      <Background color={isDark ? "#374151" : "#e5e7eb"} gap={20} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

// ---------- Main component ----------

export function UnifiedRuleChainFlow({
  selectedRule,
  activeBackendId,
}: UnifiedRuleChainFlowProps) {
  const t = useTranslations("rules");
  const [data, setData] = useState<AllChainFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [activePolicyOnly, setActivePolicyOnly] = useState(false);
  const [activeChainInfo, setActiveChainInfo] =
    useState<ActiveChainInfo | null>(null);
  const prevRuleRef = useRef(selectedRule);

  // Initial fetch + background polling every 5 seconds
  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function initialLoad() {
      setLoading(true);
      setError(null);
      try {
        const result = await api.getAllRuleChainFlows(activeBackendId);
        if (cancelled) return;
        setData(result);
        setLoading(false);
        // Start polling after successful initial load
        interval = setInterval(async () => {
          try {
            const fresh = await api.getAllRuleChainFlows(activeBackendId);
            if (!cancelled) setData(fresh);
          } catch {
            // Silent failure for background polls
          }
        }, 5000);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load chain flows:", err);
        setError("Failed to load chain flows");
        setLoading(false);
      }
    }

    initialLoad();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [activeBackendId]);

  // Fetch active chain info when activePolicyOnly is ON
  useEffect(() => {
    if (!activePolicyOnly) {
      setActiveChainInfo(null);
      return;
    }
    let cancelled = false;

    async function fetchActiveChains() {
      try {
        const [providers, rules] = await Promise.all([
          api.getClashProviders(activeBackendId),
          api.getClashRules(activeBackendId),
        ]);
        if (cancelled) return;
        setActiveChainInfo(resolveActiveChains(providers, rules));
      } catch {
        if (!cancelled) setActivePolicyOnly(false);
      }
    }

    fetchActiveChains();
    const interval = setInterval(fetchActiveChains, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activePolicyOnly, activeBackendId]);

  // When user selects a different rule, auto-disable showAll
  useEffect(() => {
    if (selectedRule && selectedRule !== prevRuleRef.current) {
      prevRuleRef.current = selectedRule;
      setShowAll(false);
    }
  }, [selectedRule]);

  // Filter DAG when activePolicyOnly is ON
  const filteredData = useMemo((): AllChainFlowData | null => {
    if (!data) return null;
    if (!activePolicyOnly || !activeChainInfo) return data;

    const { activeNodeNames, activeLinkKeys, activeChains } = activeChainInfo;

    // Build name→index map of existing nodes
    const existingNodeMap = new Map<string, number>();
    data.nodes.forEach((n, i) => existingNodeMap.set(n.name, i));

    // Determine which existing nodes are active
    const keepNodeIndices = new Set<number>();
    for (const [, idx] of existingNodeMap) {
      if (activeNodeNames.has(data.nodes[idx].name)) {
        keepNodeIndices.add(idx);
      }
    }

    // Build new nodes array (existing active + zero-traffic for missing)
    const newNodes: MergedChainNode[] = [];
    const nameToNewIdx = new Map<string, number>();

    // First: existing active nodes
    for (const idx of keepNodeIndices) {
      const node = data.nodes[idx];
      nameToNewIdx.set(node.name, newNodes.length);
      newNodes.push({ ...node });
    }

    // Second: add zero-traffic nodes for active chain members not in existing data
    for (const [, chain] of activeChains) {
      for (let i = 0; i < chain.length; i++) {
        const name = chain[i];
        if (!nameToNewIdx.has(name)) {
          const nodeType: "rule" | "group" | "proxy" =
            i === 0 ? "rule" : i === chain.length - 1 ? "proxy" : "group";
          nameToNewIdx.set(name, newNodes.length);
          newNodes.push({
            name,
            layer: i,
            nodeType,
            totalUpload: 0,
            totalDownload: 0,
            totalConnections: 0,
            rules: [],
            _zeroTraffic: true,
          } as MergedChainNode & { _zeroTraffic?: boolean } as any);
        }
      }
    }

    // Build new links
    const newLinks: Array<{ source: number; target: number; rules: string[] }> =
      [];
    const linkKeySet = new Set<string>();

    // Existing active links
    for (const link of data.links) {
      const srcName = data.nodes[link.source]?.name;
      const tgtName = data.nodes[link.target]?.name;
      if (srcName && tgtName && activeLinkKeys.has(`${srcName}|${tgtName}`)) {
        const newSrc = nameToNewIdx.get(srcName);
        const newTgt = nameToNewIdx.get(tgtName);
        if (newSrc !== undefined && newTgt !== undefined) {
          const key = `${newSrc}-${newTgt}`;
          if (!linkKeySet.has(key)) {
            linkKeySet.add(key);
            newLinks.push({
              source: newSrc,
              target: newTgt,
              rules: link.rules,
            });
          }
        }
      }
    }

    // Zero-traffic links for active chains not yet covered
    for (const [, chain] of activeChains) {
      for (let i = 0; i < chain.length - 1; i++) {
        const srcIdx = nameToNewIdx.get(chain[i]);
        const tgtIdx = nameToNewIdx.get(chain[i + 1]);
        if (srcIdx !== undefined && tgtIdx !== undefined) {
          const key = `${srcIdx}-${tgtIdx}`;
          if (!linkKeySet.has(key)) {
            linkKeySet.add(key);
            newLinks.push({ source: srcIdx, target: tgtIdx, rules: [] });
          }
        }
      }
    }

    // Rebuild rulePaths for the filtered data
    const newRulePaths: Record<
      string,
      { nodeIndices: number[]; linkIndices: number[] }
    > = {};
    for (const [ruleName, chain] of activeChains) {
      const nodeIndices: number[] = [];
      const linkIndices: number[] = [];
      for (const name of chain) {
        const idx = nameToNewIdx.get(name);
        if (idx !== undefined) nodeIndices.push(idx);
      }
      // Find link indices
      for (let i = 0; i < chain.length - 1; i++) {
        const srcIdx = nameToNewIdx.get(chain[i]);
        const tgtIdx = nameToNewIdx.get(chain[i + 1]);
        if (srcIdx !== undefined && tgtIdx !== undefined) {
          const linkIdx = newLinks.findIndex(
            (l) => l.source === srcIdx && l.target === tgtIdx,
          );
          if (linkIdx !== -1) linkIndices.push(linkIdx);
        }
      }
      if (nodeIndices.length > 0) {
        newRulePaths[ruleName] = { nodeIndices, linkIndices };
      }
    }

    // Compute maxLayer
    const maxLayer = newNodes.reduce((max, n) => Math.max(max, n.layer), 0);

    return {
      nodes: newNodes,
      links: newLinks,
      rulePaths: newRulePaths,
      maxLayer,
    };
  }, [data, activePolicyOnly, activeChainInfo]);

  // Use filteredData for rendering
  const renderData = filteredData;

  // Container height: compact for focused mode, taller for show-all
  const containerHeight = useMemo(() => {
    if (!renderData || renderData.nodes.length === 0) return 280;

    if (!showAll && selectedRule && renderData.rulePaths[selectedRule]) {
      // Focused mode: just enough for the active chain
      const activeNodes = renderData.rulePaths[selectedRule].nodeIndices;
      const layerCounts = new Map<number, number>();
      for (const idx of activeNodes) {
        const layer = renderData.nodes[idx].layer;
        layerCounts.set(layer, (layerCounts.get(layer) || 0) + 1);
      }
      const maxActiveInLayer =
        layerCounts.size > 0 ? Math.max(...layerCounts.values()) : 1;
      return Math.max(200, maxActiveInLayer * NODE_HEIGHT + 100);
    }

    // Show-all mode: full height based on densest layer
    const layerCounts = new Map<number, number>();
    renderData.nodes.forEach((node) => {
      layerCounts.set(node.layer, (layerCounts.get(node.layer) || 0) + 1);
    });
    const maxNodesInLayer = Math.max(...layerCounts.values());
    return Math.min(600, Math.max(300, maxNodesInLayer * 90 + 60));
  }, [renderData, showAll, selectedRule]);

  if (loading) {
    return (
      <Card className="mb-4">
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t("loadingChainFlow")}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !renderData || renderData.nodes.length <= 1) {
    return null;
  }

  return (
    <Card className="mb-4 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary" />
            {t("chainFlow")}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-7 px-3 text-xs gap-1.5 rounded-full transition-colors",
                activePolicyOnly
                  ? "border-emerald-500 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 dark:border-emerald-500/50"
                  : "hover:border-emerald-300 hover:text-emerald-600",
              )}
              onClick={() => setActivePolicyOnly(!activePolicyOnly)}>
              <Activity className={cn("h-3.5 w-3.5", activePolicyOnly && "text-emerald-500")} />
              {t("activePolicy")}
            </Button>
            <Button
              variant={showAll ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-7 px-3 text-xs gap-1.5 rounded-full",
                showAll && "bg-primary/90 hover:bg-primary",
              )}
              onClick={() => setShowAll(!showAll)}>
              <Eye className="h-3.5 w-3.5" />
              {t("showAll")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div style={{ height: containerHeight }} className="w-full">
          <ReactFlowProvider>
            <FlowRenderer
              data={renderData}
              selectedRule={showAll ? null : selectedRule}
              showAll={showAll}
            />
          </ReactFlowProvider>
        </div>
      </CardContent>
    </Card>
  );
}

// Backward-compatible alias
export { UnifiedRuleChainFlow as RuleChainFlow };
