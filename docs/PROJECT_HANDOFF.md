# HRMS / RVM Attend Project Handoff

## 1. Project Identity

- Working app name in code: `HRMSApp`
- Product name used in UI: `RVM Attend`
- App type: React Native CLI mobile app with Firebase backend
- Main target right now: Android
- Secondary target: iOS project exists, but Firebase iOS setup is not complete in this repo

This repository is a role-based HRMS/attendance/payroll mobile application with:

- `super_admin` flow for shop onboarding and management
- `shop_manager` flow for daily shop operations
- planned `staff` flow foundation now added in shared types/model design
- Firebase Auth for login
- Firestore for application data
- Firebase Cloud Functions for privileged admin deletion flows

## 2. Current Tech Stack

- React Native `0.84.1`
- React `19.2.3`
- TypeScript `5.8.x`
- Redux Toolkit + RTK Query
- React Navigation `7.x`
- React Native Firebase:
  - App
  - Auth
  - Firestore
- Report/export libraries:
  - `react-native-html-to-pdf`
  - `react-native-share`
  - `xlsx`
  - `react-native-fs`

Runtime requirements:

- Node `>= 20`
- Java `17`
- Android SDK / build-tools
- CocoaPods for iOS

## 3. Repo Layout

High-value structure:

```text
HRMS/
├── App.tsx
├── index.js
├── package.json
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── PLAN.md
├── docs/
│   ├── APK_BUILD.md
│   ├── IMPLEMENTATION.md
│   └── PROJECT_HANDOFF.md
├── functions/
│   ├── index.js
│   ├── package.json
│   └── package-lock.json
├── scripts/
│   ├── sync-shop-manager-auth.js
│   ├── audit-shop-auth-consistency.js
│   ├── delete-shop-auth-user.js
│   └── seed-claims-template.js
├── src/
│   ├── app/
│   │   ├── AppProviders.tsx
│   │   └── RootNavigator.tsx
│   ├── components/
│   │   └── ui.tsx
│   ├── config/
│   │   └── auth.ts
│   ├── features/
│   │   ├── admin/
│   │   ├── auth/
│   │   └── shop/
│   ├── services/
│   │   ├── authService.ts
│   │   └── firebase.ts
│   ├── store/
│   │   ├── authSlice.ts
│   │   ├── hooks.ts
│   │   ├── hrmsApi.ts
│   │   └── index.ts
│   ├── theme/
│   │   └── colors.ts
│   ├── types/
│   │   ├── models.ts
│   │   └── navigation.ts
│   └── utils/
│       ├── date.ts
│       ├── logger.ts
│       └── salary.ts
├── android/
└── ios/
```

## 4. What Each Major Folder Does

### `src/app`
- App bootstrap
- Redux provider
- auth bootstrapping
- root navigation and role routing

### `src/features/auth`
- login screen

### `src/features/admin`
- admin dashboard
- shop list
- create/update shop
- shop status controls
- admin profile area

### `src/features/shop`
- shop dashboard
- staff management
- attendance flows
- salary generation and reports
- general reports center
- shop profile/settings/support

### `src/store/hrmsApi.ts`
This is the main business/data layer. It handles Firestore reads/writes for:

- shops
- employees
- attendance
- salary
- advances / loans
- shifts
- weekly shift plans
- payroll settings
- biometric settings
- admin/shop dashboard aggregates
- reports

### `src/services`
- Firebase collection helpers
- Auth login/session logic
- local session persistence

### `functions/`
Firebase HTTP functions for privileged delete flows:

- delete shop auth user by admin
- delete full shop by admin

### `scripts/`
Admin SDK operational scripts:

- sync shop auth accounts and claims
- audit auth consistency
- delete auth user manually
- seed claims manually

## 5. Auth Model

There are currently two fully implemented roles and one planned role foundation:

- `super_admin`
- `shop_manager`
- `staff` (Phase 1 data-model foundation locked; screens/auth flow not implemented yet)

### Admin Login

Admin credentials are hardcoded in app config:

- email: `admin@hrms.com`
- password: `admin@123`

Important: this still expects a matching Firebase Auth user with the `super_admin` custom claim. It is not a fake offline-only admin.

### Shop Login

Shop login is Firebase Auth email/password based.

Current limitation:

- shop login uses email only
- username login is not enabled

### Session Behavior

- Firebase auth state is subscribed during app bootstrap
- local admin and local shop sessions are cached in AsyncStorage
- app routes users by resolved role and `shopId`

## 6. Firestore Data Model

Main collections:

- `admins/{uid}`
- `shops/{shopId}`
- `shops/{shopId}/managers/{uid}`
- `shops/{shopId}/employees/{employeeId}`
- `shops/{shopId}/attendance/{employeeId_YYYY-MM-DD}`
- `shops/{shopId}/salary/{employeeId_YYYY-MM}`
- `shops/{shopId}/advances/{advanceId}`
- `shops/{shopId}/shifts/{shiftId}`
- `shops/{shopId}/weekly_shift_plans/{employeeId_weekStart_day}`
- `shops/{shopId}/settings/payroll`
- `shops/{shopId}/settings/biometric`

Important employee fields already supported in the model:

- `employeeCode`
- `addressLine1`
- `taluka`
- `district`
- `organization`
- `aadhaarNo`
- `pfAmount`
- `defaultShiftId`
- `weeklyOff`
- `biometricUserId`
- `biometricConsent`
- `biometricRegisteredAt`
- `activatedAt`
- `deactivatedAt`

Planned/now-typed employee auth fields for future staff login:

- `loginEmail`
- `authUid`
- `authStatus`
- `authProvisionedAt`
- `authDisabledAt`
- `lastLoginAt`
- `authLastError`

Important attendance fields already supported:

- `status`: `present | absent | late | half_day | leave`
- `source`: `manual | biometric`
- `punchTime`
- `rawLogId`
- `biometricDeviceId`
- `syncedAt`
- `checkInTime`
- `checkOutTime`

Important salary fields already supported:

- `grossSalary`
- `advanceDeduction`
- `netSalary`
- `salaryPaidAt`
- `salaryPaidBy`

## 7. Current Feature Status

This is the actual current implementation, based on source review.

### Admin Side

Implemented:

- admin dashboard
- shop listing
- search shops
- create/update shop
- delete shop through Firebase Function
- status visibility and operational metadata

Operational behavior:

- shop creation creates or links Firebase Auth user
- payroll default settings are created for each shop
- shop deletion depends on deployed Firebase Functions

### Shop Dashboard

Implemented:

- professional dashboard header
- shop name
- address
- powered by RVM Attend
- live date/time
- cards for total staff, present staff, punch errors, projected salary, advance paid

Not yet implemented on dashboard:

- month-wise salary bar graph UI

Note:

- analytics support exists in `hrmsApi.ts`, but the dashboard screen is not rendering charts yet

### Staff Module

Implemented:

- create staff
- edit staff
- deactivate/reactivate staff
- all staff list
- shift creation
- weekly shift planner
- fixed shift vs weekly plan handling

Already built in staff form:

- unique staff number auto-generation
- address line 1
- taluka
- district
- organization
- Aadhaar number
- biometric user ID generation
- biometric consent and registration stamp
- PF amount
- joining date
- active/inactive status logic
- automatic active/inactive date handling
- total job duration calculation

Important behavior:

- employee document ID is stabilized as `emp_${employeeCode}`
- deactivation stores `deactivatedAt`
- reactivation updates `activatedAt`
- biometric ID generation avoids duplicates

### Attendance Module

Implemented:

- attendance home
- biometric enrollment placeholder screen
- attendance regularization
- individual attendance report
- all staff attendance report
- date range filters
- PDF export for attendance reports
- report tables in scrollable format

Current biometric status:

- settings and placeholder UI exist
- external device connectivity is intentionally not implemented yet

### Salary Module

Implemented:

- salary generate screen
- once-per-month generation lock
- paid/pending counts and amount summaries
- mark salary as paid
- advance/loan entry
- advance deduction during monthly salary generation
- monthwise salary report
- all employee salary report
- annual individual salary report
- advance paid report
- monthly attendance report
- PDF exports
- table-style report views

Salary business rules already in code:

- future month generation blocked
- regeneration blocked after normal generation
- if any salary row is already paid, regeneration is blocked
- advance/loan total for the month is deducted from gross salary
- leave is treated as payable day in the current salary logic
- late deduction uses payroll settings

### Reports Module

Implemented:

- attendance summary
- salary summary
- advance summary
- weekly shift plan summary
- export to PDF
- export to Excel (`.xlsx`)
- generated file tracking in UI
- table-like data presentation

Exports currently available:

- attendance Excel
- salary Excel
- advance Excel
- staff Excel
- shift plan Excel
- attendance PDF
- salary PDF
- complete PDF

### Settings / Profile

Implemented:

- payroll settings
- biometric settings
- shop self-service profile edit
- email update with current-password verification
- password change
- account deletion flow
- logout

## 8. Important Business Rules in Code

### Salary

- generation allowed only for current/past month
- generation blocked for future month
- generation allowed only once per month unless all existing rows are zero-value unpaid repair rows
- advances/loans are deducted from the generated month salary
- salary can be marked paid individually

### Attendance

- one attendance row per employee per date
- attendance doc ID format: `employeeId_YYYY-MM-DD`
- present-like status includes `present`, `late`, `half_day`
- punch error is detected when a present-like row has missing in/out timing

### Staff

- active staff are used for salary generation
- staff can have fixed default shift or weekly planner assignments
- biometric ID registration depends on consent

## 9. Firebase / Cloud Requirements

Firebase project currently configured:

- default project: `hrms-a391a`

Required Firebase services:

- Authentication with Email/Password
- Firestore
- Cloud Functions

You must deploy:

- Firestore rules
- Firestore indexes
- Functions

Commands:

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
cd functions && firebase deploy --only functions
```

Important:

- shop deletion from admin depends on deployed HTTP function
- function-based delete flow may require Blaze plan

## 10. New Laptop Setup Checklist

### A. Install prerequisites once

- Node 20+
- Java 17
- Android Studio
- Android SDK / platform tools / build tools
- Xcode + CocoaPods if you want iOS
- Firebase CLI if you will deploy rules/functions

### B. Get the project onto the new laptop

Recommended:

- copy the repo with full `.git` history, or clone from remote
- move sensitive files securely, not through public chat

Sensitive files to verify:

- `android/app/google-services.json`
- `service-account.json`
- release keystore if you build signed APK
- `~/.gradle/gradle.properties` signing values

### C. Install dependencies

From project root:

```bash
npm install
```

For functions:

```bash
cd functions
npm install
cd ..
```

For iOS:

```bash
bundle install
cd ios
bundle exec pod install
cd ..
```

### D. Android machine-specific setup

Make sure `android/local.properties` points to your new Android SDK path.

Example:

```properties
sdk.dir=/Users/<your-user>/Library/Android/sdk
```

This file is machine-specific and usually needs to be regenerated/updated per laptop.

### E. iOS machine-specific setup

The repo contains `ios/HRMSApp/Info.plist`, but I did not find `GoogleService-Info.plist`.

So for iOS on the new laptop you likely need to:

1. download the correct Firebase iOS plist from Firebase console
2. add it to `ios/HRMSApp/`
3. make sure it is included in the Xcode target

Until that is done, Android is the safer target.

## 11. Run Commands

### Start Metro

```bash
npm start
```

### Run Android

```bash
npm run android
```

### Run iOS

```bash
npm run ios
```

### Build debug APK

```bash
cd android
./gradlew assembleDebug
```

APK output:

- `android/app/build/outputs/apk/debug/app-debug.apk`

### Build release APK

```bash
cd android
./gradlew clean
./gradlew assembleRelease
```

APK output:

- `android/app/build/outputs/apk/release/app-release.apk`

## 12. Operational Scripts

These scripts require Google service account credentials.

Set environment variable:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

### Sync shop auth + claims

```bash
node scripts/sync-shop-manager-auth.js
```

Optional:

```bash
node scripts/sync-shop-manager-auth.js --keep-secrets
```

### Audit shop auth consistency

```bash
node scripts/audit-shop-auth-consistency.js
```

### Delete one auth user manually

```bash
node scripts/delete-shop-auth-user.js --email=user@example.com
```

or

```bash
node scripts/delete-shop-auth-user.js --uid=AUTH_UID
```

### Seed custom claims manually

```bash
node scripts/seed-claims-template.js <uid> <role> [shopId]
```

## 13. Files You Should Read First On A New Laptop

If you want to regain full context quickly, read in this order:

1. `docs/PROJECT_HANDOFF.md`
2. `PLAN.md`
3. `docs/IMPLEMENTATION.md`
4. `package.json`
5. `src/types/models.ts`
6. `src/store/hrmsApi.ts`
7. `src/features/shop/StaffScreen.tsx`
8. `src/features/shop/AttendanceScreen.tsx`
9. `src/features/shop/SalaryScreen.tsx`
10. `src/features/shop/ReportsScreen.tsx`

## 14. Current Gaps / Risks / Caveats

### Product gaps

- shop dashboard month-wise salary chart is not yet rendered
- real biometric hardware connectivity is not implemented yet
- iOS Firebase plist is missing from repo
- default `README.md` is not the real onboarding doc

### Operational risks

- `service-account.json` exists in repo root; treat it as highly sensitive
- admin credentials are hardcoded in source and should be revisited for production hardening
- there are existing uncommitted working-tree changes in this repo; do not blindly reset or clean
- repo contains generated/local machine artifacts in places (`android/.gradle`, `ios/Pods`, etc.)

### Codebase realities

- large feature files exist, especially `StaffScreen.tsx`, `AttendanceScreen.tsx`, `SalaryScreen.tsx`
- business logic and UI are still somewhat co-located
- RTK Query + Firestore is the main system of record; there is no separate custom backend API

## 15. Recommended Codex Project Instructions For The New Laptop

You can paste the block below to quickly orient Codex:

```text
This project is a React Native CLI HRMS app called RVM Attend. Use Node 20+, Java 17, Android SDK, Firebase Auth, Firestore, and Firebase Functions. The main business/data layer is src/store/hrmsApi.ts. Implemented roles are super_admin and shop_manager, and staff role foundation is now added in the shared model layer for upcoming work. Shop-side features live in src/features/shop and already include staff CRUD, attendance regularization, salary generation, advances/loans, shifts, weekly planning, report tables, PDF export, and Excel export. The employee model already supports employeeCode, taluka, district, organization, Aadhaar, PF, biometricUserId, activatedAt, deactivatedAt, and now planned auth-link fields for future staff login. Biometric hardware integration is not connected yet; only placeholders/settings exist. For Android, google-services.json is already in android/app. For iOS, GoogleService-Info.plist is likely missing. Avoid destructive git commands because the worktree may be dirty. Before changing behavior, check docs/PROJECT_HANDOFF.md, PLAN.md, src/types/models.ts, and src/store/hrmsApi.ts.
```

## 16. Recommended Start Sequence On The New Laptop

1. Open repo.
2. Read this file.
3. Run `npm install`.
4. Run `cd functions && npm install && cd ..`.
5. Verify `android/app/google-services.json` exists.
6. Verify `service-account.json` is available only if you need admin scripts.
7. Fix `android/local.properties` for the new SDK path.
8. Start Metro with `npm start`.
9. Run Android with `npm run android`.
10. Only after app boots successfully, continue feature work.

## 17. Best Next Cleanup Tasks

These are strong follow-up improvements for maintainability:

- replace default root `README.md` with real project onboarding
- move sensitive credentials out of repo
- split large shop feature screens into smaller modules
- add focused tests for salary rules and auth flows
- add real chart component for dashboard salary trend
- formalize biometric sync architecture before hardware work starts
