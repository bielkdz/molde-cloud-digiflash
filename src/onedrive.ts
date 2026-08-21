import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
} from "@azure/msal-browser";

const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID?.trim();
const redirectUri = `${window.location.origin}/redirect.html`;
const graphScopes = ["Files.ReadWrite.AppFolder"];

export const isOneDriveConfigured = Boolean(clientId);

const msal = clientId
  ? new PublicClientApplication({
      auth: {
        clientId,
        authority: "https://login.microsoftonline.com/common",
        redirectUri,
        postLogoutRedirectUri: redirectUri,
      },
      cache: { cacheLocation: "localStorage" },
    })
  : null;

let initialization: Promise<void> | null = null;

async function initializeMicrosoftAuth() {
  if (!msal) throw new Error("MICROSOFT_APP_NOT_CONFIGURED");
  initialization ??= msal.initialize();
  await initialization;
  return msal;
}

export async function restoreOneDriveAccount(): Promise<AccountInfo | null> {
  const app = await initializeMicrosoftAuth();
  return app.getActiveAccount() ?? app.getAllAccounts()[0] ?? null;
}

export async function connectOneDrive(): Promise<AccountInfo> {
  const app = await initializeMicrosoftAuth();
  const result = await app.loginPopup({
    scopes: graphScopes,
    prompt: "select_account",
    redirectUri,
  });
  app.setActiveAccount(result.account);
  await ensureAppFolder();
  return result.account;
}

async function accessToken() {
  const app = await initializeMicrosoftAuth();
  const account = app.getActiveAccount() ?? app.getAllAccounts()[0];
  if (!account) throw new Error("ONEDRIVE_NOT_CONNECTED");
  app.setActiveAccount(account);

  try {
    return (await app.acquireTokenSilent({ account, scopes: graphScopes })).accessToken;
  } catch (error) {
    if (!(error instanceof InteractionRequiredAuthError)) throw error;
    return (await app.acquireTokenPopup({ account, scopes: graphScopes, redirectUri })).accessToken;
  }
}

async function graph<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body instanceof Blob ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Microsoft Graph ${response.status}: ${details}`);
  }

  return response.status === 204 ? (undefined as T) : response.json();
}

export type OneDriveFolder = { id: string; name: string };

type DriveItem = {
  id: string;
  name: string;
  folder?: { childCount: number };
};

async function ensureAppFolder() {
  return graph<DriveItem>("/me/drive/special/approot");
}

export async function listOneDriveFolders(): Promise<OneDriveFolder[]> {
  const result = await graph<{ value: DriveItem[] }>(
    "/me/drive/special/approot/children?$select=id,name,folder&$orderby=name",
  );
  return result.value.filter((item) => item.folder).map(({ id, name }) => ({ id, name }));
}

export async function createOneDriveFolder(name: string): Promise<OneDriveFolder> {
  const item = await graph<DriveItem>("/me/drive/special/approot/children", {
    method: "POST",
    body: JSON.stringify({
      name,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    }),
  });
  return { id: item.id, name: item.name };
}

export async function uploadPhotoToOneDrive(folder: string, name: string, file: File) {
  if (file.size > 250 * 1024 * 1024) throw new Error("FILE_TOO_LARGE");
  const extension = file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ".jpg";
  const safeName = name.replace(/["*:<>?/\\|]/g, "-").trim();
  const path = [folder, `${safeName}${extension}`].map(encodeURIComponent).join("/");
  return graph<DriveItem>(
    `/me/drive/special/approot:/${path}:/content?@microsoft.graph.conflictBehavior=rename`,
    { method: "PUT", body: file },
  );
}
