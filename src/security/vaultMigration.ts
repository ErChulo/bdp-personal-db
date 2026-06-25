import { sqlAdapter } from '../adapters/sqlAdapter';
import { nosqlAdapter } from '../adapters/nosqlAdapter';
import { sqlStore } from '../adapters/sqlStore';

export async function migrateVaultData(): Promise<void> {
  const sqlDbs = await sqlStore.listAll();
  for (const db of sqlDbs) {
    await sqlAdapter.export(db.id);
  }

  const collections = await nosqlAdapter.listCollectionIds();
  for (const collectionId of collections) {
    await nosqlAdapter.sealCollection(collectionId);
  }
}

