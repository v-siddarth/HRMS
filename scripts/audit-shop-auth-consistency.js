/*
  Audits consistency between Firestore shops and Firebase Auth users.

  Usage:
    export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/service-account.json
    node scripts/audit-shop-auth-consistency.js
*/

const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function getAuthUserByUid(uid) {
  if (!uid) {
    return null;
  }
  try {
    return await admin.auth().getUser(String(uid));
  } catch (error) {
    if (String(error.code) === 'auth/user-not-found') {
      return null;
    }
    throw error;
  }
}

async function run() {
  const db = admin.firestore();
  const shopsSnap = await db.collection('shops').get();

  const report = {
    totalShops: shopsSnap.size,
    ok: 0,
    missingEmail: 0,
    missingAuthUser: 0,
    claimMismatch: 0,
    inactiveButEnabled: 0,
  };

  for (const doc of shopsSnap.docs) {
    const shop = doc.data() || {};
    const shopId = doc.id;
    const email = normalizeEmail(shop.email);
    const authUid = String(shop.authUid || '');
    const status = String(shop.status || 'inactive');

    if (!email) {
      report.missingEmail += 1;
      console.log(`[MISSING_EMAIL] shop=${shopId}`);
      continue;
    }

    let authUser = await getAuthUserByUid(authUid);
    if (!authUser) {
      try {
        authUser = await admin.auth().getUserByEmail(email);
      } catch (error) {
        if (String(error.code) === 'auth/user-not-found') {
          report.missingAuthUser += 1;
          console.log(`[MISSING_AUTH_USER] shop=${shopId} email=${email} authUid=${authUid || '-'}`);
          continue;
        }
        throw error;
      }
    }

    const claims = authUser.customClaims || {};
    const claimRole = String(claims.role || '');
    const claimShopId = String(claims.shopId || '');
    if (claimRole !== 'shop_manager' || claimShopId !== shopId) {
      report.claimMismatch += 1;
      console.log(
        `[CLAIM_MISMATCH] shop=${shopId} email=${email} role=${claimRole || '-'} claimShopId=${claimShopId || '-'}`,
      );
      continue;
    }

    if (status !== 'active' && !authUser.disabled) {
      report.inactiveButEnabled += 1;
      console.log(`[INACTIVE_ENABLED] shop=${shopId} email=${email}`);
      continue;
    }

    report.ok += 1;
  }

  console.log('\nAudit Summary');
  console.log(report);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
