/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-express-in-domain-or-application",
      severity: "error",
      from: { path: "/(domain|application)/" },
      to: { path: "^express$" },
    },
    {
      name: "no-http-to-database-client",
      severity: "error",
      from: { path: "/http/" },
      to: { path: "^(pg|postgres|drizzle-orm)" },
    },
    {
      name: "no-cross-module-infrastructure",
      severity: "error",
      from: { path: "packages/modules/src/([^/]+)/" },
      to: {
        path: "packages/modules/src/([^/]+)/infrastructure/",
        pathNot: "$1",
      },
    },
    {
      name: "no-circular-dependencies",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: "(^|/)dist/|\\.test\\.(ts|tsx)$|\\.spec\\.(ts|tsx)$",
    tsConfig: { fileName: "tsconfig.check.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "default"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
