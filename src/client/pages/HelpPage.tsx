import { PageHero } from "../components/PageHero";
import { Icon } from "../components/Icon";
export function HelpPage() {
  return (
    <div className="content-container help-container">
      <PageHero
        title="How it works"
        subtitle="Copy messages between chats you manage."
      />
      <section className="card stack">
        <h2 className="card-title">Create a copy task</h2>
        <ol className="help-steps">
          <li>
            <strong>Create a Telegram bot</strong>
            <p>
              Open{" "}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
              >
                @BotFather
              </a>{" "}
              in Telegram. Send /newbot and follow the instructions. Copy the
              token it gives you.
            </p>
          </li>
          <li>
            <strong>Add the bot to your chats</strong>
            <p>
              Add it to the source and destination. In channels, make the bot an
              administrator. The destination needs permission to post messages.
            </p>
          </li>
          <li>
            <strong>Choose the chats and messages</strong>
            <p>
              Select <a href="#wizard">New task</a>, connect your bot, and enter
              both chat usernames or IDs. Choose existing messages, new
              messages, or both.
            </p>
          </li>
          <li>
            <strong>Review and start</strong>
            <p>
              Check the destination and message range, then start copying. You
              can close this page; tasks run on your deployment.
            </p>
          </li>
        </ol>
      </section>
      <section className="card stack">
        <h2 className="card-title">Common questions</h2>
        <details className="advanced-section">
          <summary>Where do I find a message ID?</summary>
          <p>
            Copy a message’s link in Telegram. The final number is its ID. For
            example, the ID in t.me/example/123 is 123. A private channel link
            can look like t.me/c/1234567890/123.
          </p>
        </details>
        <details className="advanced-section">
          <summary>How do I find a private channel ID?</summary>
          <p>
            Copy a message link from the private channel. For a link like
            t.me/c/1234567890/123, use -1001234567890 as the channel ID. The
            last number, 123, is the message ID. The bot must be added to that
            channel first.
          </p>
        </details>
        <details className="advanced-section">
          <summary>What does “most recent message IDs” do?</summary>
          <p>
            The bot posts a temporary message to the source, reads its ID, then
            tries to delete it. This needs posting permission and may trigger a
            notification. A manual ID range avoids this check.
          </p>
        </details>
        <details className="advanced-section">
          <summary>Why are some messages skipped?</summary>
          <p>
            Deleted messages, protected content, and some service messages
            cannot be copied. Bots may not receive messages sent by other bots
            in groups. Gaps between message IDs are normal.
          </p>
        </details>
        <details className="advanced-section">
          <summary>When are new messages copied?</summary>
          <p>
            The deployment checks Telegram on a schedule, normally once a
            minute. New messages wait while an existing-history copy finishes.
            Telegram limits can add delays.
          </p>
        </details>
        <details className="advanced-section">
          <summary>
            Can I use a bot that is already connected elsewhere?
          </summary>
          <p>
            A dedicated bot is the simplest option. Telegram allows one update
            receiver per bot. Another app using the same bot can prevent new
            messages from reaching this workspace. Check Bots → Activity for
            connection details.
          </p>
        </details>
        <details className="advanced-section">
          <summary>How do I replace an invalid bot token?</summary>
          <p>
            Get a new token from BotFather. Open Bots → Connect bot and paste
            the replacement token for the same bot. The existing bot record is
            updated.
          </p>
        </details>
        <details className="advanced-section">
          <summary>Do filters apply to old messages?</summary>
          <p>
            No. Type and file-size filters apply to new messages. Existing
            history is copied without those filters.
          </p>
        </details>
        <details className="advanced-section">
          <summary>Will deleting a task delete Telegram messages?</summary>
          <p>
            No. Deleting a task removes it from this workspace. Messages already
            copied to Telegram stay in the destination.
          </p>
        </details>
      </section>
      <section className="card">
        <div className="row">
          <Icon name="info" />
          <h2 className="card-title">About this project</h2>
        </div>
        <p className="text-muted">
          Telegram Copy is a self-hosted tool based on Telegram Clone Worker by{" "}
          <a
            href="https://github.com/iamLiquidX"
            target="_blank"
            rel="noopener noreferrer"
          >
            iamLiquidX
          </a>
          . It is not affiliated with Telegram.
        </p>
        <a
          className="text-link"
          href="https://github.com/vigarepo2/telegram-clone-worker"
          target="_blank"
          rel="noopener noreferrer"
        >
          View repository
          <Icon name="external-link" size={15} />
        </a>
      </section>
    </div>
  );
}
