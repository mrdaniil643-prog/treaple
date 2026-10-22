# Неразрывный пробел после коротких слов в HTML-страницах сайта.
# Запуск после правки текстов: python3 tools/nbsp.py index.html 404.html
# Неразрывный пробел после коротких предлогов, союзов и частиц — только в тексте, не в тегах
import re, sys
SHORT = r'(в|к|с|и|о|у|а|я|по|на|не|до|за|из|от|об|со|во|ко|ни|же|ли|но|что|как|при|для|без|№)'
for path in sys.argv[1:]:
    parts = re.split(r'(<[^>]+>)', open(path).read())
    skip = count = 0
    for i, part in enumerate(parts):
        if part.startswith('<'):
            if re.match(r'<(script|style|title)\b', part, re.I): skip += 1
            elif re.match(r'</(script|style|title)>', part, re.I): skip -= 1
            continue
        if skip or not re.search('[А-Яа-я]', part): continue
        parts[i], n = re.subn(r'(?<![А-Яа-яЁё])' + SHORT + r' (?=[А-Яа-яЁё«0-9+]|$)', lambda m: m.group(1) + ' ', part, flags=re.I)
        count += n
    open(path, 'w').write(''.join(parts))
    print(f'{path}: {count}')
