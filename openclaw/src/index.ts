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
