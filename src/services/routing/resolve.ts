// 将 routing_rules 中的 action 解析为实际的 outbound 名称
// 处理 strict 逻辑和节点可用性降级

import type { Node, RoutingRule } from "../../db/schema";

export type ResolvedAction = "direct" | "reject" | "proxy" | string;

/**
 * 解析单条规则的 action 为实际 outbound 名称
 *
 * - action="direct"    → "direct"
 * - action="reject"    → "reject"
 * - action="proxy"     → "proxy"
 * - action=<node_id>   → 节点名（作为 outbound tag）
 *   - strict=0 且节点不可用 → 降级为 "proxy"
 *   - strict=1 且节点不可用 → "reject"（宁可不通）
 */
export function resolveOutbound(
  rule: RoutingRule,
  userNodes: Node[],
  allNodes: Node[],
): ResolvedAction {
  const builtins = ["direct", "reject", "proxy"];
  if (builtins.includes(rule.action)) {
    return rule.action;
  }

  // action 是 node_id，查找节点
  const targetNode = allNodes.find((n) => n.id === rule.action);
  if (!targetNode) {
    return rule.strict ? "reject" : "proxy";
  }

  const userHasNode = userNodes.some((n) => n.id === rule.action);
  if (!userHasNode) {
    return rule.strict ? "reject" : "proxy";
  }

  return targetNode.name;
}

/**
 * 批量解析所有规则，返回 { rule, outbound } 对
 * 按 priority DESC 排序，仅返回 enabled 的规则
 */
export function resolveAllRules(
  rules: RoutingRule[],
  userNodes: Node[],
  allNodes: Node[],
): Array<{ rule: RoutingRule; outbound: ResolvedAction }> {
  return rules
    .filter((r) => r.enabled === 1)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .map((rule) => ({
      rule,
      outbound: resolveOutbound(rule, userNodes, allNodes),
    }));
}
