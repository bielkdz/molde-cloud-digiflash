import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn(), set: vi.fn(), commit: vi.fn(async () => {}) }));
vi.mock('../src/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => name,
  doc: (...args: unknown[]) => args.join('/'),
  serverTimestamp: () => 'timestamp',
  writeBatch: () => ({ update: mocks.update, delete: mocks.remove, set: mocks.set, commit: mocks.commit }),
  deleteField: vi.fn(), getDocs: vi.fn(), onSnapshot: vi.fn(), query: vi.fn(), where: vi.fn(),
}));
import { synchronizeWorkspace, type FileRecord, type FolderRecord } from '../src/workspace';
const actor = { userId: 'user', companyId: 'company', name: 'Tester' };
const folder = { id: 'folder', name: 'Moldes', companyId: 'company', userId: 'user', oneDriveItemId: 'old-folder' } as FolderRecord;
const file = { id: 'photo', name: 'Foto.jpg', companyId: 'company', userId: 'user', folderId: 'folder', folderName: 'Moldes', oneDriveItemId: 'old-photo', size: 3 } as FileRecord;
beforeEach(() => vi.clearAllMocks());
it('preserves all catalog records for an empty or newly connected drive', async () => {
  const result = await synchronizeWorkspace(actor, [folder], [file], { folders: [], files: [] });
  expect(result).toEqual({ missingFolders: 1, missingFiles: 1, updated: 0 });
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.commit).toHaveBeenCalledOnce();
});
it('updates known files without deleting missing siblings', async () => {
  const result = await synchronizeWorkspace(actor, [folder], [file, { ...file, id: 'missing', oneDriveItemId: 'missing' }], {
    folders: [{ id: 'old-folder', name: 'Moldes' }],
    files: [{ id: 'old-photo', name: 'Renomeada.jpg', size: 3, webUrl: 'https://example.com', folderName: 'Moldes' }],
  });
  expect(result.updated).toBe(1);
  expect(result.missingFiles).toBe(1);
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: 'Renomeada.jpg' }));
});
