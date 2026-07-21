const { withPodfile } = require("expo/config-plugins");

const MINIMUM_IOS_DEPLOYMENT_TARGET = "15.1";
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

/**
 * Xcode 26 warns for pods declaring obsolete iOS deployment targets (such as
 * AsyncStorage's iOS 9 resource bundle). Raise only lower pod targets to the
 * app's supported floor while preserving any pod that needs a newer target.
 */
module.exports = function withMinimumIosPodTarget(config) {
  return withPodfile(config, (podfileConfig) => {
    const contents = podfileConfig.modResults.contents;

    if (contents.includes(REPLACEMENT_PODFILE_BLOCK)) {
      return podfileConfig;
    }

    if (!contents.includes(GENERATED_PODFILE_BLOCK)) {
      throw new Error(
        "Unable to apply the minimum iOS Pod deployment target: the Expo Podfile template changed.",
      );
    }

    podfileConfig.modResults.contents = contents.replace(
      GENERATED_PODFILE_BLOCK,
      REPLACEMENT_PODFILE_BLOCK,
    );
    return podfileConfig;
  });
};
