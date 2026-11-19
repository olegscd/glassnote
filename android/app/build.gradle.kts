plugins {
  alias(libs.plugins.android.application)
}

android {
  namespace = "com.yumpzy.glassnote"
  compileSdk = 35
  defaultConfig {
    applicationId = "com.yumpzy.glassnote"
    minSdk = 26
    targetSdk = 35
    versionCode = 1
    versionName = "0.3.0"
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  buildFeatures {
    aidl = false
    buildConfig = false
    shaders = false
  }
}

kotlin {
  jvmToolchain(17)
}

dependencies {
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.activity.ktx)
  implementation(libs.androidx.webkit)
}
