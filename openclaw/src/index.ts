// OpenClaw 插件入口：向 Gateway 注册 TunPilot MCP 连接
// 用户通过 OpenClaw 配置 UI 填写 tunpilotUrl 和 mcpToken
export default function register(api: any) {
  const config = api.getConfig();

  api.registerService({
    id: "tunpilot-mcp",
    start: () => {
      api.registerMcpServer({
        id: "tunpilot",
        transport: {
          type: "http",
          url: `${config.tunpilotUrl}/mcp`,
          headers: {
            Authorization: `Bearer ${config.mcpToken}`,
          },
        },
      });
      api.logger.info(`TunPilot MCP connected: ${config.tunpilotUrl}`);
    },
    stop: () => {
      api.logger.info("TunPilot MCP disconnected");
    },
  });
}
