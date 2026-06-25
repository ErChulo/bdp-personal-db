import { nosqlAdapter } from '../adapters/nosqlAdapter';
import { sqlStore } from '../adapters/sqlStore';
import { resetVaultStorage } from './vault';

export async function clearVaultData(): Promise<void> {
  const sqlDbs = await sqlStore.listAll();
  for (const db of sqlDbs) {
    await sqlStore.remove(db.id);
  }

  const collections = await nosqlAdapter.listCollectionIds();
  for (const collectionId of collections) {
    await nosqlAdapter.removeCollection(collectionId);
  }

  await resetVaultStorage();
}

