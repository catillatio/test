#!/usr/bin/env python3
"""Reproduce the offline APK evidence. Reads files only; never runs the APK."""
import collections
import hashlib
import json
import re
import zipfile
from pathlib import Path
from dex_reader import ROOT, Dex
from android_binary import decode_xml, decode_arsc, id_names


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def main():
    out = ROOT / 'analysis'
    source = ROOT / 'extracted'
    dex = Dex(source / 'classes.dex')
    save(out / 'dex-integrity.json', dex.integrity)
    save(out / 'dex-index.json', {'classes': dex.classes, 'methods': dex.methods, 'fields': dex.fields})
    save(out / 'dex-strings.json', dex.strings)
    save(out / 'resource-table.json', decode_arsc(source / 'resources.arsc'))
    save(out / 'resource-id-map.json', {f'0x{k:08x}': v for k, v in id_names.items()})
    xmls = [source / 'AndroidManifest.xml', *sorted((source / 'res').rglob('*.xml'))]
    for path in xmls:
        target = out / 'decoded' / path.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(decode_xml(path))
    xrefs = collections.defaultdict(list)
    classes = []
    constants = {}
    coded = instructions = 0
    failures = []
    for item in dex.classes:
        constants[item['name']] = dex.static_values(item)
        relative = Path('disassembly') / (item['name'][1:-1] + '.dex.txt')
        target = out / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        text = [f"# class {item['name']} extends {item['super']}",
                '# interfaces ' + ', '.join(item['interfaces']),
                '# source ' + str(item['source']), '# fields']
        text += [f"# {f['name']} access=0x{f['access']:x}" for f in item['fields']]
        for method in item['methods']:
            text += ['', f"## {method['name']} access=0x{method['access']:x}"]
            lines = dex.disasm(method)
            text += lines
            if method['code_off']:
                coded += 1
                size = dex.u32(method['code_off'] + 12)
                starts = {int(line[:4], 16) for line in lines if re.match(r'^[0-9a-f]{4}:', line)}
                for line in lines:
                    if not re.match(r'^[0-9a-f]{4}:', line):
                        continue
                    instructions += 1
                    if 'unknown-' in line:
                        failures.append([method['name'], line])
                    # Direct branches and switch payload locations must be instruction starts.
                    if re.match(r'^[0-9a-f]{4}: (?:if-|goto|packed-switch |sparse-switch |fill-array-data )', line):
                        for destination in re.findall(r'@([0-9a-f]+)', line):
                            if int(destination, 16) not in starts:
                                failures.append([method['name'], 'invalid branch/payload target', line, size])
                    if 'const-string' in line:
                        value = json.loads(line.split(', ', 1)[1])
                        xrefs[value].append({'method': method['name'], 'pc': line[:4], 'file': str(relative)})
        target.write_text('\n'.join(text) + '\n')
        classes.append({'class': item['name'], 'super': item['super'], 'source': item['source'],
                        'method_count': len(item['methods']), 'file': str(relative)})
    save(out / 'class-inventory.json', classes)
    save(out / 'static-values.json', constants)
    save(out / 'string-xrefs.json', xrefs)
    apk = ROOT / 'KingdomsLive-1.6.3.apk'
    with zipfile.ZipFile(apk) as archive:
        inventory = [{'path': info.filename, 'bytes': info.file_size,
                      'sha256': hashlib.sha256(archive.read(info.filename)).hexdigest()}
                     for info in archive.infolist() if not info.is_dir()]
        crc_failure = archive.testzip()
    save(out / 'apk-inventory.json', inventory)
    audit = {'apk_sha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
             'zip_crc_failure': crc_failure, 'class_definitions': len(dex.classes),
             'method_references': len(dex.methods), 'strings': len(dex.strings),
             'coded_methods': coded, 'decoded_instruction_records': instructions,
             'decoded_xml_files': len(xmls), 'decode_or_branch_failures': failures,
             'limitations': ['Structural disassembly checks are not an Android runtime verifier.',
                             'No APK execution, server requests, or balance-formula recovery.']}
    save(out / 'offline-audit.json', audit)
    print(json.dumps(audit, indent=2))


if __name__ == '__main__':
    main()
