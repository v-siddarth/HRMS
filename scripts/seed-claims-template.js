/*
  Usage:
  1) npm i firebase-admin
  2) export GOOGLE_APPLICATION_CREDENTIALS=/path/service-account.json
  3) node scripts/seed-claims-template.js <uid> <role> [shopId]

  role: super_admin | shop_manager
*/

const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

async function run() {
  const [, , uid, role, shopId] = process.argv;
  if (!uid || !role) {
    console.error('Usage: node scripts/seed-claims-template.js <uid> <role> [shopId]');
    process.exit(1);
  }

  const claims = role === 'super_admin' ? { role } : { role, shopId };
  await admin.auth().setCustomUserClaims(uid, claims);
  console.log(`Custom claims set for ${uid}:`, claims);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
