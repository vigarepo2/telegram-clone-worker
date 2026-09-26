import type { ErrorReason } from "../../shared/rpcTypes";
import { Icon } from "./Icon";
const help: Record<ErrorReason, string> = {
  insufficient_permissions: "Check the bot’s admin permissions in Telegram.",
  bot_not_in_chat: "Add the bot to this chat in Telegram, then try again.",
  rate_limited:
    "Telegram has asked this bot to wait. Copying will retry automatically.",
  invalid_request: "Check the information below and try again.",
  unauthorized:
    "This bot token is no longer valid. Reconnect the bot with a current token.",
  unknown: "This action could not be completed.",
};
export function PermissionErrorBanner({
  reason,
  description,
}: {
  reason: ErrorReason;
  description: string;
}) {
  return (
    <div className="alert alert-error" role="alert">
      <Icon name="alert" />
      <div>
        <p>{help[reason]}</p>
        <p className="helper">{description}</p>
      </div>
    </div>
  );
}
