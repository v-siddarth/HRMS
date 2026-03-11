/*
  Production bootstrap script for shop manager auth + claims.

  What it does:
  1) Reads all shops from Firestore (`shops` collection).
  2) Ensures a Firebase Auth user exists for each shop email.
  3) Sets custom claims: { role: 'shop_manager', shopId: '<shopId>' }.
  4) Syncs Firebase Auth password from `shops.password` when valid (>= 6 chars).

  Usage:
    export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/service-account.json
    node scripts/sync-shop-manager-auth.js
*/

const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

async function getOrCreateAuthUserByEmail(email) {
  try {
    return await admin.auth().getUserByEmail(email);
  } catch (error) {
    const code = String(error && error.code ? error.code : '');
    if (code !== 'auth/user-not-found') {
      throw error;
    }
    const randomPassword = `Shop@${Math.random().toString(36).slice(2, 10)}!`;
    return admin.auth().createUser({
      email,
      password: randomPassword,
      emailVerified: true,
      disabled: false,
    });
  }
}

function isValidPassword(value) {
  return typeof value === 'string' && value.length >= 6;
}

async function run() {
  const db = admin.firestore();
  const shopsSnap = await db.collection('shops').get();
  if (shopsSnap.empty) {
    console.log('No shops found.');
    return;
  }

  const summary = {
    total: 0,
    processed: 0,
    skipped: 0,
    errors: 0,
  };

  for (const doc of shopsSnap.docs) {
    summary.total += 1;
    const data = doc.data() || {};
    const shopId = doc.id;
    const email = String(data.email || '').trim().toLowerCase();
    const status = String(data.status || 'inactive');
    const shopPassword = String(data.password || '');

    if (!email) {
      summary.skipped += 1;
      console.log(`[SKIP] ${shopId}: missing email`);
      continue;
    }
    if (status !== 'active') {
      summary.skipped += 1;
      console.log(`[SKIP] ${shopId}: status=${status}`);
      continue;
    }

    try {
      const user = await getOrCreateAuthUserByEmail(email);

      if (isValidPassword(shopPassword)) {
        await admin.auth().updateUser(user.uid, { password: shopPassword });
      } else {
        console.log(`[WARN] ${shopId}: password not synced (missing or < 6 chars)`);
      }

      await admin.auth().setCustomUserClaims(user.uid, {
        role: 'shop_manager',
        shopId,
      });
      summary.processed += 1;
      console.log(`[OK] ${shopId}: ${email} -> uid=${user.uid}`);
    } catch (error) {
      summary.errors += 1;
      console.error(`[ERROR] ${shopId}: ${email}`, error.message || error);
    }
  }

  console.log('\nDone.');
  console.log(summary);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
