import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import {
  createCompany,
  removeCompany,
  restoreCompany,
  setCompanyStatus,
  verifyCompanyOneDrive,
  watchCompanies,
  watchCompany,
  type CompanyRecord,
  type CompanyStatus,
} from "./company";
import {
  cancelEmployeeInvite,
  changeUserRole,
  ensureUserProfile,
  inviteEmployee,
  removeUserAccess,
  watchAllUsers,
  watchEmployeeInvites,
  watchUserProfile,
  type EmployeeInvitation,
  type UserProfile,
  type UserRole,
} from "./users";
import {
  connectOneDrive,
  consumeOneDriveConnectionIntent,
  consumeOneDriveRenewalNotice,
  deleteOneDriveItem,
  downloadOneDriveItem,
  ensureOneDriveFolder,
  getOneDriveAccount,
  isOneDriveConfigured,
  moveOneDriveItem,
  oneDriveErrorMessage,
  readOneDriveSnapshot,
  renameOneDriveItem,
  uploadPhotoToOneDrive,
} from "./onedrive";
import {
  createFolder,
  linkFolderToOneDrive,
  migrateLegacyWorkspace,
  moveFileRecord,
  permanentlyDeleteFileRecord,
  registerPhoto,
  removeFileRecord,
  removeFolder,
  renameFileRecord,
  renameFolder,
  restoreFileRecord,
  synchronizeWorkspace,
  watchDeletedFiles,
  watchFiles,
  watchFolders,
  watchHistory,
  type FileRecord,
  type FolderRecord,
  type HistoryRecord,
} from "./workspace";
import { GlobalApprovals } from "./GlobalApprovals";

type Screen =
  | "dashboard"
  | "capture"
  | "files"
  | "history"
  | "search"
  | "users"
  | "companies";
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
const nav = [
  { id: "dashboard" as Screen, label: "Início", icon: "home" },
  { id: "capture" as Screen, label: "Tirar foto", icon: "camera" },
  { id: "files" as Screen, label: "Arquivos", icon: "folder" },
  { id: "history" as Screen, label: "Histórico", icon: "clock" },
  { id: "search" as Screen, label: "Localizar", icon: "search" },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [profile, setProfile] = useState<UserProfile | null>(null),
    [loading, setLoading] = useState(true),
    [splashVisible, setSplashVisible] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let unsubscribeAuth = () => {},
      unsubscribeProfile = () => {};
    let active = true,
      splashTimer = window.setTimeout(() => {
        if (active) setSplashVisible(false);
      }, 1800);
    unsubscribeAuth = onAuthStateChanged(auth, (current) => {
      unsubscribeProfile();
      setUser(current);
      setProfile(null);
      if (!current) {
        setLoading(false);
        return;
      }
      window.clearTimeout(splashTimer);
      setSplashVisible(true);
      splashTimer = window.setTimeout(() => {
        if (active) setSplashVisible(false);
      }, 2400);
      setLoading(false);
      unsubscribeProfile = watchUserProfile(current.uid, (nextProfile) => {
        if (active) setProfile(nextProfile);
      });
      void ensureUserProfile(current)
        .then((initialProfile) => {
          if (active) setProfile(initialProfile);
        })
        .catch(() => {
          if (active)
            setError(
              "Login realizado, mas não foi possível carregar sua permissão.",
            );
        });
    });
    return () => {
      active = false;
      window.clearTimeout(splashTimer);
      unsubscribeAuth();
      unsubscribeProfile();
    };
  }, []);
  if (loading || splashVisible)
    return (
      <div className="auth-screen auth-loading-screen">
        <div className="auth-card auth-loading-card">
          <span className="brand-mark">M</span>
          <h1>Molde Cloud</h1>
          <p>Preparando seu acesso...</p>
          <div className="auth-loader" />
        </div>
      </div>
    );
  if (!user) return <AuthScreen error={error} setError={setError} />;
  if (!profile)
    return (
      <AccessScreen
        title="Carregando permissão"
        message="Estamos preparando seu perfil de acesso."
        user={user}
      />
    );
  if (profile.role === "pending")
    return (
      <AccessScreen
        title="Cadastro aguardando aprovação"
        message="O administrador precisa liberar seu acesso. Esta tela será atualizada automaticamente."
        user={user}
      />
    );
  if (profile.role === "blocked")
    return (
      <AccessScreen
        title="Acesso bloqueado"
        message="Procure o administrador do Molde Cloud para revisar seu cadastro."
        user={user}
      />
    );
  return <DashboardApp user={user} profile={profile} notice={error} />;
}

function AuthScreen({
  error,
  setError,
}: {
  error: string;
  setError: (value: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login"),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
        await updateProfile(credential.user, { displayName: name.trim() });
        await ensureUserProfile(credential.user);
        setMessage(
          "Cadastro criado. Aguarde a aprovação do administrador dentro do sistema.",
        );
      } else await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (value: any) {
      const code = value?.code;
      setError(
        code === "auth/email-already-in-use"
          ? "Este e-mail já possui cadastro."
          : code === "auth/weak-password"
            ? "Use uma senha com pelo menos 6 caracteres."
            : code === "auth/operation-not-allowed"
              ? "O login por e-mail ainda precisa ser ativado no Firebase."
              : "E-mail ou senha inválidos.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function resetPassword() {
    if (!email.trim()) {
      setError("Digite seu e-mail primeiro.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Enviamos o link de recuperação para seu e-mail.");
    } catch {
      setMessage("Se o cadastro existir, o link de recuperação será enviado.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <span className="brand-mark">M</span>
        <small>DIGIFLASH</small>
        <h1>Molde Cloud</h1>
        <p>
          {mode === "login"
            ? "Entre para acessar suas fotografias, pastas e histórico."
            : "Crie sua conta. O administrador aprovará seu acesso."}
        </p>
        <div className="auth-tabs">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Entrar
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Criar conta
          </button>
        </div>
        {error && <div className="auth-error">{error}</div>}
        {message && <div className="auth-success">{message}</div>}
        <form className="email-form" onSubmit={submit}>
          {mode === "register" && (
            <label>
              Nome
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
              />
            </label>
          )}
          <label>
            E-mail
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            Senha
            <input
              required
              minLength={6}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </label>
          <button className="primary auth-submit" disabled={busy}>
            {busy
              ? "Aguarde..."
              : mode === "login"
                ? "Entrar com e-mail"
                : "Criar minha conta"}
          </button>
        </form>
        {mode === "login" && (
          <button
            className="forgot-password"
            disabled={busy}
            onClick={resetPassword}
          >
            Esqueci minha senha
          </button>
        )}
        <div className="auth-divider">
          <span>ou</span>
        </div>
        <button
          className="google-login"
          onClick={() => {
            setError("");
            void signInWithPopup(auth, googleProvider).catch(() =>
              setError("Não foi possível abrir o login do Google."),
            );
          }}
        >
          <b>G</b> Entrar com Google
        </button>
        <span className="auth-note">
          Sua sessão permanecerá salva neste aparelho.
        </span>
      </div>
    </div>
  );
}

function AccessScreen({
  title,
  message,
  user,
}: {
  title: string;
  message: string;
  user: User;
}) {
  return (
    <div className="auth-screen">
      <div className="auth-card access-card">
        <span className="brand-mark">M</span>
        <small>DIGIFLASH</small>
        <h2>{title}</h2>
        <p>{message}</p>
        <strong>{user.email}</strong>
        <button className="outline full" onClick={() => signOut(auth)}>
          Sair da conta
        </button>
      </div>
    </div>
  );
}

function DashboardApp({
  user,
  profile,
  notice,
}: {
  user: User;
  profile: UserProfile;
  notice: string;
}) {
  const [screen, setScreen] = useState<Screen>("dashboard"),
    [collapsed, setCollapsed] = useState(true);
  const [folders, setFolders] = useState<FolderRecord[]>([]),
    [files, setFiles] = useState<FileRecord[]>([]),
    [deletedFiles, setDeletedFiles] = useState<FileRecord[]>([]),
    [history, setHistory] = useState<HistoryRecord[]>([]);
  const [folderId, setFolderId] = useState(""),
    [newFolder, setNewFolder] = useState(""),
    [showFolder, setShowFolder] = useState(false);
  const [fileName, setFileName] = useState(""),
    [photo, setPhoto] = useState<string | null>(null),
    [photoFile, setPhotoFile] = useState<File | null>(null),
    [query, setQuery] = useState("");
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [oneDriveAccount, setOneDriveAccount] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine),
    [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
      null,
    );
  const [currentCompany, setCurrentCompany] = useState<CompanyRecord | null>(
      null,
    ),
    [profileOpen, setProfileOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null),
    [previewUrl, setPreviewUrl] = useState(""),
    [previewLoading, setPreviewLoading] = useState(false),
    [previewZoom, setPreviewZoom] = useState(1);
  const [fileSort, setFileSort] = useState<"newest" | "oldest" | "name">(
      "newest",
    ),
    [fileFolderFilter, setFileFolderFilter] = useState("all"),
    [selectedFiles, setSelectedFiles] = useState<Set<string>>(() => new Set());
  const [sentPhotosOpen, setSentPhotosOpen] = useState(false),
    [trashOpen, setTrashOpen] = useState(false),
    [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [mobileActions, setMobileActions] = useState<
    | { type: "folder"; item: FolderRecord }
    | { type: "file"; item: FileRecord }
    | null
  >(null);
  const historyInitialized = useRef(false);
  const companyStatus: CompanyStatus = currentCompany?.status || "active";
  const visibleNav =
    profile.role === "superadmin"
      ? [
          ...nav,
          { id: "users" as Screen, label: "Usuários", icon: "users" },
          { id: "companies" as Screen, label: "Empresas", icon: "building" },
        ]
      : profile.role === "admin"
        ? [...nav, { id: "users" as Screen, label: "Usuários", icon: "users" }]
        : nav;
  const workspaceActor = useMemo(
    () => ({
      userId: user.uid,
      companyId: profile.companyId,
      name: profile.name || user.displayName || "Usuário",
    }),
    [user.uid, user.displayName, profile.companyId, profile.name],
  );
  const filtered = useMemo(
    () =>
      files.filter((x) =>
        `${x.name} ${x.folderName}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [files, query],
  );
  const organizedFiles = useMemo(
    () =>
      files
        .filter(
          (item) =>
            fileFolderFilter === "all" || item.folderId === fileFolderFilter,
        )
        .sort((a, b) => {
          if (fileSort === "name")
            return a.name.localeCompare(b.name, "pt-BR", {
              sensitivity: "base",
            });
          const aTime = (a.uploadedAt ?? a.createdAt)?.toMillis() ?? 0,
            bTime = (b.uploadedAt ?? b.createdAt)?.toMillis() ?? 0;
          return fileSort === "oldest" ? aTime - bTime : bTime - aTime;
        }),
    [files, fileFolderFilter, fileSort],
  );
  useEffect(() => {
    void migrateLegacyWorkspace(user.uid, profile.companyId).catch(() =>
      setMessage(
        "Não foi possível preparar os dados compartilhados da empresa.",
      ),
    );
    const fail = (value: string) => setMessage(value);
    const stopFolders = watchFolders(profile.companyId, setFolders, fail),
      stopFiles = watchFiles(profile.companyId, setFiles, fail),
      stopDeleted = watchDeletedFiles(profile.companyId, setDeletedFiles, fail),
      stopHistory = watchHistory(profile.companyId, setHistory, fail);
    return () => {
      stopFolders();
      stopFiles();
      stopDeleted();
      stopHistory();
    };
  }, [user.uid, profile.companyId]);
  useEffect(
    () => watchCompany(profile.companyId, setCurrentCompany),
    [profile.companyId],
  );
  useEffect(() => {
    let active = true;
    void getOneDriveAccount()
      .then(async (account) => {
        if (!account || !active) return;
        const explicitConnection = consumeOneDriveConnectionIntent(
          profile.companyId,
        );
        const renewed = consumeOneDriveRenewalNotice();
        const username = account.username || account.name || "";
        const valid = await verifyCompanyOneDrive(
          profile.companyId,
          profile.role,
          username,
          explicitConnection,
        );
        if (!active) return;
        if (valid) {
          setOneDriveAccount(account.name || account.username);
          if (renewed)
            setMessage(
              "Sessão do OneDrive renovada. Clique em Sincronizar novamente.",
            );
        } else {
          setOneDriveAccount("");
          setMessage(
            profile.role === "admin" || profile.role === "superadmin"
              ? "Conecte novamente o OneDrive oficial desta empresa."
              : "Esta não é a conta OneDrive definida pelo administrador da empresa.",
          );
        }
      })
      .catch(() => {
        if (active)
          setMessage("Não foi possível restaurar a conexão com o OneDrive.");
      });
    return () => {
      active = false;
    };
  }, [profile.companyId, profile.role]);
  useEffect(() => {
    if (!message || busy) return;
    const timer = window.setTimeout(() => setMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [message, busy]);
  useEffect(() => {
    const connected = () => setOnline(true),
      disconnected = () => setOnline(false),
      capture = (event: Event) => {
        event.preventDefault();
        setInstallPrompt(event as InstallPromptEvent);
      },
      installed = () => setInstallPrompt(null);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  useEffect(() => {
    if (!profileOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [profileOpen]);
  useEffect(() => {
    if (historyInitialized.current) return;
    historyInitialized.current = true;
    window.history.replaceState(
      { ...window.history.state, moldeCloudScreen: "dashboard" },
      "",
    );
    window.history.pushState({ moldeCloudScreen: "dashboard" }, "");
  }, []);
  useEffect(() => {
    const restoreCurrentEntry = () => {
      window.history.pushState({ moldeCloudScreen: screen }, "");
    };
    const goBackInsideApp = (event: PopStateEvent) => {
      if (mobileActions) {
        setMobileActions(null);
        restoreCurrentEntry();
        return;
      }
      if (previewFile) {
        setPreviewFile(null);
        restoreCurrentEntry();
        return;
      }
      if (showFolder) {
        setShowFolder(false);
        restoreCurrentEntry();
        return;
      }
      if (profileOpen) {
        setProfileOpen(false);
        restoreCurrentEntry();
        return;
      }
      if (!collapsed) {
        setCollapsed(true);
        restoreCurrentEntry();
        return;
      }

      const previous = event.state?.moldeCloudScreen as Screen | undefined;
      if (previous && previous !== screen) {
        setScreen(previous);
        setProfileOpen(false);
        setCollapsed(true);
        return;
      }

      // Keep one internal history entry on the dashboard so a single Android
      // back gesture never closes the browser/app by accident.
      if (screen === "dashboard") restoreCurrentEntry();
    };
    window.addEventListener("popstate", goBackInsideApp);
    return () => window.removeEventListener("popstate", goBackInsideApp);
  }, [collapsed, mobileActions, previewFile, profileOpen, screen, showFolder]);
  useEffect(() => {
    if (!folders.some((item) => item.id === folderId))
      setFolderId(folders[0]?.id ?? "");
  }, [folders, folderId]);
  useEffect(() => {
    if (
      fileFolderFilter !== "all" &&
      !folders.some((item) => item.id === fileFolderFilter)
    )
      setFileFolderFilter("all");
  }, [folders, fileFolderFilter]);
  useEffect(() => {
    setSelectedFiles((current) => {
      const valid = new Set(
        [...current].filter((id) => files.some((file) => file.id === id)),
      );
      return valid.size === current.size ? current : valid;
    });
  }, [files]);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo);
    },
    [photo],
  );
  useEffect(() => {
    if (!previewFile?.oneDriveItemId) {
      setPreviewUrl("");
      return;
    }
    let active = true,
      url = "";
    setPreviewLoading(true);
    setPreviewZoom(1);
    void downloadOneDriveItem(previewFile.oneDriveItemId)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      })
      .catch((error) => {
        if (active) setMessage(oneDriveErrorMessage(error));
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [previewFile]);
  function choosePhoto(file?: File) {
    if (!file) return;
    if (photo) URL.revokeObjectURL(photo);
    setPhoto(URL.createObjectURL(file));
    setPhotoFile(file);
    if (!fileName) setFileName(file.name.replace(/\.[^/.]+$/, ""));
  }
  async function addFolder() {
    const name = newFolder.trim();
    if (!name) return;
    if (
      folders.some(
        (item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      setMessage("Já existe uma pasta com esse nome.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const id = await createFolder(workspaceActor, name);
      if (oneDriveAccount) {
        const remote = await ensureOneDriveFolder(name);
        await linkFolderToOneDrive(id, remote.id);
      }
      setNewFolder("");
      setShowFolder(false);
      setMessage("Pasta criada e sincronizada com sucesso.");
    } catch {
      setMessage(
        "A pasta foi criada no sistema, mas pode estar aguardando sincronização com o OneDrive.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function editFolder(folder: FolderRecord) {
    const name = window.prompt("Novo nome da pasta:", folder.name)?.trim();
    if (!name || name === folder.name) return;
    if (
      folders.some(
        (item) =>
          item.id !== folder.id &&
          item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      setMessage("Já existe uma pasta com esse nome.");
      return;
    }
    setBusy(true);
    try {
      if (folder.oneDriveItemId)
        await renameOneDriveItem(folder.oneDriveItemId, name);
      await renameFolder(workspaceActor, folder, name);
      setMessage("Pasta renomeada no sistema e no OneDrive.");
    } catch (error) {
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function deleteFolder(folder: FolderRecord) {
    const count = files.filter((item) => item.folderId === folder.id).length;
    if (count) {
      setMessage("Mova ou exclua as fotos desta pasta antes de excluí-la.");
      return;
    }
    if (
      !window.confirm(
        `Excluir a pasta “${folder.name}” do sistema e do OneDrive?`,
      )
    )
      return;
    setBusy(true);
    try {
      if (folder.oneDriveItemId)
        await deleteOneDriveItem(folder.oneDriveItemId);
      await removeFolder(workspaceActor, folder);
      setMessage(
        "Pasta excluída. O OneDrive a mantém na lixeira para recuperação.",
      );
    } catch (error) {
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function renameFile(file: FileRecord) {
    const name = window.prompt("Novo nome do arquivo:", file.name)?.trim();
    if (!name || name === file.name) return;
    setBusy(true);
    try {
      const remote = file.oneDriveItemId
        ? await renameOneDriveItem(file.oneDriveItemId, name)
        : undefined;
      await renameFileRecord(
        workspaceActor,
        file,
        remote?.name || name,
        remote?.webUrl,
      );
      setMessage("Arquivo renomeado com sucesso.");
    } catch (error) {
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function moveFile(file: FileRecord) {
    const choices = folders.filter((item) => item.id !== file.folderId);
    if (!choices.length) {
      setMessage("Crie outra pasta antes de mover este arquivo.");
      return;
    }
    const name = window
      .prompt(
        `Mover para qual pasta?\n${choices.map((item) => `• ${item.name}`).join("\n")}`,
      )
      ?.trim();
    if (!name) return;
    const target = choices.find(
      (item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (!target) {
      setMessage(
        "Pasta não encontrada. Digite o nome exatamente como aparece na lista.",
      );
      return;
    }
    setBusy(true);
    try {
      const remote = file.oneDriveItemId
        ? await moveOneDriveItem(file.oneDriveItemId, target.name)
        : undefined;
      await moveFileRecord(workspaceActor, file, target, remote?.webUrl);
      setMessage("Arquivo movido com sucesso.");
    } catch (error) {
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function deleteFile(file: FileRecord) {
    if (!window.confirm(`Mover “${file.name}” para a lixeira?`)) return;
    setBusy(true);
    try {
      if (file.oneDriveItemId)
        await moveOneDriveItem(file.oneDriveItemId, "Lixeira Molde Cloud");
      await removeFileRecord(workspaceActor, file);
      setMessage("Arquivo movido para a lixeira do Molde Cloud.");
    } catch (error) {
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function restoreDeletedFile(file: FileRecord) {
    setBusy(true);
    try {
      const remote = file.oneDriveItemId
        ? await moveOneDriveItem(file.oneDriveItemId, file.folderName)
        : undefined;
      await restoreFileRecord(workspaceActor, file, remote?.webUrl);
      setMessage(`“${file.name}” foi restaurado para ${file.folderName}.`);
    } catch (error) {
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function permanentlyDeleteFile(file: FileRecord) {
    const confirmation = window.prompt(
      `Esta ação não poderá ser desfeita. Digite EXCLUIR para apagar “${file.name}” permanentemente.`,
    );
    if (confirmation !== "EXCLUIR") return;
    setBusy(true);
    try {
      if (file.oneDriveItemId) await deleteOneDriveItem(file.oneDriveItemId);
      await permanentlyDeleteFileRecord(file);
      setMessage("Arquivo excluído permanentemente.");
    } catch (error) {
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function toggleFileSelection(id: string) {
    setSelectedFiles((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllVisible() {
    setSelectedFiles((current) => {
      const visibleIds = organizedFiles.map((item) => item.id),
        allSelected =
          visibleIds.length > 0 && visibleIds.every((id) => current.has(id));
      const next = new Set(current);
      visibleIds.forEach((id) =>
        allSelected ? next.delete(id) : next.add(id),
      );
      return next;
    });
  }
  async function moveSelectedFiles() {
    const selected = files.filter((item) => selectedFiles.has(item.id));
    if (!selected.length) return;
    const name = window
      .prompt(
        `Mover ${selected.length} arquivo(s) para qual pasta?\n${folders.map((item) => `• ${item.name}`).join("\n")}`,
      )
      ?.trim();
    if (!name) return;
    const target = folders.find(
      (item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (!target) {
      setMessage(
        "Pasta não encontrada. Digite o nome exatamente como aparece na lista.",
      );
      return;
    }
    setBusy(true);
    let moved = 0;
    try {
      for (const file of selected) {
        if (file.folderId === target.id) continue;
        const remote = file.oneDriveItemId
          ? await moveOneDriveItem(file.oneDriveItemId, target.name)
          : undefined;
        await moveFileRecord(workspaceActor, file, target, remote?.webUrl);
        moved += 1;
      }
      setSelectedFiles(new Set());
      setMessage(`${moved} arquivo(s) movido(s) para ${target.name}.`);
    } catch (error) {
      setMessage(
        `${moved} arquivo(s) movido(s) antes da interrupção. ${oneDriveErrorMessage(error)}`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function deleteSelectedFiles() {
    const selected = files.filter((item) => selectedFiles.has(item.id));
    if (!selected.length) return;
    const confirmation = window.prompt(
      `Para mover ${selected.length} arquivo(s) para a lixeira, digite EXCLUIR ${selected.length}`,
    );
    if (confirmation !== `EXCLUIR ${selected.length}`) return;
    setBusy(true);
    let removed = 0;
    try {
      for (const file of selected) {
        if (file.oneDriveItemId)
          await moveOneDriveItem(file.oneDriveItemId, "Lixeira Molde Cloud");
        await removeFileRecord(workspaceActor, file);
        removed += 1;
      }
      setSelectedFiles(new Set());
      setMessage(`${removed} arquivo(s) movido(s) para a lixeira.`);
    } catch (error) {
      setMessage(
        `${removed} arquivo(s) movido(s) antes da interrupção. ${oneDriveErrorMessage(error)}`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function syncOneDrive() {
    if (!oneDriveAccount) {
      setMessage("Conecte o OneDrive antes de sincronizar.");
      return;
    }
    setBusy(true);
    setMessage("Comparando pastas e arquivos com o OneDrive...");
    try {
      const snapshot = await readOneDriveSnapshot();
      const result = await synchronizeWorkspace(
        workspaceActor,
        folders,
        files,
        snapshot,
      );
      setMessage(
        `Sincronização concluída: ${result.removedFolders} pasta(s) e ${result.removedFiles} arquivo(s) removido(s); ${result.updated} atualizado(s).`,
      );
    } catch (error) {
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function handleOneDrive() {
    if (!isOneDriveConfigured) {
      setMessage(
        "A integração está pronta no código. Falta cadastrar o aplicativo na Microsoft para ativá-la.",
      );
      return;
    }
    setBusy(true);
    setMessage("Abrindo a autorização da Microsoft...");
    try {
      await connectOneDrive(profile.companyId);
    } catch (error) {
      setMessage(oneDriveErrorMessage(error));
      setBusy(false);
    } finally {
      setCollapsed(true);
    }
  }
  async function savePhoto() {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder || !photoFile || !fileName.trim()) return;
    if (!oneDriveAccount) {
      setMessage("Conecte o OneDrive antes de enviar a foto.");
      return;
    }
    setBusy(true);
    setUploadProgress(0);
    setMessage("Preparando o envio para o OneDrive...");
    let uploaded;
    try {
      uploaded = await uploadPhotoToOneDrive(
        folder.name,
        fileName,
        photoFile,
        setUploadProgress,
      );
    } catch (error) {
      setMessage(oneDriveErrorMessage(error));
      setBusy(false);
      setUploadProgress(null);
      return;
    }
    try {
      await registerPhoto(
        workspaceActor,
        folder,
        fileName,
        photoFile,
        uploaded,
      );
      setPhoto(null);
      setPhotoFile(null);
      setFileName("");
      if (inputRef.current) inputRef.current.value = "";
      setMessage("Foto enviada e registrada com sucesso no OneDrive.");
      navigateTo("files");
    } catch {
      setMessage(
        "A foto foi enviada ao OneDrive, mas o histórico não pôde ser salvo. Não envie novamente antes de conferir o OneDrive.",
      );
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  }
  async function signOutApp() {
    // Preserve the Microsoft cache so reopening Molde Cloud can restore the
    // company's verified OneDrive without asking for a new connection.
    await signOut(auth);
  }
  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  }
  function navigateTo(next: Screen) {
    if (next !== screen) {
      window.history.pushState({ moldeCloudScreen: next }, "");
    }
    setScreen(next);
    setCollapsed(true);
    setProfileOpen(false);
  }
  if (
    (companyStatus === "blocked" || companyStatus === "deleted") &&
    profile.role !== "superadmin"
  )
    return (
      <AccessScreen
        title={
          companyStatus === "deleted"
            ? "Empresa removida"
            : "Empresa temporariamente bloqueada"
        }
        message="O administrador geral precisa reativar a empresa para liberar o acesso."
        user={user}
      />
    );
  return (
    <main
      className={`app-shell app-enter screen-${screen} ${collapsed ? "is-collapsed" : ""}`}
    >
      <button
        className="mobile-menu"
        onClick={() => setCollapsed(false)}
        aria-label="Abrir menu"
      >
        ☰
      </button>
      {!collapsed && (
        <button
          className="menu-overlay"
          onClick={() => setCollapsed(true)}
          aria-label="Fechar menu"
        />
      )}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">M</span>
          <span className="brand-copy">
            Molde Cloud<small>DIGIFLASH</small>
          </span>
        </div>
        <button
          className="collapse"
          onClick={() => setCollapsed(!collapsed)}
          aria-label="Recolher menu"
        >
          ‹
        </button>
        <nav>
          {visibleNav.map((x) => (
            <button
              key={x.id}
              className={screen === x.id ? "active" : ""}
              onClick={() => navigateTo(x.id)}
            >
              <span className="nav-icon">
                <Icon name={x.icon} />
              </span>
              <span className="nav-label">{x.label}</span>
            </button>
          ))}
        </nav>
        {installPrompt && (
          <button className="install-button" onClick={() => void installApp()}>
            <span className="nav-icon">
              <Icon name="desktop" />
            </span>
            <span className="nav-label">Instalar aplicativo</span>
          </button>
        )}
        <button
          className={`onedrive-button ${oneDriveAccount ? "connected" : ""}`}
          disabled={busy || !online}
          onClick={() => void handleOneDrive()}
        >
          <span className="nav-icon">
            <Icon name="cloud" />
          </span>
          <span className="nav-label">
            {oneDriveAccount
              ? "Trocar conta OneDrive"
              : isOneDriveConfigured
                ? "Conectar OneDrive"
                : "Ativação pendente"}
          </span>
        </button>
      </aside>
      <section className="workspace">
        <header>
          <div>
            <p>DIGIFLASH</p>
            <h1>{visibleNav.find((x) => x.id === screen)?.label}</h1>
          </div>
          <div className="header-actions">
            <div
              className={`status ${oneDriveAccount ? "ok" : ""}`}
              title={oneDriveAccount || undefined}
            >
              <i />
              {oneDriveAccount
                ? "OneDrive conectado"
                : isOneDriveConfigured
                  ? "OneDrive desconectado"
                  : "Ativação pendente"}
            </div>
            <button
              className="user-chip"
              onClick={() => setProfileOpen(!profileOpen)}
              title="Abrir perfil"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="" />
              ) : (
                <span>{user.displayName?.[0] || profile.name?.[0] || "U"}</span>
              )}
              <b>
                {user.displayName?.split(" ")[0] ||
                  profile.name?.split(" ")[0] ||
                  "Usuário"}
              </b>
            </button>
            {profileOpen && (
              <>
                <button
                  className="profile-menu-backdrop"
                  aria-label="Fechar perfil"
                  onClick={() => setProfileOpen(false)}
                />
                <section className="profile-menu" role="menu">
                  <div className="profile-summary">
                    <div className="profile-avatar">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="" />
                      ) : (
                        user.displayName?.[0] || profile.name?.[0] || "U"
                      )}
                    </div>
                    <div>
                      <strong>
                        {user.displayName || profile.name || "Usuário"}
                      </strong>
                      <span>{user.email}</span>
                      <small>{roleLabel(profile.role)}</small>
                    </div>
                  </div>
                  <div className="profile-company">
                    <small>EMPRESA</small>
                    <strong>{currentCompany?.name || profile.companyId}</strong>
                    <span>
                      {oneDriveAccount
                        ? `OneDrive conectado: ${oneDriveAccount}`
                        : currentCompany?.oneDriveAccount
                          ? `OneDrive oficial: ${currentCompany.oneDriveAccount}`
                          : "OneDrive ainda não conectado"}
                    </span>
                  </div>
                  <div className="profile-actions">
                    {(profile.role === "admin" ||
                      profile.role === "superadmin") && (
                      <button
                        role="menuitem"
                        onClick={() => navigateTo("users")}
                      >
                        <Icon name="users" />
                        <span>
                          <strong>Usuários</strong>
                          <small>Gerenciar acessos da empresa</small>
                        </span>
                      </button>
                    )}
                    {profile.role === "superadmin" && (
                      <button
                        role="menuitem"
                        onClick={() => navigateTo("companies")}
                      >
                        <Icon name="building" />
                        <span>
                          <strong>Empresas</strong>
                          <small>Abrir administração geral</small>
                        </span>
                      </button>
                    )}
                    <button
                      role="menuitem"
                      disabled={busy || !online}
                      onClick={() => {
                        setProfileOpen(false);
                        void handleOneDrive();
                      }}
                    >
                      <Icon name="cloud" />
                      <span>
                        <strong>
                          {oneDriveAccount
                            ? "Trocar OneDrive"
                            : "Conectar OneDrive"}
                        </strong>
                        <small>
                          {online
                            ? "Conta de arquivos da empresa"
                            : "Disponível quando a internet voltar"}
                        </small>
                      </span>
                    </button>
                    <button
                      className="profile-signout"
                      role="menuitem"
                      disabled={busy}
                      onClick={() => {
                        setProfileOpen(false);
                        void signOutApp();
                      }}
                    >
                      <span className="signout-icon">↪</span>
                      <span>
                        <strong>Sair da conta</strong>
                        <small>Encerrar esta sessão</small>
                      </span>
                    </button>
                  </div>
                </section>
              </>
            )}
          </div>
        </header>
        {!online && (
          <div className="offline-notice">
            Sem internet. Você pode consultar esta tela, mas o envio ficará
            disponível quando a conexão voltar.
          </div>
        )}
        {(notice || message) && (
          <div className="system-notice">{notice || message}</div>
        )}
        {screen === "dashboard" && (
          <Dashboard
            files={files}
            folders={folders}
            oneDriveConnected={Boolean(oneDriveAccount)}
            go={navigateTo}
            openFile={setPreviewFile}
          />
        )}
        {screen === "capture" && (
          <Capture
            photo={photo}
            folderId={folderId}
            folders={folders}
            fileName={fileName}
            busy={busy}
            uploadProgress={uploadProgress}
            oneDriveConnected={Boolean(oneDriveAccount)}
            setFolderId={setFolderId}
            setFileName={setFileName}
            inputRef={inputRef}
            openFolder={() => setShowFolder(true)}
            connect={() => void handleOneDrive()}
            save={savePhoto}
          />
        )}
        {screen === "files" && (
          <>
            <div className="section-heading">
              <p>
                {folders.length} pasta(s) · {files.length} foto(s) registrada(s)
              </p>
              <div className="heading-actions">
                <button
                  className="sync-button"
                  disabled={busy || !online || !oneDriveAccount}
                  onClick={() => void syncOneDrive()}
                >
                  <Icon name="sync" />
                  {busy ? "Sincronizando..." : "Sincronizar"}
                </button>
                <button className="outline" onClick={() => setShowFolder(true)}>
                  <Icon name="plus" /> Nova pasta
                </button>
                <button
                  className="primary"
                  onClick={() => navigateTo("capture")}
                >
                  <Icon name="plus" /> Nova foto
                </button>
              </div>
            </div>
            {folders.length ? (
              <div className="folder-grid">
                {folders.map((folder) => (
                  <article
                    key={folder.id}
                    className={openFolderId === folder.id ? "is-open" : ""}
                    role="button"
                    tabIndex={0}
                    aria-expanded={openFolderId === folder.id}
                    onClick={() =>
                      setOpenFolderId((current) =>
                        current === folder.id ? null : folder.id,
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setOpenFolderId((current) =>
                          current === folder.id ? null : folder.id,
                        );
                      }
                    }}
                  >
                    <span>
                      <Icon name="folder" />
                    </span>
                    <div>
                      <strong>{folder.name}</strong>
                      <small>
                        {
                          files.filter((item) => item.folderId === folder.id)
                            .length
                        }{" "}
                        arquivo(s)
                      </small>
                    </div>
                    <div className="folder-actions">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void editFolder(folder);
                        }}
                      >
                        <Icon name="edit" /> Editar
                      </button>
                      <button
                        className="danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteFolder(folder);
                        }}
                      >
                        <Icon name="trash" /> Excluir
                      </button>
                    </div>
                    <button
                      className="mobile-more-button"
                      aria-label={`Ações da pasta ${folder.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setMobileActions({ type: "folder", item: folder });
                      }}
                    >
                      <Icon name="more" />
                    </button>
                    {openFolderId === folder.id && (
                      <div className="folder-contents">
                        <small>ARQUIVOS NESTA PASTA</small>
                        {files.filter((item) => item.folderId === folder.id)
                          .length ? (
                          <ul>
                            {files
                              .filter((item) => item.folderId === folder.id)
                              .sort((a, b) =>
                                a.name.localeCompare(b.name, "pt-BR", {
                                  sensitivity: "base",
                                }),
                              )
                              .map((item) => (
                                <li key={item.id}>{item.name}</li>
                              ))}
                          </ul>
                        ) : (
                          <p>Esta pasta está vazia.</p>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty panel">
                Crie sua primeira pasta para organizar as fotografias.
              </div>
            )}
            <button
              className={`files-disclosure ${sentPhotosOpen ? "open" : ""}`}
              onClick={() => setSentPhotosOpen(!sentPhotosOpen)}
            >
              <span>
                <Icon name="image" />
              </span>
              <div>
                <strong>Fotos enviadas</strong>
                <small>{files.length} fotografia(s) no OneDrive</small>
              </div>
              <b>⌄</b>
            </button>
            {sentPhotosOpen && (
              <>
                <section className="organization-bar panel">
                  <label>
                    Filtrar por pasta
                    <select
                      value={fileFolderFilter}
                      onChange={(event) =>
                        setFileFolderFilter(event.target.value)
                      }
                    >
                      <option value="all">Todas as pastas</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name} (
                          {
                            files.filter((item) => item.folderId === folder.id)
                              .length
                          }
                          )
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Ordenar
                    <select
                      value={fileSort}
                      onChange={(event) =>
                        setFileSort(
                          event.target.value as "newest" | "oldest" | "name",
                        )
                      }
                    >
                      <option value="newest">Mais recentes</option>
                      <option value="oldest">Mais antigos</option>
                      <option value="name">Nome de A a Z</option>
                    </select>
                  </label>
                  <div className="selection-actions">
                    <button className="outline" onClick={selectAllVisible}>
                      {organizedFiles.length > 0 &&
                      organizedFiles.every((item) => selectedFiles.has(item.id))
                        ? "Desmarcar visíveis"
                        : "Selecionar visíveis"}
                    </button>
                    {selectedFiles.size > 0 && (
                      <>
                        <strong>{selectedFiles.size} selecionada(s)</strong>
                        <button
                          className="outline"
                          disabled={busy}
                          onClick={() => void moveSelectedFiles()}
                        >
                          Mover selecionadas
                        </button>
                        <button
                          className="danger-action"
                          disabled={busy}
                          onClick={() => void deleteSelectedFiles()}
                        >
                          Excluir selecionadas
                        </button>
                        <button
                          className="clear-selection"
                          onClick={() => setSelectedFiles(new Set())}
                        >
                          Limpar
                        </button>
                      </>
                    )}
                  </div>
                </section>
                <section className="panel registered-files">
                  <div className="panel-title">
                    <div>
                      <small>ONEDRIVE</small>
                      <h3>{organizedFiles.length} foto(s) exibida(s)</h3>
                    </div>
                  </div>
                  {organizedFiles.length ? (
                    organizedFiles.map((item) => (
                      <FileRow
                        key={item.id}
                        item={item}
                        selected={selectedFiles.has(item.id)}
                        onSelect={() => toggleFileSelection(item.id)}
                        onOpen={() => setPreviewFile(item)}
                        actions={{
                          rename: () => void renameFile(item),
                          move: () => void moveFile(item),
                          remove: () => void deleteFile(item),
                        }}
                        onMenu={() => setMobileActions({ type: "file", item })}
                      />
                    ))
                  ) : (
                    <div className="empty">
                      Nenhuma foto corresponde ao filtro escolhido.
                    </div>
                  )}
                </section>
              </>
            )}
            {deletedFiles.length > 0 && (
              <>
                <button
                  className={`files-disclosure trash ${trashOpen ? "open" : ""}`}
                  onClick={() => setTrashOpen(!trashOpen)}
                >
                  <span>♻</span>
                  <div>
                    <strong>Lixeira</strong>
                    <small>
                      {deletedFiles.length} fotografia(s) excluída(s)
                    </small>
                  </div>
                  <b>⌄</b>
                </button>
                {trashOpen && (
                  <section className="panel trash-files">
                    {deletedFiles.map((item) => (
                      <article key={item.id}>
                        <div>
                          <strong>{item.name}</strong>
                          <small>
                            {item.folderName} · excluída por{" "}
                            {item.deletedByName || "usuário"}
                          </small>
                        </div>
                        <button
                          className="outline"
                          disabled={busy}
                          onClick={() => void restoreDeletedFile(item)}
                        >
                          <Icon name="restore" /> Restaurar
                        </button>
                        <button
                          className="danger-action"
                          disabled={busy}
                          onClick={() => void permanentlyDeleteFile(item)}
                        >
                          <Icon name="trash" /> Excluir definitivamente
                        </button>
                      </article>
                    ))}
                  </section>
                )}
              </>
            )}
          </>
        )}
        {screen === "history" && <HistoryList items={history} />}
        {screen === "search" && (
          <>
            <div className="search-box">
              <span>
                <Icon name="search" />
              </span>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar pasta ou arquivo..."
              />
            </div>
            <p className="result-count">{filtered.length} resultado(s)</p>
            <section className="panel">
              {filtered.length ? (
                filtered.map((x) => (
                  <FileRow
                    key={x.id}
                    item={x}
                    onOpen={() => setPreviewFile(x)}
                  />
                ))
              ) : (
                <div className="empty">Nenhum arquivo encontrado.</div>
              )}
            </section>
          </>
        )}
        {screen === "users" &&
          (profile.role === "admin" || profile.role === "superadmin") && (
            <UsersAdmin currentUid={user.uid} companyId={profile.companyId} />
          )}
        {screen === "companies" && profile.role === "superadmin" && (
          <>
            <GlobalApprovals currentUid={user.uid} />
            <CompaniesAdmin currentUid={user.uid} />
          </>
        )}
      </section>
      <input
        ref={inputRef}
        className="hidden-input"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => choosePhoto(e.target.files?.[0])}
      />
      {screen !== "capture" && (
        <button
          className="quick-camera-button"
          onClick={() => navigateTo("capture")}
          aria-label="Tirar nova foto"
        >
          <Icon name="camera" />
          <span>Tirar foto</span>
        </button>
      )}
      {previewFile && (
        <div className="preview-backdrop" onClick={() => setPreviewFile(null)}>
          <section
            className="preview-modal"
            onClick={(event) => event.stopPropagation()}
            aria-modal="true"
            role="dialog"
            aria-label={`Visualização de ${previewFile.name}`}
          >
            <header>
              <div>
                <small>VISUALIZAÇÃO</small>
                <h2>{previewFile.name}</h2>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                aria-label="Fechar visualização"
              >
                ×
              </button>
            </header>
            <div className="preview-stage">
              {previewLoading ? (
                <div className="preview-loading">
                  <div className="auth-loader" />
                  <span>Carregando fotografia...</span>
                </div>
              ) : previewUrl ? (
                <img
                  src={previewUrl}
                  alt={previewFile.name}
                  style={{ transform: `scale(${previewZoom})` }}
                />
              ) : (
                <div className="empty">
                  Não foi possível carregar esta fotografia.
                </div>
              )}
            </div>
            <div className="preview-toolbar">
              <div className="zoom-controls">
                <button
                  disabled={previewZoom <= 0.5}
                  onClick={() =>
                    setPreviewZoom((value) => Math.max(0.5, value - 0.25))
                  }
                >
                  −
                </button>
                <strong>{Math.round(previewZoom * 100)}%</strong>
                <button
                  disabled={previewZoom >= 3}
                  onClick={() =>
                    setPreviewZoom((value) => Math.min(3, value + 0.25))
                  }
                >
                  ＋
                </button>
                <button onClick={() => setPreviewZoom(1)}>Ajustar</button>
              </div>
              {previewUrl && (
                <a
                  className="preview-download"
                  href={previewUrl}
                  download={previewFile.name}
                >
                  Baixar imagem
                </a>
              )}
            </div>
            <div className="preview-details">
              <div>
                <small>PASTA</small>
                <strong>{previewFile.folderName}</strong>
              </div>
              <div>
                <small>TAMANHO</small>
                <strong>{formatBytes(previewFile.size)}</strong>
              </div>
              <div>
                <small>DATA</small>
                <strong>
                  {formatDate(
                    previewFile.uploadedAt?.toDate() ??
                      previewFile.createdAt?.toDate(),
                  )}
                </strong>
              </div>
              <div>
                <small>RESPONSÁVEL</small>
                <strong>{previewFile.createdByName || "Não informado"}</strong>
              </div>
            </div>
            <footer>
              <button onClick={() => void renameFile(previewFile)}>
                <Icon name="edit" /> Renomear
              </button>
              <button onClick={() => void moveFile(previewFile)}>
                <Icon name="move" /> Mover
              </button>
              <button
                className="danger"
                onClick={() => {
                  const file = previewFile;
                  setPreviewFile(null);
                  void deleteFile(file);
                }}
              >
                <Icon name="trash" /> Excluir
              </button>
            </footer>
          </section>
        </div>
      )}
      {mobileActions && (
        <div
          className="action-sheet-backdrop"
          onClick={() => setMobileActions(null)}
        >
          <section
            className="action-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={`Ações de ${mobileActions.item.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="action-sheet-handle" />
            <header>
              <small>
                {mobileActions.type === "folder" ? "PASTA" : "FOTOGRAFIA"}
              </small>
              <strong>{mobileActions.item.name}</strong>
            </header>
            {mobileActions.type === "folder" ? (
              <>
                <button
                  onClick={() => {
                    setOpenFolderId(mobileActions.item.id);
                    setMobileActions(null);
                  }}
                >
                  <Icon name="folder" /> Abrir pasta
                </button>
                <button
                  onClick={() => {
                    const folder = mobileActions.item;
                    setMobileActions(null);
                    void editFolder(folder);
                  }}
                >
                  <Icon name="edit" /> Renomear
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    const folder = mobileActions.item;
                    setMobileActions(null);
                    void deleteFolder(folder);
                  }}
                >
                  <Icon name="trash" /> Excluir
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setPreviewFile(mobileActions.item);
                    setMobileActions(null);
                  }}
                >
                  <Icon name="eye" /> Visualizar
                </button>
                <button
                  onClick={() => {
                    const file = mobileActions.item;
                    setMobileActions(null);
                    void renameFile(file);
                  }}
                >
                  <Icon name="edit" /> Renomear
                </button>
                <button
                  onClick={() => {
                    const file = mobileActions.item;
                    setMobileActions(null);
                    void moveFile(file);
                  }}
                >
                  <Icon name="move" /> Mover
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    const file = mobileActions.item;
                    setMobileActions(null);
                    void deleteFile(file);
                  }}
                >
                  <Icon name="trash" /> Excluir
                </button>
              </>
            )}
            <button
              className="action-sheet-cancel"
              onClick={() => setMobileActions(null)}
            >
              Cancelar
            </button>
          </section>
        </div>
      )}
      {showFolder && (
        <div className="modal-backdrop" onClick={() => setShowFolder(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setShowFolder(false)}
            >
              ×
            </button>
            <p>NOVA PASTA</p>
            <h2>Criar pasta no Molde Cloud</h2>
            <label>
              Nome da pasta
              <input
                autoFocus
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addFolder();
                }}
                placeholder="Ex.: Moldes agosto"
              />
            </label>
            <button
              className="primary full"
              disabled={busy || !newFolder.trim()}
              onClick={() => void addFolder()}
            >
              {busy ? "Criando..." : "Criar pasta"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Dashboard({
  files,
  folders,
  oneDriveConnected,
  go,
  openFile,
}: {
  files: FileRecord[];
  folders: FolderRecord[];
  oneDriveConnected: boolean;
  go: (s: Screen) => void;
  openFile: (file: FileRecord) => void;
}) {
  return (
    <div className="dashboard">
      <section className="welcome">
        <div>
          <span className="eyebrow">SEU FLUXO DE TRABALHO</span>
          <h2>
            Fotografe no celular.
            <br />
            <em>Acesse no computador.</em>
          </h2>
          <p>
            O Molde Cloud organiza a fotografia e envia o arquivo original para
            sua pasta no OneDrive.
          </p>
          <button className="primary" onClick={() => go("capture")}>
            <Icon name="camera" /> Tirar nova foto
          </button>
        </div>
        <div className="flow-art">
          <div>
            <Icon name="camera" />
            <small>CELULAR</small>
          </div>
          <span>•••</span>
          <div>
            <Icon name="cloud" />
            <small>ONEDRIVE</small>
          </div>
          <span>•••</span>
          <div>
            <Icon name="desktop" />
            <small>COMPUTADOR</small>
          </div>
        </div>
      </section>
      <div className="stats">
        <Stat
          icon="camera"
          tone="purple"
          label="FOTOS ENVIADAS"
          value={String(
            files.filter((item) => item.status === "uploaded").length,
          )}
          note="Arquivos no OneDrive"
        />
        <Stat
          icon="folder"
          tone="cyan"
          label="PASTAS"
          value={String(folders.length)}
          note="Organização do trabalho"
        />
        <Stat
          icon="cloud"
          tone={oneDriveConnected ? "green" : "amber"}
          label="ONEDRIVE"
          value={oneDriveConnected ? "Conectado" : "Desconectado"}
          note={
            oneDriveConnected ? "Pronto para enviar" : "Conecte para começar"
          }
        />
      </div>
      <div className="lower-grid">
        <section className="panel">
          <div className="panel-title">
            <div>
              <small>ATIVIDADE</small>
              <h3>Últimas fotos</h3>
            </div>
            <button onClick={() => go("history")}>Ver histórico →</button>
          </div>
          {files.length ? (
            files
              .slice(0, 4)
              .map((item) => (
                <FileRow
                  key={item.id}
                  item={item}
                  onOpen={() => openFile(item)}
                />
              ))
          ) : (
            <div className="empty">Nenhuma foto enviada.</div>
          )}
        </section>
        <section className="quick">
          <small>ACESSO RÁPIDO</small>
          <h3>O que deseja fazer?</h3>
          {[
            ["camera", "Tirar foto", "Abrir câmera traseira", "capture"],
            ["folder", "Ver arquivos", "Acessar suas pastas", "files"],
            ["search", "Localizar", "Buscar foto ou pasta", "search"],
          ].map((x) => (
            <button key={x[1]} onClick={() => go(x[3] as Screen)}>
              <span>
                <Icon name={x[0]} />
              </span>
              <div>
                <strong>{x[1]}</strong>
                <small>{x[2]}</small>
              </div>
              <b>›</b>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
function Stat({
  icon,
  tone,
  label,
  value,
  note,
}: {
  icon: string;
  tone: string;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article>
      <span className={`stat-icon ${tone}`}>
        <Icon name={icon} />
      </span>
      <div>
        <small>{label}</small>
        <strong className={value.length > 4 ? "status-word" : ""}>
          {value}
        </strong>
        <p>{note}</p>
      </div>
    </article>
  );
}
type CaptureProps = {
  photo: string | null;
  folderId: string;
  folders: FolderRecord[];
  fileName: string;
  busy: boolean;
  uploadProgress: number | null;
  oneDriveConnected: boolean;
  setFolderId: (value: string) => void;
  setFileName: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  openFolder: () => void;
  connect: () => void;
  save: () => Promise<void>;
};
function Capture(p: CaptureProps) {
  const [step, setStep] = useState<"photo" | "details" | "confirm">("photo");
  useEffect(() => {
    if (!p.photo) setStep("photo");
  }, [p.photo]);
  const stepNumber = step === "photo" ? 1 : step === "details" ? 2 : 3,
    folderName = p.folders.find((folder) => folder.id === p.folderId)?.name;
  return (
    <section className="capture-card">
      <div className="capture-steps">
        {["Foto", "Detalhes", "Enviar"].map((label, index) => (
          <div
            key={label}
            className={`capture-step ${index + 1 <= stepNumber ? "active" : ""}`}
          >
            <b>{index + 1}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {!p.oneDriveConnected && (
        <div className="onedrive-callout">
          <div>
            <strong>Conecte o OneDrive para enviar fotografias</strong>
            <small>
              O arquivo será salvo na pasta “Molde Cloud DigiFlash”.
            </small>
          </div>
          <button className="outline" onClick={p.connect}>
            Conectar OneDrive
          </button>
        </div>
      )}
      {step === "photo" && (
        <>
          {p.photo ? (
            <div className="camera-area has-photo">
              <img src={p.photo} alt="Foto escolhida" />
            </div>
          ) : (
            <button
              className="camera-area"
              onClick={() => p.inputRef.current?.click()}
            >
              <span className="camera-icon">
                <Icon name="camera" />
              </span>
              <strong>Fotografar o quadro</strong>
              <small>
                Use a câmera traseira e mantenha o celular paralelo ao quadro.
              </small>
              <b>Abrir câmera</b>
            </button>
          )}
          <div className="capture-actions">
            {p.photo && (
              <>
                <button
                  className="outline"
                  onClick={() => p.inputRef.current?.click()}
                >
                  Refazer foto
                </button>
                <button className="primary" onClick={() => setStep("details")}>
                  Usar esta foto
                </button>
              </>
            )}
          </div>
        </>
      )}
      {step === "details" && (
        <>
          <div className="capture-thumbnail">
            <img src={p.photo || ""} alt="Foto escolhida" />
            <span>Foto pronta para organizar</span>
          </div>
          <div className="form-grid">
            <label>
              Pasta
              <select
                value={p.folderId}
                onChange={(e) => p.setFolderId(e.target.value)}
              >
                <option value="">Selecione uma pasta</option>
                {p.folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="outline" onClick={p.openFolder}>
              ＋ Criar pasta
            </button>
            <label>
              Nome do arquivo
              <input
                value={p.fileName}
                onChange={(e) => p.setFileName(e.target.value)}
                placeholder="Ex.: frente tamanho M"
              />
            </label>
          </div>
          <div className="capture-footer">
            <button className="outline" onClick={() => setStep("photo")}>
              Voltar
            </button>
            <button
              className="primary"
              disabled={!p.fileName.trim() || !p.folderId}
              onClick={() => setStep("confirm")}
            >
              Revisar envio
            </button>
          </div>
        </>
      )}
      {step === "confirm" && (
        <>
          <div className="capture-review">
            <img src={p.photo || ""} alt="Foto para envio" />
            <div>
              <small>PASTA</small>
              <strong>{folderName}</strong>
              <small>ARQUIVO</small>
              <strong>{p.fileName.trim()}</strong>
            </div>
          </div>
          {p.busy && (
            <div className="upload-progress" aria-live="polite">
              <div>
                <span>Enviando ao OneDrive</span>
                <b>{p.uploadProgress ?? 0}%</b>
              </div>
              <progress max="100" value={p.uploadProgress ?? 0} />
            </div>
          )}
          <div className="capture-footer">
            <button
              className="outline"
              disabled={p.busy}
              onClick={() => setStep("details")}
            >
              Corrigir
            </button>
            <button
              className="primary"
              disabled={p.busy || !p.oneDriveConnected}
              onClick={() => void p.save()}
            >
              {p.busy
                ? `Enviando ${p.uploadProgress ?? 0}%`
                : "Enviar ao OneDrive"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
function HistoryList({ items }: { items: HistoryRecord[] }) {
  return (
    <section className="panel list-panel">
      <div className="panel-title">
        <div>
          <small>ATIVIDADE</small>
          <h3>Histórico real</h3>
        </div>
      </div>
      {items.length ? (
        items.map((item) => (
          <div className="history-row" key={item.id}>
            <span className="file-icon">
              <Icon
                name={
                  item.action === "photo_registered" ||
                  item.action === "photo_uploaded"
                    ? "image"
                    : "folder"
                }
              />
            </span>
            <div>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </div>
            <time>{formatDate(item.createdAt?.toDate())}</time>
          </div>
        ))
      ) : (
        <div className="empty">Nenhuma atividade registrada.</div>
      )}
    </section>
  );
}
function FileRow({
  item,
  selected,
  onSelect,
  onOpen,
  actions,
  onMenu,
}: {
  item: FileRecord;
  selected?: boolean;
  onSelect?: () => void;
  onOpen?: () => void;
  actions?: { rename: () => void; move: () => void; remove: () => void };
  onMenu?: () => void;
}) {
  return (
    <div className={`file-row ${selected ? "is-selected" : ""}`}>
      {onSelect && (
        <label className="file-select" title="Selecionar arquivo">
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={onSelect}
          />
          <span />
        </label>
      )}
      <span className="file-icon">
        <Icon name="image" />
      </span>
      <div>
        <strong>{item.name}</strong>
        <small>{item.folderName}</small>
      </div>
      <span>{formatBytes(item.size)}</span>
      <time>
        {formatDate(item.uploadedAt?.toDate() ?? item.createdAt?.toDate())}
      </time>
      <b
        className={
          item.status === "uploaded" ? "uploaded-mark" : "pending-mark"
        }
        title={
          item.status === "uploaded"
            ? "Enviado ao OneDrive"
            : "Aguardando OneDrive"
        }
      >
        {item.status === "uploaded" ? "✓" : "…"}
      </b>
      {onOpen && (
        <button className="file-open" onClick={onOpen}>
          <Icon name="eye" /> Visualizar
        </button>
      )}
      {actions && (
        <div className="file-actions">
          <button onClick={actions.rename}>
            <Icon name="edit" /> Renomear
          </button>
          <button onClick={actions.move}>
            <Icon name="move" /> Mover
          </button>
          <button className="danger" onClick={actions.remove}>
            <Icon name="trash" /> Excluir
          </button>
        </div>
      )}
      {onMenu && (
        <button
          className="mobile-more-button file-more-button"
          aria-label={`Ações de ${item.name}`}
          onClick={onMenu}
        >
          <Icon name="more" />
        </button>
      )}
    </div>
  );
}
function formatBytes(bytes: number) {
  if (!bytes) return "—";
  return `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}
function formatDate(value?: Date) {
  return value
    ? value.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "Agora";
}
function UsersAdmin({
  currentUid,
  companyId,
}: {
  currentUid: string;
  companyId: string;
}) {
  const [users, setUsers] = useState<UserProfile[]>([]),
    [invitations, setInvitations] = useState<EmployeeInvitation[]>([]),
    [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const stopUsers = watchAllUsers(companyId, setUsers),
      stopInvites = watchEmployeeInvites(companyId, setInvitations);
    return () => {
      stopUsers();
      stopInvites();
    };
  }, [companyId]);
  async function submitInvite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await inviteEmployee(companyId, email, currentUid);
      setEmail("");
      setMessage(
        "Convite criado. Use o botão Enviar e-mail para encaminhar o acesso ao funcionário.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível criar o convite.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function cancelInvite(invitation: EmployeeInvitation) {
    if (!window.confirm(`Cancelar o convite de ${invitation.email}?`)) return;
    setMessage("");
    try {
      await cancelEmployeeInvite(invitation.email);
      setMessage("Convite cancelado.");
    } catch {
      setMessage("Não foi possível cancelar o convite.");
    }
  }
  async function setRole(uid: string, role: UserRole) {
    setMessage("");
    try {
      await changeUserRole(uid, role, companyId, currentUid);
      setMessage("Permissão atualizada com sucesso.");
    } catch {
      setMessage("Não foi possível atualizar esta permissão.");
    }
  }
  async function removeUser(item: UserProfile) {
    const confirmation = window.prompt(
      `Para remover o acesso de ${item.name || item.email}, digite REMOVER`,
    );
    if (confirmation !== "REMOVER") return;
    setMessage("");
    try {
      await removeUserAccess(item.uid);
      setMessage("Acesso do usuário removido com sucesso.");
    } catch {
      setMessage("Não foi possível remover este usuário.");
    }
  }
  return (
    <section className="users-panel">
      <div className="section-heading">
        <div>
          <p>{users.length} usuário(s) da empresa</p>
          <h2>Controle de acesso compartilhado</h2>
        </div>
      </div>
      {message && <div className="system-notice">{message}</div>}
      <form className="invite-form panel" onSubmit={submitInvite}>
        <div>
          <small>NOVO FUNCIONÁRIO</small>
          <h3>Convidar por e-mail</h3>
          <p>
            Depois do primeiro acesso, aprove a permissão na lista de usuários.
          </p>
        </div>
        <label>
          E-mail do funcionário
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="funcionario@empresa.com"
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Convidando..." : "Criar convite"}
        </button>
      </form>
      {invitations.length > 0 && (
        <div className="pending-invites">
          <h3>Convites aguardando acesso</h3>
          {invitations.map((invitation) => {
            const subject = encodeURIComponent("Convite para o Molde Cloud");
            const body = encodeURIComponent(
              "Você foi convidado para acessar o Molde Cloud da empresa. Crie sua conta usando este mesmo e-mail: https://moldes-cloud-digiflash.web.app/",
            );
            return (
              <article key={invitation.email}>
                <div>
                  <strong>{invitation.email}</strong>
                  <small>O funcionário ainda não entrou no sistema.</small>
                </div>
                <a
                  className="outline invite-email"
                  href={`mailto:${invitation.email}?subject=${subject}&body=${body}`}
                >
                  Enviar e-mail
                </a>
                <button
                  className="danger-action"
                  onClick={() => void cancelInvite(invitation)}
                >
                  Cancelar
                </button>
              </article>
            );
          })}
        </div>
      )}
      <div className="users-list">
        {users.map((item) => (
          <article key={item.uid}>
            <div className="user-avatar">
              {item.photoURL ? (
                <img src={item.photoURL} alt="" />
              ) : (
                item.name?.[0] || "U"
              )}
            </div>
            <div className="user-details">
              <strong>
                {item.name || "Usuário"}
                {item.uid === currentUid && <small> VOCÊ</small>}
              </strong>
              <span>{item.email}</span>
            </div>
            <span className={`role-badge ${item.role}`}>
              {roleLabel(item.role)}
            </span>
            <select
              aria-label={`Permissão de ${item.name}`}
              value={item.role}
              disabled={
                item.role === "superadmin" ||
                (item.uid === currentUid && item.role === "admin")
              }
              onChange={(event) =>
                void setRole(item.uid, event.target.value as UserRole)
              }
            >
              <option value="superadmin" disabled>
                Administrador geral
              </option>
              <option value="pending">Aguardando</option>
              <option value="user">Usuário</option>
              <option value="admin">Administrador</option>
              <option value="blocked">Bloqueado</option>
            </select>
            {item.uid !== currentUid && item.role !== "superadmin" && (
              <button
                className="remove-user"
                onClick={() => void removeUser(item)}
              >
                Remover acesso
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
function CompaniesAdmin({ currentUid }: { currentUid: string }) {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]),
    [name, setName] = useState(""),
    [adminEmail, setAdminEmail] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [showRemoved, setShowRemoved] = useState(false);
  useEffect(() => watchCompanies(setCompanies, setMessage), []);
  const visibleCompanies = companies.filter(
      (company) => company.status !== "deleted",
    ),
    removedCompanies = companies.filter(
      (company) => company.status === "deleted",
    );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await createCompany(name, adminEmail, currentUid);
      setName("");
      setAdminEmail("");
      setMessage("Empresa criada e administrador definido com sucesso.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível criar a empresa.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggle(company: CompanyRecord) {
    setMessage("");
    try {
      await setCompanyStatus(
        company.id,
        company.status === "active" ? "blocked" : "active",
      );
      setMessage(
        company.status === "active"
          ? "Empresa bloqueada."
          : "Empresa reativada.",
      );
    } catch {
      setMessage("Não foi possível alterar a empresa.");
    }
  }
  async function remove(company: CompanyRecord) {
    const confirmation = window.prompt(
      `Para remover esta empresa, digite exatamente: ${company.name}`,
    );
    if (confirmation?.trim() !== company.name) {
      if (confirmation !== null)
        setMessage("O nome digitado não corresponde à empresa.");
      return;
    }
    setMessage("");
    try {
      await removeCompany(company.id, currentUid);
      setMessage(
        "Empresa removida. Os dados e arquivos foram preservados para recuperação.",
      );
    } catch {
      setMessage("Não foi possível remover a empresa.");
    }
  }
  async function restore(company: CompanyRecord) {
    setMessage("");
    try {
      await restoreCompany(company.id);
      setMessage("Empresa restaurada com sucesso.");
    } catch {
      setMessage("Não foi possível restaurar a empresa.");
    }
  }
  return (
    <section className="companies-panel">
      <div className="section-heading">
        <div>
          <p>{visibleCompanies.length} empresa(s) ativa(s) ou bloqueada(s)</p>
          <h2>Administração geral</h2>
        </div>
        {removedCompanies.length > 0 && (
          <button
            className="outline"
            onClick={() => setShowRemoved(!showRemoved)}
          >
            {showRemoved
              ? "Ocultar removidas"
              : `Ver removidas (${removedCompanies.length})`}
          </button>
        )}
      </div>
      {message && <div className="system-notice">{message}</div>}
      <form className="company-form panel" onSubmit={submit}>
        <div>
          <small>NOVA EMPRESA</small>
          <h3>Cadastrar empresa e administrador</h3>
          <p className="password-guidance">
            O administrador criará a própria senha pelo convite. O Molde Cloud
            nunca armazena senhas.
          </p>
        </div>
        <label>
          Nome da empresa
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Confecções Modelo"
          />
        </label>
        <label>
          E-mail do administrador
          <input
            required
            type="email"
            value={adminEmail}
            onChange={(event) => setAdminEmail(event.target.value)}
            placeholder="administrador@empresa.com"
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Criando..." : "Criar empresa"}
        </button>
      </form>
      <div className="companies-list">
        {visibleCompanies.map((company) => (
          <article key={company.id}>
            <span className="company-icon">
              <Icon name="building" />
            </span>
            <div className="company-details">
              <strong>{company.name}</strong>
              <small>Administrador: {company.adminEmail}</small>
              <small>
                OneDrive: {company.oneDriveAccount || "aguardando conexão"}
              </small>
            </div>
            <span className={`company-status ${company.status}`}>
              {company.status === "active" ? "Ativa" : "Bloqueada"}
            </span>
            <div className="company-actions">
              <button
                className={
                  company.status === "active" ? "danger-action" : "outline"
                }
                onClick={() => void toggle(company)}
              >
                {company.status === "active" ? "Bloquear" : "Reativar"}
              </button>
              <button
                className="remove-action"
                onClick={() => void remove(company)}
              >
                Remover
              </button>
            </div>
          </article>
        ))}
      </div>
      {showRemoved && removedCompanies.length > 0 && (
        <section className="removed-companies">
          <h3>Empresas removidas</h3>
          <div className="companies-list">
            {removedCompanies.map((company) => (
              <article key={company.id}>
                <span className="company-icon">
                  <Icon name="building" />
                </span>
                <div className="company-details">
                  <strong>{company.name}</strong>
                  <small>Administrador: {company.adminEmail}</small>
                  <small>Dados e arquivos preservados</small>
                </div>
                <span className="company-status deleted">Removida</span>
                <button
                  className="outline"
                  onClick={() => void restore(company)}
                >
                  Restaurar
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
function roleLabel(role: UserRole) {
  return role === "superadmin"
    ? "Administrador geral"
    : role === "admin"
      ? "Administrador"
      : role === "user"
        ? "Liberado"
        : role === "blocked"
          ? "Bloqueado"
          : "Aguardando";
}
function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: (
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5M9 21v-7h6v7" />
      </>
    ),
    camera: (
      <>
        <path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v10H2V9a2 2 0 0 1 2-2Z" />
        <circle cx="12" cy="13" r="4" />
      </>
    ),
    folder: <path d="M2 6h8l2 2h10v11H2Z" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6l4 2" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="7" />
        <path d="m16 16 5 5" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    building: (
      <>
        <path d="M4 21V4h11v17M15 9h5v12M8 8h3M8 12h3M8 16h3M18 13h.01M18 17h.01M2 21h20" />
      </>
    ),
    cloud: <path d="M7 19h11a4 4 0 0 0 .5-8A7 7 0 0 0 5 9.5 5 5 0 0 0 7 19Z" />,
    desktop: (
      <>
        <rect x="2" y="4" width="20" height="14" rx="2" />
        <path d="M8 22h8M12 18v4" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m3 17 5-5 4 4 3-3 6 6" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </>
    ),
    move: (
      <>
        <path d="M5 9V5h4M19 15v4h-4M5 5l6 6M19 19l-6-6" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14" />
        <path d="M10 11v6M14 11v6" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    sync: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6.1 9A7 7 0 0 1 18.5 6.5L20 12M4 12l1.5 5.5A7 7 0 0 0 17.9 15" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    restore: (
      <>
        <path d="M4 4v6h6" />
        <path d="M5.5 15a8 8 0 1 0 .5-8.5L4 10" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
