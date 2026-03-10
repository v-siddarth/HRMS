# APK Build Guide (Client Delivery)

## 1) Prerequisites
- Java 17
- Android SDK + build tools
- Node 20+
- Project dependencies installed:
  - `npm install`

## 2) Generate Debug APK (quick internal testing)
From project root:

```bash
cd android
./gradlew assembleDebug
```

APK path:
- `android/app/build/outputs/apk/debug/app-debug.apk`

## 3) Generate Signed Release APK (for client)

### 3.1 Create keystore (one-time)
Run:

```bash
keytool -genkeypair -v \
  -keystore hrms-release-key.keystore \
  -alias hrms-key-alias \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Move `hrms-release-key.keystore` into:
- `android/app/hrms-release-key.keystore`

### 3.2 Add signing values to `~/.gradle/gradle.properties`

```properties
MYAPP_UPLOAD_STORE_FILE=hrms-release-key.keystore
MYAPP_UPLOAD_KEY_ALIAS=hrms-key-alias
MYAPP_UPLOAD_STORE_PASSWORD=YOUR_STORE_PASSWORD
MYAPP_UPLOAD_KEY_PASSWORD=YOUR_KEY_PASSWORD
```

### 3.3 Build release APK

```bash
cd android
./gradlew clean
./gradlew assembleRelease
```

APK path:
- `android/app/build/outputs/apk/release/app-release.apk`

## 4) Verify release build
- Install APK on a physical Android device.
- Validate:
  - Login
  - Drawer navigation
  - Attendance auto-save
  - Salary/Reports exports
  - Staff form date picker

## 5) Optional: Build Android App Bundle (Play Store)

```bash
cd android
./gradlew bundleRelease
```

AAB path:
- `android/app/build/outputs/bundle/release/app-release.aab`
