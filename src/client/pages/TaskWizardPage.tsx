import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import { usePreferences } from "../lib/themes";
import { useTasks } from "../lib/useTasksContext";
import { navigate } from "../lib/router";
import { useToast } from "../components/Toast";
import { PageHero } from "../components/PageHero";
import { Icon } from "../components/Icon";
import { CapabilityChecklist } from "../components/CapabilityChecklist";
import { ChatTools } from "../components/ChatTools";
import { Modal } from "../components/Modal";
import { MediaFilterPicker } from "../components/MediaFilterPicker";
import { InfoTip, InfoLabel } from "../components/InfoTip";
import { SCOPE_LABELS } from "./TasksPage";
import { normalizeChatInput } from "../../shared/chatInput";
import type {
  BotSummary,
  ChatLookupResult,
  SavedTaskSummary,
  TaskScope,
  TaskSummary,
} from "../../shared/rpcTypes";

type SavedSetup = SavedTaskSummary & { existing_bot_id: string | null };
const steps = ["Bot", "Chats", "Messages", "Review"];
const positive = (value: string) =>
  /^\d+$/.test(value) &&
  Number.isSafeInteger(Number(value)) &&
  Number(value) > 0;
export function TaskWizardPage({ fromSavedId }: { fromSavedId?: string }) {
  const {
    data: bots,
    loading: botsLoading,
    error: botsError,
    refetch: refetchBots,
  } = usePolling(() => api.get<BotSummary[]>("/api/bots"), 30000);
  const { preferences } = usePreferences();
  const tasks = useTasks();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [botId, setBotId] = useState("");
  const [token, setToken] = useState("");
  const [connectNew, setConnectNew] = useState(false);
  const [source, setSource] = useState("");
  const [dest, setDest] = useState("");
  const [sourceChat, setSourceChat] = useState<ChatLookupResult | null>(null);
  const [destChat, setDestChat] = useState<ChatLookupResult | null>(null);
  const [scope, setScope] = useState<TaskScope>(
    () => preferences.defaultTaskScope,
  );
  const [mode, setMode] = useState<"range" | "lastN">("range");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [count, setCount] = useState("100");
  const [label, setLabel] = useState("");
  const [saveSetup, setSaveSetup] = useState(() =>
    fromSavedId ? false : preferences.defaultSaveSetup,
  );
  const [extensions, setExtensions] = useState<string[]>([]);
  const [media, setMedia] = useState<string[]>([]);
  const [minSize, setMinSize] = useState("");
  const [maxSize, setMaxSize] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingSetup, setLoadingSetup] = useState(!!fromSavedId);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [confirmTest, setConfirmTest] = useState(false);
  const [testId, setTestId] = useState("");
  const [testResult, setTestResult] = useState("");
  const generation = useRef(0);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    const heading = stepHeadingRef.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    const reduceMotion =
      preferences.reduceMotion ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heading.scrollIntoView({
      behavior: reduceMotion ? "instant" : "smooth",
      block: "start",
    });
  }, [step, preferences.reduceMotion]);
  const selectedBot = bots?.find((bot) => bot.id === botId);
  const history = scope !== "live";
  const hasFilters = !!(
    media.length ||
    extensions.length ||
    minSize !== "" ||
    maxSize !== ""
  );
  const sourceReady =
    sourceChat &&
    ["creator", "administrator", "member"].includes(sourceChat.botStatus);
  const destReady = destChat?.capabilities.find(
    (c) => c.key === "send_message",
  )?.available;
  useEffect(() => {
    if (!fromSavedId) return;
    let cancelled = false;
    void api
      .get<SavedSetup>(`/api/saved-tasks/${fromSavedId}`)
      .then((result) => {
        if (cancelled) return;
        setLoadingSetup(false);
        if (!result.ok) {
          setError(result.description);
          return;
        }
        const saved = result.data;
        setBotId(saved.existing_bot_id ?? "");
        setSource(saved.source_chat_id);
        setDest(saved.dest_chat_id);
        setScope(saved.scope);
        setMode(saved.backfill_mode ?? "range");
        setStart(saved.start_id == null ? "" : String(saved.start_id));
        setEnd(saved.end_id == null ? "" : String(saved.end_id));
        setCount(String(saved.n ?? 100));
        setMedia(saved.filter_media_types?.split(",") ?? []);
        setExtensions(
          saved.filter_extensions?.split(",").filter(Boolean) ?? [],
        );
        setMinSize(
          saved.filter_min_size_bytes == null
            ? ""
            : String(saved.filter_min_size_bytes / 1048576),
        );
        setMaxSize(
          saved.filter_max_size_bytes == null
            ? ""
            : String(saved.filter_max_size_bytes / 1048576),
        );
        setNotice(
          saved.existing_bot_id
            ? "Setup loaded. Check the chats and review before starting."
            : "Setup loaded. Reconnect its bot, or choose another bot, to continue.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [fromSavedId]);
  function resetChats() {
    generation.current++;
    setSourceChat(null);
    setDestChat(null);
    setError("");
  }
  async function connect() {
    setBusy(true);
    setError("");
    const result = await api.post<BotSummary>("/api/bots", {
      token: token.trim(),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.description);
      return;
    }
    resetChats();
    setBotId(result.data.id);
    setToken("");
    setConnectNew(false);
    await refetchBots();
    toast.show("success", `Connected @${result.data.bot_username}.`);
  }
  async function checkChats() {
    const normalizedSource = normalizeChatInput(source);
    const normalizedDest = normalizeChatInput(dest);
    if (!normalizedSource.ok || !normalizedDest.ok) {
      setError(
        [
          !normalizedSource.ok ? `Source: ${normalizedSource.error}` : "",
          !normalizedDest.ok ? `Destination: ${normalizedDest.error}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
      return;
    }
    setSource(normalizedSource.value);
    setDest(normalizedDest.value);
    const key = ++generation.current;
    setBusy(true);
    setError("");
    const query = `?botId=${encodeURIComponent(botId)}`;
    const results = await Promise.all([
      api.get<ChatLookupResult>(
        `/api/chats/${encodeURIComponent(normalizedSource.value)}${query}`,
      ),
      api.get<ChatLookupResult>(
        `/api/chats/${encodeURIComponent(normalizedDest.value)}${query}`,
      ),
    ]);
    if (key !== generation.current) {
      setBusy(false);
      return;
    }
    setBusy(false);
    const [first, second] = results;
    setSourceChat(first.ok ? first.data : null);
    setDestChat(second.ok ? second.data : null);
    if (!first.ok || !second.ok) {
      setError(
        [
          !first.ok ? `Source: ${first.description}` : "",
          !second.ok ? `Destination: ${second.description}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
      return;
    }
    if (first.data.chat.id === second.data.chat.id) {
      setDestChat(null);
      setError("Choose different source and destination chats.");
      return;
    }
    if (
      !["creator", "administrator", "member"].includes(first.data.botStatus)
    ) {
      setError(
        "Add the bot to the source chat and remove any membership restriction, then check again.",
      );
      return;
    }
    if (
      !second.data.capabilities.find((c) => c.key === "send_message")?.available
    ) {
      setError(
        "Give your bot permission to post in the destination, then check again.",
      );
      return;
    }
  }
  function validateMessages() {
    if (
      history &&
      mode === "range" &&
      (!positive(start) || !positive(end) || Number(start) > Number(end))
    )
      return "Enter valid start and end message IDs, with the end at or after the start.";
    if (
      history &&
      mode === "lastN" &&
      (!positive(count) || Number(count) > 1000000)
    )
      return "Enter a number of recent message IDs from 1 to 1,000,000.";
    if (
      history &&
      mode === "lastN" &&
      !sourceChat?.capabilities.find((c) => c.key === "send_message")?.available
    )
      return "Finding recent messages requires permission to post in the source. Use a message range instead.";
    if (scope !== "backfill_only") {
      if (
        [minSize, maxSize].some(
          (value) =>
            value !== "" &&
            (!Number.isFinite(Number(value)) || Number(value) < 0),
        )
      )
        return "File sizes must be zero or a positive number.";
      if (minSize !== "" && maxSize !== "" && Number(minSize) > Number(maxSize))
        return "Maximum file size must be at least the minimum size.";
    }
    return "";
  }
  async function create(allowDuplicate = false) {
    if (!sourceChat || !destChat || !botId) return;
    const invalid = validateMessages();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError("");
    const result = await api.post<TaskSummary>(`/api/bots/${botId}/tasks`, {
      sourceChatId: String(sourceChat.chat.id),
      destChatId: String(destChat.chat.id),
      scope,
      label: label.trim() || undefined,
      backfillMode: history ? mode : undefined,
      startId: history && mode === "range" ? Number(start) : undefined,
      endId: history && mode === "range" ? Number(end) : undefined,
      n: history && mode === "lastN" ? Number(count) : undefined,
      saveTemplate: saveSetup,
      allowDuplicate,
      filterExtensions:
        scope !== "backfill_only" && extensions.length
          ? extensions.join(",")
          : null,
      filterMediaTypes:
        scope !== "backfill_only" && media.length ? media.join(",") : null,
      filterMinSizeBytes:
        scope !== "backfill_only" && minSize !== ""
          ? Math.round(Number(minSize) * 1048576)
          : null,
      filterMaxSizeBytes:
        scope !== "backfill_only" && maxSize !== ""
          ? Math.round(Number(maxSize) * 1048576)
          : null,
    });
    setBusy(false);
    if (!result.ok) {
      const existing = (result as typeof result & { duplicateTaskId?: string })
        .duplicateTaskId;
      if (existing) setDuplicate(existing);
      else setError(result.description);
      return;
    }
    toast.show("success", "Task created.");
    if (result.data.notice) toast.show("info", result.data.notice);
    void tasks.refetch();
    navigate(`task/${result.data.id}`);
  }
  async function testCopy() {
    if (!sourceChat || !destChat || !positive(testId)) return;
    setBusy(true);
    setConfirmTest(false);
    setError("");
    const result = await api.post<{ message_id: number }>(
      `/api/chats/${sourceChat.chat.id}/test-copy?botId=${encodeURIComponent(botId)}`,
      { destChatId: String(destChat.chat.id), messageId: Number(testId) },
    );
    setBusy(false);
    if (result.ok)
      setTestResult(
        `Copied to destination as message ${result.data.message_id}.`,
      );
    else setError(result.description);
  }
  if (loadingSetup)
    return (
      <div className="content-container">
        <div className="loading-state">Loading saved setup…</div>
      </div>
    );
  return (
    <div className="content-container wizard-container">
      <PageHero
        title="New copy task"
        subtitle="Choose what to copy and where it should go."
      >
        <a href="#" className="button button-ghost">
          Cancel
        </a>
      </PageHero>
      <ol className="wizard-steps" aria-label="Setup progress">
        {steps.map((name, index) => (
          <li
            key={name}
            className={`wizard-step${step === index ? " is-current" : step > index ? " is-complete" : ""}`}
            aria-current={step === index ? "step" : undefined}
          >
            <span>
              {step > index ? <Icon name="check" size={15} /> : index + 1}
            </span>
            <strong>{name}</strong>
          </li>
        ))}
      </ol>
      {notice && (
        <div className="alert alert-info">
          <Icon name="info" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="alert alert-error" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      )}
      <section className="card wizard-card">
        {step === 0 && (
          <div className="stack">
            <div>
              <span className="eyebrow">STEP 1 OF 4</span>
              <h2
                className="card-title wizard-step-heading"
                tabIndex={-1}
                ref={stepHeadingRef}
              >
                Choose your bot
              </h2>
              <p className="text-muted">
                Your bot needs access to both chats to copy messages.
              </p>
            </div>
            {botsError && (
              <div className="alert alert-error">
                {botsError}
                <button
                  className="button button-secondary"
                  onClick={() => void refetchBots()}
                >
                  Retry
                </button>
              </div>
            )}
            {botsLoading && <p className="helper">Loading bots…</p>}
            {!!bots?.length && (
              <div className="field">
                <InfoLabel htmlFor="select-bot" label="Connected bot">
                  Choose a bot already stored in this workspace. It must have
                  access to the source and destination chats.
                </InfoLabel>
                <select
                  className="input"
                  id="select-bot"
                  value={botId}
                  disabled={busy}
                  onChange={(e) => {
                    setBotId(e.target.value);
                    resetChats();
                    setConnectNew(false);
                  }}
                >
                  <option value="">Choose a bot</option>
                  {bots.map((bot) => (
                    <option key={bot.id} value={bot.id}>
                      {bot.label} (@{bot.bot_username})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {connectNew || (!botsLoading && !bots?.length) ? (
              <div className="stack">
                <div className="field">
                  <InfoLabel htmlFor="new-token" label="Bot token">
                    A token is the private key BotFather gives you. Paste it
                    here to connect your bot. Do not share it with other people.
                  </InfoLabel>
                  <input
                    id="new-token"
                    type="password"
                    className="input"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy}
                    placeholder="Paste your token"
                  />
                  <p className="helper">
                    Get a token from{" "}
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      @BotFather
                    </a>{" "}
                    in Telegram using /newbot.
                  </p>
                </div>
                <div className="row">
                  <button
                    className="button button-secondary"
                    disabled={!token.trim() || busy}
                    onClick={() => void connect()}
                  >
                    <Icon name="bot" />
                    {busy ? "Connecting…" : "Connect bot"}
                  </button>
                  {!!bots?.length && (
                    <button
                      className="button button-ghost"
                      onClick={() => {
                        setConnectNew(false);
                        setToken("");
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button
                className="button button-ghost align-start"
                onClick={() => setConnectNew(true)}
              >
                <Icon name="plus" size={17} />
                Connect another bot
              </button>
            )}
            {selectedBot && (
              <div className="alert alert-success">
                <Icon name="check-circle" />
                <span>@{selectedBot.bot_username} is ready to use.</span>
              </div>
            )}
            <div className="wizard-actions">
              <span className="helper">
                Use a dedicated bot if another app already uses yours.
              </span>
              <button
                className="button button-primary"
                disabled={!botId || busy}
                onClick={() => {
                  setError("");
                  setStep(1);
                }}
              >
                Continue
                <Icon name="arrow-right" />
              </button>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="stack">
            <div>
              <span className="eyebrow">STEP 2 OF 4</span>
              <h2
                className="card-title wizard-step-heading"
                tabIndex={-1}
                ref={stepHeadingRef}
              >
                Where should messages go?
              </h2>
              <p className="text-muted">
                Add @{selectedBot?.bot_username || "your bot"} to both chats
                first. For channels, make it an administrator.
              </p>
            </div>
            <div className="form-grid">
              <div className="field">
                <InfoLabel htmlFor="source-chat" label="Copy from">
                  This is the source chat. Paste its public username, numeric
                  chat ID, or a Telegram chat or message link. Add your bot to
                  this chat first.
                </InfoLabel>
                <input
                  className="input"
                  id="source-chat"
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value);
                    resetChats();
                  }}
                  placeholder="@source, chat ID, or t.me link"
                  disabled={busy}
                  autoComplete="off"
                  spellCheck={false}
                />
                {sourceChat && (
                  <div
                    className={`chat-result${sourceReady ? " is-valid" : ""}`}
                  >
                    <Icon name={sourceReady ? "check-circle" : "alert"} />
                    <span>
                      <strong>
                        {sourceChat.chat.title ||
                          sourceChat.chat.username ||
                          sourceChat.chat.id}
                      </strong>
                      <small>
                        {sourceChat.chat.type} · {sourceChat.chat.id}
                      </small>
                    </span>
                  </div>
                )}
              </div>
              <div className="field">
                <InfoLabel htmlFor="destination-chat" label="Copy to">
                  This is where copied messages will appear. It must be
                  different from the source, and your bot needs permission to
                  post here.
                </InfoLabel>
                <input
                  className="input"
                  id="destination-chat"
                  value={dest}
                  onChange={(e) => {
                    setDest(e.target.value);
                    resetChats();
                  }}
                  placeholder="@destination, chat ID, or t.me link"
                  disabled={busy}
                  autoComplete="off"
                  spellCheck={false}
                />
                {destChat && (
                  <div className={`chat-result${destReady ? " is-valid" : ""}`}>
                    <Icon name={destReady ? "check-circle" : "alert"} />
                    <span>
                      <strong>
                        {destChat.chat.title ||
                          destChat.chat.username ||
                          destChat.chat.id}
                      </strong>
                      <small>
                        {destReady
                          ? "Bot can post here"
                          : "Posting permission needed"}
                      </small>
                    </span>
                  </div>
                )}
              </div>
            </div>
            <p className="helper">
              Paste a Telegram chat or message link, a public @username, or a
              numeric chat ID. Invite links are not supported. The chats must be
              different.
            </p>
            <button
              className="button button-secondary align-start"
              disabled={busy || !source.trim() || !dest.trim()}
              onClick={() => void checkChats()}
            >
              <Icon name="check-circle" />
              {busy ? "Checking chats…" : "Check both chats"}
            </button>
            {sourceChat && sourceChat.chat.type !== "channel" && (
              <div className="alert alert-info">
                <Icon name="info" />
                <span>
                  In groups, bot privacy settings affect which messages are
                  visible. Messages from other bots may not be available.
                </span>
              </div>
            )}
            {sourceChat && !!sourceChat.pastTasks?.length && (
              <details className="advanced-section">
                <summary>
                  <Icon name="history" size={17} />
                  Previous tasks from this chat ({sourceChat.pastTasks.length})
                </summary>
                <div className="stack">
                  {sourceChat.pastTasks.map((task) => (
                    <a
                      className="history-link"
                      href={`#task/${task.id}`}
                      key={task.id}
                    >
                      <strong>
                        {task.dest_chat_title || task.dest_chat_id}
                      </strong>
                      <span className="helper">
                        {task.processed} copied
                        {task.last_copied_message_id
                          ? ` · Last copied ID ${task.last_copied_message_id}`
                          : ""}
                      </span>
                      <Icon name="arrow-right" size={17} />
                    </a>
                  ))}
                  <p className="helper">
                    Review the destination and message range to avoid copying
                    the same messages twice.
                  </p>
                </div>
              </details>
            )}
            {sourceChat && (
              <details className="advanced-section">
                <summary>
                  <Icon name="shield" size={17} />
                  Bot permissions
                </summary>
                <CapabilityChecklist capabilities={sourceChat.capabilities} />
              </details>
            )}
            {sourceChat && (
              <ChatTools botId={botId} chatId={String(sourceChat.chat.id)} />
            )}
            <div className="wizard-actions">
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setStep(0);
                }}
              >
                <Icon name="arrow-left" />
                Back
              </button>
              <button
                className="button button-primary"
                disabled={!sourceReady || !destReady || busy}
                onClick={() => {
                  setError("");
                  setStep(2);
                }}
              >
                Continue
                <Icon name="arrow-right" />
              </button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="stack">
            <div>
              <span className="eyebrow">STEP 3 OF 4</span>
              <h2
                className="card-title wizard-step-heading"
                tabIndex={-1}
                ref={stepHeadingRef}
              >
                Which messages?
              </h2>
              <p className="text-muted">
                Choose a one-time copy, ongoing copying, or both.
              </p>
            </div>
            <div className="row wrap">
              <span className="form-label">Messages to copy</span>
              <InfoTip label="Messages to copy">
                New messages keeps watching for incoming posts. Existing
                messages copies a selected history range once. Existing + new
                copies the range and then continues with incoming posts.
              </InfoTip>
            </div>
            <fieldset className="choice-grid">
              <legend className="sr-only">Messages to copy</legend>
              {(
                [
                  {
                    value: "live",
                    icon: "send",
                    title: "New messages",
                    description: "Copy new messages as they arrive.",
                  },
                  {
                    value: "backfill_only",
                    icon: "history",
                    title: "Existing messages",
                    description: "Copy a selected part of the history once.",
                  },
                  {
                    value: "live_and_backfill",
                    icon: "copy",
                    title: "Existing + new",
                    description:
                      "Copy the history, then keep copying new messages.",
                  },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className={`choice-card${scope === option.value ? " is-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="scope"
                    value={option.value}
                    checked={scope === option.value}
                    onChange={() => {
                      setScope(option.value);
                      setError("");
                    }}
                  />
                  <Icon name={option.icon} size={23} />
                  <strong>{option.title}</strong>
                  <span>{option.description}</span>
                </label>
              ))}
            </fieldset>
            {history && (
              <section className="subsection stack">
                <h3>Choose the history</h3>
                <div className="field">
                  <InfoLabel htmlFor="history-mode" label="Selection method">
                    Use a message ID range if you know the first and last
                    messages. Most recent message IDs posts a temporary message
                    to find the latest ID, then tries to delete it.
                  </InfoLabel>
                  <select
                    id="history-mode"
                    className="input"
                    value={mode}
                    onChange={(e) =>
                      setMode(e.target.value as "range" | "lastN")
                    }
                  >
                    <option value="range">Message ID range</option>
                    <option value="lastN">Most recent message IDs</option>
                  </select>
                </div>
                {mode === "range" ? (
                  <>
                    <div className="form-grid">
                      <div className="field">
                        <InfoLabel htmlFor="start-id" label="First message ID">
                          The first source message ID to check. The message ID
                          is the final number in a Telegram message link. This
                          message is included.
                        </InfoLabel>
                        <input
                          className="input"
                          id="start-id"
                          inputMode="numeric"
                          value={start}
                          onChange={(e) => setStart(e.target.value)}
                          placeholder="1"
                        />
                      </div>
                      <div className="field">
                        <InfoLabel htmlFor="end-id" label="Last message ID">
                          The last source message ID to check. It must be at or
                          after the first ID. This message is included.
                        </InfoLabel>
                        <input
                          className="input"
                          id="end-id"
                          inputMode="numeric"
                          value={end}
                          onChange={(e) => setEnd(e.target.value)}
                          placeholder="100"
                        />
                      </div>
                    </div>
                    <p className="helper">
                      In Telegram, copy a message link. Its last number is the
                      message ID: t.me/channel/<strong>123</strong>.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="field">
                      <InfoLabel
                        htmlFor="recent-count"
                        label="Number of recent message IDs"
                      >
                        Checks this many recent IDs, not a guaranteed number of
                        copied messages. Deleted or unavailable messages can
                        leave gaps. Starting sends a temporary source message
                        and tries to delete it.
                      </InfoLabel>
                      <input
                        className="input"
                        id="recent-count"
                        inputMode="numeric"
                        value={count}
                        onChange={(e) => setCount(e.target.value)}
                      />
                    </div>
                    <div className="alert alert-info">
                      <Icon name="info" />
                      <p>
                        When you start, the bot sends a temporary message to the
                        source to find the latest ID, then tries to delete it.
                        Members may see a notification.
                      </p>
                    </div>
                  </>
                )}
                <p className="helper">
                  Deleted, protected, or unavailable messages may be skipped.
                  Message IDs do not always equal the number of copyable
                  messages.
                </p>
              </section>
            )}
            {scope !== "backfill_only" && (
              <section
                className="new-message-filters stack"
                aria-labelledby="new-filters-title"
              >
                <div className="row wrap">
                  <h3 id="new-filters-title">New-message filters</h3>
                  <InfoTip label="New-message filters">
                    These choices apply only to messages received after the task
                    starts. Existing history is copied without filters. Leave
                    formats, message types, and file-size fields unselected to
                    copy all available new messages.
                  </InfoTip>
                </div>
                <p className="helper">
                  Optional. Existing history is copied without these filters.
                </p>
                <MediaFilterPicker
                  value={extensions}
                  onChange={setExtensions}
                  disabled={busy}
                />
                {media.length > 0 && extensions.length > 0 && (
                  <div className="alert alert-info">
                    <Icon name="info" />
                    <p>
                      Both filters must match. For example, an .mp4 sent as a
                      document is excluded if only Videos is checked. Leave
                      message types unchecked to match by file format alone.
                    </p>
                  </div>
                )}
                <details className="advanced-section">
                  <summary>
                    <Icon name="filter" size={17} />
                    Message types and file size
                  </summary>
                  <div className="stack">
                    <div className="row wrap">
                      <h4>Telegram message types</h4>
                      <InfoTip label="Telegram message types">
                        Telegram classifies each message by how it was sent,
                        separately from its file extension. A video uploaded as
                        a file is a Document, even if its filename ends in .mp4.
                        Leave these unchecked to allow every message type. If
                        you also select file formats, both filters must match.
                      </InfoTip>
                    </div>
                    <fieldset className="stack">
                      <legend className="sr-only">
                        Allowed Telegram message types
                      </legend>
                      <div className="row wrap">
                        {[
                          { id: "text", label: "Text" },
                          { id: "document", label: "Documents" },
                          { id: "video", label: "Videos" },
                          { id: "photo", label: "Photos" },
                          { id: "audio", label: "Audio" },
                          { id: "voice", label: "Voice messages" },
                          { id: "animation", label: "Animations" },
                        ].map((type) => (
                          <label className="check-row" key={type.id}>
                            <input
                              type="checkbox"
                              checked={media.includes(type.id)}
                              onChange={(event) =>
                                setMedia((values) =>
                                  event.target.checked
                                    ? [...values, type.id]
                                    : values.filter(
                                        (value) => value !== type.id,
                                      ),
                                )
                              }
                              disabled={busy}
                            />
                            {type.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <p className="helper">
                      Leave all unchecked to allow every message type.
                    </p>
                    <div className="form-grid">
                      <div className="field">
                        <InfoLabel
                          htmlFor="min-size"
                          label="Minimum file size (MB)"
                        >
                          Skip files smaller than this amount. Leave empty for
                          no minimum. Size limits apply only when Telegram
                          reports a file size. Messages without a reported size
                          are unaffected by this limit.
                        </InfoLabel>
                        <input
                          className="input"
                          id="min-size"
                          type="number"
                          min="0"
                          step="any"
                          value={minSize}
                          onChange={(event) => setMinSize(event.target.value)}
                          placeholder="No minimum"
                          disabled={busy}
                        />
                      </div>
                      <div className="field">
                        <InfoLabel
                          htmlFor="max-size"
                          label="Maximum file size (MB)"
                        >
                          Skip files larger than this amount. Leave empty for no
                          maximum. This checks the size reported by Telegram.
                        </InfoLabel>
                        <input
                          className="input"
                          id="max-size"
                          type="number"
                          min="0"
                          step="any"
                          value={maxSize}
                          onChange={(event) => setMaxSize(event.target.value)}
                          placeholder="No maximum"
                          disabled={busy}
                        />
                      </div>
                    </div>
                  </div>
                </details>
                {hasFilters && (
                  <button
                    type="button"
                    className="button button-ghost align-start"
                    onClick={() => {
                      setExtensions([]);
                      setMedia([]);
                      setMinSize("");
                      setMaxSize("");
                    }}
                    disabled={busy}
                  >
                    Clear all new-message filters
                  </button>
                )}
              </section>
            )}
            <div className="wizard-actions">
              <button
                className="button button-secondary"
                onClick={() => {
                  setError("");
                  setStep(1);
                }}
              >
                <Icon name="arrow-left" />
                Back
              </button>
              <button
                className="button button-primary"
                onClick={() => {
                  const invalid = validateMessages();
                  setError(invalid);
                  if (!invalid) setStep(3);
                }}
              >
                Review task
                <Icon name="arrow-right" />
              </button>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="stack">
            <div>
              <span className="eyebrow">STEP 4 OF 4</span>
              <h2
                className="card-title wizard-step-heading"
                tabIndex={-1}
                ref={stepHeadingRef}
              >
                Ready to start?
              </h2>
              <p className="text-muted">
                Review your task before copying begins.
              </p>
            </div>
            <div className="copy-route">
              <div>
                <span className="helper">FROM</span>
                <strong>{sourceChat?.chat.title || sourceChat?.chat.id}</strong>
              </div>
              <Icon name="arrow-right" />
              <div>
                <span className="helper">TO</span>
                <strong>{destChat?.chat.title || destChat?.chat.id}</strong>
              </div>
            </div>
            <dl className="review-list">
              <div>
                <dt>Bot</dt>
                <dd>@{selectedBot?.bot_username}</dd>
              </div>
              <div>
                <dt>Messages</dt>
                <dd>{SCOPE_LABELS[scope]}</dd>
              </div>
              {history && (
                <div>
                  <dt>History selection</dt>
                  <dd>
                    {mode === "range"
                      ? `Message IDs ${start} to ${end}`
                      : `${count} most recent message IDs`}
                  </dd>
                </div>
              )}
              <div>
                <dt>New message filters</dt>
                <dd>
                  {scope === "backfill_only"
                    ? "Not applicable"
                    : hasFilters
                      ? `${media.length ? media.join(", ") : "All message types"}${extensions.length ? ` · ${extensions.length} file formats selected` : " · Any format"}${minSize ? ` · min ${minSize} MB` : ""}${maxSize ? ` · max ${maxSize} MB` : ""}`
                      : "None"}
                </dd>
              </div>
            </dl>
            {history && mode === "lastN" && (
              <p className="alert alert-info">
                Starting will send and try to delete a temporary message in the
                source chat to find the latest ID.
              </p>
            )}
            <div className="field">
              <InfoLabel htmlFor="task-label" label="Task name (optional)">
                Give this task a name to recognise it later. Leave it empty to
                use the source and destination names.
              </InfoLabel>
              <input
                className="input"
                id="task-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={120}
                placeholder="Use chat names"
                disabled={busy}
              />
            </div>
            <div className="row wrap">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={saveSetup}
                  onChange={(event) => setSaveSetup(event.target.checked)}
                  disabled={busy}
                />
                Save this setup for next time
              </label>
              <InfoTip label="Save this setup">
                Keep the bot, source, destination, message selection, and
                filters as a reusable setup. Reusing it still asks you to review
                before another task starts.
              </InfoTip>
            </div>
            <details className="advanced-section">
              <summary>
                <Icon name="send" size={17} />
                Try one message first
              </summary>
              <div className="stack">
                <p className="helper">
                  This sends a real copy to the destination. The task may copy
                  it again if it falls within your selected range.
                </p>
                <div className="field">
                  <InfoLabel htmlFor="test-id" label="Source message ID">
                    Copy the link to a source message in Telegram and use its
                    final number. Sending a test creates a real copy in the
                    destination.
                  </InfoLabel>
                  <input
                    className="input"
                    id="test-id"
                    inputMode="numeric"
                    value={testId}
                    onChange={(e) => setTestId(e.target.value)}
                    disabled={busy}
                  />
                </div>
                <button
                  className="button button-secondary align-start"
                  disabled={!positive(testId) || busy}
                  onClick={() => setConfirmTest(true)}
                >
                  Send test copy
                </button>
                {testResult && (
                  <p className="alert alert-success" role="status">
                    {testResult}
                  </p>
                )}
              </div>
            </details>
            <div className="wizard-actions">
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setStep(2);
                }}
              >
                <Icon name="arrow-left" />
                Back
              </button>
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() => void create()}
              >
                <Icon name="play" />
                {busy ? "Starting…" : "Start copying"}
              </button>
            </div>
          </div>
        )}
      </section>
      {duplicate && (
        <Modal
          title="A task already uses these chats"
          busy={busy}
          onClose={() => setDuplicate(null)}
          actions={
            <>
              <a href={`#task/${duplicate}`} className="button button-primary">
                Open existing task
              </a>
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => {
                  setDuplicate(null);
                  void create(true);
                }}
              >
                Create another anyway
              </button>
            </>
          }
        >
          <p>
            Another task already copies from this source to this destination.
            Starting a second one can copy messages twice.
          </p>
        </Modal>
      )}
      {confirmTest && (
        <Modal
          title="Send a test copy?"
          onClose={() => setConfirmTest(false)}
          actions={
            <>
              <button
                className="button button-secondary"
                onClick={() => setConfirmTest(false)}
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                onClick={() => void testCopy()}
              >
                Send copy
              </button>
            </>
          }
        >
          <p>
            Message {testId} will be copied into{" "}
            <strong>{destChat?.chat.title || destChat?.chat.id}</strong>.
          </p>
        </Modal>
      )}
    </div>
  );
}
