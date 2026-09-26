import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ALL_EXTENSIONS, EXTENSION_GROUPS } from "../../shared/mediaExtensions";
import { Icon } from "./Icon";
import { InfoTip } from "./InfoTip";
import "../styles/mediaFilters.css";

export function MediaFilterPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const [category, setCategory] = useState(EXTENSION_GROUPS[0].id);
  const [query, setQuery] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const id = useId();
  const tabsRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => new Set(value), [value]);
  const current =
    EXTENSION_GROUPS.find((group) => group.id === category) ??
    EXTENSION_GROUPS[0];
  const search = query.trim().toLowerCase().replace(/^\./, "");
  const visible = useMemo(() => {
    const base = search
      ? EXTENSION_GROUPS.flatMap((group) =>
          group.extensions.filter(
            (extension) =>
              extension.includes(search) ||
              group.label.toLowerCase().includes(search),
          ),
        )
      : current.extensions;
    return [
      ...new Set(
        selectedOnly
          ? (search ? base : ALL_EXTENSIONS).filter((extension) =>
              selected.has(extension),
            )
          : base,
      ),
    ];
  }, [search, current, selectedOnly, selected]);
  const visibleSelected = visible.filter((extension) =>
    selected.has(extension),
  ).length;
  const summary = value
    .slice(0, 5)
    .map((extension) => `.${extension}`)
    .join(", ");

  function toggle(extension: string, checked: boolean) {
    const next = new Set(value);
    if (checked) next.add(extension);
    else next.delete(extension);
    onChange([...next].sort());
  }
  function setVisible(checked: boolean) {
    const next = new Set(value);
    for (const extension of visible) {
      if (checked) next.add(extension);
      else next.delete(extension);
    }
    onChange([...next].sort());
  }
  function chooseCategory(next: string) {
    setCategory(next);
    setQuery("");
    setSelectedOnly(false);
  }
  function navigateTabs(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const count = EXTENSION_GROUPS.length;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? count - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + count) % count;
    chooseCategory(EXTENSION_GROUPS[next].id);
    tabsRef.current
      ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
      [next]?.focus();
  }

  return (
    <section className="media-filter-picker" aria-labelledby={`${id}-title`}>
      <div className="format-heading">
        <div className="format-heading-label">
          <h3 id={`${id}-title`}>File formats</h3>
          <InfoTip label="File formats">
            Choose file extensions for new messages. An extension identifies a
            format, such as .mp4 or .pdf. These choices match the filename or a
            specific format Telegram reports. Categories only organise the
            choices: an .mp4 file still matches when sent as a document. Leave
            every format unchecked to allow any format.
          </InfoTip>
        </div>
        <span
          className={`format-selection-count${value.length ? " has-selection" : ""}`}
        >
          {value.length ? `${value.length} selected` : "Any format"}
        </span>
      </div>
      <div
        className="format-tabs"
        role="tablist"
        aria-label="File format categories"
        ref={tabsRef}
      >
        {EXTENSION_GROUPS.map((group, index) => {
          const groupCount = group.extensions.filter((extension) =>
            selected.has(extension),
          ).length;
          return (
            <button
              type="button"
              key={group.id}
              id={`${id}-tab-${group.id}`}
              role="tab"
              aria-controls={`${id}-formats`}
              aria-selected={category === group.id}
              tabIndex={category === group.id ? 0 : -1}
              className={`format-tab${category === group.id ? " is-active" : ""}`}
              disabled={disabled}
              onClick={() => chooseCategory(group.id)}
              onKeyDown={(event) => navigateTabs(event, index)}
            >
              <Icon name={group.icon} size={17} />
              <span>{group.label}</span>
              {groupCount > 0 && (
                <span className="format-tab-count">{groupCount}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="format-toolbar">
        <div className="format-search">
          <Icon name="search" size={17} />
          <input
            id={`${id}-search`}
            className="input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${ALL_EXTENSIONS.length} formats`}
            aria-label="Search file formats across all categories"
            disabled={disabled}
          />
        </div>
        <button
          type="button"
          className={`button button-secondary button-sm${selectedOnly ? " is-active" : ""}`}
          aria-pressed={selectedOnly}
          onClick={() => setSelectedOnly(!selectedOnly)}
          disabled={disabled || (!value.length && !selectedOnly)}
        >
          Selected ({value.length})
        </button>
      </div>
      <div className="format-results-heading">
        <span id={`${id}-results-label`}>
          {selectedOnly
            ? "Selected formats"
            : search
              ? "Search results"
              : current.label}{" "}
          <small>({visible.length})</small>
        </span>
        <div className="format-bulk-actions">
          <button
            type="button"
            className="text-link"
            onClick={() => setVisible(true)}
            disabled={
              disabled || !visible.length || visibleSelected === visible.length
            }
          >
            {search || selectedOnly ? "Select results" : "Select category"}
          </button>
          <button
            type="button"
            className="text-link"
            onClick={() => setVisible(false)}
            disabled={disabled || !visibleSelected}
          >
            Clear {search || selectedOnly ? "results" : "category"}
          </button>
        </div>
      </div>
      <div
        id={`${id}-formats`}
        className="format-panel"
        role="tabpanel"
        aria-labelledby={
          search || selectedOnly
            ? `${id}-results-label`
            : `${id}-tab-${category}`
        }
      >
        {visible.length ? (
          <div className="format-chip-grid">
            {visible.map((extension) => (
              <label
                className={`format-chip${selected.has(extension) ? " is-selected" : ""}`}
                key={extension}
              >
                <input
                  type="checkbox"
                  checked={selected.has(extension)}
                  disabled={disabled}
                  onChange={(event) => toggle(extension, event.target.checked)}
                />
                <span>.{extension}</span>
                <Icon name="check" size={13} aria-hidden="true" />
              </label>
            ))}
          </div>
        ) : (
          <p className="format-no-results">
            {selectedOnly
              ? "No selected formats match this search."
              : "No formats match. Try a shorter extension or another category."}
          </p>
        )}
      </div>
      <div className="format-selection-summary" aria-live="polite">
        <p>
          {value.length ? (
            <>
              <strong>Only these formats:</strong> {summary}
              {value.length > 5 ? `, and ${value.length - 5} more` : ""}
            </>
          ) : (
            <>
              <strong>Any format.</strong> Select a checkbox to restrict which
              formats are copied.
            </>
          )}
        </p>
        {value.length > 0 && (
          <button
            type="button"
            className="text-link"
            disabled={disabled}
            onClick={() => {
              onChange([]);
              setSelectedOnly(false);
            }}
          >
            Allow any format
          </button>
        )}
      </div>
      <div className="format-photo-note">
        <Icon name="info" size={16} />
        <p>
          Regular Telegram photos may have no original filename or extension. A
          format selection skips those photos and other files with an unknown
          format. Choose <strong>Any format</strong> to include them, subject to
          your other filters.
        </p>
      </div>
    </section>
  );
}
