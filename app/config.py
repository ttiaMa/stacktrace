"""Validate untrusted YAML and expose only documented public fields."""
import datetime as dt
import hashlib
import re
from pathlib import Path
from urllib.parse import urlsplit
import yaml

PALETTE = ['#b5b986', '#b49ace', '#85b5ae', '#d9ac80', '#90aac8', '#cd929e']
PRESETS = {'openai': '#85b5ae', 'anthropic': '#d9ac80', 'google': '#90aac8',
           'meta': '#b49ace', 'mistral': '#d8be78', 'local': '#b5b986'}
ICONS = {'code': '⌘', 'chat': '◌', 'research': '⌕', 'image': '▧',
         'audio': '♫', 'agent': '◇', 'terminal': '›_', 'ide': '▣',
         'web': '◎', 'experiment': '⚗', 'production': '◆', 'archive': '▤'}

class ConfigError(ValueError):
    pass

class Loader(yaml.SafeLoader):
    def compose_node(self, parent, index):
        if self.check_event(yaml.AliasEvent):
            raise ConfigError('YAML aliases are not supported; use explicit values')
        return super().compose_node(parent, index)

def mapping(loader, node):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node)
        if not isinstance(key, str) or key in result:
            raise ConfigError('Mapping keys must be unique strings')
        result[key] = loader.construct_object(value_node)
    return result
Loader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping)

def check(condition, message):
    if not condition:
        raise ConfigError(message)

def obj(value, path, fields):
    check(isinstance(value, dict), f'{path}: expected a mapping')
    check(not (value.keys() - fields), f'{path}: unknown fields {value.keys() - fields}')
    return value

def string(value, path, default=None):
    if value is None and default is not None:
        return default
    check(isinstance(value, str) and bool(value.strip()) and len(value) <= 4000,
          f'{path}: expected non-empty text, max 4000 characters')
    return value

def date(value, path):
    if isinstance(value, dt.date) and not isinstance(value, dt.datetime):
        return value.isoformat()
    check(isinstance(value, str) and bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', value)),
          f'{path}: expected YYYY-MM-DD')
    try:
        return dt.date.fromisoformat(value).isoformat()
    except ValueError as error:
        raise ConfigError(f'{path}: invalid date') from error

def normalize(raw):
    raw = obj(raw, 'root', {'version', 'site', 'models', 'harnesses', 'categories', 'entries'})
    check(type(raw.get('version')) is int and raw['version'] == 1, 'version must be 1')
    site = obj(raw.get('site', {}), 'site', {'title', 'description', 'author', 'github'})
    github = string(site.get('github'), 'site.github', '')
    if github:
        try:
            parsed = urlsplit(github)
            valid = (parsed.scheme == 'https' and parsed.hostname in ('github.com', 'www.github.com')
                     and not parsed.username and not parsed.password and parsed.port in (None, 443)
                     and bool(parsed.path.strip('/')) and not any(c.isspace() for c in github))
        except ValueError:
            valid = False
        check(valid, 'site.github: use an HTTPS GitHub profile or repository URL')
    result = {'version': 1, 'site': {
        'title': string(site.get('title'), 'site.title', 'My AI stack'),
        'description': string(site.get('description'), 'site.description', 'Tools change. Keep the story.'),
        'author': string(site.get('author'), 'site.author', 'Stack journal'), 'github': github}, 'entries': []}
    for kind in ['models', 'harnesses', 'categories']:
        catalog = raw.get(kind, {})
        check(isinstance(catalog, dict) and len(catalog) <= 500, f'{kind}: expected a mapping, max 500 items')
        result[kind] = {}
        for index, (key, item) in enumerate(catalog.items()):
            if kind == 'categories' and isinstance(item, str):
                item = {'name': item}
            check(isinstance(key, str) and bool(re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', key)), f'{kind}: invalid ID')
            item = obj(item, f'{kind}.{key}', {'name', 'color', 'icon', 'provider'})
            provider = string(item.get('provider'), f'{kind}.{key}.provider', 'custom')
            color = item.get('color', PRESETS.get(provider.lower(), PALETTE[index % len(PALETTE)]))
            check(isinstance(color, str) and bool(re.fullmatch(r'#[0-9a-fA-F]{6}', color)), f'{kind}.{key}.color: use #RRGGBB')
            icon = string(item.get('icon'), f'{kind}.{key}.icon', ICONS.get(key.rstrip('s'), '◇' if kind == 'models' else '▣'))
            result[kind][key] = {'name': string(item.get('name'), f'{kind}.{key}.name'),
                                 'color': color, 'icon': ICONS.get(icon, icon), 'provider': provider}
    def resolve(value, catalog, path):
        if value is None:
            return None
        name = string(value, path).strip()
        if catalog in raw:
            check(name in result[catalog], path + ': unknown reference')
            return name
        key = 'name-' + hashlib.sha256(name.encode()).hexdigest()[:20]
        if key not in result[catalog]:
            check(len(result[catalog]) < 500, path + ': max 500 distinct names')
            result[catalog][key] = {'name': name, 'color': PALETTE[int(key[-4:], 16) % len(PALETTE)],
                                    'icon': '◇' if catalog == 'models' else '▣', 'provider': 'custom'}
        return key
    entries = raw.get('entries', [])
    check(isinstance(entries, list) and len(entries) <= 2000, 'entries: expected a list, max 2000 items')
    ids = set()
    for index, entry in enumerate(entries):
        p = f'entries[{index}]'
        entry = obj(entry, p, {'id', 'title', 'start', 'end', 'model', 'models', 'harness', 'category', 'notes', 'tags', 'url'})
        ident = string(entry.get('id'), p + '.id')
        check(bool(re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', ident)) and ident not in ids, p + ': invalid or duplicate id')
        ids.add(ident)
        out = {'id': ident, 'title': string(entry.get('title'), p + '.title'),
               'start': date(entry.get('start'), p + '.start'),
               'end': date(entry['end'], p + '.end') if entry.get('end') is not None else None,
               'notes': string(entry.get('notes'), p + '.notes', ''),
               'url': string(entry.get('url'), p + '.url', '')}
        check(out['end'] is None or out['end'] >= out['start'], p + ': end precedes start')
        check(not out['url'] or (out['url'].startswith(('https://', 'http://')) and not any(c.isspace() for c in out['url'])), p + '.url: use http(s)')
        check(not ('model' in entry and 'models' in entry), p + ': use model or models, not both')
        check(entry.get('model') or entry.get('models') or entry.get('harness'), p + ': specify model(s) and/or harness')
        model_refs = entry.get('models', [])
        check(isinstance(model_refs, list) and len(model_refs) <= 30, p + '.models: expected list, max 30')
        check('models' not in entry or model_refs, p + '.models: must not be empty')
        out['models'] = []
        for model_index, model_ref in enumerate(model_refs):
            mp = f'{p}.models[{model_index}]'
            model_ref = obj(model_ref, mp, {'model', 'role'})
            check(model_ref.get('model') is not None, mp + ': model is required')
            ref = resolve(model_ref.get('model'), 'models', mp + '.model')
            out['models'].append({'model': ref, 'role': string(model_ref.get('role'), mp + '.role', '')})
        for field, catalog in [('model', 'models'), ('harness', 'harnesses'), ('category', 'categories')]:
            ref = entry.get(field)
            if catalog != 'categories':
                ref = resolve(ref, catalog, p + '.' + field)
            else:
                check(ref is None or isinstance(ref, str) and ref in result[catalog], p + f'.{field}: unknown reference')
            out[field] = ref
        tags = entry.get('tags', [])
        check(isinstance(tags, list) and len(tags) <= 30, p + '.tags: expected list, max 30')
        out['tags'] = [string(tag, p + '.tags') for tag in tags]
        result['entries'].append(out)
    return result

def load(path):
    with Path(path).open('rb') as handle:
        data = handle.read(1_048_577)
    check(len(data) <= 1_048_576, 'YAML file exceeds 1 MiB')
    try:
        return normalize(yaml.load(data, Loader=Loader)), hashlib.sha256(data).hexdigest()
    except yaml.YAMLError as error:
        mark = getattr(error, 'problem_mark', None)
        location = f' at line {mark.line + 1}, column {mark.column + 1}' if mark else ''
        raise ConfigError('Invalid YAML syntax' + location) from error
    except RecursionError as error:
        raise ConfigError('Excessive YAML nesting') from error
