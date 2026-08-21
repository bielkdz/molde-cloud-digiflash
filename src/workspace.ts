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
  userId: string;
  name: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type FileRecord = {
  id: string;
  userId: string;
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
  userId: string;
  action: "folder_created" | "folder_renamed" | "folder_deleted" | "photo_registered" | "photo_uploaded";
  title: string;
  detail: string;
  createdAt?: Timestamp;
};

function timestampValue(value?: Timestamp) {
  return value?.toMillis() ?? 0;
}

function watchOwnedCollection<T extends { id: string; createdAt?: Timestamp }>(
  name: "folders" | "files" | "history",
  userId: string,
  onChange: (items: T[]) => void,
  onError: (message: string) => void,
) {
  const ownedQuery = query(collection(db, name), where("userId", "==", userId));
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

export function watchFolders(userId: string, onChange: (items: FolderRecord[]) => void, onError: (message: string) => void) {
  return watchOwnedCollection<FolderRecord>("folders", userId, onChange, onError);
}

export function watchFiles(userId: string, onChange: (items: FileRecord[]) => void, onError: (message: string) => void) {
  return watchOwnedCollection<FileRecord>("files", userId, onChange, onError);
}

export function watchHistory(userId: string, onChange: (items: HistoryRecord[]) => void, onError: (message: string) => void) {
  return watchOwnedCollection<HistoryRecord>("history", userId, onChange, onError);
}

export async function createFolder(userId: string, name: string) {
  const batch = writeBatch(db);
  const folderRef = doc(collection(db, "folders"));
  const historyRef = doc(collection(db, "history"));
  batch.set(folderRef, {
    userId,
    name: name.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(historyRef, {
    userId,
    action: "folder_created",
    title: "Pasta criada",
    detail: name.trim(),
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function renameFolder(userId: string, folder: FolderRecord, name: string) {
  const nextName = name.trim();
  const filesSnapshot = await getDocs(query(collection(db, "files"), where("userId", "==", userId), where("folderId", "==", folder.id)));
  const batch = writeBatch(db);
  batch.update(doc(db, "folders", folder.id), { name: nextName, updatedAt: serverTimestamp() });
  filesSnapshot.docs.forEach((file) => batch.update(file.ref, { folderName: nextName }));
  batch.set(doc(collection(db, "history")), {
    userId,
    action: "folder_renamed",
    title: "Pasta renomeada",
    detail: `${folder.name} → ${nextName}`,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function removeFolder(userId: string, folder: FolderRecord) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "folders", folder.id));
  batch.set(doc(collection(db, "history")), {
    userId,
    action: "folder_deleted",
    title: "Pasta excluída",
    detail: folder.name,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function registerPhoto(
  userId: string,
  folder: FolderRecord,
  name: string,
  file: File,
  oneDrive: { id: string; webUrl: string; name: string; size: number },
) {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "files")), {
    userId,
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
    userId,
    action: "photo_uploaded",
    title: "Foto enviada ao OneDrive",
    detail: `${oneDrive.name || name.trim()} · ${folder.name}`,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}
