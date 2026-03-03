import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../../db/index";
import { getSetting, setSetting, deleteSetting, listSettings } from "../../services/settings";

// 注册设置管理工具（3 个）：set_setting, list_settings, delete_setting
export function register(server: McpServer, db: Db, _baseUrl: string) {
  server.registerTool(
    "set_setting",
    {
      description: "Set a configuration value (e.g. API keys). Known keys: ipinfo_token, scamalytics_key, ipqs_key, globalping_token, abuseipdb_key",
      inputSchema: {
        key: z.string().describe("Setting key"),
        value: z.string().describe("Setting value"),
      },
    },
    async ({ key, value }) => {
      setSetting(db, key, value);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, key }) }] };
    }
  );

  server.registerTool(
    "list_settings",
    {
      description: "List all configured settings (values are masked for security)",
      inputSchema: {},
    },
    async () => {
      const list = listSettings(db);
      return { content: [{ type: "text", text: JSON.stringify(list) }] };
    }
  );

  server.registerTool(
    "delete_setting",
    {
      description: "Delete a configuration setting",
      inputSchema: {
        key: z.string().describe("Setting key to delete"),
      },
    },
    async ({ key }) => {
      deleteSetting(db, key);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, key }) }] };
    }
  );
}
