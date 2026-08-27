import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { WorkspaceActor } from "./workspace";

export function safeErrorCode(error: unknown) {
  if (typeof error === "object" && error && "errorCode" in error) {
    const code = String(error.errorCode || "").trim();
    if (code) return code.slice(0, 80);
  }
  if (error instanceof Error) {
    const knownCode = error.message.split(":", 1)[0].trim();
    if (/^[a-z0-9/_-]+$/i.test(knownCode)) return knownCode.slice(0, 80);
    return error.name.slice(0, 80) || "Error";
  }
  return "unknown_error";
}

export async function logOperationalError(
  actor: WorkspaceActor,
  operation: string,
  error: unknown,
) {
  await addDoc(collection(db, "errorLogs"), {
    companyId: actor.companyId,
    userId: actor.userId,
    actorName: actor.name,
    operation: operation.slice(0, 80),
    code: safeErrorCode(error),
    createdAt: serverTimestamp(),
  });
}
