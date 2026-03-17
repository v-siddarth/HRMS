const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const SHOP_CHILD_COLLECTIONS = [
  'managers',
  'employees',
  'attendance',
  'salary',
  'advances',
  'shifts',
  'weekly_shift_plans',
  'settings',
];

async function deleteCollectionBatched(collectionRef, batchSize = 400) {
  while (true) {
    const snapshot = await collectionRef.limit(batchSize).get();
    if (snapshot.empty) {
      break;
    }
    const batch = admin.firestore().batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    if (snapshot.size < batchSize) {
      break;
    }
  }
}

async function verifySuperAdmin(req) {
  const authHeader = String(req.headers.authorization || '');
  const bearerPrefix = 'Bearer ';
  if (!authHeader.startsWith(bearerPrefix)) {
    return { ok: false, status: 401, message: 'Missing bearer token' };
  }

  const idToken = authHeader.slice(bearerPrefix.length).trim();
  const decoded = await admin.auth().verifyIdToken(idToken, true);
  if (String(decoded.role || '') !== 'super_admin') {
    return { ok: false, status: 403, message: 'Only super admin can perform this action.' };
  }
  return { ok: true, uid: decoded.uid };
}

exports.deleteShopAuthUserByAdmin = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  try {
    const authHeader = String(req.headers.authorization || '');
    const bearerPrefix = 'Bearer ';
    if (!authHeader.startsWith(bearerPrefix)) {
      res.status(401).json({ ok: false, message: 'Missing bearer token' });
      return;
    }

    const idToken = authHeader.slice(bearerPrefix.length).trim();
    const decoded = await admin.auth().verifyIdToken(idToken, true);
    if (String(decoded.role || '') !== 'super_admin') {
      res.status(403).json({ ok: false, message: 'Only super admin can delete auth users.' });
      return;
    }

    const rawUid = String(req.body?.uid || '').trim();
    const rawEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!rawUid && !rawEmail) {
      res.status(400).json({ ok: false, message: 'uid or email is required' });
      return;
    }

    let targetUid = rawUid;
    if (!targetUid) {
      try {
        const user = await admin.auth().getUserByEmail(rawEmail);
        targetUid = user.uid;
      } catch (error) {
        if (String(error?.code || '') === 'auth/user-not-found') {
          res.status(200).json({ ok: true, deleted: false, reason: 'user-not-found' });
          return;
        }
        throw error;
      }
    }

    try {
      await admin.auth().deleteUser(targetUid);
      res.status(200).json({ ok: true, deleted: true, uid: targetUid });
    } catch (error) {
      if (String(error?.code || '') === 'auth/user-not-found') {
        res.status(200).json({ ok: true, deleted: false, reason: 'user-not-found' });
        return;
      }
      throw error;
    }
  } catch (error) {
    functions.logger.error('deleteShopAuthUserByAdmin failed', error);
    res.status(500).json({
      ok: false,
      message: String(error?.message || error || 'Unknown server error'),
    });
  }
});

exports.deleteShopByAdmin = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  try {
    const authResult = await verifySuperAdmin(req);
    if (!authResult.ok) {
      res.status(authResult.status).json({ ok: false, message: authResult.message });
      return;
    }

    const shopId = String(req.body?.shopId || '').trim();
    if (!shopId) {
      res.status(400).json({ ok: false, message: 'shopId is required' });
      return;
    }

    const db = admin.firestore();
    const shopRef = db.collection('shops').doc(shopId);
    const shopSnap = await shopRef.get();
    if (!shopSnap.exists) {
      res.status(200).json({ ok: true, deleted: false, reason: 'shop-not-found' });
      return;
    }

    const shop = shopSnap.data() || {};
    const rawUid = String(shop.authUid || '').trim();
    const rawEmail = String(shop.email || '').trim().toLowerCase();

    let targetUid = rawUid;
    if (!targetUid && rawEmail) {
      try {
        const user = await admin.auth().getUserByEmail(rawEmail);
        targetUid = user.uid;
      } catch (error) {
        if (String(error?.code || '') !== 'auth/user-not-found') {
          throw error;
        }
      }
    }

    if (targetUid) {
      try {
        await admin.auth().deleteUser(targetUid);
      } catch (error) {
        if (String(error?.code || '') !== 'auth/user-not-found') {
          throw error;
        }
      }
    }

    for (const name of SHOP_CHILD_COLLECTIONS) {
      await deleteCollectionBatched(shopRef.collection(name));
    }

    await shopRef.delete();

    res.status(200).json({
      ok: true,
      deleted: true,
      shopId,
      deletedAuthUid: targetUid || null,
    });
  } catch (error) {
    functions.logger.error('deleteShopByAdmin failed', error);
    res.status(500).json({
      ok: false,
      message: String(error?.message || error || 'Unknown server error'),
    });
  }
});
