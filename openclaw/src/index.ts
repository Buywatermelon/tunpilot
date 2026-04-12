// OpenClaw 插件入口：将 TunPilot 服务地址与认证令牌暴露给 Skill 环境。
// 用户在 OpenClaw 配置界面填写 tunpilotUrl 和 authToken，
// Skill 通过 TUNPILOT_URL / TUNPILOT_AUTH_TOKEN 读取。
export default function register(api: any) {
  const config = api.getConfig();

  api.registerService({
    id: "tunpilot-env",
    start: () => {
      api.setSkillEnv?.({
        TUNPILOT_URL: config.tunpilotUrl,
        TUNPILOT_AUTH_TOKEN: config.authToken,
      });
      api.logger.info(`TunPilot env exported: ${config.tunpilotUrl}`);
    },
    stop: () => {
      api.logger.info("TunPilot env cleared");
    },
  });
}
