import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getStorage } from 'firebase-admin/storage';

const DEFAULT_BUCKET = process.env.STORAGE_BUCKET || 'repository-ai-477311.firebasestorage.app';

export const purgeTrash = onSchedule(
  {
    region: 'europe-west1',
    schedule: 'every 24 hours',
    timeZone: 'Europe/Rome',
  },
  async () => {
    const days = parseInt(process.env.DELETE_RETENTION_DAYS ?? '30', 10);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    console.log(`[purgeTrash] Starting purge (retention: ${days} days, cutoff: ${new Date(cutoff).toISOString()})`);

    const bucket = getStorage().bucket(DEFAULT_BUCKET);
    const [files] = await bucket.getFiles({ prefix: 'trash/' });

    let deleted = 0;
    let skipped = 0;

    for (const f of files) {
      try {
        const [md] = await f.getMetadata().catch(() => [null]);
        const deletedAtStr = md?.metadata?.deletedAt || md?.timeCreated || '';
        const deletedAt = typeof deletedAtStr === 'string' ? Date.parse(deletedAtStr) : 
                         typeof deletedAtStr === 'number' ? deletedAtStr : 0;

        if (deletedAt && deletedAt < cutoff) {
          await f.delete();
          deleted++;
          console.log(`[purgeTrash] Deleted: ${f.name}`);
        } else {
          skipped++;
        }
      } catch (e: any) {
        console.warn(`[purgeTrash] Failed to delete ${f.name}:`, e.message);
      }
    }

    console.log(`[purgeTrash] Completed: ${deleted} deleted, ${skipped} skipped`);
  }
);

