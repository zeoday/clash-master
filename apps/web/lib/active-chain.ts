import type { GatewayProvidersResponse, GatewayRulesResponse } from "./api";

export interface ActiveChainInfo {
  /** Set of node names that are part of active chains */
  activeNodeNames: Set<string>;
  /** Set of "sourceName|targetName" keys for active links */
  activeLinkKeys: Set<string>;
  /** Map from proxy group name to its full active chain path */
  activeChains: Map<string, string[]>;
}

/**
 * Build a map of group name → currently selected proxy/group name
 * from the providers/proxies response.
 */
function buildGroupNowMap(providers: GatewayProvidersResponse): Map<string, string> {
  const map = new Map<string, string>();
  for (const provider of Object.values(providers.providers)) {
    if (!provider.proxies) continue;
    for (const proxy of provider.proxies) {
      if (proxy.now) {
        map.set(proxy.name, proxy.now);
      }
    }
  }
  return map;
}

/**
 * Follow the active proxy chain from a starting group name.
 * Returns the full path including the starting group.
 */
function followChain(startGroup: string, groupNowMap: Map<string, string>): string[] {
  const path: string[] = [startGroup];
  const visited = new Set<string>();
  visited.add(startGroup);

  let current = startGroup;
  while (groupNowMap.has(current)) {
    const next = groupNowMap.get(current)!;
    if (visited.has(next)) break; // prevent cycles
    visited.add(next);
    path.push(next);
    current = next;
  }
  return path;
}

/**
 * Resolve active policy chains from Gateway providers and rules data.
 */
export function resolveActiveChains(
  providers: GatewayProvidersResponse,
  rules: GatewayRulesResponse
): ActiveChainInfo {
  const groupNowMap = buildGroupNowMap(providers);
  const activeNodeNames = new Set<string>();
  const activeLinkKeys = new Set<string>();
  const activeChains = new Map<string, string[]>();

  const processedGroups = new Set<string>();

  for (const rule of rules.rules) {
    const targetGroup = rule.proxy;
    if (processedGroups.has(targetGroup)) continue;
    processedGroups.add(targetGroup);

    const chain = followChain(targetGroup, groupNowMap);
    activeChains.set(targetGroup, chain);

    for (const name of chain) {
      activeNodeNames.add(name);
    }
    for (let i = 0; i < chain.length - 1; i++) {
      activeLinkKeys.add(`${chain[i]}|${chain[i + 1]}`);
    }
  }

  return { activeNodeNames, activeLinkKeys, activeChains };
}
