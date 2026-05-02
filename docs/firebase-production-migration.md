# Firebase Production Migration Guide

This app uses Firebase in four places:

1. React Native app credentials
2. Firestore rules and indexes
3. Cloud Functions
4. Admin scripts that use a service account

Current repo wiring:

- Firebase project alias: `/Users/samgadge/Desktop/HRMS/.firebaserc`
- Firestore config: `/Users/samgadge/Desktop/HRMS/firebase.json`
- Firestore rules: `/Users/samgadge/Desktop/HRMS/firestore.rules`
- Firestore indexes: `/Users/samgadge/Desktop/HRMS/firestore.indexes.json`
- Cloud Functions: `/Users/samgadge/Desktop/HRMS/functions/index.js`
- Android Firebase app file: `/Users/samgadge/Desktop/HRMS/android/app/google-services.json`
- App Firebase usage: `/Users/samgadge/Desktop/HRMS/src/services/firebase.ts`
- Admin scripts:
  - `/Users/samgadge/Desktop/HRMS/scripts/sync-shop-manager-auth.js`
  - `/Users/samgadge/Desktop/HRMS/scripts/audit-shop-auth-consistency.js`
  - `/Users/samgadge/Desktop/HRMS/scripts/seed-claims-template.js`

## 1. Create the new Firebase project correctly

In Firebase Console, create the new production project first and enable:

- Authentication
- Firestore Database in Native mode
- Cloud Functions
- Storage only if you plan to use it later

For this app, make sure Email/Password sign-in is enabled in Firebase Authentication.

## 2. Register the mobile apps in the new Firebase project

### Android

In Firebase Console:

1. Add Android app.
2. Use package name: `com.hrmsapp`
3. Download `google-services.json`
4. Replace:

`/Users/samgadge/Desktop/HRMS/android/app/google-services.json`

Important:

- The Android package name in Firebase must exactly match `applicationId "com.hrmsapp"` in `/Users/samgadge/Desktop/HRMS/android/app/build.gradle`
- If you later change package name, Firebase app registration must be recreated or updated

### iOS

If you are building iOS, also:

1. Add iOS app in Firebase Console
2. Use the exact iOS bundle identifier from Xcode
3. Download `GoogleService-Info.plist`
4. Add it into the iOS app target in Xcode under `ios/HRMSApp`

This repo does not currently contain `GoogleService-Info.plist`, so iOS Firebase setup still needs to be completed for production if you ship iOS.

## 3. Point the repo to the new Firebase project

Update:

`/Users/samgadge/Desktop/HRMS/.firebaserc`

Replace the current default project:

```json
{
  "projects": {
    "default": "YOUR_NEW_FIREBASE_PROJECT_ID"
  }
}
```

You can also set it with the Firebase CLI:

```bash
firebase use --add
```

Then select the new project and make it the default for this repo.

## 3A. Fix IAM before deploys

If deploy commands fail with a `403` mentioning `serviceusage.services.use`, the Firebase CLI is working but your Google account does not have enough IAM permissions on the new project.

For project `rvm-attend`, open:

[https://console.developers.google.com/iam-admin/iam?project=rvm-attend](https://console.developers.google.com/iam-admin/iam?project=rvm-attend)

Add your deploy account, for example `siddarthgadge4209@gmail.com`, with one of these role sets:

- Recommended for a solo production owner: `Owner`
- Recommended for a team member doing production deploys: `Editor` plus Firebase access
- Minimum role for the specific error: `Service Usage Consumer`

For Firebase production deploys, the practical setup is usually:

- `Firebase Admin`
- `Editor` or `Owner`
- `Service Usage Consumer`

After changing IAM, wait 2 to 10 minutes and retry the deploy.

## 4. Check the app-side Firebase usage

This app uses native Firebase initialization through `@react-native-firebase`, not manual JS config objects.

The main Firebase access layer is:

`/Users/samgadge/Desktop/HRMS/src/services/firebase.ts`

That means the real credential switch happens through:

- Android `google-services.json`
- iOS `GoogleService-Info.plist`
- Firebase project selected in `.firebaserc` for deploys

You do not need to replace `apiKey`, `appId`, or `projectId` manually in JS because this project is using native Firebase config files.

## 5. Deploy Firestore rules and indexes to the new project

This repo already has deployable Firestore config:

- `/Users/samgadge/Desktop/HRMS/firestore.rules`
- `/Users/samgadge/Desktop/HRMS/firestore.indexes.json`

Deploy them with:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Production note:

- Do not edit rules only in the Firebase Console and forget the repo copy
- The repo should stay as the source of truth
- If rules were changed in Console only, export them back into the repo immediately

## 6. Deploy Cloud Functions to the new project

This app calls Cloud Functions from the client using the active Firebase project ID. You can see that in:

`/Users/samgadge/Desktop/HRMS/src/store/hrmsApi.ts`

The functions source is:

`/Users/samgadge/Desktop/HRMS/functions/index.js`

Deploy with:

```bash
firebase deploy --only functions
```

Before production deploy, check:

- Blaze plan enabled for Cloud Functions
- Required Firebase APIs enabled in Google Cloud
- Region consistency between deployed functions and `FUNCTIONS_REGION` used by the app

If the app calls `https://<region>-<projectId>.cloudfunctions.net/...`, then changing the Firebase project automatically changes the function base URL once the app uses the new project credentials.

## 7. Move or recreate production data

Changing Firebase project means your old Authentication users, Firestore data, and custom claims do not automatically move.

You need to handle all three:

1. Firestore data
2. Firebase Auth users
3. Custom claims

### Firestore data

Recommended production path:

- Export from old project
- Import into new project
- Validate document counts before switching the app

### Auth users

Firebase Auth users belong to the old project. They will not exist in the new one unless recreated or imported.

For this repo, shop-manager accounts can be re-provisioned using:

- `/Users/samgadge/Desktop/HRMS/scripts/sync-shop-manager-auth.js`

That script:

- reads shops from Firestore
- creates or updates Auth users
- applies custom claims `{ role: 'shop_manager', shopId }`
- stores sync metadata back in Firestore

Run it with a service account from the new Firebase project:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/new-project-service-account.json
npm run auth:sync-shop-claims
```

Then audit consistency:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/new-project-service-account.json
npm run auth:audit-shop-claims
```

### Super admin custom claims

Any super admin users in the new project also need claims reapplied:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/new-project-service-account.json
node scripts/seed-claims-template.js <uid> super_admin
```

## 8. Production validation checklist before app release

Do all of these before publishing the new build:

1. Login as super admin
2. Login as shop manager
3. Login as staff
4. Confirm Firestore reads and writes work
5. Confirm Cloud Functions endpoints work
6. Confirm custom claims are present for all privileged users
7. Confirm Firestore indexes are deployed and no screen throws missing-index errors
8. Build Android release with the new `google-services.json`
9. Build iOS release with the new `GoogleService-Info.plist` if iOS is supported
10. Confirm the new project contains the expected shops, employees, attendance, salary, and settings documents

## 9. Important production risks in the current repo

These are the main things that usually break after switching Firebase projects:

### Missing Auth data

If Firestore data exists but Auth users were not recreated, users will fail to sign in.

### Missing custom claims

This app relies on role-based claims like:

- `super_admin`
- `shop_manager`
- `staff`

If claims are missing, Firestore rules and server authorization will fail even if login works.

### Missing Firestore indexes

The app already has query patterns that require indexes. If indexes are not deployed, some screens will fail.

### Wrong Android app registration

If the new Firebase Android app does not use `com.hrmsapp`, the app will build but Firebase services may fail or connect incorrectly.

### iOS left unconfigured

If you ship iOS and do not add `GoogleService-Info.plist`, Firebase will not be configured for the iOS app.

## 10. Recommended production rollout order

Use this order:

1. Create new Firebase project
2. Register Android and iOS apps in Firebase
3. Replace `google-services.json` and add `GoogleService-Info.plist`
4. Update `.firebaserc`
5. Deploy Firestore rules and indexes
6. Deploy Cloud Functions
7. Import Firestore data
8. Recreate or sync Auth users
9. Reapply custom claims
10. Run production verification
11. Build new release APK/AAB and iOS build
12. Release only after validating the new project end to end

## 11. What should be changed in this repo for the new Firebase project

At minimum, you need to change these items:

- `/Users/samgadge/Desktop/HRMS/.firebaserc`
- `/Users/samgadge/Desktop/HRMS/android/app/google-services.json`
- `ios/HRMSApp/GoogleService-Info.plist` if using iOS

Then deploy:

- `/Users/samgadge/Desktop/HRMS/firestore.rules`
- `/Users/samgadge/Desktop/HRMS/firestore.indexes.json`
- `/Users/samgadge/Desktop/HRMS/functions/index.js`

And run:

- `/Users/samgadge/Desktop/HRMS/scripts/sync-shop-manager-auth.js`
- `/Users/samgadge/Desktop/HRMS/scripts/audit-shop-auth-consistency.js`
- `/Users/samgadge/Desktop/HRMS/scripts/seed-claims-template.js`

## 12. Recommended next step

Once you give the new Firebase project ID and confirm whether you want Android only or Android + iOS, the remaining repo changes are straightforward:

- update `.firebaserc`
- replace Android Firebase credentials
- wire iOS credentials if needed
- deploy rules, indexes, and functions against the new project
- run the auth migration scripts against the new service account
