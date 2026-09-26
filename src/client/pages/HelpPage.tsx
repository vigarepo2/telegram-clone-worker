import { PageHero } from "../components/PageHero";
import { Icon } from "../components/Icon";

const sections = [
  {
    title: "Getting started",
    questions: [
      {
        question: "What do I need?",
        answer:
          "A Telegram bot and two chats it can access. The source is the chat you copy from. The destination is where the copies appear. In channels, add the bot as an administrator and let it post in the destination.",
      },
      {
        question: "Where do I get a bot token?",
        answer:
          "Open the verified @BotFather account in Telegram, send /newbot, and follow its instructions. Copy the token it gives you, then paste it into Bots → Connect bot here. Keep this token private: it gives control of your bot.",
      },
      {
        question: "Where do I find a chat ID?",
        answer:
          "For a public channel, paste its @username or Telegram link. For a private channel, copy a message link. A link such as t.me/c/1234567890/456 belongs to chat -1001234567890; 456 is the message ID. Add your bot to the chat before checking it here.",
      },
    ],
  },
  {
    title: "Copying messages",
    questions: [
      {
        question: "Which messages should I choose?",
        answer:
          "Existing messages copies a chosen part of the chat’s history once. New messages keeps copying posts as they arrive. Both copies your chosen history first, then continues with new posts.",
      },
      {
        question: "What is a message ID?",
        answer:
          "It is the final number in a Telegram message link. For t.me/example/123, the ID is 123. Enter the first and last IDs to choose a history range. Deleted or unavailable posts can leave gaps, so a range of 100 IDs may produce fewer than 100 copies.",
      },
      {
        question: "What happens when I choose recent messages?",
        answer:
          "The bot posts a temporary message in the source to find its latest message number, then tries to delete it. Members may see a notification. Enter a message ID range yourself if you want to avoid this check.",
      },
      {
        question: "Can I close this website?",
        answer:
          "Yes. Tasks run on your Cloudflare deployment, normally checking for work once a minute. Your phone does not need to stay online. Telegram limits or a large history can add delays.",
      },
      {
        question: "What do Pause and Resume do?",
        answer:
          "Pause stops further copying; a request already in progress may still finish. Resume continues from the saved position. Telegram keeps incoming bot updates for a limited time, so a long pause may miss new posts.",
      },
      {
        question: "What is a saved setup?",
        answer:
          "It remembers your bot, chats, and message choices for another task. It does not run by itself. Open it from Saved and review the range before starting again, because copying the same range twice can create duplicates.",
      },
      {
        question: "Do filters apply to existing messages?",
        answer:
          "No. Filters apply only to new messages. Existing history is copied without them. Filters choose which posts to copy; they do not convert files or change their quality.",
      },
    ],
  },
  {
    title: "When something needs attention",
    questions: [
      {
        question: "Why is copying waiting or skipping messages?",
        answer:
          "Telegram may ask the bot to wait before sending more. The task keeps its place and retries after that wait. Deleted posts, protected content, some group messages, and your new-message filters can cause skips. Open the task to see its latest result.",
      },
      {
        question: "My task is active but nothing arrives. What should I check?",
        answer:
          "Check that the bot still belongs to both chats and can post in the destination. Confirm the chat IDs and look at the task’s latest result. New-message tasks wait for a new post; they do not automatically copy old ones. New posts also wait while a history copy finishes.",
      },
      {
        question: "What if another app uses the same bot?",
        answer:
          "Use a separate bot for this website when possible. Two apps receiving the same bot’s updates can interrupt each other. Bots → Status shows whether another service has a direct connection. Disconnect it only if you want that service to stop receiving updates.",
      },
      {
        question: "How do I replace an invalid bot token?",
        answer:
          "Get a replacement token for the same bot from BotFather. Open Bots → Connect bot and paste it here. The saved connection is updated. Then open any stopped tasks and resume them after checking their settings.",
      },
      {
        question: "What happens when I delete a task or bot?",
        answer:
          "Deleting a task removes its settings, progress, and activity here. Removing a bot also removes its tasks. Messages already copied to Telegram remain there. Changes or deletions in the source do not update copies that already exist.",
      },
    ],
  },
];

export function HelpPage() {
  return (
    <div className="content-container help-container stack">
      <PageHero
        title="Help"
        subtitle="A short guide to copying between your Telegram chats."
      />
      <section className="card stack">
        <h2 className="card-title">Start your first task</h2>
        <ol className="help-steps">
          <li>
            <strong>Connect a bot</strong>
            <p>
              Get a token from{" "}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
              >
                BotFather
              </a>
              , then add it in <a href="#bots">Bots</a>.
            </p>
          </li>
          <li>
            <strong>Choose the chats</strong>
            <p>
              Add the bot to both chats. Open <a href="#wizard">New task</a> and
              choose where to copy from and to.
            </p>
          </li>
          <li>
            <strong>Choose your messages</strong>
            <p>
              Select existing messages, new ones, or both. Review the
              destination, then start.
            </p>
          </li>
        </ol>
      </section>
      {sections.map((section) => (
        <section className="card faq-group" key={section.title}>
          <h2>{section.title}</h2>
          {section.questions.map((item) => (
            <details className="faq-item" key={item.question}>
              <summary>
                {item.question}
                <Icon name="chevron-down" size={18} />
              </summary>
              <div className="help-answer">
                <p>{item.answer}</p>
              </div>
            </details>
          ))}
        </section>
      ))}
      <p className="helper">
        Your workspace password protects this website. It is separate from your
        Telegram password and bot token. Anyone with the workspace password can
        manage its bots and tasks.
      </p>
      <p className="help-credit">
        Based on Telegram Clone Worker by{" "}
        <a
          href="https://github.com/iamLiquidX"
          target="_blank"
          rel="noopener noreferrer"
        >
          iamLiquidX
        </a>
        . Not affiliated with Telegram.{" "}
        <a
          href="https://github.com/vigarepo2/telegram-clone-worker"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source code
        </a>
        .
      </p>
    </div>
  );
}
