import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export type FolderRecord = {
  id: string;
  companyId: string;
  userId: string;
  createdByName?: string;
  name: string;
  oneDriveItemId?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type FileRecord = {
  id: string;
  companyId: string;
  userId: string;
  createdByName?: string;
  folderId: string;
  folderName: string;
  name: string;
  size: number;
  mimeType: string;
  status: "pending_onedrive" | "uploaded";
  oneDriveItemId?: string;
  oneDriveWebUrl?: string;
  uploadedAt?: Timestamp;
  createdAt?: Timestamp;
};

export type HistoryRecord = {
  id: string;
  companyId: string;
  userId: string;
  actorName?: string;
  action: "folder_created" | "folder_renamed" | "folder_deleted" | "photo_registered" | "photo_uploaded" | "photo_renamed" | "photo_moved" | "photo_deleted" | "workspace_synced";
  title: string;
  detail: string;
  createdAt?: Timestamp;
};

function timestampValue(value?: Timestamp) {
  return value?.toMillis() ?? 0;
}

export type WorkspaceActor = { userId: string; companyId: string; name: string };

function watchCompanyCollection<T extends { id: string; createdAt?: Timestamp }>(
  name: "folders" | "files" | "history",
  companyId: string,
  onChange: (items: T[]) => void,
  onError: (message: string) => void,
) {
  const ownedQuery = query(collection(db, name), where("companyId", "==", companyId));
  return onSnapshot(
    ownedQuery,
    (snapshot) => {
      const items = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }) as T)
        .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt));
      onChange(items);
    },
    () => onError(`Não foi possível carregar ${name === "folders" ? "as pastas" : name === "files" ? "os arquivos" : "o histórico"}.`),
  );
}

export function watchFolders(companyId: string, onChange: (items: FolderRecord[]) => void, onError: (message: string) => void) {
  return watchCompanyCollection<FolderRecord>("folders", companyId, onChange, onError);
}

export function watchFiles(companyId: string, onChange: (items: FileRecord[]) => void, onError: (message: string) => void) {
  return watchCompanyCollection<FileRecord>("files", companyId, onChange, onError);
}

export function watchHistory(companyId: string, onChange: (items: HistoryRecord[]) => void, onError: (message: string) => void) {
  return watchCompanyCollection<HistoryRecord>("history", companyId, onChange, onError);
}

export async function migrateLegacyWorkspace(userId: string, companyId: string) {
  for (const name of ["folders", "files", "history"] as const) {
    const snapshot = await getDocs(query(collection(db, name), where("userId", "==", userId)));
    const legacy = snapshot.docs.filter((item) => !item.data().companyId);
    if (!legacy.length) continue;
    const batch = writeBatch(db);
    legacy.forEach((item) => batch.update(item.ref, { companyId }));
    await batch.commit();
  }
}

export async function createFolder(actor: WorkspaceActor, name: string) {
  const batch = writeBatch(db);
  const folderRef = doc(collection(db, "folders"));
  const historyRef = doc(collection(db, "history"));
  batch.set(folderRef, {
    companyId: actor.companyId,
    userId: actor.userId,
    createdByName: actor.name,
    name: name.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(historyRef, {
    companyId: actor.companyId,
    userId: actor.userId,
    actorName: actor.name,
    action: "folder_created",
    title: "Pasta criada",
    detail: `${name.trim()} · ${actor.name}`,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return folderRef.id;
}

export async function linkFolderToOneDrive(folderId: string, oneDriveItemId: string) {
  await writeBatchWithUpdate(doc(db, "folders", folderId), { oneDriveItemId, updatedAt: serverTimestamp() });
}

async function writeBatchWithUpdate(reference: ReturnType<typeof doc>, data: Record<string, unknown>) {
  const batch = writeBatch(db);
  batch.update(reference, data);
  await batch.commit();
}

export async function renameFolder(actor: WorkspaceActor, folder: FolderRecord, name: string) {
  const nextName = name.trim();
  const filesSnapshot = await getDocs(query(collection(db, "files"), where("companyId", "==", actor.companyId), where("folderId", "==", folder.id)));
  const batch = writeBatch(db);
  batch.update(doc(db, "folders", folder.id), { name: nextName, updatedAt: serverTimestamp() });
  filesSnapshot.docs.forEach((file) => batch.update(file.ref, { folderName: nextName }));
  batch.set(doc(collection(db, "history")), {
    companyId: actor.companyId,
    userId: actor.userId,
    actorName: actor.name,
    action: "folder_renamed",
    title: "Pasta renomeada",
    detail: `${folder.name} → ${nextName} · ${actor.name}`,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function removeFolder(actor: WorkspaceActor, folder: FolderRecord) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "folders", folder.id));
  batch.set(doc(collection(db, "history")), {
    companyId: actor.companyId,
    userId: actor.userId,
    actorName: actor.name,
    action: "folder_deleted",
    title: "Pasta excluída",
    detail: `${folder.name} · ${actor.name}`,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function registerPhoto(
  actor: WorkspaceActor,
  folder: FolderRecord,
  name: string,
  file: File,
  oneDrive: { id: string; webUrl: string; name: string; size: number },
) {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "files")), {
    companyId: actor.companyId,
    userId: actor.userId,
    createdByName: actor.name,
    folderId: folder.id,
    folderName: folder.name,
    name: oneDrive.name || name.trim(),
    size: oneDrive.size || file.size,
    mimeType: file.type || "image/jpeg",
    status: "uploaded",
    oneDriveItemId: oneDrive.id,
    oneDriveWebUrl: oneDrive.webUrl,
    uploadedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  batch.set(doc(collection(db, "history")), {
    companyId: actor.companyId,
    userId: actor.userId,
    actorName: actor.name,
    action: "photo_uploaded",
    title: "Foto enviada ao OneDrive",
    detail: `${oneDrive.name || name.trim()} · ${folder.name} · ${actor.name}`,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function renameFileRecord(actor: WorkspaceActor, file: FileRecord, name: string, webUrl?: string) {
  const nextName = name.trim();
  const batch = writeBatch(db);
  batch.update(doc(db, "files", file.id), { name: nextName, ...(webUrl ? { oneDriveWebUrl: webUrl } : {}) });
  batch.set(doc(collection(db, "history")), {
    companyId: actor.companyId, userId: actor.userId, actorName: actor.name, action: "photo_renamed",
    title: "Foto renomeada", detail: `${file.name} → ${nextName} · ${actor.name}`, createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function moveFileRecord(actor: WorkspaceActor, file: FileRecord, folder: FolderRecord, webUrl?: string) {
  const batch = writeBatch(db);
  batch.update(doc(db, "files", file.id), { folderId: folder.id, folderName: folder.name, ...(webUrl ? { oneDriveWebUrl: webUrl } : {}) });
  batch.set(doc(collection(db, "history")), {
    companyId: actor.companyId, userId: actor.userId, actorName: actor.name, action: "photo_moved",
    title: "Foto movida", detail: `${file.name} · ${file.folderName} → ${folder.name} · ${actor.name}`, createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function removeFileRecord(actor: WorkspaceActor, file: FileRecord) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "files", file.id));
  batch.set(doc(collection(db, "history")), {
    companyId: actor.companyId, userId: actor.userId, actorName: actor.name, action: "photo_deleted",
    title: "Foto excluída", detail: `${file.name} · ${file.folderName} · ${actor.name}`, createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function synchronizeWorkspace(
  actor: WorkspaceActor,
  folders: FolderRecord[],
  files: FileRecord[],
  snapshot: { folders: Array<{ id: string; name: string }>; files: Array<{ id: string; name: string; size: number; webUrl: string; folderName: string }> },
) {
  const remoteFoldersById = new Map(snapshot.folders.map((item) => [item.id, item]));
  const remoteFoldersByName = new Map(snapshot.folders.map((item) => [item.name.toLocaleLowerCase(), item]));
  const remoteFiles = new Map(snapshot.files.map((item) => [item.id, item]));
  const missingFiles = files.filter((item) => item.oneDriveItemId && !remoteFiles.has(item.oneDriveItemId));
  const missingFolders = folders.filter((item) => {
    if (item.oneDriveItemId) return !remoteFoldersById.has(item.oneDriveItemId);
    return files.some((file) => file.folderId === item.id) && !remoteFoldersByName.has(item.name.toLocaleLowerCase());
  });
  const batch = writeBatch(db);
  let updated = 0;
  files.forEach((item) => {
    const remote = item.oneDriveItemId ? remoteFiles.get(item.oneDriveItemId) : undefined;
    if (!remote) return;
    const folder = folders.find((candidate) => candidate.name.toLocaleLowerCase() === remote.folderName.toLocaleLowerCase());
    const changes: Record<string, unknown> = {};
    if (item.name !== remote.name) changes.name = remote.name;
    if (item.size !== remote.size) changes.size = remote.size;
    if (item.oneDriveWebUrl !== remote.webUrl) changes.oneDriveWebUrl = remote.webUrl;
    if (folder && item.folderId !== folder.id) { changes.folderId = folder.id; changes.folderName = folder.name; }
    if (Object.keys(changes).length) { batch.update(doc(db, "files", item.id), changes); updated += 1; }
  });
  folders.forEach((item) => {
    if (item.oneDriveItemId) return;
    const remote = remoteFoldersByName.get(item.name.toLocaleLowerCase());
    if (remote) { batch.update(doc(db, "folders", item.id), { oneDriveItemId: remote.id, updatedAt: serverTimestamp() }); updated += 1; }
  });
  missingFiles.forEach((item) => batch.delete(doc(db, "files", item.id)));
  missingFolders.forEach((item) => batch.delete(doc(db, "folders", item.id)));
  batch.set(doc(collection(db, "history")), {
    companyId: actor.companyId, userId: actor.userId, actorName: actor.name, action: "workspace_synced",
    title: "OneDrive sincronizado",
    detail: `${missingFolders.length} pasta(s) e ${missingFiles.length} arquivo(s) removido(s); ${updated} registro(s) atualizado(s) · ${actor.name}`,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return { removedFolders: missingFolders.length, removedFiles: missingFiles.length, updated };
}
