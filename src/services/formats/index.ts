import type { User, Node } from "../../db/schema";

// --- 接口定义 ---

export interface RenderMeta {
  subscriptionUrl?: string;
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

import { shadowrocket } from "./shadowrocket";
import { singbox } from "./singbox";
import { clash } from "./clash";
import { surge } from "./surge";

registerFormat(shadowrocket);
registerFormat(singbox);
registerFormat(clash);
registerFormat(surge);
