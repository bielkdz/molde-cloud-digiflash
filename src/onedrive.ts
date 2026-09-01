import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
} from "@azure/msal-browser";

const graphBaseUrl = "https://graph.microsoft.com/v1.0";
const rootFolderName = "Molde Cloud DigiFlash";
const scopes = ["Files.ReadWrite", "User.Read"];
const clientId =
  import.meta.env.VITE_MICROSOFT_CLIENT_ID?.trim() ||
  "2ad90ac1-7b91-46a3-ba52-0093e1e7775e";
const connectionIntentKey = "molde-cloud:onedrive-company";
const renewalNoticeKey = "molde-cloud:onedrive-renewed";

let clientPromise: Promise<PublicClientApplication> | null = null;

export type OneDriveUpload = {
  id: string;
  name: string;
  size: number;
  webUrl: string;
};

type DriveItem = OneDriveUpload & { folder?: { childCount?: number } };

export type OneDriveSnapshot = {
  folders: Array<{ id: string; name: string }>;
  files: Array<{
    id: string;
    name: string;
    size: number;
    webUrl: string;
    folderName: string;
  }>;
};

export type OneDriveStorage = {
  total: number;
  used: number;
  remaining: number;
  state: string;
};

export const isOneDriveConfigured = Boolean(clientId);

async function getClient() {
  if (!clientId) throw new Error("onedrive/not-configured");
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new PublicClientApplication({
        auth: {
          clientId,
          authority: "https://login.microsoftonline.com/common",
          redirectUri: `${window.location.origin}/`,
          postLogoutRedirectUri: `${window.location.origin}/`,
        },
        cache: { cacheLocation: "localStorage" },
      });
      await client.initialize();
      const redirectResult = await client.handleRedirectPromise();
      const account =
        redirectResult?.account ?? client.getAllAccounts()[0] ?? null;
      if (account) client.setActiveAccount(account);
      return client;
    })();
  }
  return clientPromise;
}

export async function getOneDriveAccount() {
  if (!isOneDriveConfigured) return null;
  const client = await getClient();
  return client.getActiveAccount() ?? client.getAllAccounts()[0] ?? null;
}

export function consumeOneDriveConnectionIntent(companyId: string) {
  const intendedCompany = window.sessionStorage.getItem(connectionIntentKey);
  window.sessionStorage.removeItem(connectionIntentKey);
  return intendedCompany === companyId;
}

export function consumeOneDriveRenewalNotice() {
  const renewed = window.sessionStorage.getItem(renewalNoticeKey) === "pending";
  window.sessionStorage.removeItem(renewalNoticeKey);
  return renewed;
}

export async function connectOneDrive(
  companyId: string,
  prompt: "select_account" | "login" = "select_account",
) {
  // Only an explicit click may define or replace a company's official drive.
  // A Microsoft account restored from browser cache must never claim a company.
  window.sessionStorage.setItem(connectionIntentKey, companyId);
  let client = await getClient();
  try {
    // Redirect in the main window so the application itself cannot consume the
    // OAuth response inside a popup before MSAL finishes the authentication.
    await client.loginRedirect({ scopes, prompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("interaction_in_progress")) {
      window.sessionStorage.removeItem(connectionIntentKey);
      throw error;
    }

    // A failed popup can leave MSAL's interaction flag behind. Clear only this
    // application's authentication cache and retry once without user action.
    await client.clearCache();
    clientPromise = null;
    client = await getClient();
    try {
      await client.loginRedirect({ scopes, prompt });
    } catch (retryError) {
      window.sessionStorage.removeItem(connectionIntentKey);
      throw retryError;
    }
  }
}

export async function getOneDriveStorage(): Promise<OneDriveStorage> {
  const drive = await graph<{ quota?: Partial<OneDriveStorage> }>(
    "/me/drive?$select=quota",
  );
  const quota = drive.quota ?? {};
  return {
    total: Number(quota.total) || 0,
    used: Number(quota.used) || 0,
    remaining: Number(quota.remaining) || 0,
    state: typeof quota.state === "string" ? quota.state : "normal",
  };
}

export async function disconnectOneDrive() {
  const client = await getClient();
  const account = client.getActiveAccount() ?? client.getAllAccounts()[0];
  if (account)
    await client.logoutPopup({
      account,
      mainWindowRedirectUri: `${window.location.origin}/`,
    });
}

async function getAccessToken(account?: AccountInfo | null) {
  const client = await getClient();
  const selectedAccount =
    account ?? client.getActiveAccount() ?? client.getAllAccounts()[0];
  if (!selectedAccount) throw new Error("onedrive/not-connected");
  try {
    return (
      await client.acquireTokenSilent({ scopes, account: selectedAccount })
    ).accessToken;
  } catch (error) {
    const code =
      typeof error === "object" &&
      error &&
      "errorCode" in error &&
      typeof error.errorCode === "string"
        ? error.errorCode
        : "";
    const message = error instanceof Error ? error.message : "";
    const sessionNeedsRenewal =
      error instanceof InteractionRequiredAuthError ||
      [
        "timed_out",
        "login_required",
        "interaction_required",
        "consent_required",
        "no_tokens_found",
      ].includes(code) ||
      message.includes("timed_out");
    if (!sessionNeedsRenewal) throw error;
    window.sessionStorage.setItem(renewalNoticeKey, "pending");
    await client.acquireTokenRedirect({
      scopes,
      account: selectedAccount,
      prompt: "select_account",
    });
    throw new Error("onedrive/session-renewal-started");
  }
}

async function graph<T>(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const response = await fetch(`${graphBaseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`onedrive/${response.status}:${detail}`);
  }
  return response.json() as Promise<T>;
}

function safeName(value: string, fallback: string) {
  const clean = value
    .replace(/["*:<>?/\\|]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim();
  return clean || fallback;
}

async function findByPath(path: string) {
  const encodedPath = path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  try {
    return await graph<DriveItem>(`/me/drive/root:/${encodedPath}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("onedrive/404:"))
      return null;
    throw error;
  }
}

async function createFolder(parentId: string | null, name: string) {
  const parentPath = parentId
    ? `/me/drive/items/${parentId}/children`
    : "/me/drive/root/children";
  return graph<DriveItem>(parentPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });
}

async function ensureFolders(folderName: string) {
  const safeFolder = safeName(folderName, "Sem pasta");
  const root =
    (await findByPath(rootFolderName)) ??
    (await createFolder(null, rootFolderName));
  const childPath = `${rootFolderName}/${safeFolder}`;
  const child =
    (await findByPath(childPath)) ?? (await createFolder(root.id, safeFolder));
  return child;
}

async function moveItemToParent(itemId: string, parentId: string) {
  return graph<DriveItem>(`/me/drive/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentReference: { id: parentId } }),
  });
}

export async function moveOneDriveFolderToTrash(itemId: string) {
  const root =
    (await findByPath(rootFolderName)) ??
    (await createFolder(null, rootFolderName));
  const trashPath = `${rootFolderName}/Lixeira de pastas`;
  const trash =
    (await findByPath(trashPath)) ??
    (await createFolder(root.id, "Lixeira de pastas"));
  return moveItemToParent(itemId, trash.id);
}

export async function restoreOneDriveFolder(itemId: string) {
  const root =
    (await findByPath(rootFolderName)) ??
    (await createFolder(null, rootFolderName));
  return moveItemToParent(itemId, root.id);
}

async function listChildren(parentId: string) {
  let path: string | null =
    `/me/drive/items/${parentId}/children?$select=id,name,size,webUrl,folder&$top=200`;
  const items: DriveItem[] = [];
  while (path) {
    const page: { value: DriveItem[]; "@odata.nextLink"?: string } =
      path.startsWith("http") ? await graphUrl(path) : await graph(path);
    items.push(...page.value);
    const next = page["@odata.nextLink"];
    path = next ?? null;
  }
  return items;
}

async function graphUrl<T>(url: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!response.ok)
    throw new Error(`onedrive/${response.status}:${await response.text()}`);
  return response.json() as Promise<T>;
}

export async function ensureOneDriveFolder(folderName: string) {
  const folder = await ensureFolders(folderName);
  return { id: folder.id, name: folder.name };
}

export async function renameOneDriveItem(itemId: string, name: string) {
  return graph<DriveItem>(`/me/drive/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: safeName(name, "foto") }),
  });
}

export async function moveOneDriveItem(itemId: string, folderName: string) {
  const folder = await ensureFolders(folderName);
  return graph<DriveItem>(`/me/drive/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentReference: { id: folder.id } }),
  });
}

export async function deleteOneDriveItem(itemId: string) {
  const token = await getAccessToken();
  const response = await fetch(`${graphBaseUrl}/me/drive/items/${itemId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404)
    throw new Error(`onedrive/${response.status}:${await response.text()}`);
}

export async function downloadOneDriveItem(itemId: string) {
  const token = await getAccessToken();
  const response = await fetch(
    `${graphBaseUrl}/me/drive/items/${itemId}/content`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok)
    throw new Error(`onedrive/${response.status}:${await response.text()}`);
  return response.blob();
}

export async function readOneDriveSnapshot(): Promise<OneDriveSnapshot> {
  const root = await findByPath(rootFolderName);
  if (!root) return { folders: [], files: [] };
  const children = await listChildren(root.id);
  const folders = children
    .filter((item) => item.folder)
    .map((item) => ({ id: item.id, name: item.name }));
  const nested = await Promise.all(
    folders.map(async (folder) =>
      (await listChildren(folder.id))
        .filter((item) => !item.folder)
        .map((item) => ({
          id: item.id,
          name: item.name,
          size: item.size,
          webUrl: item.webUrl,
          folderName: folder.name,
        })),
    ),
  );
  return { folders, files: nested.flat() };
}

function fileNameWithExtension(name: string, file: File) {
  const safeBase = safeName(name, "foto");
  if (/\.[a-z0-9]{2,5}$/i.test(safeBase)) return safeBase;
  const originalExtension = file.name.match(/\.[a-z0-9]{2,5}$/i)?.[0];
  const mimeExtension = file.type === "image/png" ? ".png" : ".jpg";
  return `${safeBase}${originalExtension ?? mimeExtension}`;
}

export async function uploadPhotoToOneDrive(
  folderName: string,
  name: string,
  file: File,
  onProgress?: (percentage: number) => void,
) {
  if (file.size > 250 * 1024 * 1024) throw new Error("onedrive/file-too-large");
  onProgress?.(5);
  const folder = await ensureFolders(folderName);
  onProgress?.(12);
  const uploadName = fileNameWithExtension(name, file);
  const token = await getAccessToken();
  // The service enforces the conflict atomically, including concurrent uploads.
  const url = `${graphBaseUrl}/me/drive/items/${folder.id}:/${encodeURIComponent(uploadName)}:/content?@microsoft.graph.conflictBehavior=fail`;
  return new Promise<OneDriveUpload>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.timeout = 120000;
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable)
        onProgress?.(12 + Math.round((event.loaded / event.total) * 86));
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          const result = JSON.parse(request.responseText) as OneDriveUpload;
          if (!result.id || !result.name) throw new Error("invalid response");
          onProgress?.(100);
          resolve(result);
        } catch {
          reject(new Error("onedrive/invalid-upload-response"));
        }
      } else {
        reject(new Error(`onedrive/${request.status}:${request.responseText}`));
      }
    });
    request.addEventListener("error", () =>
      reject(new Error("onedrive/network-error")),
    );
    request.addEventListener("abort", () =>
      reject(new Error("onedrive/upload-cancelled")),
    );
    request.addEventListener("timeout", () => reject(new Error("onedrive/upload-timeout")));
    request.send(file);
  });
}

export function oneDriveErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("onedrive/409:"))
    return "Já existe um arquivo com esse nome na pasta. Escolha outro nome; a foto anterior foi preservada.";
  if (["onedrive/upload-timeout", "onedrive/invalid-upload-response"].includes(message))
    return "Não foi possível confirmar o envio. Confira o OneDrive antes de tentar novamente; sua foto continua selecionada.";
  const code =
    typeof error === "object" &&
    error &&
    "errorCode" in error &&
    typeof error.errorCode === "string"
      ? error.errorCode
      : "";
  if (message === "onedrive/not-configured")
    return "A integração Microsoft ainda precisa receber o ID do aplicativo.";
  if (message === "onedrive/not-connected")
    return "Conecte sua conta do OneDrive antes de enviar a foto.";
  if (message === "onedrive/session-renewal-started")
    return "A Microsoft está renovando sua sessão. Depois de voltar ao sistema, clique em Sincronizar novamente.";
  if (message === "onedrive/file-too-large")
    return "A foto ultrapassa o limite de 250 MB para envio direto.";
  if (message === "onedrive/network-error")
    return "A internet caiu durante o envio. A foto não foi registrada; tente novamente quando a conexão voltar.";
  if (
    message.includes("user_cancelled") ||
    message.includes("user_cancelled_login")
  )
    return "A conexão com o OneDrive foi cancelada.";
  if (
    message.includes("monitor_window_timeout") ||
    message.includes("hash_empty_error")
  )
    return "A janela da Microsoft não devolveu a autorização. Atualize a página e conecte novamente.";
  if (message.includes("interaction_in_progress"))
    return "Havia uma autorização antiga presa no navegador. Feche esta aba, abra o sistema novamente e conecte o OneDrive.";
  if (code === "timed_out" || message.includes("timed_out"))
    return "A sessão do OneDrive expirou e precisa ser renovada. Clique em Sincronizar novamente.";
  if (code === "popup_window_error" || message.includes("popup_window_error"))
    return "O navegador bloqueou a janela da Microsoft. Atualize a página e tente sincronizar novamente.";
  if (message.includes("unauthorized_client"))
    return "O aplicativo Microsoft não está habilitado para esta conta.";
  if (
    message.startsWith("onedrive/401:") ||
    message.startsWith("onedrive/403:")
  )
    return "A Microsoft não autorizou o acesso aos arquivos. Conecte novamente.";
  if (message.startsWith("onedrive/507:"))
    return "O OneDrive está sem espaço disponível.";
  return code
    ? `Não foi possível concluir a operação no OneDrive. Código: ${code}.`
    : "Não foi possível concluir a operação no OneDrive. Tente novamente.";
}
