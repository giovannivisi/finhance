require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'ExpoReceiptOcr'
  s.version = package['version']
  s.summary = package['description']
  s.description = package['description']
  s.license = package['license']
  s.author = 'finhance'
  s.homepage = 'https://finhance-web.vercel.app'
  s.platforms = {
    :ios => '15.1'
  }
  s.swift_version = '5.9'
  s.source = { git: 'https://github.com/giovisi/finhance.git' }
  s.static_framework = true
  s.source_files = '**/*.{h,m,swift}'
  s.frameworks = 'ImageIO', 'UIKit', 'Vision'

  s.dependency 'ExpoModulesCore'
end
