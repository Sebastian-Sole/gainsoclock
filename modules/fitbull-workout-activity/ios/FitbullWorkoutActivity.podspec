Pod::Spec.new do |s|
  s.name           = 'FitbullWorkoutActivity'
  s.version        = '1.0.0'
  s.summary        = 'Bridges the Fitbull workout store to the lock-screen Live Activity.'
  s.description    = 'Local Expo module: forwards plan sync / event drain calls to the app-target WorkoutActivityBridge via the ObjC runtime.'
  s.author         = 'Sole Innovations'
  s.homepage       = 'https://github.com/sole-innovations/fitbull'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
