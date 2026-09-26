import type { CapabilityEntry } from "../../shared/rpcTypes";
import { Icon } from "./Icon";
export function CapabilityChecklist({
  capabilities,
}: {
  capabilities: CapabilityEntry[];
}) {
  return (
    <ul className="capability-list">
      {capabilities.map((item) => (
        <li key={item.key}>
          <Icon name={item.available ? "check-circle" : "info"} />
          <span>
            {item.label}
            {!item.available && item.reason && (
              <small className="text-muted">{item.reason}</small>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
