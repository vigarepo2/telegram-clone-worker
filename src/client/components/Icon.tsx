import { useId, type SVGProps } from "react";

const files = import.meta.glob<string>("../../assets/icons/*.svg", {
  eager: true,
  query: "?raw",
  import: "default",
});
const marks = import.meta.glob<string>("../../assets/logo.svg", {
  eager: true,
  query: "?raw",
  import: "default",
});

// Only bundled assets can supply markup; icon names never become markup or URLs.
const artwork = new Map(
  Object.entries({ ...files, ...marks }).map(([path, svg]) => [
    path
      .split("/")
      .pop()!
      .replace(/\.svg$/, ""),
    svg.replace(/^[\s\S]*?<svg\b[^>]*>/i, "").replace(/<\/svg>\s*$/i, ""),
  ]),
);

export type IconName =
  | "activity"
  | "alert"
  | "animation"
  | "archive"
  | "arrow-down"
  | "arrow-left"
  | "arrow-repeat"
  | "arrow-right"
  | "arrow-up"
  | "arrow-up-right"
  | "audio"
  | "bell"
  | "bookmark"
  | "bot"
  | "calendar"
  | "channel"
  | "check"
  | "check-circle"
  | "check-square"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "chevron-up"
  | "clock"
  | "close"
  | "cloud"
  | "code"
  | "copy"
  | "database"
  | "details"
  | "download"
  | "edit"
  | "expand"
  | "external-link"
  | "eye"
  | "eye-off"
  | "file"
  | "filter"
  | "folder"
  | "globe"
  | "grid"
  | "help"
  | "history"
  | "home"
  | "inbox"
  | "info"
  | "key"
  | "link"
  | "list"
  | "loader"
  | "lock"
  | "logo"
  | "logout"
  | "menu"
  | "message"
  | "microphone"
  | "minus"
  | "monitor"
  | "moon"
  | "more"
  | "palette"
  | "panel-left"
  | "panel-top"
  | "pause"
  | "phone"
  | "photo"
  | "play"
  | "plus"
  | "refresh"
  | "save"
  | "search"
  | "send"
  | "settings"
  | "shield"
  | "stop"
  | "sun"
  | "tasks"
  | "trash"
  | "unlock"
  | "upload"
  | "user"
  | "users"
  | "video"
  | "volume"
  | "wifi"
  | "zap";

export interface IconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "children" | "dangerouslySetInnerHTML" | "name"
> {
  name: IconName | (string & {});
  size?: number | string;
  title?: string;
}

export function Icon({
  name,
  size = 20,
  title,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-hidden": ariaHidden,
  ...props
}: IconProps) {
  const titleId = useId();
  const label = ariaLabel?.trim();
  const titleText = title?.trim();
  const labelledBy = ariaLabelledBy || (titleText ? titleId : undefined);
  const hasLabel = Boolean(label || labelledBy);
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      focusable="false"
      aria-hidden={ariaHidden ?? (hasLabel ? undefined : true)}
      role={hasLabel ? "img" : undefined}
      aria-label={label}
      aria-labelledby={label ? undefined : labelledBy}
      className={className ? `icon ${className}` : "icon"}
    >
      {titleText && <title id={titleId}>{titleText}</title>}
      <g
        dangerouslySetInnerHTML={{
          __html: artwork.get(name) ?? artwork.get("info")!,
        }}
      />
    </svg>
  );
}

export default Icon;
