const admin = require('firebase-admin');
const serviceAccount = require('./acessoftballreference-84791-firebase-adminsdk-fbsvc-76633b4bca.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const AUTH_UID = 'EbEd4qK0YpP6uywCjhmqzubC9ao2';

async function fixJoePatanella() {
  console.log('Starting Joe Patanella account fix...\n');

  // 1. Update auth user doc to point to the correct legacy profile
  console.log('Step 1: Updating auth user doc...');
  await db.collection('users').doc(AUTH_UID).update({
    mergedFromProfile: 'joe_patanella',
    linkedPlayer: 'Joe Patanella'
  });
  console.log('  auth user -> mergedFromProfile: joe_patanella, linkedPlayer: Joe Patanella\n');

  // 2. Mark joe_patanella aggregatedPlayerStats as migrated (the real stats doc)
  console.log('Step 2: Marking joe_patanella stats as migrated...');
  await db.collection('aggregatedPlayerStats').doc('joe_patanella').update({
    migrated: true,
    migratedTo: AUTH_UID,
    isAuthUser: true
  });
  console.log('  joe_patanella stats -> migrated: true, migratedTo:', AUTH_UID, '\n');

  // 3. Delete the ghost joseph_patanella stats doc (all zeros, never had real data)
  console.log('Step 3: Deleting ghost joseph_patanella stats doc...');
  await db.collection('aggregatedPlayerStats').doc('joseph_patanella').delete();
  console.log('  aggregatedPlayerStats/joseph_patanella -> DELETED\n');

  // 4. Update users/joseph_patanella legacy doc to point to correct auth UID
  console.log('Step 4: Updating joseph_patanella legacy user doc...');
  await db.collection('users').doc('joseph_patanella').update({
    migratedTo: AUTH_UID
  });
  console.log('  users/joseph_patanella -> migratedTo:', AUTH_UID, '\n');

  console.log('All done! Summary:');
  console.log('  - Auth user now points to joe_patanella (real stats)');
  console.log('  - joe_patanella stats marked as migrated to auth UID');
  console.log('  - Ghost joseph_patanella stats doc deleted');
  console.log('  - Legacy joseph_patanella user doc updated');
}

fixJoePatanella().catch(err => {
  console.error('Error during fix:', err);
  process.exit(1);
});
