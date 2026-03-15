/*
  Production-grade sync script for shop manager auth + claims.

  What it does:
  1) Reads all shops from Firestore (`shops` collection).
  2) Ensures a Firebase Auth user exists for each shop email.
  3) Sets custom claims: { role: 'shop_manager', shopId: '<shopId>' }.
  4) Syncs password from `bootstrapPassword` (or legacy `password`) when provided.
  5) Disables Auth users for inactive shops.
  6) Writes sync metadata back to Firestore:
     - authUid
     - authProvisionStatus
     - authProvisionedAt
     - authLastSyncedAt
     - authLastError
  7) Optionally clears bootstrap/password from Firestore after successful sync.

  Usage:
    export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/service-account.json
    node scripts/sync-shop-manager-auth.js

  Optional flags:
    --keep-secrets   Keep bootstrap/password fields in Firestore after sync.
*/

const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const KEEP_SECRETS = process.argv.includes('--keep-secrets');

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidPassword(value) {
  return typeof value === 'string' && value.trim().length >= 6;
}

async function getAuthUserByUid(uid) {
  if (!uid) {
    return null;
  }
  try {
    return await admin.auth().getUser(String(uid));
  } catch (error) {
    const code = String(error && error.code ? error.code : '');
    if (code === 'auth/user-not-found') {
      return null;
    }
    throw error;
  }
}

async function getAuthUserByEmail(email) {
  try {
    return await admin.auth().getUserByEmail(email);
  } catch (error) {
    const code = String(error && error.code ? error.code : '');
    if (code === 'auth/user-not-found') {
      return null;
    }
    throw error;
  }
}

async function writeSyncStatus(docRef, data, { clearSecrets }) {
  const payload = {
    ...data,
    updatedAt: nowIso(),
  };
  if (clearSecrets) {
    payload.bootstrapPassword = admin.firestore.FieldValue.delete();
    payload.password = admin.firestore.FieldValue.delete();
  }
  await docRef.set(payload, { merge: true });
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
    created: 0,
    updated: 0,
    disabled: 0,
    provisioned: 0,
    skipped: 0,
    errors: 0,
  };

  for (const doc of shopsSnap.docs) {
    summary.total += 1;
    const data = doc.data() || {};
    const docRef = doc.ref;
    const shopId = doc.id;
    const email = normalizeEmail(data.email);
    const status = String(data.status || 'inactive');
    const authUid = String(data.authUid || '');
    const secret = String(data.bootstrapPassword || data.password || '');
    const hasSecret = isValidPassword(secret);
    const syncAt = nowIso();

    if (!email) {
      summary.skipped += 1;
      await writeSyncStatus(
        docRef,
        {
          authProvisionStatus: 'error',
          authLastSyncedAt: syncAt,
          authLastError: 'Missing shop email',
        },
        { clearSecrets: false },
      );
      console.log(`[SKIP] ${shopId}: missing email`);
      continue;
    }

    try {
      let user = (await getAuthUserByUid(authUid)) || (await getAuthUserByEmail(email));
      const shouldDisable = status !== 'active';

      if (!user) {
        if (!hasSecret) {
          summary.errors += 1;
          await writeSyncStatus(
            docRef,
            {
              authProvisionStatus: 'error',
              authLastSyncedAt: syncAt,
              authLastError: 'Missing bootstrap password (min 6 chars) for new auth user',
            },
            { clearSecrets: false },
          );
          console.error(`[ERROR] ${shopId}: cannot create auth user without valid bootstrap password.`);
          continue;
        }

        user = await admin.auth().createUser({
          email,
          password: secret,
          emailVerified: true,
          disabled: shouldDisable,
        });
        summary.created += 1;
      } else {
        const updatePayload = {
          email,
          disabled: shouldDisable,
        };
        if (hasSecret) {
          updatePayload.password = secret;
        }
        await admin.auth().updateUser(user.uid, updatePayload);
        summary.updated += 1;
      }

      if (shouldDisable) {
        summary.disabled += 1;
      }

      await admin.auth().setCustomUserClaims(user.uid, {
        role: 'shop_manager',
        shopId,
      });

      await writeSyncStatus(
        docRef,
        {
          authUid: user.uid,
          authProvisionStatus: 'provisioned',
          authProvisionedAt: data.authProvisionedAt || syncAt,
          authLastSyncedAt: syncAt,
          authLastError: '',
        },
        { clearSecrets: !KEEP_SECRETS },
      );

      summary.provisioned += 1;
      console.log(`[OK] ${shopId}: ${email} -> uid=${user.uid} status=${status}`);
    } catch (error) {
      summary.errors += 1;
      await writeSyncStatus(
        docRef,
        {
          authProvisionStatus: 'error',
          authLastSyncedAt: syncAt,
          authLastError: String(error && error.message ? error.message : error),
        },
        { clearSecrets: false },
      );
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
