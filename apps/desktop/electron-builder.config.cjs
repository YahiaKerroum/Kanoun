module.exports = {
  appId: "com.mise.desktop",
  productName: "MISE Desktop",
  directories: {
    output: "release",
  },
  files: ["dist/**/*", "package.json"],
  extraResources: [
    { from: "vendor/postgresql", to: "postgresql" },
    {
      from: "../../scripts",
      to: "app-bundle/scripts",
      filter: ["**/*.ts", "!**/*.test.ts"],
    },
    {
      from: "../../packages",
      to: "app-bundle/packages",
      filter: ["*/dist/**/*", "*/package.json"],
    },
    { from: "../../apps/api/dist", to: "app-bundle/apps/api/dist" },
    { from: "../../apps/api/package.json", to: "app-bundle/apps/api/package.json" },
    { from: "../../apps/worker/dist", to: "app-bundle/apps/worker/dist" },
    {
      from: "../../apps/worker/package.json",
      to: "app-bundle/apps/worker/package.json",
    },
    { from: "../../apps/web/customer/dist", to: "app-bundle/apps/web/customer/dist" },
    {
      from: "../../apps/web/customer/node_modules/vite",
      to: "app-bundle/apps/web/customer/node_modules/vite",
    },
    { from: "../../apps/web/staff/dist", to: "app-bundle/apps/web/staff/dist" },
    {
      from: "../../apps/web/staff/node_modules/vite",
      to: "app-bundle/apps/web/staff/node_modules/vite",
    },
    { from: "../../apps/web/admin/dist", to: "app-bundle/apps/web/admin/dist" },
    {
      from: "../../apps/web/admin/node_modules/vite",
      to: "app-bundle/apps/web/admin/node_modules/vite",
    },
    { from: "../../node_modules", to: "app-bundle/node_modules" },
    { from: "../../package.json", to: "app-bundle/package.json" },
  ],
  win: {
    target: ["nsis", "portable"],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
  },
};
