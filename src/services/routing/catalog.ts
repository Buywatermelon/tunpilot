// 规则集目录 — 定义所有可用的分流分类及其上游 URL
// sing-box: MetaCubeX geo-lite .srs (底层源自 blackmatrix7)
// Clash:    blackmatrix7 远程 rule-providers .yaml
// Surge:    blackmatrix7 远程 RULE-SET .list

const METACUBEX_SING =
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing";
const BM7_CLASH =
  "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash";
const BM7_SURGE =
  "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge";

// ─── 类型定义 ────────────────────────────────────────

export interface SingboxRuleSetRef {
  tag: string;
  url: string;
  type: "geosite" | "geoip";
}

export interface SingboxRemote {
  ruleSets: SingboxRuleSetRef[];
}

export interface SingboxInline {
  type: "inline";
  rule: Record<string, unknown>;
}

export interface SingboxFinal {
  type: "final";
}

export type SingboxDef = SingboxRemote | SingboxInline | SingboxFinal;

export interface ClashProvider {
  name: string;
  url: string;
  behavior: "classical" | "domain" | "ipcidr";
}

export interface ClashDef {
  providers: ClashProvider[];
}

export interface SurgeDef {
  rules: string[]; // "RULE-SET,{url},{outbound}" 模板
}

export interface RuleSetDefinition {
  name: string;
  defaultAction: string;
  singbox: SingboxDef;
  clash: ClashDef | null;
  surge: SurgeDef | null;
}

// ─── 目录定义 ────────────────────────────────────────

export const RULE_SET_CATALOG: Record<string, RuleSetDefinition> = {
  private: {
    name: "私有地址",
    defaultAction: "direct",
    singbox: { type: "inline", rule: { ip_is_private: true } },
    clash: null,
    surge: null,
  },

  ads: {
    name: "广告拦截",
    defaultAction: "reject",
    singbox: {
      ruleSets: [
        {
          tag: "geosite-category-ads-all",
          url: `${METACUBEX_SING}/geo/geosite/category-ads-all.srs`,
          type: "geosite",
        },
      ],
    },
    clash: {
      providers: [
        {
          name: "Advertising",
          url: `${BM7_CLASH}/Advertising/Advertising.yaml`,
          behavior: "classical",
        },
      ],
    },
    surge: {
      rules: [
        `RULE-SET,${BM7_SURGE}/Advertising/Advertising.list,{outbound}`,
      ],
    },
  },

  cn: {
    name: "中国大陆",
    defaultAction: "direct",
    singbox: {
      ruleSets: [
        {
          tag: "geosite-cn",
          url: `${METACUBEX_SING}/geo-lite/geosite/cn.srs`,
          type: "geosite",
        },
        {
          tag: "geoip-cn",
          url: `${METACUBEX_SING}/geo-lite/geoip/cn.srs`,
          type: "geoip",
        },
      ],
    },
    clash: {
      providers: [
        {
          name: "ChinaMax",
          url: `${BM7_CLASH}/ChinaMax/ChinaMax_Classical.yaml`,
          behavior: "classical",
        },
      ],
    },
    surge: {
      rules: [
        `RULE-SET,${BM7_SURGE}/ChinaMax/ChinaMax.list,{outbound}`,
      ],
    },
  },

  openai: {
    name: "OpenAI (ChatGPT)",
    defaultAction: "proxy",
    singbox: {
      ruleSets: [
        {
          tag: "geosite-openai",
          url: `${METACUBEX_SING}/geo-lite/geosite/openai.srs`,
          type: "geosite",
        },
      ],
    },
    clash: {
      providers: [
        {
          name: "OpenAI",
          url: `${BM7_CLASH}/OpenAI/OpenAI.yaml`,
          behavior: "classical",
        },
      ],
    },
    surge: {
      rules: [`RULE-SET,${BM7_SURGE}/OpenAI/OpenAI.list,{outbound}`],
    },
  },

  claude: {
    name: "Anthropic (Claude)",
    defaultAction: "proxy",
    singbox: {
      ruleSets: [
        {
          tag: "geosite-anthropic",
          url: `${METACUBEX_SING}/geo/geosite/anthropic.srs`,
          type: "geosite",
        },
      ],
    },
    clash: {
      providers: [
        {
          name: "Claude",
          url: `${BM7_CLASH}/Claude/Claude.yaml`,
          behavior: "classical",
        },
      ],
    },
    surge: {
      rules: [`RULE-SET,${BM7_SURGE}/Claude/Claude.list,{outbound}`],
    },
  },

  netflix: {
    name: "Netflix",
    defaultAction: "proxy",
    singbox: {
      ruleSets: [
        {
          tag: "geosite-netflix",
          url: `${METACUBEX_SING}/geo-lite/geosite/netflix.srs`,
          type: "geosite",
        },
      ],
    },
    clash: {
      providers: [
        {
          name: "Netflix",
          url: `${BM7_CLASH}/Netflix/Netflix.yaml`,
          behavior: "classical",
        },
      ],
    },
    surge: {
      rules: [`RULE-SET,${BM7_SURGE}/Netflix/Netflix.list,{outbound}`],
    },
  },

  google: {
    name: "Google",
    defaultAction: "proxy",
    singbox: {
      ruleSets: [
        {
          tag: "geosite-google",
          url: `${METACUBEX_SING}/geo-lite/geosite/google.srs`,
          type: "geosite",
        },
      ],
    },
    clash: {
      providers: [
        {
          name: "Google",
          url: `${BM7_CLASH}/Google/Google.yaml`,
          behavior: "classical",
        },
      ],
    },
    surge: {
      rules: [`RULE-SET,${BM7_SURGE}/Google/Google.list,{outbound}`],
    },
  },

  telegram: {
    name: "Telegram",
    defaultAction: "proxy",
    singbox: {
      ruleSets: [
        {
          tag: "geosite-telegram",
          url: `${METACUBEX_SING}/geo-lite/geosite/telegram.srs`,
          type: "geosite",
        },
      ],
    },
    clash: {
      providers: [
        {
          name: "Telegram",
          url: `${BM7_CLASH}/Telegram/Telegram.yaml`,
          behavior: "classical",
        },
      ],
    },
    surge: {
      rules: [
        `RULE-SET,${BM7_SURGE}/Telegram/Telegram.list,{outbound}`,
      ],
    },
  },

  youtube: {
    name: "YouTube",
    defaultAction: "proxy",
    singbox: {
      ruleSets: [
        {
          tag: "geosite-youtube",
          url: `${METACUBEX_SING}/geo-lite/geosite/youtube.srs`,
          type: "geosite",
        },
      ],
    },
    clash: {
      providers: [
        {
          name: "YouTube",
          url: `${BM7_CLASH}/YouTube/YouTube.yaml`,
          behavior: "classical",
        },
      ],
    },
    surge: {
      rules: [`RULE-SET,${BM7_SURGE}/YouTube/YouTube.list,{outbound}`],
    },
  },

  twitter: {
    name: "Twitter/X",
    defaultAction: "proxy",
    singbox: {
      ruleSets: [
        {
          tag: "geosite-twitter",
          url: `${METACUBEX_SING}/geo-lite/geosite/twitter.srs`,
          type: "geosite",
        },
      ],
    },
    clash: {
      providers: [
        {
          name: "Twitter",
          url: `${BM7_CLASH}/Twitter/Twitter.yaml`,
          behavior: "classical",
        },
      ],
    },
    surge: {
      rules: [`RULE-SET,${BM7_SURGE}/Twitter/Twitter.list,{outbound}`],
    },
  },

  spotify: {
    name: "Spotify",
    defaultAction: "proxy",
    singbox: {
      ruleSets: [
        {
          tag: "geosite-spotify",
          url: `${METACUBEX_SING}/geo-lite/geosite/spotify.srs`,
          type: "geosite",
        },
      ],
    },
    clash: {
      providers: [
        {
          name: "Spotify",
          url: `${BM7_CLASH}/Spotify/Spotify.yaml`,
          behavior: "classical",
        },
      ],
    },
    surge: {
      rules: [`RULE-SET,${BM7_SURGE}/Spotify/Spotify.list,{outbound}`],
    },
  },

  github: {
    name: "GitHub",
    defaultAction: "proxy",
    singbox: {
      ruleSets: [
        {
          tag: "geosite-github",
          url: `${METACUBEX_SING}/geo-lite/geosite/github.srs`,
          type: "geosite",
        },
      ],
    },
    clash: {
      providers: [
        {
          name: "GitHub",
          url: `${BM7_CLASH}/GitHub/GitHub.yaml`,
          behavior: "classical",
        },
      ],
    },
    surge: {
      rules: [`RULE-SET,${BM7_SURGE}/GitHub/GitHub.list,{outbound}`],
    },
  },

  microsoft: {
    name: "Microsoft",
    defaultAction: "proxy",
    singbox: {
      ruleSets: [
        {
          tag: "geosite-microsoft",
          url: `${METACUBEX_SING}/geo-lite/geosite/microsoft.srs`,
          type: "geosite",
        },
      ],
    },
    clash: {
      providers: [
        {
          name: "Microsoft",
          url: `${BM7_CLASH}/Microsoft/Microsoft.yaml`,
          behavior: "classical",
        },
      ],
    },
    surge: {
      rules: [
        `RULE-SET,${BM7_SURGE}/Microsoft/Microsoft.list,{outbound}`,
      ],
    },
  },

  apple: {
    name: "Apple",
    defaultAction: "direct",
    singbox: {
      ruleSets: [
        {
          tag: "geosite-apple",
          url: `${METACUBEX_SING}/geo-lite/geosite/apple.srs`,
          type: "geosite",
        },
      ],
    },
    clash: {
      providers: [
        {
          name: "Apple",
          url: `${BM7_CLASH}/Apple/Apple.yaml`,
          behavior: "classical",
        },
      ],
    },
    surge: {
      rules: [`RULE-SET,${BM7_SURGE}/Apple/Apple.list,{outbound}`],
    },
  },

  tiktok: {
    name: "TikTok",
    defaultAction: "proxy",
    singbox: {
      ruleSets: [
        {
          tag: "geosite-tiktok",
          url: `${METACUBEX_SING}/geo-lite/geosite/tiktok.srs`,
          type: "geosite",
        },
      ],
    },
    clash: {
      providers: [
        {
          name: "TikTok",
          url: `${BM7_CLASH}/TikTok/TikTok.yaml`,
          behavior: "classical",
        },
      ],
    },
    surge: {
      rules: [`RULE-SET,${BM7_SURGE}/TikTok/TikTok.list,{outbound}`],
    },
  },

  bilibili: {
    name: "哔哩哔哩",
    defaultAction: "direct",
    singbox: {
      ruleSets: [
        {
          tag: "geosite-bilibili",
          url: `${METACUBEX_SING}/geo-lite/geosite/bilibili.srs`,
          type: "geosite",
        },
      ],
    },
    clash: {
      providers: [
        {
          name: "BiliBili",
          url: `${BM7_CLASH}/BiliBili/BiliBili.yaml`,
          behavior: "classical",
        },
      ],
    },
    surge: {
      rules: [
        `RULE-SET,${BM7_SURGE}/BiliBili/BiliBili.list,{outbound}`,
      ],
    },
  },

  match: {
    name: "其他流量（兜底）",
    defaultAction: "proxy",
    singbox: { type: "final" },
    clash: null,
    surge: null,
  },
};
