plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.geojecwc.signage"
    compileSdk = 34

    defaultConfig {
        // 구글 TV 사이니지 앱과 따로 설치되도록 별도 앱 ID를 씀
        applicationId = "com.geojecwc.cafesignage"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        // 꽃다비 카페 사이니지 웹앱 주소 (GAS 배포 주소, /exec 로 끝남)
        buildConfigField(
            "String",
            "SIGNAGE_URL",
            "\"https://script.google.com/macros/s/여기에_꽃다비_배포ID/exec\""
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
