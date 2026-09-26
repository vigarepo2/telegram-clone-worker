import type { TelegramMessage } from "../telegram/types";

export interface ExtensionGroup {
  id: string;
  label: string;
  icon: string;
  extensions: string[];
}

/** Categories organise choices, not content inspection. For example, an MP4
 * sent as a Telegram document still matches the mp4 extension selection. */
export const EXTENSION_GROUPS: ExtensionGroup[] = [
  {
    id: "photos",
    label: "Photos",
    icon: "photo",
    extensions: [
      "jpg",
      "jpeg",
      "jpe",
      "jfif",
      "png",
      "gif",
      "webp",
      "avif",
      "heic",
      "heif",
      "bmp",
      "dib",
      "tif",
      "tiff",
      "ico",
      "svg",
      "svgz",
      "raw",
      "cr2",
      "cr3",
      "nef",
      "nrw",
      "arw",
      "dng",
      "orf",
      "rw2",
      "raf",
      "pef",
      "srw",
      "exr",
      "hdr",
      "dds",
      "tga",
      "pcx",
      "ppm",
      "pgm",
      "pbm",
      "pnm",
    ],
  },
  {
    id: "videos",
    label: "Videos",
    icon: "video",
    extensions: [
      "mp4",
      "m4v",
      "mkv",
      "webm",
      "mov",
      "avi",
      "wmv",
      "flv",
      "f4v",
      "mpg",
      "mpeg",
      "mpe",
      "m2v",
      "3gp",
      "3g2",
      "ts",
      "mts",
      "m2ts",
      "vob",
      "ogv",
      "rm",
      "rmvb",
      "asf",
      "divx",
      "hevc",
      "h264",
      "h265",
      "mxf",
    ],
  },
  {
    id: "audio",
    label: "Audio",
    icon: "audio",
    extensions: [
      "mp3",
      "m4a",
      "aac",
      "flac",
      "wav",
      "ogg",
      "oga",
      "opus",
      "wma",
      "aif",
      "aiff",
      "alac",
      "amr",
      "ape",
      "au",
      "mid",
      "midi",
      "mka",
      "ac3",
      "dts",
      "pcm",
      "ra",
      "aax",
    ],
  },
  {
    id: "documents",
    label: "Documents",
    icon: "file",
    extensions: [
      "pdf",
      "doc",
      "docx",
      "odt",
      "rtf",
      "txt",
      "md",
      "xls",
      "xlsx",
      "xlsm",
      "ods",
      "csv",
      "tsv",
      "ppt",
      "pptx",
      "odp",
      "epub",
      "mobi",
      "azw",
      "azw3",
      "fb2",
      "djvu",
      "tex",
      "log",
      "rst",
      "pages",
      "numbers",
      "key",
    ],
  },
  {
    id: "archives",
    label: "Archives",
    icon: "archive",
    extensions: [
      "zip",
      "rar",
      "7z",
      "tar",
      "gz",
      "bz2",
      "xz",
      "zst",
      "tgz",
      "tbz2",
      "txz",
      "tar.gz",
      "tar.bz2",
      "tar.xz",
      "tar.zst",
      "lz",
      "lzma",
      "lzh",
      "cab",
      "iso",
      "img",
      "dmg",
      "wim",
      "arj",
      "ace",
      "cbr",
      "cbz",
    ],
  },
  {
    id: "code",
    label: "Code & data",
    icon: "code",
    extensions: [
      "html",
      "htm",
      "css",
      "js",
      "mjs",
      "cjs",
      "jsx",
      "ts",
      "tsx",
      "py",
      "pyw",
      "ipynb",
      "java",
      "class",
      "jar",
      "kt",
      "kts",
      "c",
      "cpp",
      "h",
      "hpp",
      "cs",
      "go",
      "rs",
      "rb",
      "php",
      "swift",
      "dart",
      "lua",
      "r",
      "sh",
      "bash",
      "ps1",
      "bat",
      "cmd",
      "sql",
      "json",
      "jsonl",
      "ndjson",
      "xml",
      "yaml",
      "yml",
      "toml",
      "ini",
      "conf",
      "cfg",
      "env",
      "lock",
      "wasm",
      "vue",
      "svelte",
      "map",
      "graphql",
      "gql",
      "proto",
    ],
  },
  {
    id: "fonts",
    label: "Fonts",
    icon: "edit",
    extensions: ["ttf", "otf", "woff", "woff2", "eot", "pfa", "pfb", "fon"],
  },
  {
    id: "design",
    label: "Design & 3D",
    icon: "palette",
    extensions: [
      "psd",
      "psb",
      "ai",
      "eps",
      "sketch",
      "fig",
      "xd",
      "indd",
      "idml",
      "afdesign",
      "afphoto",
      "afpub",
      "blend",
      "fbx",
      "obj",
      "stl",
      "3mf",
      "gltf",
      "glb",
      "dae",
      "dwg",
      "dxf",
      "step",
      "stp",
      "iges",
      "igs",
    ],
  },
  {
    id: "apps",
    label: "Apps & packages",
    icon: "monitor",
    extensions: [
      "apk",
      "aab",
      "apks",
      "xapk",
      "ipa",
      "exe",
      "msi",
      "msix",
      "appx",
      "deb",
      "rpm",
      "appimage",
      "crx",
      "xpi",
    ],
  },
  {
    id: "other",
    label: "Other files",
    icon: "folder",
    extensions: [
      "db",
      "sqlite",
      "sqlite3",
      "db3",
      "ics",
      "vcf",
      "torrent",
      "nzb",
      "pem",
      "crt",
      "cer",
      "p12",
      "pfx",
      "asc",
      "sig",
      "bin",
      "dat",
    ],
  },
];

// Some suffixes have multiple uses: .ts can be video transport stream or TypeScript.
export const ALL_EXTENSIONS: string[] = [
  ...new Set(EXTENSION_GROUPS.flatMap((group) => group.extensions)),
];
const SUPPORTED_EXTENSIONS = new Set(ALL_EXTENSIONS);
const LONGEST_EXTENSIONS_FIRST = [...ALL_EXTENSIONS].sort(
  (left, right) => right.length - left.length,
);

/** Empty means no restriction. Unsupported or malformed choices must fail,
 * rather than silently turning a restrictive selection into "all files". */
export function normalizeExtensionFilter(value: string): string | null {
  if (typeof value !== "string" || value.length > 4096)
    throw new TypeError("Choose supported file extensions.");
  if (!value.trim()) return null;
  const extensions = value
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/^\./, ""));
  if (extensions.some((extension) => !SUPPORTED_EXTENSIONS.has(extension)))
    throw new TypeError("Choose supported file extensions.");
  return [...new Set(extensions)].sort().join(",");
}

export function extensionFromFilename(filename: string): string | null {
  if (
    typeof filename !== "string" ||
    !filename ||
    filename.length > 4096 ||
    /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(filename)
  )
    return null;
  const name = filename.toLowerCase();
  return (
    LONGEST_EXTENSIONS_FIRST.find((extension) =>
      name.endsWith(`.${extension}`),
    ) ?? null
  );
}

// Specific reported formats only. Generic MIME types and ambiguous aliases
// (JPEG, plain text, octet-stream, etc.) do not identify a file extension.
const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/x-matroska": "mkv",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "application/zip": "zip",
  "application/x-7z-compressed": "7z",
  "application/vnd.rar": "rar",
  "application/x-rar-compressed": "rar",
  "application/epub+zip": "epub",
  "application/wasm": "wasm",
};

export function extensionFromMimeType(mimeType: string): string | null {
  const normalized = mimeType.split(";", 1)[0].trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(MIME_EXTENSIONS, normalized)
    ? MIME_EXTENSIONS[normalized]
    : null;
}

/** Uses Telegram-provided metadata, never a caption or a file URL. A present
 * filename always wins, even if its suffix is unknown. MIME fallback reports
 * a format, not the sender's original filename; it is not a file safety check. */
export function detectMessageExtension(
  message: TelegramMessage,
): string | null {
  const media =
    message.animation ??
    message.document ??
    message.video ??
    message.audio ??
    message.voice;
  if (!media) return null; // Telegram PhotoSize contains no filename or MIME type.
  if (
    "file_name" in media &&
    typeof media.file_name === "string" &&
    media.file_name.length > 0
  ) {
    return extensionFromFilename(media.file_name);
  }
  return typeof media.mime_type === "string"
    ? extensionFromMimeType(media.mime_type)
    : null;
}

export function matchesExtensionFilter(
  extension: string | null,
  selected: readonly string[],
): boolean {
  if (selected.length === 0) return true;
  if (extension === null) return false;
  return selected.some(
    (choice) => extension === choice || extension.endsWith(`.${choice}`),
  );
}
