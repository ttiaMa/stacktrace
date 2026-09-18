# Configuration reference — version 1

## Root

| Key | Type | Meaning |
| --- | --- | --- |
| `version` | integer | Required, exactly `1`. |
| `site` | mapping | Optional `title`, `description`, `author`; defaults supplied. |
| `models` | mapping | Model IDs → catalog objects. |
| `harnesses` | mapping | Harness IDs → catalog objects. |
| `categories` | mapping | User-defined activity IDs → catalog objects. |
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

Adoption stages can be custom categories: experimental, production, retired, etc. Release generations can be part of a model's name or tags. No lifecycle is imposed. Icons use local system fonts and may vary by device; they are not downloaded logos.

## Entries

| Key | Required | Meaning |
| --- | --- | --- |
| `id` | Yes | Stable unique ID, also used in share URLs. |
| `title` | Yes | Short period label. |
| `start` | Yes | `YYYY-MM-DD`, quoted or native YAML date. |
| `end` | No | Inclusive date ≥ start. Omit or use `null` for ongoing. |
| `model` | Model and/or harness | Reference to a model ID. |
| `harness` | Model and/or harness | Reference to a harness ID. |
| `category` | No | Category ID; defaults to Uncategorized. |
| `notes` | No | Plain text; `|` for multiline. No HTML/Markdown rendering. |
| `tags` | No | List of up to 30 text labels. |
| `url` | No | HTTP or HTTPS link to related work. |

With both references, the entry means using that model **through that harness** during the interval. Create more entries for different pairs, overlaps, interruptions or switches. Adjacent periods are not implicitly merged. Open periods advance with today; a future open period is drawn as one planned day until it starts. Select a short bar via the row title when the text cannot fit.

## Independent lifetimes

```yaml
entries:
  - id: editor
    title: Editor as my main environment
    start: 2026-01-01
    harness: my-editor
  - id: first-model
    title: Initial model
    start: 2026-01-01
    end: 2026-02-15
    model: model-a
  - id: second-model
    title: New model, same editor
    start: 2026-02-01
    model: model-b
```

Define the referenced catalogs separately. Both models overlap February 1–15; the editor's lifetime is independent.
