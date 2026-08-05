const { withPodfile } = require("expo/config-plugins");

const MINIMUM_IOS_DEPLOYMENT_TARGET = "15.1";
const FMT_CONSTEVAL_MARKER = "// FMT_USE_CONSTEVAL override for Xcode 26.4+";
const GENERATED_PODFILE_BLOCK = `    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'

      target.build_configurations.each do |build_config|
        build_config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
    end`;
const REPLACEMENT_PODFILE_BLOCK = `    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current_deployment_target = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current_deployment_target.nil? ||
           Gem::Version.new(current_deployment_target) < Gem::Version.new('${MINIMUM_IOS_DEPLOYMENT_TARGET}')
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MINIMUM_IOS_DEPLOYMENT_TARGET}'
        end

        if target.name == 'fmt'
          build_config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
        end
      end
    end`;
const FMT_CONSTEVAL_WORKAROUND = `    # Xcode 26.4+ cannot compile React Native 0.81's bundled fmt 11.0.2
    # consteval format strings when they are included by a C++20 pod such as
    # RCT-Folly. Keep runtime formatting intact while disabling only that
    # compile-time validation path. Remove this once React Native upgrades fmt
    # to 12.1.0 or newer.
    fmt_base = File.join(installer.sandbox.root, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base)
      fmt_contents = File.read(fmt_base)
      fmt_marker = '${FMT_CONSTEVAL_MARKER}'
      unless fmt_contents.include?(fmt_marker)
        fmt_needle = "#if FMT_USE_CONSTEVAL\\n#  define FMT_CONSTEVAL consteval"
        raise 'fmt/base.h has an unexpected FMT_USE_CONSTEVAL definition' unless fmt_contents.include?(fmt_needle)

        fmt_replacement = "#{fmt_marker}\\n#undef FMT_USE_CONSTEVAL\\n#define FMT_USE_CONSTEVAL 0\\n#{fmt_needle}"
        File.chmod(0o644, fmt_base)
        File.write(fmt_base, fmt_contents.sub(fmt_needle, fmt_replacement))
      end
    end`;
const REPLACEMENT_PODFILE_BLOCK_WITH_FMT_WORKAROUND = `${FMT_CONSTEVAL_WORKAROUND}

${REPLACEMENT_PODFILE_BLOCK}`;

/**
 * Xcode 26 warns for pods declaring obsolete iOS deployment targets (such as
 * AsyncStorage's iOS 9 resource bundle). Raise only lower pod targets to the
 * app's supported floor while preserving any pod that needs a newer target.
 */
module.exports = function withMinimumIosPodTarget(config) {
  return withPodfile(config, (podfileConfig) => {
    const contents = podfileConfig.modResults.contents;

    if (
      contents.includes(REPLACEMENT_PODFILE_BLOCK_WITH_FMT_WORKAROUND) ||
      (contents.includes(FMT_CONSTEVAL_MARKER) &&
        contents.includes(REPLACEMENT_PODFILE_BLOCK))
    ) {
      return podfileConfig;
    }

    const targetBlock = contents.includes(REPLACEMENT_PODFILE_BLOCK)
      ? REPLACEMENT_PODFILE_BLOCK
      : GENERATED_PODFILE_BLOCK;

    if (!contents.includes(targetBlock)) {
      throw new Error(
        "Unable to apply the iOS Podfile workarounds: the Expo Podfile template changed.",
      );
    }

    podfileConfig.modResults.contents = contents.replace(
      targetBlock,
      REPLACEMENT_PODFILE_BLOCK_WITH_FMT_WORKAROUND,
    );
    return podfileConfig;
  });
};
