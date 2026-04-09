/**
 * Firebase Cloud Functions for Robust Backup System
 * 
 * This file contains:
 * 1. Real-time backup triggers for the 'entries' collection.
 * 2. Scheduled daily full backups.
 * 3. Scheduled cleanup of old backups.
 * 4. Logic for restore utilities.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');

admin.initializeApp();
const db = admin.firestore();
const storage = new Storage();
const bucket = admin.storage().bucket();

// --- 1. REAL-TIME BACKUP (CRITICAL) ---

/**
 * Triggered on any write to the 'entries' collection.
 * Creates a backup in Storage and a metadata record in Firestore.
 */
exports.backupEntryChange = functions.firestore
  .document('entries/{entryId}')
  .onWrite(async (change, context) => {
    const entryId = context.params.entryId;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    
    let action = 'updated';
    if (!before) action = 'created';
    if (!after) action = 'deleted';

    const timestamp = new Date().toISOString();
    const backupData = {
      journalId: entryId,
      before,
      after,
      action,
      timestamp
    };

    const fileName = `journal-history/${timestamp}_${entryId}.json`;
    const file = bucket.file(fileName);

    try {
      // Store backup in Firebase Storage
      await file.save(JSON.stringify(backupData, null, 2), {
        contentType: 'application/json',
        metadata: {
          metadata: {
            entryId,
            action,
            timestamp
          }
        }
      });

      // Store metadata in Firestore for the frontend timeline
      await db.collection('entry_history').add({
        entryId,
        action,
        timestamp,
        storagePath: fileName
      });

      console.log(`Backup successful for ${entryId} (${action}) at ${fileName}`);
    } catch (error) {
      console.error(`Backup failed for ${entryId}:`, error);
    }
  });

// --- 2. DAILY BACKUP (02:00 AM) ---

/**
 * Scheduled daily full backup of the 'entries' collection.
 * Runs at 02:00 AM Asia/Dhaka.
 */
exports.dailyFullBackup = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('Asia/Dhaka')
  .onRun(async (context) => {
    try {
      const snapshot = await db.collection('entries').get();
      const entries = [];
      snapshot.forEach(doc => entries.push({ id: doc.id, ...doc.data() }));

      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `daily-backups/entries-${dateStr}.json`;
      const file = bucket.file(fileName);

      await file.save(JSON.stringify(entries, null, 2), {
        contentType: 'application/json'
      });

      console.log(`Daily full backup completed: ${fileName}`);
    } catch (error) {
      console.error('Daily full backup failed:', error);
    }
  });

// --- 3. RESTORE FUNCTIONS (Internal Logic) ---

/**
 * Restore a full backup from a JSON file in Storage.
 * This is intended to be called via a secure admin endpoint or manual trigger.
 */
async function restoreFullBackup(fileName) {
  try {
    const file = bucket.file(fileName);
    const [content] = await file.download();
    const entries = JSON.parse(content.toString());

    const batch = db.batch();
    entries.forEach(entry => {
      const { id, ...data } = entry;
      const ref = db.collection('entries').doc(id);
      batch.set(ref, data);
    });

    await batch.commit();
    console.log(`Successfully restored ${entries.length} entries from ${fileName}`);
    return { success: true, count: entries.length };
  } catch (error) {
    console.error('Full restore failed:', error);
    throw error;
  }
}

/**
 * Restore a single entry from a history backup.
 */
async function restoreSingleEntry(historyFileName) {
  try {
    const file = bucket.file(historyFileName);
    const [content] = await file.download();
    const backup = JSON.parse(content.toString());

    const entryId = backup.journalId;
    const ref = db.collection('entries').doc(entryId);

    if (backup.after) {
      // If it was created or updated, restore the 'after' state
      await ref.set(backup.after);
    } else if (backup.action === 'deleted') {
      // If it was deleted, we might want to restore the 'before' state to bring it back
      if (backup.before) {
        await ref.set(backup.before);
      }
    }

    console.log(`Successfully restored entry ${entryId} from ${historyFileName}`);
    return { success: true, entryId };
  } catch (error) {
    console.error('Single restore failed:', error);
    throw error;
  }
}

// --- 4. CLEANUP OLD BACKUPS ---

/**
 * Scheduled cleanup of old backups.
 * Deletes daily backups > 30 days and history > 90 days.
 */
exports.cleanupOldBackups = functions.pubsub
  .schedule('0 3 * * *') // Runs at 03:00 AM daily
  .onRun(async (context) => {
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

    try {
      const [files] = await bucket.getFiles();
      
      const deletePromises = files.map(async (file) => {
        const [metadata] = await file.getMetadata();
        const createdTime = new Date(metadata.timeCreated).getTime();

        if (file.name.startsWith('daily-backups/') && (now - createdTime > thirtyDaysMs)) {
          console.log(`Deleting old daily backup: ${file.name}`);
          return file.delete();
        }

        if (file.name.startsWith('journal-history/') && (now - createdTime > ninetyDaysMs)) {
          console.log(`Deleting old history backup: ${file.name}`);
          // Also cleanup Firestore metadata
          const historySnapshot = await db.collection('entry_history')
            .where('storagePath', '==', file.name)
            .get();
          
          const batch = db.batch();
          historySnapshot.forEach(doc => batch.delete(doc.ref));
          await batch.commit();

          return file.delete();
        }
      });

      await Promise.all(deletePromises);
      console.log('Cleanup completed.');
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  });

// --- 5. EXPORTS FOR RESTORE (Callable Functions) ---

exports.triggerFullRestore = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.email !== 'tasfeen.auyan@triloytech.com') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can restore.');
  }
  return await restoreFullBackup(data.fileName);
});

exports.triggerSingleRestore = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.email !== 'tasfeen.auyan@triloytech.com') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can restore.');
  }
  return await restoreSingleEntry(data.storagePath);
});
