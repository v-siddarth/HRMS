/*
  Deletes a Firebase Auth user by email or uid using Admin SDK.

  Usage:
    GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/delete-shop-auth-user.js --email=user@example.com
    GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/delete-shop-auth-user.js --uid=abc123
*/

const admin = require('firebase-admin');

function readArg(name) {
  const pref = `--${name}=`;
  const hit = process.argv.find(arg => arg.startsWith(pref));
  return hit ? hit.slice(pref.length).trim() : '';
}

async function main() {
  const email = readArg('email').toLowerCase();
  const uidArg = readArg('uid');
  if (!email && !uidArg) {
    throw new Error('Provide --email or --uid');
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });

  let uid = uidArg;
  if (!uid) {
    try {
      const user = await admin.auth().getUserByEmail(email);
      uid = user.uid;
    } catch (error) {
      if (String(error?.code || '') === 'auth/user-not-found') {
        console.log('User not found. Nothing to delete.');
        return;
      }
      throw error;
    }
  }

  try {
    await admin.auth().deleteUser(uid);
    console.log(`Deleted auth user: uid=${uid}${email ? ` email=${email}` : ''}`);
  } catch (error) {
    if (String(error?.code || '') === 'auth/user-not-found') {
      console.log('User not found. Nothing to delete.');
      return;
    }
    throw error;
  }
}

main().catch(error => {
  console.error(error?.message || error);
  process.exit(1);
});
