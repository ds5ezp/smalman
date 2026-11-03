plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.geojecwc.signage"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.geojecwc.signage"
        // Google TV(안드로이드 9 이상)에서 동작
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        // 사이니지 주소. 바꾸려면 여기만 고친 뒤 다시 빌드하세요.
        buildConfigField(
            "String",
            "SIGNAGE_URL",
            "\"https://script.google.com/macros/s/여기에_배포ID/exec\""
        )
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.leanback:leanback:1.0.0")
}
