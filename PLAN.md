
**Staff User Plan**

Here’s a production-focused plan to add a new `staff` user role cleanly, without confusion or rework.

**Goal**
Add a real `staff` login flow to the app where:
- Shop manager can create staff login accounts
- Staff users are created in Firebase Auth properly
- Staff can sign in separately
- Staff app has its own bottom tabs:
  `Home`, `Attendance`, `Salary`, `Profile`
- UI should follow the same visual system as shop user:
  green hero section, clean cards, mobile-first layout, safe-area support

**Phase 1: Product And Data Design**
1. Locked role:
   `staff` is now the third first-class app role.
2. Locked ownership:
   only `shop_manager` can create and manage staff login accounts.
3. Locked identity model:
   staff login will use `loginEmail + password`.
4. Locked staff mapping:
   one Firebase Auth staff user maps to exactly one employee record and exactly one shop.
5. Locked schema approach:
   no separate `staffs` collection for V1; the employee document remains the source of truth.
6. Locked employee auth fields:
   `loginEmail`, `authUid`, `authStatus`, `authProvisionedAt`, `authDisabledAt`, `lastLoginAt`, `authLastError`.
7. Locked lifecycle states:
   `not_created`, `pending`, `provisioned`, `disabled`, `error`.
8. Locked permissions:
   staff can access only their own profile, attendance, salary, and shift-related views inside their own shop.
9. Locked UI target:
   staff app experience will use bottom tabs: `Home`, `Attendance`, `Salary`, `Profile`.
10. Locked design direction:
    staff UI will reuse the shop visual language, green hero sections, safe-area handling, and mobile-first card layouts.

**Phase 2: Auth And Security Architecture**
1. Add `staff` custom claims in Firebase Auth.
2. Add staff session hydration in auth bootstrap.
3. Extend login flow to detect and route:
   `super_admin`, `shop_manager`, `staff`.
4. Add secure account creation flow from shop panel:
   create Firebase Auth user + link to staff record.
5. Add safe rollback handling:
   if Firestore saves but Auth creation fails, show clear error.
6. Add delete/deactivate strategy:
   deactivate in app first, delete auth only when needed.
7. Update Firestore rules so staff can only read/write their own allowed data.

**Phase 3: Backend/Data Layer Changes**
1. Extend models/types for staff auth fields and role.
2. Add RTK Query endpoints for:
   staff self profile,
   staff attendance summary,
   staff attendance history,
   staff monthly salary,
   staff shift details,
   staff password change,
   staff account delete.
3. Add shop-side mutation to create staff login.
4. Add shop-side mutation to update/reset staff credentials.
5. Add derived selectors/helpers for:
   today hours,
   monthly present count,
   off count,
   half-day count,
   late count,
   salary deductions,
   advance balance.

**Phase 4: Shop Manager Side Changes**
1. Update staff creation/edit form so shop user can optionally create login credentials.
2. Add fields:
   login email,
   initial password,
   account enabled/disabled.
3. Show auth provisioning status in staff management.
4. Add actions:
   create login,
   reset password,
   disable access,
   remove access.
5. Validate duplicate email and auth conflicts properly.

**Phase 5: Staff App Navigation**
1. Add a dedicated `StaffNavigator`.
2. Add bottom tabs:
   `Home`, `Attendance`, `Salary`, `Profile`.
3. Keep same design language as shop UI.
4. Hide shop/admin-only features completely.
5. Add staff-specific drawer only if truly needed.
   Recommendation: start without drawer to keep UX clean.

**Phase 6: Staff Home Screen**
1. Build immersive hero header like shop UI.
2. Add large `Check In` / `Check Out` buttons.
3. Show live status:
   checked in, checked out, late, shift assigned.
4. Show today summary:
   worked hours,
   check-in time,
   check-out time,
   overtime if any.
5. Show month summary cards:
   present days,
   off days,
   half days,
   absent days,
   late marks.
6. Show shift info:
   today shift,
   shift start/end,
   weekly off.
7. Add smart states:
   no shift assigned,
   already checked in,
   already checked out,
   punch mismatch,
   biometric/manual source label if relevant.
8. Delivery status:
   completed in current codebase with staff tabs and home UI shell already wired.

**Phase 7: Staff Attendance Screen**
1. Phase goal:
   replace the current placeholder `StaffAttendanceScreen` with a production-ready read-only attendance module for staff users.
2. Scope lock for this phase:
   read-only attendance only,
   no correction request flow,
   no punch write actions from this screen,
   no biometric device integration UI beyond showing `manual` vs `biometric` source when data exists.
3. Existing code we should reuse:
   `useGetStaffAttendanceSummaryQuery`
   `useGetStaffAttendanceHistoryQuery`
   `useGetStaffShiftOverviewQuery`
   current staff navigation shell already in place.
4. Screen structure:
   hero header with month label and attendance snapshot,
   month selector row,
   summary cards row,
   filter chip row,
   mini calendar grid,
   selected-day detail card,
   scrollable attendance table/list.
5. Top summary block should show:
   present count,
   absent count,
   half day count,
   leave/off count,
   late count,
   checked-in days.
6. Month selector behavior:
   default to current month,
   support previous/next month navigation,
   disable next month beyond current live month,
   refetch summary + history together from same selected month key.
7. Filter chips:
   `all`, `present`, `absent`, `leave`, `half_day`, `late`.
   Note:
   weekly off days are derived from shift/week off setup and shown in calendar/day detail even if no attendance row exists.
8. Calendar behavior:
   show full month grid,
   highlight today,
   highlight selected date,
   color-code statuses,
   show empty/unmarked dates safely,
   allow tap on any date to update the detail card below.
9. Selected-day detail card should show:
   date,
   resolved attendance status,
   source `manual|biometric` if present,
   check-in,
   check-out,
   total worked hours,
   shift name,
   shift timing,
   weekly off marker,
   notes.
10. Attendance table/list should show one readable row per date with:
    date,
    day label,
    status badge,
    check-in,
    check-out,
    hours,
    source,
    shift name.
11. Data-resolution rules:
    if attendance record exists, use that as primary truth;
    if no record exists and selected date matches weekly off, show `off day`;
    if no record exists and date is in past, show `no record`;
    if no record exists and date is future, show `upcoming`.
12. UX and styling direction:
    keep same green hero language as phase 6,
    use compact professional cards,
    strong mobile readability,
    horizontal scroll where table width needs it,
    never hide important attendance values behind tiny text.
13. Exact implementation files for this phase:
    `src/features/staff/StaffAttendanceScreen.tsx`
    `src/store/hrmsApi.ts` only if a derived helper or query shape adjustment is truly required
    `src/types/models.ts` only if a presentation-safe derived status type is needed
    shared UI helpers only if reusable card/badge/table pieces reduce duplication.
14. Production checks for this phase:
    safe-area top and bottom spacing,
    loading state does not flash broken layout,
    empty state works for first-login staff,
    error state is actionable,
    month switch does not crash on missing records,
    selected date remains valid when month changes,
    long attendance lists remain scrollable and readable.
15. Acceptance criteria:
    staff can open Attendance tab without placeholder copy,
    staff can switch month,
    staff can filter history by status,
    staff can inspect one date in detail,
    staff can understand present vs absent vs leave vs off quickly,
    screen handles no-data and partial-data cases without visual breakage.
16. Out of scope for this phase:
    correction requests,
    export/report download,
    biometric sync configuration,
    manager-side attendance editing from staff app.
17. Recommendation:
    complete this phase fully before moving to phase 8 salary refinements so staff app feels functionally complete tab by tab.

**Phase 8: Staff Salary Screen**
1. Show current month salary card with:
   gross salary,
   OT amount,
   PF deduction,
   advance deduction,
   final payable salary.
2. Show salary breakup table.
3. Show advance history separately.
4. Clearly show:
   total advances taken,
   deducted this month,
   remaining impact on salary.
5. Add month selector for previous salary records.
6. Show paid/unpaid status.
7. Keep all calculations aligned with existing salary engine used by shop side.
8. Delivery status:
   completed in current codebase with month selector, salary overview, breakup table, advance history, and payment-status UI.

**Phase 9: Staff Profile Screen**
1. Professional profile UI matching shop design.
2. Show:
   full name,
   employee code,
   phone,
   email/login email,
   shop name,
   role,
   joining date,
   shift/basic employment info if available.
3. Add change password flow.
4. Add delete account flow only if business wants self-delete.
   Recommendation: better to allow deactivate/request removal, not hard delete by default.
5. Add logout.
6. Add account security section:
   last password update if available,
   account status,
   login identity info.
7. Delivery status:
   completed in current codebase with professional details, shop/work info, access identity, password change, account deletion, and logout flow.

**Phase 10: Production Hardening**
1. Handle safe-area and Android navigation insets correctly.
2. Prevent stale listeners during logout.
3. Prevent staff from seeing other staff/shop data.
4. Add strong validation for auth email/password creation.
5. Handle disabled staff login gracefully.
6. Handle missing salary/attendance data without crashes.
7. Handle shiftless staff and first-login empty states.
8. Keep offline/error messaging clean and actionable.
9. Delivery status:
   completed in current codebase with auth hydration cleanup, disabled-login messaging, logout/session hardening, empty-state coverage, and compile-safe UI fixes.

**Recommended Build Order**
1. Data model and auth role design
2. Firestore rules and claim strategy
3. Shop-side staff login creation flow
4. Staff login + auth hydration
5. Staff navigator and bottom tabs
6. Staff Home
7. Staff Attendance
8. Staff Salary
9. Staff Profile
10. QA, edge cases, release hardening

**Important Decisions To Lock Before Coding**
1. Staff login should use `email` only or `employee code + password`
   Recommendation: `email + password`
2. Staff can self-delete account or not
   Recommendation: no hard delete at first
3. Staff can edit only password or also personal profile fields
   Recommendation: password + limited personal fields
4. Attendance should be read-only or allow correction requests
   Recommendation: read-only in first version

**Main Risks**
1. Auth user creation and Firestore staff record getting out of sync
2. Weak access control causing data leakage
3. Salary calculations diverging between shop and staff screens
4. Attendance check-in/out rules conflicting with existing attendance model
5. Account deletion causing orphaned records

**Best-Practice Recommendation**
Build this in two releases:
1. Release 1:
   staff auth creation, login, tabs, home, attendance read-only, salary read-only, profile/password
2. Release 2:
   advanced attendance requests, deeper analytics, notifications, self-service edits

**Current Delivery Snapshot**
1. Phases 1 to 5 are already reflected in the current project structure:
   staff role, auth/data plumbing, manager provisioning hooks, and staff tab navigation exist.
2. Phase 6 is represented in the current codebase:
   `StaffHomeScreen` is already implemented as the first polished staff screen.
3. Phase 7 is implemented in the current codebase:
   `StaffAttendanceScreen` now provides the read-only attendance module with calendar, filters, daily detail, and report table.
4. Phase 8 is implemented in the current codebase:
   `StaffSalaryScreen` now provides the read-only salary module with month navigation, breakup, advance history, and paid or pending state.
5. Phase 9 is implemented in the current codebase:
   `StaffProfileScreen` now provides staff identity, security, password, deletion, and logout flows.
6. Phase 10 is implemented in the current codebase:
   production hardening, auth cleanup, and compile-safety fixes have been completed for the current staff experience.

If you want, next I can switch from roadmap phases to your next business feature set on the shop side.
