import { useMemo, useState } from "react";
import { PageHero } from "../components/PageHero";
import { Icon } from "../components/Icon";
import "../styles/help.css";

type Category =
  | "Getting started"
  | "Choosing messages"
  | "Files and filters"
  | "Fixing a problem"
  | "Privacy and settings";
type Question = {
  id: string;
  category: Category;
  question: string;
  answer: string[];
  keywords?: string;
  link?: { label: string; href: string };
};
const categories: Category[] = [
  "Getting started",
  "Choosing messages",
  "Files and filters",
  "Fixing a problem",
  "Privacy and settings",
];
const questions: Question[] = [
  {
    id: "purpose",
    category: "Getting started",
    question: "What does this website do?",
    answer: [
      "It copies messages from one Telegram chat into another. You choose the chat to copy from, the chat to copy to, and which messages you want. These instructions are saved as a task.",
      "You can copy messages that already exist, keep copying new messages, or do both. Your bot needs access to both chats.",
    ],
    keywords: "clone sync source destination",
  },
  {
    id: "bot",
    category: "Getting started",
    question: "What is a bot, and why do I need one?",
    answer: [
      "A bot is a Telegram account that can follow instructions from an app. This website uses your bot to read the chats it can access and make copies in the destination.",
      "Use a bot made for this website. Sharing one bot with another app can interrupt new-message copying.",
    ],
    link: { label: "Connect a bot", href: "#bots" },
  },
  {
    id: "token",
    category: "Getting started",
    question: "How do I get a bot token?",
    answer: [
      "Open the verified @BotFather account in Telegram. Send /newbot, then follow its instructions to choose a name and username. BotFather gives you a long string containing numbers, a colon, and letters. That is your bot token.",
      "Copy the whole token. Open Bots here, choose Connect bot, and paste it. Keep the token private: it gives control of your bot.",
    ],
    link: {
      label: "Open BotFather in Telegram",
      href: "https://t.me/BotFather",
    },
    keywords: "password secret key create",
  },
  {
    id: "chats",
    category: "Getting started",
    question: "What do source and destination mean?",
    answer: [
      "Source means the chat you want to copy from. Destination means the chat where the copies should appear.",
      "For example, to copy posts from an old channel into a new one, the old channel is the source and the new channel is the destination. Check them carefully before starting.",
    ],
    keywords: "from to channel group",
  },
  {
    id: "permissions",
    category: "Getting started",
    question: "How do I give my bot access to a channel?",
    answer: [
      "Open the channel in Telegram, open its settings, and add your bot as an administrator. Do this in both the source and destination. In the destination, allow the bot to post messages.",
      "Checking the latest message number also posts a temporary message in the source, so that option needs posting access there. Telegram groups have different permissions and may not expose every message to bots.",
    ],
    keywords: "rights admin member private group",
  },
  {
    id: "first-task",
    category: "Getting started",
    question: "How do I start my first copy?",
    answer: [
      "Choose New task. Select a connected bot, then enter the chat to copy from and the chat to copy to. Check both chats when prompted.",
      "Choose existing messages, new messages, or both. Review the destination and your choices, then start. The task page shows progress and anything that needs your attention.",
    ],
    link: { label: "Create a task", href: "#wizard" },
  },
  {
    id: "chat-id",
    category: "Getting started",
    question: "Where do I find a chat username or ID?",
    answer: [
      "For a public channel, use its username, such as @example. You can find it in the channel’s Telegram link.",
      "For a private channel, copy a message link. If it looks like t.me/c/1234567890/456, use -1001234567890 as the chat ID. The last number, 456, is the message ID. The bot must already belong to the channel.",
    ],
    keywords: "number link private source destination",
  },
  {
    id: "scope",
    category: "Choosing messages",
    question: "Should I choose existing messages, new messages, or both?",
    answer: [
      "Existing messages copies a range of posts already in the source, then finishes. New messages keeps watching for posts that arrive while the task is active.",
      "Both first copies your chosen history, then continues with new posts. New posts wait until the history finishes so they can follow it in order.",
    ],
    keywords: "scope live backfill historical old future",
  },
  {
    id: "range",
    category: "Choosing messages",
    question: "What are the first and last message IDs?",
    answer: [
      "They are the numbers that mark the start and end of the history you want to copy. Copy a message’s link in Telegram: its final number is the message ID. For t.me/example/123, the ID is 123.",
      "A range from 100 to 200 includes both ends. Some numbers may belong to deleted posts or messages Telegram cannot copy, so 101 IDs may produce fewer than 101 copies.",
    ],
    keywords: "start end number range count",
  },
  {
    id: "recent",
    category: "Choosing messages",
    question: "What happens when I choose the most recent messages?",
    answer: [
      "The bot finds the latest message number by posting a temporary message in the source, then trying to remove it. Members may briefly see that message or receive a notification.",
      "The count is a range of message IDs, not a guarantee of that many visible posts. To avoid posting the temporary message, enter the first and last IDs yourself.",
    ],
    keywords: "last N latest probe check",
  },
  {
    id: "background",
    category: "Choosing messages",
    question: "Can I close the website while a task runs?",
    answer: [
      "Yes. Copying runs on your Cloudflare deployment, so your phone or browser does not need to stay open.",
      "The deployment normally checks for work once a minute. Telegram waiting periods or a large history can make copying take longer.",
    ],
    keywords: "offline close browser phone schedule speed cron",
  },
  {
    id: "pause",
    category: "Choosing messages",
    question: "What does Pause do?",
    answer: [
      "Pause stops further copying for that part of the task. A request already being processed may still finish. Resume continues from the saved position.",
      "On the task page, existing-message copying and new-message copying have separate controls. New messages may wait while the history is paused. Telegram only keeps incoming bot updates for a limited time, so do not rely on a long pause to preserve every new post.",
    ],
    keywords: "stop resume hold live history",
  },
  {
    id: "saved",
    category: "Choosing messages",
    question: "What is a saved setup?",
    answer: [
      "A saved setup remembers your bot, chats, and copy choices so you can fill in a new task more quickly. It does not run by itself.",
      "Review the message range before starting again. Reusing a range can copy the same messages a second time.",
    ],
    link: { label: "Open saved setups", href: "#saved-tasks" },
    keywords: "template reuse duplicate",
  },
  {
    id: "changes",
    category: "Choosing messages",
    question: "Will edits and deletions stay in sync?",
    answer: [
      "No. This app creates copies. Editing or deleting a source post later does not update or remove a copy that has already been made.",
    ],
    keywords: "mirror edit delete synchronize",
  },
  {
    id: "filters",
    category: "Files and filters",
    question: "Do filters apply to old messages?",
    answer: [
      "No. File-type, file-size, and file-format filters apply to new messages received by the task. Existing messages are copied without these filters.",
      "If you only want filtered new posts, choose New messages. Choose Both only if you also want the selected history copied without filtering.",
    ],
    keywords: "filter extension minimum maximum format existing backfill",
  },
  {
    id: "media",
    category: "Files and filters",
    question: "What do the optional Telegram message types mean?",
    answer: [
      "The optional Telegram message type setting uses the way a sender uploaded a post. A picture sent as a photo is different from the same picture sent as a file. Telegram calls uploaded files documents.",
      "These message types are separate from the file format groups. An .mp4 uploaded as a file matches the Videos format group, but its Telegram message type is Document. Leave message types unrestricted unless you need both checks.",
    ],
    keywords: "media gif animation voice audio music",
  },
  {
    id: "extensions",
    category: "Files and filters",
    question: "What does a file format filter do?",
    answer: [
      "An extension is the ending of a filename, such as .pdf, .mp4, or .zip. A file format filter checks that ending to decide whether to copy a new file. It does not search for words in the filename.",
      "It does not convert a file. Choosing PDF cannot turn a photo into a PDF. When there is no filename, the app uses Telegram’s format information if it identifies a supported format. Media with no usable name or format is skipped while an extension filter is active.",
    ],
    keywords: "extension document convert format filename pdf zip mp4 mkv",
  },
  {
    id: "size",
    category: "Files and filters",
    question: "How do minimum and maximum file size work?",
    answer: [
      "Minimum size skips smaller files. Maximum size skips larger ones. Leave a limit empty if you do not need it. The maximum must be at least the minimum.",
      "These checks use the size Telegram provides. If Telegram does not provide a file size, the size rule cannot be checked. The message can still pass if it matches your other filters.",
    ],
    keywords: "MB megabytes size bytes limits",
  },
  {
    id: "quality",
    category: "Files and filters",
    question: "Does copying change file quality or format?",
    answer: [
      "This app asks Telegram to copy the message. It does not download, compress, rename, or convert the file itself.",
      "What can be copied depends on Telegram and the source’s settings. Protected content and some message types cannot be copied.",
    ],
    keywords: "resolution video photos compression convert",
  },
  {
    id: "skipped",
    category: "Fixing a problem",
    question: "Why were some messages skipped?",
    answer: [
      "The source may contain deleted messages, service notices, protected content, or other posts Telegram will not copy. Gaps in message numbers are normal.",
      "For new posts, your filters can also skip messages. Open the task to check its copied, skipped, and error counts before changing your range.",
    ],
    keywords: "failed missing unavailable protected",
  },
  {
    id: "waiting",
    category: "Fixing a problem",
    question: "Why does a task say it is waiting for Telegram?",
    answer: [
      "Telegram limits how quickly a bot can send messages. When it asks the app to wait, the task keeps its place and tries again after that waiting period.",
      "Repeatedly stopping, restarting, or creating another copy task usually will not make the limit go away. Let the waiting period finish.",
    ],
    keywords: "429 rate cooldown slow delayed speed",
  },
  {
    id: "nothing",
    category: "Fixing a problem",
    question:
      "My task is active, but nothing is being copied. What should I check?",
    answer: [
      "Check that the bot is still in both chats and can post in the destination. Confirm the source and destination IDs. If you chose New messages, an old post will not start a new copy.",
      "Open the task for its latest result. A new post may be waiting for the next check, for history to finish, or for Telegram’s waiting period to end. Your filters may also exclude it.",
    ],
    link: { label: "View active tasks", href: "#" },
    keywords: "not working empty no output stuck",
  },
  {
    id: "another-service",
    category: "Fixing a problem",
    question: "What does “connected to another service” mean?",
    answer: [
      "Another app is set to receive this bot’s new-message notifications. Telegram calls this connection a webhook. This website cannot receive those notifications at the same time.",
      "The easiest fix is a separate bot for this website. Only disconnect the other service if you understand that its bot features will stop receiving updates. A status check cannot detect every other app that is polling the bot.",
    ],
    link: { label: "Check your bots", href: "#bots" },
    keywords: "webhook conflict 409 polling connected",
  },
  {
    id: "replace-token",
    category: "Fixing a problem",
    question: "How do I replace an invalid or leaked bot token?",
    answer: [
      "Use BotFather in Telegram to replace the token for that bot. Then open Bots → Connect bot here and paste the new token for the same bot. Its saved connection is updated.",
      "If tasks stopped because the old token was invalid, check their settings and resume them after reconnecting.",
    ],
    link: { label: "Open bots", href: "#bots" },
    keywords: "401 unauthorized revoked secret token",
  },
  {
    id: "partial",
    category: "Fixing a problem",
    question: "Why did copying stop partway through a range?",
    answer: [
      "Telegram sometimes reports that only part of a group of messages could be sent, without telling the app exactly which copies arrived. The task stops and keeps the range in place so it does not quietly skip the rest.",
      "Check the destination before resuming. If some messages arrived, adjust the first remaining message ID carefully to avoid duplicates.",
    ],
    keywords: "partial error ambiguous batch duplicate resume",
  },
  {
    id: "groups",
    category: "Fixing a problem",
    question: "Why are group messages different from channel posts?",
    answer: [
      "Telegram decides which group messages a bot can receive. Its administrator permissions and privacy setting can affect this. Bots also may not receive posts sent by other bots.",
      "Check the bot’s permissions in Telegram and its privacy settings in BotFather. A successful connection check does not guarantee access to every past group message.",
    ],
    keywords: "privacy mode missing group supergroup history bot",
  },
  {
    id: "delete",
    category: "Privacy and settings",
    question: "What happens when I delete a task, bot, or saved setup?",
    answer: [
      "Deleting a task removes its settings, progress, and activity from this website. Removing a bot also deletes its tasks. Removing a saved setup only removes that reusable setup.",
      "None of these actions deletes messages already copied into Telegram. Removing a bot here also does not delete the Telegram bot itself.",
    ],
    keywords: "remove trash permanent",
  },
  {
    id: "password",
    category: "Privacy and settings",
    question: "Is this my Telegram password?",
    answer: [
      "No. Your workspace password protects this website. A bot token controls your Telegram bot. They are different credentials, and this app does not ask for your personal Telegram account password or login code.",
      "You can change the workspace password in Settings. Changing it signs out other sessions.",
    ],
    link: { label: "Open settings", href: "#settings" },
    keywords: "login sign in secret security access",
  },
  {
    id: "setup-code",
    category: "Privacy and settings",
    question: "Why do I need a setup code the first time?",
    answer: [
      "The setup code proves you control the Cloudflare deployment. It stops a stranger from opening your new website first and choosing its password.",
      "The first setup screen shows where to find the code in your private Cloudflare database. You use it once, then sign in with your chosen workspace password.",
    ],
    keywords: "claim owner D1 database first deploy env variables",
  },
  {
    id: "stored",
    category: "Privacy and settings",
    question: "Where are my tokens and settings stored?",
    answer: [
      "Bot tokens, tasks, and saved setups are stored in the database attached to your Cloudflare deployment. The browser receives a sign-in cookie instead of storing your password as a login token.",
      "Only give trusted people access to the website password or your Cloudflare account. A bot token can still be read by someone who has access to the deployment’s database.",
    ],
    keywords: "private storage secrets encryption cloudflare D1",
  },
  {
    id: "appearance",
    category: "Privacy and settings",
    question: "Will changing the theme affect copying?",
    answer: [
      "No. Appearance settings change how the website looks and how much space its controls use. They do not change bots, message ranges, or running tasks.",
      "Appearance settings are saved for this workspace and are shared across devices when you sign in. The sign-in screen uses its own default style.",
    ],
    link: { label: "Choose an appearance", href: "#settings" },
    keywords: "theme layout font text size compact density motion dark light",
  },
  {
    id: "public",
    category: "Privacy and settings",
    question: "Can I share the website address?",
    answer: [
      "Someone who opens the address still needs the workspace password to use your bots and tasks. This is one shared workspace, not separate accounts for each visitor.",
      "Sharing the password gives access to the workspace. Publishing the project’s source code does not require publishing your bot tokens or database contents.",
    ],
    keywords: "public github repo multiuser account share",
  },
];

export function HelpPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "All">("Getting started");
  const search = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      questions.filter(
        (item) =>
          (category === "All" || item.category === category) &&
          (!search ||
            `${item.question} ${item.answer.join(" ")} ${item.keywords ?? ""}`
              .toLowerCase()
              .includes(search)),
      ),
    [category, search],
  );
  return (
    <div className="content-container help-container stack">
      <PageHero
        title="Help"
        subtitle="Set up your first task, understand an option, or fix a problem."
      />
      <div className="help-start-grid">
        <a
          className="help-start-card"
          href="https://t.me/BotFather"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="bot" />
          <div>
            <strong>1. Create a bot</strong>
            <p>Get a bot token from Telegram’s BotFather.</p>
          </div>
        </a>
        <a className="help-start-card" href="#bots">
          <Icon name="link" />
          <div>
            <strong>2. Connect it here</strong>
            <p>Add the bot to both chats, then save its token.</p>
          </div>
        </a>
        <a className="help-start-card" href="#wizard">
          <Icon name="copy" />
          <div>
            <strong>3. Choose what to copy</strong>
            <p>Pick your chats and messages. Review, then start.</p>
          </div>
        </a>
      </div>
      <section className="card stack" aria-label="Find help">
        <div className="field">
          <label className="form-label" htmlFor="faq-search">
            Search questions
          </label>
          <div className="faq-search">
            <Icon name="search" />
            <input
              id="faq-search"
              type="search"
              className="input"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCategory("All");
              }}
              placeholder="Try bot token, skipped messages, or filters"
            />
            {query && (
              <button
                type="button"
                className="icon-button"
                aria-label="Clear help search"
                onClick={() => setQuery("")}
              >
                <Icon name="close" size={17} />
              </button>
            )}
          </div>
        </div>
        <div className="faq-categories" aria-label="Help categories">
          {(["All", ...categories] as const).map((item) => (
            <button
              key={item}
              type="button"
              className="faq-category"
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <p className="faq-result-count" role="status">
          {matches.length} {matches.length === 1 ? "answer" : "answers"}
          {search ? ` for “${query.trim()}”` : ""}
        </p>
      </section>
      {categories.map((group) => {
        const items = matches.filter((item) => item.category === group);
        return items.length ? (
          <section className="card faq-group" key={group}>
            <h2>{group}</h2>
            {items.map((item) => (
              <details
                className="faq-item"
                key={item.id}
                open={search ? true : undefined}
              >
                <summary>
                  {item.question}
                  <Icon name="chevron-down" size={18} />
                </summary>
                <div className="help-answer">
                  {item.answer.map((answer) => (
                    <p key={answer}>{answer}</p>
                  ))}
                  {item.link && (
                    <a
                      href={item.link.href}
                      {...(item.link.href.startsWith("https:")
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                    >
                      {item.link.label}
                    </a>
                  )}
                </div>
              </details>
            ))}
          </section>
        ) : null;
      })}
      {!matches.length && (
        <section className="card faq-empty">
          <Icon name="search" size={28} />
          <h2>No matching questions</h2>
          <p>
            Try a shorter word, such as “token” or “pause”, or show all
            categories.
          </p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setQuery("");
              setCategory("All");
            }}
          >
            Show all answers
          </button>
        </section>
      )}
      <p className="help-credit">
        Telegram Copy is based on Telegram Clone Worker by{" "}
        <a
          href="https://github.com/iamLiquidX"
          target="_blank"
          rel="noopener noreferrer"
        >
          iamLiquidX
        </a>
        . It is not affiliated with Telegram.{" "}
        <a
          href="https://github.com/vigarepo2/telegram-clone-worker"
          target="_blank"
          rel="noopener noreferrer"
        >
          View source code
        </a>
        .
      </p>
    </div>
  );
}
