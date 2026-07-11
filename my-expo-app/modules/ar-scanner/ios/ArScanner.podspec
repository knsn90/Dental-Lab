Pod::Spec.new do |s|
  s.name           = 'ArScanner'
  s.version        = '0.1.0'
  s.summary        = 'TrueDepth-based 3D face capture module.'
  s.description    = 'Native iOS Expo module that captures a 3D face mesh via ARKit and exports OBJ/STL/PNG.'
  s.author         = ''
  s.homepage       = 'https://github.com/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.swift_version  = '5.4'
  s.source_files   = "**/*.{h,m,swift}"
  s.resource_bundles = { 'ArScannerAssets' => ['Resources/*'] }
end
