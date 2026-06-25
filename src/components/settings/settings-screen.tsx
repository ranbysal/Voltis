"use client";

import {
  Activity,
  Bell,
  Clock,
  Eye,
  EyeOff,
  Link2,
  Lock,
  LogOut,
  RefreshCw,
  Settings as SettingsIcon,
  Sparkle,
  User,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Dropdown, MenuItem, Switch } from "@/components/workspace/ui";
import {
  activeCount,
  appendActivity,
  defaultConnections,
  FIRM_IDS,
  FIRM_NAMES,
  latestSync,
  loadActivity,
  loadConnections,
  PROP_FIRMS,
  requestConnect,
  saveActivity,
  saveConnections,
  type ActivityEntry,
  type ConnectionState,
  type Environment,
  type FirmId,
} from "@/lib/connections";
import { cn } from "@/lib/utils";

type Section = "connections" | "security" | "activity";
type Theme = "light" | "dark";

const SECTION_NAV: { id: Section; label: string; icon: typeof Link2 }[] = [
  { id: "connections", label: "Connections", icon: Link2 },
  { id: "security", label: "Security", icon: Lock },
  { id: "activity", label: "Activity", icon: Clock },
];

export function SettingsScreen({
  email,
  expiresAt,
  initialSection,
}: {
  email: string;
  expiresAt: number;
  initialSection: Section;
}) {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>("light");
  const [section, setSection] = useState<Section>(initialSection);
  const [connections, setConnections] = useState<ConnectionState>(() =>
    defaultConnections(),
  );
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [connectFirm, setConnectFirm] = useState<FirmId | null>(null);
  const [hydrated, setHydrated] = useState(false);

  /* ----- theme ----- */
  useEffect(() => {
    const dark = window.localStorage.getItem("voltis-theme") === "dark";
    const remember =
      window.localStorage.getItem("voltis-remember-device") === "1";
    queueMicrotask(() => {
      if (dark) {
        setTheme("dark");
      }
      setRememberDevice(remember);
    });
  }, []);

  useEffect(() => {
    window.localStorage.setItem("voltis-theme", theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  /* ----- connections + activity hydrate / seed ----- */
  useEffect(() => {
    const nowIso = new Date().toISOString();
    const loaded = loadConnections();
    let changed = false;
    for (const id of FIRM_IDS) {
      if (loaded[id].status === "connected" && !loaded[id].lastSync) {
        loaded[id] = {
          ...loaded[id],
          connectedAt: loaded[id].connectedAt ?? nowIso,
          lastSync: nowIso,
        };
        changed = true;
      }
    }
    if (changed) {
      saveConnections(loaded);
    }

    let log = loadActivity();
    if (log.length === 0) {
      log = appendActivity(log, {
        kind: "connect",
        firm: "takeprofittrader",
        label: "Linked TakeProfitTrader via Tradovate",
        at: nowIso,
      });
    }
    const top = log[0];
    const sameDaySignIn =
      top &&
      top.kind === "signin" &&
      new Date(top.at).toDateString() === new Date(nowIso).toDateString();
    if (!sameDaySignIn) {
      log = appendActivity(log, {
        kind: "signin",
        firm: null,
        label: "Signed in to Voltis",
        at: nowIso,
      });
    }
    saveActivity(log);

    queueMicrotask(() => {
      setConnections(loaded);
      setActivity(log);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (hydrated) {
      saveConnections(connections);
    }
  }, [connections, hydrated]);

  useEffect(() => {
    if (hydrated) {
      saveActivity(activity);
    }
  }, [activity, hydrated]);

  /* ----- actions ----- */
  const logActivity = useCallback(
    (entry: Parameters<typeof appendActivity>[1]) =>
      setActivity((current) => appendActivity(current, entry)),
    [],
  );

  const handleConnect = useCallback(
    async (
      firm: FirmId,
      payload: { username: string; password: string; environment: Environment },
    ) => {
      const result = await requestConnect({ firm, ...payload });
      if (!result.ok) {
        return result.error;
      }
      setConnections((current) => ({
        ...current,
        [firm]: {
          status: "connected",
          username: payload.username,
          environment: payload.environment,
          connectedAt: new Date().toISOString(),
          lastSync: result.lastSync,
        },
      }));
      logActivity({
        kind: "connect",
        firm,
        label: `Connected ${FIRM_NAMES[firm]} via Tradovate`,
      });
      return null;
    },
    [logActivity],
  );

  const handleDisconnect = useCallback(
    (firm: FirmId) => {
      setConnections((current) => ({
        ...current,
        [firm]: {
          status: "disconnected",
          username: "",
          environment: current[firm].environment,
          connectedAt: null,
          lastSync: null,
        },
      }));
      logActivity({
        kind: "disconnect",
        firm,
        label: `Disconnected ${FIRM_NAMES[firm]}`,
      });
    },
    [logActivity],
  );

  const handleSync = useCallback(
    (firm: FirmId) => {
      const nowIso = new Date().toISOString();
      setConnections((current) => ({
        ...current,
        [firm]: { ...current[firm], lastSync: nowIso },
      }));
      logActivity({
        kind: "sync",
        firm,
        label: `Synced ${FIRM_NAMES[firm]}`,
      });
    },
    [logActivity],
  );

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/");
  }

  const connected = useMemo(() => activeCount(connections), [connections]);
  const lastSyncValue = useMemo(() => latestSync(connections), [connections]);

  return (
    <main
      data-theme={theme}
      className="vw v-settings min-h-dvh min-w-[960px] bg-bg text-ink"
    >
      {/* ----- header ----- */}
      <header className="flex h-[68px] items-center justify-between border-b border-line px-8">
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="Voltis home"
          className="v-serif text-[22px] tracking-[0.2em] text-ink transition-opacity hover:opacity-70"
        >
          VOLTIS
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setTheme((current) => (current === "light" ? "dark" : "light"))
            }
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            className="v-press grid h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-card-soft hover:text-ink"
          >
            <ContrastIcon />
          </button>

          <Dropdown
            hideChevron
            align="right"
            menuClassName="w-60"
            className="h-9 w-9 justify-center border-transparent bg-transparent hover:bg-card-soft"
            label={
              <span className="relative grid place-items-center">
                <Bell size={16} />
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
            }
          >
            <div className="px-3 py-2.5">
              <p className="text-[11px] font-medium">Notifications</p>
              <p className="mt-1.5 text-[10px] leading-4 text-ink-2">
                TakeProfitTrader synced successfully via Tradovate.
              </p>
              <p className="mt-2 text-[10px] leading-4 text-ink-2">
                3 prop accounts are awaiting connection.
              </p>
            </div>
          </Dropdown>

          <Dropdown
            align="right"
            menuClassName="w-52"
            className="h-12 gap-2.5 border-transparent bg-transparent px-2 hover:bg-card-soft"
            label={
              <span className="flex items-center gap-2.5">
                <SettingsAvatar />
                <span className="text-left">
                  <span className="block text-[12px] font-semibold leading-tight">
                    Yazan
                  </span>
                  <span className="flex items-center gap-1 text-[9px] text-ink-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    Online
                  </span>
                </span>
              </span>
            }
          >
            {(close) => (
              <>
                <MenuItem
                  onSelect={() => {
                    close();
                    setSection("security");
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <User size={14} />
                    My Account
                  </span>
                </MenuItem>
                <MenuItem
                  active={section === "connections"}
                  onSelect={() => {
                    close();
                    setSection("connections");
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <SettingsIcon size={14} />
                    Settings
                  </span>
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    void signOut();
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <LogOut size={14} />
                    Log out
                  </span>
                </MenuItem>
              </>
            )}
          </Dropdown>
        </div>
      </header>

      {/* ----- body ----- */}
      <div className="mx-auto max-w-[1200px] px-8 py-8">
        {/* title row */}
        <div className="flex items-center gap-4 pb-7">
          <h1 className="v-serif text-[34px] leading-none text-ink">
            Settings
          </h1>
          <span className="grid grid-cols-3 gap-[3px]">
            {Array.from({ length: 9 }).map((_, index) => (
              <span
                key={index}
                className="h-[3px] w-[3px] rounded-full bg-ink-3"
              />
            ))}
          </span>
          <span className="text-[13px] text-ink-2">
            {section === "connections"
              ? "Account"
              : section === "security"
                ? "Security"
                : "Activity"}
          </span>
        </div>

        <div className="flex items-start gap-6">
          {/* sidebar */}
          <aside className="w-[248px] shrink-0 rounded-2xl border border-line bg-card p-3">
            <nav className="space-y-1">
              {SECTION_NAV.map((item) => {
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={cn(
                      "v-press flex h-11 w-full items-center gap-3 rounded-xl px-3.5 text-[13px] transition-colors",
                      active
                        ? "border border-line bg-card-soft font-medium text-ink"
                        : "border border-transparent text-ink-2 hover:text-ink",
                    )}
                  >
                    <item.icon size={16} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* main */}
          <div className="min-w-0 flex-1 space-y-5">
            {section === "connections" ? (
              <ConnectionsSection
                connections={connections}
                connected={connected}
                lastSyncValue={lastSyncValue}
                onConnect={(firm) => setConnectFirm(firm)}
                onDisconnect={handleDisconnect}
                onSync={handleSync}
              />
            ) : null}

            {section === "security" ? (
              <SecuritySection
                email={email}
                expiresAt={expiresAt}
                rememberDevice={rememberDevice}
                onToggleRemember={(next) => {
                  setRememberDevice(next);
                  window.localStorage.setItem(
                    "voltis-remember-device",
                    next ? "1" : "0",
                  );
                }}
                onSignOut={signOut}
              />
            ) : null}

            {section === "activity" ? (
              <ActivitySection
                activity={activity}
                onClear={() => setActivity([])}
              />
            ) : null}
          </div>
        </div>
      </div>

      {connectFirm ? (
        <ConnectModal
          firm={connectFirm}
          onClose={() => setConnectFirm(null)}
          onSubmit={(payload) => handleConnect(connectFirm, payload)}
        />
      ) : null}
    </main>
  );
}

/* ====================================================================== */
/* Connections                                                            */
/* ====================================================================== */

function ConnectionsSection({
  connections,
  connected,
  lastSyncValue,
  onConnect,
  onDisconnect,
  onSync,
}: {
  connections: ConnectionState;
  connected: number;
  lastSyncValue: string | null;
  onConnect: (firm: FirmId) => void;
  onDisconnect: (firm: FirmId) => void;
  onSync: (firm: FirmId) => void;
}) {
  return (
    <>
      <section className="rounded-2xl border border-line bg-card p-7">
        <h2 className="v-serif text-[22px] text-ink">Connected Accounts</h2>
        <p className="mt-1.5 text-[12px] text-ink-2">
          Manage your prop firm and trading account connections.
        </p>

        <div className="mt-6 space-y-3">
          {PROP_FIRMS.map((firm) => (
            <AccountRow
              key={firm.id}
              firm={firm.id}
              monogram={firm.monogram}
              record={connections[firm.id]}
              onConnect={() => onConnect(firm.id)}
              onDisconnect={() => onDisconnect(firm.id)}
              onSync={() => onSync(firm.id)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-7">
        <h2 className="v-serif text-[22px] text-ink">Connection Overview</h2>
        <p className="mt-1.5 text-[12px] text-ink-2">
          Summary of your account integrations.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-4">
          <OverviewStat
            icon={Activity}
            label="Active Connections"
            value={`${connected} / ${FIRM_IDS.length}`}
          />
          <OverviewStat
            icon={RefreshCw}
            label="Last Sync"
            value={formatSync(lastSyncValue)}
          />
          <OverviewStat
            icon={Clock}
            label="Auto Sync"
            value="Every 5 minutes"
          />
        </div>
      </section>
    </>
  );
}

function AccountRow({
  firm,
  monogram,
  record,
  onConnect,
  onDisconnect,
  onSync,
}: {
  firm: FirmId;
  monogram: string;
  record: ConnectionState[FirmId];
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
}) {
  const isConnected = record.status === "connected";
  return (
    <div className="flex h-[84px] items-center justify-between rounded-xl border border-line px-5">
      <div className="flex items-center gap-4">
        <span className="grid h-11 w-11 place-items-center text-ink">
          <FirmMark monogram={monogram} />
        </span>
        <span>
          <span className="v-serif block text-[18px] leading-tight text-ink">
            {FIRM_NAMES[firm]}
          </span>
          <span className="mt-0.5 block text-[11px] text-ink-2">
            {isConnected && record.username
              ? `Tradovate · ${record.username} · ${
                  record.environment === "live" ? "Live" : "Demo"
                }`
              : "Prop account connection"}
          </span>
        </span>
      </div>

      {isConnected ? (
        <Dropdown
          align="right"
          menuClassName="w-44"
          className="h-9 px-3.5"
          label={
            <span className="flex items-center gap-2 text-[12px]">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Connected
            </span>
          }
        >
          {(close) => (
            <>
              <MenuItem
                onSelect={() => {
                  close();
                  onSync();
                }}
              >
                <span className="flex items-center gap-2.5">
                  <RefreshCw size={14} />
                  Sync now
                </span>
              </MenuItem>
              <MenuItem
                onSelect={() => {
                  close();
                  onDisconnect();
                }}
              >
                <span className="flex items-center gap-2.5 text-down">
                  <X size={14} />
                  Disconnect
                </span>
              </MenuItem>
            </>
          )}
        </Dropdown>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          className="v-press h-9 rounded-lg border border-line bg-card px-5 text-[12px] font-medium text-ink hover:bg-card-soft"
        >
          Connect
        </button>
      )}
    </div>
  );
}

function OverviewStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-ink-2">
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] uppercase tracking-[0.08em] text-ink-3">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-[14px] font-medium text-ink">
          {value}
        </span>
      </span>
    </div>
  );
}

function FirmMark({ monogram }: { monogram: string }) {
  if (monogram === "star") {
    return <Sparkle size={24} fill="currentColor" strokeWidth={1} />;
  }
  return (
    <span className="v-serif text-[24px] leading-none tracking-tight">
      {monogram}
    </span>
  );
}

/* ====================================================================== */
/* Security                                                               */
/* ====================================================================== */

function SecuritySection({
  email,
  expiresAt,
  rememberDevice,
  onToggleRemember,
  onSignOut,
}: {
  email: string;
  expiresAt: number;
  rememberDevice: boolean;
  onToggleRemember: (next: boolean) => void;
  onSignOut: () => void;
}) {
  const expiry =
    expiresAt > 9_000_000_000_000
      ? "Does not expire (development)"
      : new Date(expiresAt * 1000).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });

  return (
    <>
      <section className="rounded-2xl border border-line bg-card p-7">
        <h2 className="v-serif text-[22px] text-ink">Account & Security</h2>
        <p className="mt-1.5 text-[12px] text-ink-2">
          Your administrator profile and active session.
        </p>

        <dl className="mt-6 divide-y divide-line">
          <InfoRow label="Email" value={email} />
          <InfoRow label="Role" value="Administrator" />
          <InfoRow label="Session expires" value={expiry} />
        </dl>
      </section>

      <section className="rounded-2xl border border-line bg-card p-7">
        <h2 className="v-serif text-[22px] text-ink">Preferences</h2>
        <p className="mt-1.5 text-[12px] text-ink-2">
          Control how this device handles your session.
        </p>

        <div className="mt-6 flex items-center justify-between rounded-xl border border-line px-5 py-4">
          <div>
            <p className="text-[13px] font-medium text-ink">
              Remember this device
            </p>
            <p className="mt-0.5 text-[11px] text-ink-2">
              Keep this browser signed in for longer between visits.
            </p>
          </div>
          <Switch
            checked={rememberDevice}
            onChange={onToggleRemember}
            label="Remember this device"
          />
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="v-press mt-4 flex h-11 items-center gap-2.5 rounded-xl border border-line px-5 text-[12px] font-medium text-down hover:bg-down-soft"
        >
          <LogOut size={15} />
          Sign out of Voltis
        </button>
      </section>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <dt className="text-[12px] text-ink-2">{label}</dt>
      <dd className="text-[13px] font-medium text-ink">{value}</dd>
    </div>
  );
}

/* ====================================================================== */
/* Activity                                                               */
/* ====================================================================== */

function ActivitySection({
  activity,
  onClear,
}: {
  activity: ActivityEntry[];
  onClear: () => void;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-7">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="v-serif text-[22px] text-ink">Recent Activity</h2>
          <p className="mt-1.5 text-[12px] text-ink-2">
            A log of connections and sign-ins on your account.
          </p>
        </div>
        {activity.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="v-press h-9 rounded-lg border border-line px-4 text-[11px] font-medium text-ink-2 hover:text-ink"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="mt-6">
        {activity.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-[12px] text-ink-2">
            No activity yet.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {activity.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3.5 rounded-xl border border-line px-5 py-3.5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-ink-2">
                  <ActivityIcon kind={entry.kind} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink">
                    {entry.label}
                  </span>
                  <span className="text-[10px] text-ink-3">
                    {formatActivityTime(entry.at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ActivityIcon({ kind }: { kind: ActivityEntry["kind"] }) {
  if (kind === "connect") {
    return <Link2 size={15} />;
  }
  if (kind === "disconnect") {
    return <X size={15} />;
  }
  if (kind === "sync") {
    return <RefreshCw size={15} />;
  }
  return <User size={15} />;
}

/* ====================================================================== */
/* Connect modal                                                          */
/* ====================================================================== */

function ConnectModal({
  firm,
  onClose,
  onSubmit,
}: {
  firm: FirmId;
  onClose: () => void;
  onSubmit: (payload: {
    username: string;
    password: string;
    environment: Environment;
  }) => Promise<string | null>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [environment, setEnvironment] = useState<Environment>("live");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    const message = await onSubmit({ username, password, environment });
    if (message) {
      setError(message);
      setSubmitting(false);
      return;
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Connect ${FIRM_NAMES[firm]}`}
        className="v-pop-in w-[440px] max-w-full rounded-2xl border border-line bg-card p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="v-serif text-[22px] text-ink">
              Connect {FIRM_NAMES[firm]}
            </h3>
            <p className="mt-1 text-[11px] leading-4 text-ink-2">
              {FIRM_NAMES[firm]} routes through Tradovate. Enter the Tradovate
              login you use for this account.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="v-press -mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-lg text-ink-2 hover:bg-card-soft hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit} className="mt-5" noValidate>
          <ModalLabel htmlFor="tradovate-username">
            Tradovate username
          </ModalLabel>
          <div className="mt-1.5 flex h-11 items-center gap-2.5 rounded-lg border border-line bg-card-soft px-3 focus-within:border-ink">
            <User size={15} className="shrink-0 text-ink-3" />
            <input
              id="tradovate-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="your-tradovate-id"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
            />
          </div>

          <div className="mt-4" />
          <ModalLabel htmlFor="tradovate-password">
            Tradovate password
          </ModalLabel>
          <div className="mt-1.5 flex h-11 items-center gap-2.5 rounded-lg border border-line bg-card-soft px-3 focus-within:border-ink">
            <Lock size={15} className="shrink-0 text-ink-3" />
            <input
              id="tradovate-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((current) => !current)}
              className="shrink-0 text-ink-3 hover:text-ink"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          <div className="mt-4" />
          <ModalLabel htmlFor="">Environment</ModalLabel>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {(["live", "demo"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setEnvironment(value)}
                className={cn(
                  "v-press h-10 rounded-lg border text-[12px] font-medium capitalize transition-colors",
                  environment === value
                    ? "border-transparent bg-chip text-chip-ink"
                    : "border-line text-ink-2 hover:text-ink",
                )}
              >
                {value}
              </button>
            ))}
          </div>

          {error ? (
            <p role="alert" className="mt-3 text-[11px] text-down">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="v-press h-10 rounded-lg px-4 text-[12px] font-medium text-ink-2 hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !username || !password}
              className="v-press h-10 rounded-lg bg-chip px-5 text-[12px] font-semibold text-chip-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Connecting…" : "Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor || undefined}
      className="text-[11px] font-medium text-ink-2"
    >
      {children}
    </label>
  );
}

/* ====================================================================== */
/* Bits                                                                   */
/* ====================================================================== */

function ContrastIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="6.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M8 1.6a6.4 6.4 0 0 1 0 12.8z" fill="currentColor" />
    </svg>
  );
}

function SettingsAvatar() {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-card-soft">
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
        <circle cx="16" cy="13" r="6" fill="none" stroke="currentColor" />
        <path
          d="M5 29c1.6-6 5.8-9 11-9s9.4 3 11 9"
          fill="none"
          stroke="currentColor"
        />
        <path
          d="M12 14c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4"
          fill="none"
          stroke="currentColor"
          strokeWidth=".8"
        />
      </svg>
    </span>
  );
}

function formatSync(iso: string | null): string {
  if (!iso) {
    return "Never";
  }
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  if (date.toDateString() === now.toDateString()) {
    return `Today, ${time}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${time}`;
  }
  return `${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}, ${time}`;
}

function formatActivityTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
