plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "dev.treaple.rokidclaude"
    compileSdk = 34

    defaultConfig {
        applicationId = "dev.treaple.rokidclaude"
        // YodaOS на очках Rokid — Android 12 (API 31/32). Ниже опускаться незачем.
        minSdk = 29
        targetSdk = 33
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        debug {
            // Отладочная сборка ставится на очки через adb без отдельной подписи.
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
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
    // Сознательно минимальный набор: чем меньше зависимостей, тем меньше
    // сюрпризов при сайдлоаде на YodaOS. HTTP — HttpURLConnection, JSON — org.json.
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    testImplementation("junit:junit:4.13.2")
}
