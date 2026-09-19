# Configuration reference — version 1

## Direct names

Write model and harness names directly in each entry: `model: Claude Opus 5`, `harness: Pi`, or `models: [{model: GPT Sol 5.6, role: Light coding}]`. No model/harness catalogs or icon fields are needed. Reusing the exact same name consolidates totals; different version names remain distinct. Categories accept a simple mapping such as `code: Code` and `chat: Chat`.

Legacy version 1 files with root `models` or `harnesses` catalogs remain supported. When a catalog is present, its entry fields are interpreted as catalog IDs and unknown references are rejected. The tables below also document this legacy format.

## Root

| Key | Type | Meaning |
| --- | --- | --- |
| `version` | integer | Required, exactly `1`. |
| `site` | mapping | Optional `title`, `description`, `author`; defaults supplied. |
| `models` | mapping | Model IDs → catalog objects. |
| `harnesses` | mapping | Harness IDs → catalog objects. |
| `categories` | mapping | User-defined activity IDs → catalog objects; each activity is a timeline row, in declaration order. |
| `entries` | list | Usage periods. |

Catalogs and entries default to empty. Only documented keys are accepted. IDs use 1–80 ASCII letters, digits, `_` or `-`. Catalog IDs are independent; entry IDs must be unique. Explicit text values must be nonblank and at most 4,000 characters; omit optional text instead of writing empty strings. YAML anchors/aliases and duplicate keys are rejected.

## Catalog objects

Same structure for models, harnesses and categories:

| Key | Required | Meaning |
| --- | --- | --- |
| `name` | Yes | Display name, any text. Quote numeric names. |
| `color` | No | Exactly `'#RRGGBB'`; quote because `#` starts a YAML comment. |
| `icon` | No | Named shortcut or arbitrary text/Unicode symbol. |
| `provider` | No | Optional preset key; arbitrary values allowed. |

Provider defaults: `openai` → `#85b5ae`, `anthropic` → `#d9ac80`, `google` → `#90aac8`, `meta` → `#b49ace`, `mistral` → `#d8be78`, `local` → `#b5b986`. Explicit color wins. Unknown providers get a palette color by catalog order. Set colors explicitly to keep them stable when reordering. Presets do not infer the model or restrict your choices. Category colors are currently metadata; filter buttons use the theme accent.

| Shortcut | Symbol | Shortcut | Symbol |
| --- | --- | --- | --- |
| `code` | ⌘ | `chat` | ◌ |
| `research` | ⌕ | `image` | ▧ |
| `audio` | ♫ | `agent` | ◇ |
| `terminal` | ›_ | `ide` | ▣ |
| `web` | ◎ | `experiment` | ⚗ |
| `production` | ◆ | `archive` | ▤ |

Adoption stages can be custom categories: experimental, production, retired, etc. Release generations can be part of a model's name or tags. No lifecycle is imposed. Category symbols use local system fonts. Model and harness logos are matched by name to bundled Lobe SVGs; unknown names or missing assets use a character fallback. Legacy model/harness icon fields remain accepted, but automatic name matching controls the rendered logo.

## Entries

| Key | Required | Meaning |
| --- | --- | --- |
| `id` | Yes | Stable unique ID for the period. |
| `title` | Yes | Short period label. |
| `start` | Yes | `YYYY-MM-DD`, quoted or native YAML date. |
| `end` | No | Inclusive date ≥ start. Omit or use `null` for ongoing. |
| `model` | Model(s) and/or harness | Single model ID; mutually exclusive with `models`. |
| `models` | Model(s) and/or harness | Non-empty list of up to 30 mappings: required `model` ID and optional `role` text. |
| `harness` | Model and/or harness | Reference to a harness ID. |
| `category` | No | Category ID; defaults to Uncategorized. |
| `notes` | No | Plain text; `|` for multiline. No HTML/Markdown rendering. |
| `tags` | No | List of up to 30 text labels. |
| `url` | No | HTTP or HTTPS link to related work. |

With model references and a harness, the entry means using those models **through that shared harness** during the interval. A legacy `model` entry remains supported. Each `models` item accepts only `model` and `role`; references and role text use the same validation as other fields. Models may share a role, or the same model may appear with different roles. Create more entries for different pairs, overlaps, interruptions or switches. Adjacent periods are not implicitly merged. Open periods advance with the server date when the page is loaded or reloaded; a future open period is drawn as one planned day until it starts. Each activity has one row: non-overlapping periods reuse a lane, while concurrent periods use parallel lanes inside that same row. Each lane takes the height of its own tallest block, independently of other lanes in the activity. Uncategorized entries share a final row. Titles stay attached to their period blocks; select a block for its full title, notes and project link. For short periods use the Months scale, keyboard focus, search or Journal. Very short blocks have a minimum clickable width and may need separate lanes when those visible widths overlap.

## Independent lifetimes

```yaml
entries:
  - id: editor
    title: Editor as my main environment
    start: 2026-01-01
    harness: Cursor
  - id: first-model
    title: Initial model
    start: 2026-01-01
    end: 2026-02-15
    model: GPT Sol 5.6
  - id: second-model
    title: New model, same editor
    start: 2026-02-01
    model: Claude Opus 5
```

These examples use direct tool names and need no model/harness catalogs. Both models overlap February 1–15; the editor's lifetime is independent.

## Two models, one workflow

```yaml
entries:
  - id: paired-coding
    title: A lightweight and a deep coding assistant
    start: 2026-07-01
    harness: Cursor
    category: code
    models:
      - model: GPT Sol 5.6
        role: Light coding
      - model: Claude Opus 5
        role: Heavy coding
    notes: |
      Small fixes go to the fast model; complex changes get a deeper review.
      Both are part of the same project workflow in the same editor.
```

Declare `code: Code` in the categories mapping; model and harness names are written directly in the entry. The period stays one block in the Code activity, with a strip for each model and one shared harness strip. Roles also appear in details and Journal, and are searchable. Overview totals count distinct model IDs, not roles.

## Navigating long histories

Months is the default scale: its spacing stays fixed as years are added. The timeline initially opens at the latest end with no period selected, including when an older link contains an entry parameter. Selection is temporary: click a block to open its story, or empty timeline space to deselect it. The slider, arrows, horizontal scrolling and Latest button navigate the history. Zooming preserves the visible time or keeps the latest edge when already there. There is no automatic polling: YAML changes and the current date are loaded only when you open or reload the page. Changing filters resets to the latest matching history (or the selected matching period). Years is a compact scale; Fit history intentionally compresses the entire history and may shorten labels. Full text is always available in details and Journal.
