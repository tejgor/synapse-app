require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoBackgroundTask'
  s.version        = package['version']
  s.summary        = package['description']
  s.license        = { type: 'MIT' }
  s.homepage       = 'https://github.com/tejasgorla/synapse-app'
  s.authors        = 'Synapse'
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,mm,swift}"
end
