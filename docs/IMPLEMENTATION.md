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
Manager account provisioning is done via Firebase Admin SDK script.

### Shop Provisioning (Production Safe)
1. Create/update shop in admin app.  
   - For new shops, set `Initial Login Password` (min 6 chars).
2. Run auth sync:
   ```bash
   npm run auth:sync-shop-claims
   ```
3. Run audit:
   ```bash
   npm run auth:audit-shop-claims
   ```
4. Verify `authProvisionStatus` is `provisioned` in `shops/{shopId}` and login works.
5. Shop managers must login using **shop email + password** (username login is not enabled in app auth flow).

### Why this is required
- Shop login uses Firebase Auth + custom claims, not Firestore-only records.
- Firestore `shops` docs are business profiles; Auth users must exist separately.

### Shop auth-related fields
- `bootstrapPassword` (one-time provisioning secret)
- `authUid`
- `authProvisionStatus`: `pending | provisioned | error`
- `authProvisionedAt`
- `authLastSyncedAt`
- `authLastError`

`auth:sync-shop-claims` clears `bootstrapPassword` and legacy `password` by default after successful provisioning.

## Build
```bash
npm install
npx react-native run-android
cd android && ./gradlew assembleRelease
```
