// Monorepo-aware Metro config for the pnpm workspace.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

// Packages in pnpm's virtual store otherwise walk up to the workspace-level
// node_modules directory. That directory contains the web app's React version,
// which can give the native bundle a second React singleton and make hooks fail
// at launch. Pin React's entry points to the mobile app's dependency graph while
// retaining Metro's normal transitive-dependency resolution for Expo packages.
const mobileReactEntrypoints = new Set([
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
]);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (mobileReactEntrypoints.has(moduleName)) {
    return {
      type: "sourceFile",
      filePath: require.resolve(moduleName, { paths: [projectRoot] }),
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
