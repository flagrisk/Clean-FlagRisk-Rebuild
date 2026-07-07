// ============================================================================
// FlagRisk app — Metro bundler config
// ----------------------------------------------------------------------------
// We need package-exports resolution ON for libraries like @react-navigation
// (bottom-tabs breaks without it), but @supabase/auth-js historically needed
// it OFF. The modern fix: keep package exports ENABLED, and add the Node-style
// condition so Supabase resolves correctly too. This satisfies both.
// ============================================================================

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Keep package exports enabled (needed by react-navigation).
config.resolver.unstable_enablePackageExports = true;

// Ensure a sane condition order so Supabase's auth-js resolves its internals.
config.resolver.unstable_conditionNames = ["require", "default", "browser"];

module.exports = config;
