This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.

Great direction. For your current HRMS, the best production approach is:

1. **Do not connect biometric device directly to mobile app first.**
2. **Integrate device -> backend/server -> Firebase -> app.**

That keeps it secure, reliable, and scalable.

### Recommended Architecture

1. **Biometric device** (ZKTeco/eSSL/other) captures punch.
2. **Device sync service** (small Node/Java service on office PC/cloud VM) pulls logs from device API/SDK or pushes via webhook.
3. Service maps logs to your employee IDs.
4. Service writes normalized attendance records into Firestore (`shops/{shopId}/attendance`).
5. App simply reads attendance (as it does now).

### Why this is best

- Devices are often LAN-based and SDK-heavy.
- Mobile direct integration is unstable and insecure.
- Server integration gives audit trail, retries, monitoring, and multi-shop scaling.

### Implementation Plan

1. **Data model additions**
- `biometricDeviceId`
- `biometricUserId`
- `punchSource` (`biometric|manual`)
- `punchTime`
- `rawLogId` (for deduplication)

2. **Employee mapping**
- Each employee must have a unique biometric user ID in device + app DB.

3. **Sync service**
- Poll every 1-5 minutes (or webhook if supported).
- Convert raw punch logs into your attendance status rules.
- Upsert idempotently using `rawLogId`.

4. **Rules engine**
- Decide how first/last punch becomes `present/late/half_day/absent`.
- Use shop timezone from your settings.

5. **Admin controls**
- Device health status in admin.
- Last sync time, failed sync alerts.
- Manual “resync logs” option.

6. **Security**
- Signed API keys between sync service and backend.
- Encrypt data in transit.
- Keep biometric templates on certified device/vendor system; app stores only attendance events.

### Fast MVP path

- Start with **one device + one shop pilot**.
- Import punch logs every 5 minutes.
- Mark only `present/late` initially.
- Keep manual override in app.
- After 2-4 weeks, expand to all shops.

If you want, next I can draft the exact technical blueprint for your stack (Firebase + your current RTK Query backend style), including new Firestore schema and sync service endpoints.
