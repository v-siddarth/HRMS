# HRMS V1 Implementation Notes

## Firebase Requirements
1. Enable Authentication (Email/Password).
2. Create a super admin Firebase user in Console.
3. Set custom claims:
   - super admin: `{ role: 'super_admin' }`
   - shop manager: `{ role: 'shop_manager', shopId: '<shopId>' }`
4. Deploy Firestore rules and indexes from this repository.

## Data Model
- `admins/{uid}`
- `shops/{shopId}`
- `shops/{shopId}/managers/{uid}`
- `shops/{shopId}/employees/{employeeId}`
- `shops/{shopId}/attendance/{employeeId_YYYY-MM-DD}`
- `shops/{shopId}/salary/{employeeId_YYYY-MM}`
- `shops/{shopId}/settings/payroll`

## Manager Account Flow
For strict security, manager account creation + claim assignment should run via Firebase Admin SDK (Cloud Function/server). The app currently stores manager mapping in Firestore, and assumes Auth account + claims are provisioned server-side.

## Build
```bash
npm install
npx react-native run-android
cd android && ./gradlew assembleRelease
```
