import type { User, Node, RoutingRule, CustomRule } from "../../db/schema";

// --- 接口定义 ---

export interface RenderMeta {
  subscriptionUrl?: string;
  routingRules?: RoutingRule[];
  customRules?: CustomRule[];
  allNodes?: Node[];
  settings?: Record<string, string>;
}

export interface SubscriptionFormat {
  name: string;
  contentType: string;
  render(user: User, nodes: Node[], meta?: RenderMeta): string;
}

// --- Format Registry ---

const registry = new Map<string, SubscriptionFormat>();

export function registerFormat(format: SubscriptionFormat): void {
  registry.set(format.name, format);
}

export function getFormat(name: string): SubscriptionFormat | undefined {
  return registry.get(name);
}

export function getAllFormatNames(): string[] {
  return [...registry.keys()];
}

// --- 自动注册所有格式 ---

import { singbox } from "./singbox";
import { clash } from "./clash";
import { surge } from "./surge";

registerFormat(singbox);
registerFormat(clash);
registerFormat(surge);
// shadowrocket → surge 别名（小火箭完全兼容 Surge 配置）
registry.set("shadowrocket", surge);
