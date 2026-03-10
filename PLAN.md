# HRMS Mobile App V1 Plan (React Native CLI + Firebase JWT)

## Summary
Build a single React Native app with two role-based experiences: Super Admin and Shop User.  
Authentication will use Firebase Auth ID tokens (JWT) with custom claims for `role` and `shopId`.  
Data will be tenant-isolated using Firestore subcollections under each shop.  
V1 scope is core end-to-end: auth, shops, employees, attendance, salary calculation, dashboards, and reports.

## Locked Decisions
1. Auth JWT model: Firebase ID token JWT only, no separate custom JWT service.
2. Super Admin auth: seeded Firebase admin user (not hardcoded app credential).
3. Data model: tenant-root collections under `shops/{shopId}`.
4. State layer: Redux Toolkit + RTK Query.
5. Salary basis: calendar-days prorate.
6. Late deduction: every 3 late entries = 0.5 day deduction.
7. Overtime: per-hour rate × overtime hours.
8. MVP scope: core end-to-end only.

## Public Interfaces and Types (to add)
1. `UserRole`: `'super_admin' | 'shop_manager'`.
2. `AuthUser`:
   - `uid: string`
   - `email: string`
   - `role: UserRole`
   - `shopId?: string`
   - `displayName?: string`
3. `Shop`:
   - `id, shopName, address, ownerName, contactNumber, email, username, status, createdAt, updatedAt`
4. `Employee`:
   - `id, shopId, name, phone, address, designation, joiningDate, salaryType, basicSalary, overtimeRatePerHour, status, createdAt, updatedAt`
5. `AttendanceRecord`:
   - `id, employeeId, shopId, date(YYYY-MM-DD), status('present'|'absent'|'late'|'half_day'), checkInTime?, notes?, createdBy, createdAt, updatedAt`
6. `SalaryMonthly`:
   - `id = {employeeId}_{YYYY-MM}`
   - `employeeId, shopId, month, totalDaysInMonth, presentDays, absentDays, halfDays, lateEntries, lateDeductionDays, payableDays, perDaySalary, overtimeHours, overtimeAmount, netSalary, generatedAt`

## Firestore Schema (final)
1. `admins/{uid}`
   - `email, name, role='super_admin', active, createdAt`
2. `shops/{shopId}`
   - `shopName, address, ownerName, contactNumber, email, username, status, createdByAdminUid, createdAt, updatedAt`
3. `shops/{shopId}/managers/{uid}`
   - `email, name, active, createdAt`
4. `shops/{shopId}/employees/{employeeId}`
   - employee fields above
5. `shops/{shopId}/attendance/{attendanceId}`
   - `attendanceId = {employeeId}_{YYYY-MM-DD}`
6. `shops/{shopId}/salary/{salaryId}`
   - `salaryId = {employeeId}_{YYYY-MM}`
7. `shops/{shopId}/settings/payroll`
   - `lateThreshold=3, lateDeductionDays=0.5, timezone='Asia/Kolkata'`

## Security and Access Control
1. Firebase custom claims on login:
   - Admin: `{ role: 'super_admin' }`
   - Manager: `{ role: 'shop_manager', shopId: '...' }`
2. Firestore rules:
   - Super admin can read/write all `shops/*`.
   - Shop manager can read/write only `shops/{shopId}` matching token claim.
   - Managers cannot access other shops.
   - Salary and attendance writes restricted to matching `shopId`.
3. App session:
   - Store auth state securely.
   - On logout: clear Redux store + local auth/session cache.

## App Structure and Navigation
1. Root:
   - `AuthStack`: Login
   - `AdminStack`: Admin Dashboard, Shop List, Add/Edit Shop, Shop Detail Summary
   - `ShopTabs`: Dashboard, Staff, Attendance, Salary, Reports
2. Shop side extra screens:
   - Employee Add/Edit
   - Attendance Daily/Bulk
   - Salary Month Detail
   - Profile
3. Route guard:
   - After token + claims fetch, route by role.

## Module-by-Module Build Plan
1. Foundation
   - Set folder architecture (`src/app`, `src/features`, `src/services`, `src/store`, `src/types`).
   - Add React Navigation, Redux Toolkit, RTK Query, form validation, date utils.
2. Auth
   - Implement email/password login using Firebase Auth.
   - Fetch token claims and hydrate `AuthUser`.
   - Seed one admin user and claims script/process.
3. Admin: Shop Management
   - CRUD shops, activate/deactivate, search.
   - Create manager account flow (Firebase Auth user + manager doc + claims).
4. Shop: Employee Management
   - CRUD employees, status toggle, search/filter.
5. Attendance
   - Daily bulk marking for active employees.
   - Edit same-day and historical entries.
   - Calendar/month filter.
6. Salary Engine
   - Monthly compute per employee:
     - `perDay = basicSalary / totalDaysInMonth`
     - `lateDeductionDays = floor(lateEntries / 3) * 0.5`
     - `payableDays = present + 0.5*halfDay + late - absent - lateDeductionDays`
     - `overtimeAmount = overtimeRatePerHour * overtimeHours`
     - `netSalary = max(0, payableDays*perDay + overtimeAmount)`
   - Save computed snapshot to `salary` collection.
7. Reports and Dashboards
   - Admin: total shops, active/inactive, total employees aggregate.
   - Shop: staff count, today attendance summary, monthly salary summary, late count.
8. Hardening
   - Validation, loading/empty/error states.
   - Firestore indexing for common queries.
   - Release config checks.

## Testing and Acceptance Criteria
1. Auth and RBAC
   - Admin login works and lands in admin stack.
   - Shop manager login works and lands in shop tabs.
   - Manager cannot read/write any other shop data.
2. Shop management
   - Admin can create/edit/activate/deactivate shop and manager.
3. Employee and attendance
   - Manager can CRUD employees in own shop only.
   - Bulk attendance writes one record per employee/date.
4. Salary correctness
   - Test cases for all attendance statuses.
   - Late threshold deduction applied exactly per rule.
   - Overtime calculation included.
   - Month recomputation idempotent for same input.
5. Reports
   - Daily/weekly/monthly filters return correct counts and totals.
6. Build quality
   - Android debug run success.
   - Release APK generated successfully.

## Delivery Milestones
1. Milestone 1: App foundation + auth + role routing.
2. Milestone 2: Admin shop module + manager creation.
3. Milestone 3: Employee + attendance.
4. Milestone 4: Salary engine + salary report.
5. Milestone 5: Dashboards + QA + release APK.

## Assumptions and Defaults
1. Only one super admin account is needed in V1.
2. Currency and locale formatting use INR and `en-IN`.
3. Timezone default is `Asia/Kolkata` for attendance date boundaries.
4. Push notifications, PDF export, WhatsApp share, GPS/biometric are out of scope for V1.
5. iOS release is out of scope; Android APK is final deliverable.
