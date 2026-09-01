import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  doc,
  deleteDoc,
  writeBatch,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, describe, it, expect } from "vitest";

let environment: RulesTestEnvironment;

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-molde-cloud",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });

  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "companies", "company-a"), {
        name: "Empresa A",
        status: "active",
        adminEmail: "admin-a@example.com",
      }),
      setDoc(doc(db, "companies", "company-b"), {
        name: "Empresa B",
        status: "active",
        adminEmail: "admin-b@example.com",
      }),
      setDoc(doc(db, "users", "user-a"), {
        uid: "user-a",
        email: "user-a@example.com",
        role: "user",
        companyId: "company-a",
      }),
      setDoc(doc(db, "users", "admin-a"), {
        uid: "admin-a",
        email: "admin-a@example.com",
        role: "admin",
        companyId: "company-a",
      }),
      setDoc(doc(db, "users", "user-b"), {
        uid: "user-b",
        email: "user-b@example.com",
        role: "user",
        companyId: "company-b",
      }),
      setDoc(doc(db, "users", "pending"), {
        uid: "pending",
        email: "pending@example.com",
        role: "pending",
        companyId: "company-a",
      }),
      setDoc(doc(db, "users", "restricted"), {
        uid: "restricted",
        email: "restricted@example.com",
        role: "user",
        companyId: "company-a",
        permissions: {
          createFolder: false,
          renameItems: false,
          deleteItems: false,
          viewTrash: false,
        },
      }),
      setDoc(doc(db, "files", "file-a"), {
        companyId: "company-a",
        userId: "user-a",
        name: "arquivo-a.jpg",
      }),
      setDoc(doc(db, "files", "file-b"), {
        companyId: "company-b",
        userId: "user-b",
        name: "arquivo-b.jpg",
      }),
      setDoc(doc(db, "folders", "folder-a"), {
        companyId: "company-a",
        userId: "user-a",
        name: "Pasta A",
      }),
      setDoc(doc(db, "folders", "folder-restricted"), {
        companyId: "company-a",
        userId: "restricted",
        name: "Pasta restrita",
      }),
    ]);
  });
});

afterAll(async () => environment.cleanup());

describe("isolamento entre empresas", () => {
  it("permite que o usuário leia um arquivo da própria empresa", async () => {
    const db = environment.authenticatedContext("user-a").firestore();
    await assertSucceeds(getDoc(doc(db, "files", "file-a")));
  });

  it("bloqueia arquivo pertencente a outra empresa", async () => {
    const db = environment.authenticatedContext("user-a").firestore();
    await assertFails(getDoc(doc(db, "files", "file-b")));
  });

  it("impede transferir um registro alterando companyId ou userId", async () => {
    const db = environment.authenticatedContext("user-a").firestore();
    await assertFails(
      updateDoc(doc(db, "files", "file-a"), { companyId: "company-b" }),
    );
    await assertFails(
      updateDoc(doc(db, "files", "file-a"), { userId: "user-b" }),
    );
  });

  it("impede administrador de acessar usuário de outra empresa", async () => {
    const db = environment.authenticatedContext("admin-a").firestore();
    await assertFails(getDoc(doc(db, "users", "user-b")));
  });

  it("bloqueia dados para cadastro ainda pendente", async () => {
    const db = environment.authenticatedContext("pending").firestore();
    await assertFails(getDoc(doc(db, "files", "file-a")));
  });

  it("permite mover e restaurar a própria pasta sem alterar a empresa", async () => {
    const db = environment.authenticatedContext("user-a").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "folders", "folder-a"), {
        deletedAt: serverTimestamp(),
        deletedByName: "Usuário A",
      }),
    );
    await assertFails(
      updateDoc(doc(db, "folders", "folder-a"), {
        companyId: "company-b",
      }),
    );
  });

  it("aplica permissões detalhadas às ações do usuário", async () => {
    const db = environment.authenticatedContext("restricted").firestore();
    await assertFails(
      addDoc(collection(db, "folders"), {
        companyId: "company-a",
        userId: "restricted",
        name: "Nova pasta",
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(db, "folders", "folder-restricted"), {
        name: "Outro nome",
      }),
    );
    await assertFails(
      updateDoc(doc(db, "folders", "folder-restricted"), {
        deletedAt: serverTimestamp(),
        deletedByName: "Restrito",
      }),
    );

    await assertFails(
      updateDoc(doc(db, "users", "restricted"), {
        permissions: {
          createFolder: true,
          renameItems: true,
          deleteItems: true,
          viewTrash: true,
        },
      }),
    );

    const adminDb = environment.authenticatedContext("admin-a").firestore();
    await assertSucceeds(
      updateDoc(doc(adminDb, "users", "restricted"), {
        permissions: {
          createFolder: true,
          renameItems: false,
          deleteItems: false,
          viewTrash: false,
        },
      }),
    );
  });
});

describe("registro técnico seguro", () => {
  it("aceita somente os campos técnicos permitidos", async () => {
    const db = environment.authenticatedContext("user-a").firestore();
    await assertSucceeds(
      addDoc(collection(db, "errorLogs"), {
        companyId: "company-a",
        userId: "user-a",
        actorName: "Usuário A",
        operation: "synchronize_onedrive",
        code: "onedrive/403",
        status: "pending",
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      addDoc(collection(db, "errorLogs"), {
        companyId: "company-a",
        userId: "user-a",
        actorName: "Usuário A",
        operation: "upload_photo",
        code: "error",
        status: "pending",
        fileContent: "conteúdo proibido",
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("permite somente ao administrador da empresa resolver o registro", async () => {
    let logId = "";
    await environment.withSecurityRulesDisabled(async (context) => {
      const reference = await addDoc(
        collection(context.firestore(), "errorLogs"),
        {
          companyId: "company-a",
          userId: "user-a",
          actorName: "Usuário A",
          operation: "upload_photo",
          code: "network_error",
          status: "pending",
          createdAt: serverTimestamp(),
        },
      );
      logId = reference.id;
    });
    const adminDb = environment.authenticatedContext("admin-a").firestore();
    await assertSucceeds(
      updateDoc(doc(adminDb, "errorLogs", logId), {
        status: "resolved",
        resolvedAt: serverTimestamp(),
        resolvedBy: "admin-a",
      }),
    );
    const userDb = environment.authenticatedContext("user-a").firestore();
    await assertFails(
      updateDoc(doc(userDb, "errorLogs", logId), { code: "alterado" }),
    );
  });
});

describe("limpeza do histórico", () => {
  async function fixture(id: string, role: string, companyStatus = "active") {
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, "companies", id), { status: companyStatus });
      await setDoc(doc(db, "users", id), { role, companyId: id });
      await setDoc(doc(db, "history", id), { companyId: id, userId: id, title: "Atividade" });
      await setDoc(doc(db, "history", id + "-foreign"), { companyId: "company-b", userId: "user-b" });
    });
    return environment.authenticatedContext(id).firestore();
  }

  it.each(["admin", "superadmin"])("permite %s limpar somente a empresa atual", async role => {
    const id = "cleanup-" + role;
    const db = await fixture(id, role);
    await assertFails(deleteDoc(doc(db, "history", id + "-foreign")));
    await assertSucceeds(deleteDoc(doc(db, "history", id)));
    const snapshot = await assertSucceeds(getDoc(doc(db, "history", id)));
    expect(snapshot.exists()).toBe(false);
  });

  it.each(["user", "pending", "blocked"])("nega limpeza ao perfil %s", async role => {
    const id = "cleanup-denied-" + role;
    const db = await fixture(id, role);
    await assertFails(deleteDoc(doc(db, "history", id)));
  });

  it("nega limpeza sem autenticação", async () => {
    await fixture("cleanup-anonymous", "admin");
    const db = environment.unauthenticatedContext().firestore();
    await assertFails(deleteDoc(doc(db, "history", "cleanup-anonymous")));
  });

  it.each(["blocked", "deleted"])("nega administrador de empresa %s", async status => {
    const id = "cleanup-company-" + status;
    const db = await fixture(id, "admin", status);
    await assertFails(deleteDoc(doc(db, "history", id)));
  });

  it("rejeita lote misto e preserva o registro autorizado", async () => {
    const id = "cleanup-batch";
    const db = await fixture(id, "admin");
    const batch = writeBatch(db);
    batch.delete(doc(db, "history", id));
    batch.delete(doc(db, "history", id + "-foreign"));
    await assertFails(batch.commit());
    expect((await getDoc(doc(db, "history", id))).exists()).toBe(true);
  });

  it("limpar histórico não remove fotos nem pastas", async () => {
    const id = "cleanup-preserves";
    const db = await fixture(id, "admin");
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), "files", id), { companyId: id, userId: id, name: "Foto" });
      await setDoc(doc(context.firestore(), "folders", id), { companyId: id, userId: id, name: "Pasta" });
    });
    await assertSucceeds(deleteDoc(doc(db, "history", id)));
    expect((await getDoc(doc(db, "files", id))).exists()).toBe(true);
    expect((await getDoc(doc(db, "folders", id))).exists()).toBe(true);
  });
});
