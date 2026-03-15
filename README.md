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




now i wanna make some changes in the shop login i wanna some big chagnes in the like feilds altration and the UI related changes we wannt to do this production level and error less bug free production redy code and eficient solution anylize the proper changes and then do the proper and dont do any mistake and give me robust solution 
home screen 
1 shop name address and owner name needed in the top bar like a header make it proper UI like professional UI 
2 make salary graph bar graph and make it month wise salary for graph 
3 the application name is RVM Attend so give this name like powerd by RVM attend in the application 

new staff creatation 
1 keep seprate line for taluka and district in address 
2 add addhar no in creation
3 also add PF below to the basic salary
4 also keep one optional feild Organisition below to address
5 genrate a unique no for each staff sequence
6 give the option there to add biomatric user id proper working 
7 both date shuld be capture active and inactive automatioclly after inactive this staff the unique no is block 
8 if you genrate the staff report the system shuld show list of staff readable mannar in a single line for single staff in report format
9 total job duration shuld show form active to till now

attendace
1 give the option for the biomatric attendace there and we are using external device for that for now the extenal device connetcivity remain empty we will look after this chagnes 
2 attendace data should be shown in report when seclect the duration in filter (for the referance i will share my HRMS report i wanna this kind of report)

salary
1 Generate salary is good 
2.⁠ ⁠⁠it will work once in a month only.
3 after generation of report it should show as total staff no’s, paid staff no’s and Pending staff No’s, and also amount
4.⁠ ⁠⁠advance/Loan salary payment entry
5.⁠ ⁠⁠this advance should deduct from salary while generate at the end of month
6.⁠ ⁠⁠Report - Monthly attendance report should be shown while 2 dates are being selected 

Missing in app.
1.⁠ ⁠Shift creation
2.⁠ ⁠⁠shift plan loading for week for worker (every week will change)
3.⁠ ⁠If staff is not on duty then how owner will mark whether staff is on leave to absent?

we wanna all reports in App like a tabale view and if its to long use scrolling for that and also we wanna export report option and its download the report directly in PDF format but like a EXECEL and also we wanna table view like a excel 

now i give you some referace screenshot for the UI anylize it properly and impliment it into the applicion but keep in mind its only the refrace so make UI very proper and enhanced and very butifull and professional in the world think like a proper senior professional UI designer and senior professinoal Application developer and also i add some instructions related to the refrance UI also anylize that and do this changes in the shop user properly after that i will cheak it and also do this changes one by one make proper stratergy for that after one compliction i cheak and then we will go for the next make this solution powerfull robust and eficient with peroduction level and ready code do this with no mistake and eror free bug free output take your proper time and do that if you need to do any terminal task tell me i will do that and avoid the unwanted testing and make it powerfull


Use this exact flow for your project.

1. Install prerequisites (once):
- Java 17
- Android SDK + platform/build-tools
- Node 20+
- Run: `npm install`

2. Build testing APK (debug):
```bash
cd /Users/samgadge/Desktop/HRMS/android
./gradlew assembleDebug
```
APK output:
`/Users/samgadge/Desktop/HRMS/android/app/build/outputs/apk/debug/app-debug.apk`

3. Build client APK (signed release):
- Create keystore (one time):
```bash
keytool -genkeypair -v \
  -keystore hrms-release-key.keystore \
  -alias hrms-key-alias \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```
- Move it to:
`/Users/samgadge/Desktop/HRMS/android/app/hrms-release-key.keystore`
- Add to `~/.gradle/gradle.properties`:
```properties
MYAPP_UPLOAD_STORE_FILE=hrms-release-key.keystore
MYAPP_UPLOAD_KEY_ALIAS=hrms-key-alias
MYAPP_UPLOAD_STORE_PASSWORD=YOUR_STORE_PASSWORD
MYAPP_UPLOAD_KEY_PASSWORD=YOUR_KEY_PASSWORD
```
- Build release:
```bash
cd /Users/samgadge/Desktop/HRMS/android
./gradlew clean
./gradlew assembleRelease
```
Release APK output:
`/Users/samgadge/Desktop/HRMS/android/app/build/outputs/apk/release/app-release.apk`

4. Optional Play Store bundle:
```bash
cd /Users/samgadge/Desktop/HRMS/android
./gradlew bundleRelease
```
AAB output:
`/Users/samgadge/Desktop/HRMS/android/app/build/outputs/bundle/release/app-release.aab`

You can also follow the repo guide: [APK_BUILD.md](/Users/samgadge/Desktop/HRMS/docs/APK_BUILD.md).


we have some bugs and errors and soem atrations in the porject i tell you one by one and yo udo that bug fixing and changes eficiently and properly and make this applition to production level and avoid testing commands first anylize the bug properly sometime i make mistake in explining the bug anylize that bug propelry and give me the soluton on that and give me professional solution on that 
we wanna do some change in the admin user in the admin
1 in the home page its shows the total employee count remove that count and add something static content like rules and all 
2 in the shop section we need to create shop there and also able to see the shop and option to  creta new shop there we wanna crete shop form on the new page and also the update shop form in the new screen 
3 the shop card remove login user and UID and also make this card more proper like a card