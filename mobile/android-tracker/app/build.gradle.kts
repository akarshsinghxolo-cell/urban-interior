plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}
android {
  namespace = "com.urbancastle.tracker"
  compileSdk = 35
  defaultConfig {
    applicationId = "com.urbancastle.tracker"
    minSdk = 26
    targetSdk = 35
    versionCode = 1
    versionName = "1.0.0"
  }
}
dependencies {
  implementation("androidx.appcompat:appcompat:1.7.0")
  implementation("androidx.core:core-ktx:1.15.0")
  implementation("androidx.security:security-crypto:1.1.0-alpha06")
  implementation("com.google.android.gms:play-services-location:21.3.0")
}
