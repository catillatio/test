#!/usr/bin/env python3
"""Validate offline evidence and unchanged prototype files, without running the app."""
import ast
import hashlib
import json
import re
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parent
OUT = ROOT / 'analysis'
EXPECTED_APK = '671e7650511e2c2dbfbd010dd85813e9ec6bf1d77c7c4ca8f459b6d141a1b5e0'
ANDROID = '{http://schemas.android.com/apk/res/android}'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(name):
    return json.loads((OUT / name).read_text())


def method(path, name):
    blocks = (OUT / 'disassembly' / path).read_text().split('\n## ')
    matches = [block for block in blocks[1:] if f';->{name}(' in block.split('\n', 1)[0]]
    assert len(matches) == 1, (path, name, len(matches))
    return matches[0]


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []
        self.scripts = 0

    def handle_starttag(self, tag, attrs):
        self.scripts += tag == 'script'
        for name, value in attrs:
            if name in ['href', 'src']:
                self.urls.append(value)


def main():
    checks = []
    details = {}

    def check(name, action):
        try:
            value = action()
            checks.append({'check': name, 'passed': True})
            if value is not None:
                details[name] = value
        except Exception as error:
            checks.append({'check': name, 'passed': False,
                           'error': f'{type(error).__name__}: {error}'})

    def preserved():
        baseline = read_json('prototype-baseline.json')
        assert len(baseline) == 63, len(baseline)
        problems = []
        for entry in baseline:
            path = PROJECT / entry['path']
            if not path.is_file():
                problems.append({'path': entry['path'], 'problem': 'missing'})
            elif path.stat().st_size != entry['size'] or digest(path) != entry['sha256']:
                problems.append({'path': entry['path'], 'problem': 'changed'})
        assert not problems, problems
        return {'files_checked': len(baseline), 'changed': 0, 'missing': 0}

    def apk_files():
        apk = ROOT / 'KingdomsLive-1.6.3.apk'
        assert digest(apk) == EXPECTED_APK
        inventory = read_json('apk-inventory.json')
        with zipfile.ZipFile(apk) as archive:
            assert archive.testzip() is None
            entries = [entry for entry in archive.infolist() if not entry.is_dir()]
            assert len(entries) == len(inventory) == 60
            by_name = {entry['path']: entry for entry in inventory}
            for entry in entries:
                binary = archive.read(entry.filename)
                path = ROOT / 'extracted' / entry.filename
                assert path.read_bytes() == binary, entry.filename
                assert by_name[entry.filename]['sha256'] == hashlib.sha256(binary).hexdigest()
            assert not any(entry.filename.startswith(('assets/', 'lib/')) for entry in entries)
            assert not any(Path(entry.filename).suffix.lower() in ['.html', '.htm', '.css', '.js', '.php', '.sqlite', '.db'] for entry in entries)
        return {'unchanged_extracted_entries': 60, 'apk_sha256': EXPECTED_APK}

    def dex_audit():
        integrity = read_json('dex-integrity.json')
        assert integrity['sha1_stored'] == integrity['sha1_computed']
        assert integrity['adler32_stored'] == integrity['adler32_computed']
        audit = read_json('offline-audit.json')
        assert not audit['decode_or_branch_failures'], audit['decode_or_branch_failures']
        assert audit['class_definitions'] == 273
        assert audit['coded_methods'] == 1515
        inventory = read_json('class-inventory.json')
        files = list((OUT / 'disassembly').rglob('*.dex.txt'))
        assert len(files) == len(inventory) == 273
        switch_targets = 0
        for path in files:
            for block in path.read_text().split('\n## ')[1:]:
                lines = {int(match.group(1), 16): match.group(2)
                         for line in block.splitlines()
                         if (match := re.match(r'^([0-9a-f]{4}): (.*)', line))}
                for pc, instruction in lines.items():
                    if not instruction.startswith(('packed-switch ', 'sparse-switch ')):
                        continue
                    payload_pc = int(re.search(r'@([0-9a-f]+)', instruction).group(1), 16)
                    payload = lines[payload_pc]
                    offsets = ast.literal_eval(payload.split('targets=', 1)[1])
                    for offset in offsets:
                        assert pc + offset in lines, (str(path), block.splitlines()[0], pc, offset)
                        switch_targets += 1
        return {'classes': 273, 'coded_methods': 1515,
                'switch_case_destinations_checked': switch_targets,
                'scope': 'Integrity and structural disassembly, not an Android runtime verifier'}

    def xml_and_resources():
        files = list((OUT / 'decoded').rglob('*.xml'))
        assert len(files) == 13
        for path in files:
            ET.parse(path)
        assert len(list((OUT / 'decoded/res/drawable').glob('*.xml'))) == 7
        assert len(list((OUT / 'decoded/res/layout').glob('*.xml'))) == 4
        assert len(list((OUT / 'decoded/res/menu').glob('*.xml'))) == 1
        manifest = ET.parse(OUT / 'decoded/AndroidManifest.xml').getroot()
        assert manifest.get('package') == 'com.storm8.kingdoms12'
        assert manifest.get(ANDROID + 'versionName') == '1.6.3'
        assert manifest.get(ANDROID + 'versionCode') == '21'
        main = ET.parse(OUT / 'decoded/res/layout/main.xml').getroot()
        assert [child.tag for child in main] == ['WebView', 'LinearLayout']
        assert main[0].get(ANDROID + 'id') == '@id/webview'
        assert main[1].get(ANDROID + 'layout_height') == '50dp'
        table = read_json('resource-table.json')
        strings = {row['name']: row['value'] for row in table if row['type'] == 'string'}
        assert strings == {'hello': 'Hello World, Home!', 'app_name': 'Kingdoms Live'}
        return {'decoded_xml_files': len(files), 'resource_table_rows': len(table)}

    def navigation():
        main_path = 'com/storm8/kingdoms12/Main.dex.txt'
        tab_code = method(main_path, 'getTabButtons')
        values = [json.loads(match.group(1)) for match in re.finditer(r'const-string v\d+, (.+)', tab_code)]
        pairs = list(zip(values[::2], values[1::2]))
        assert pairs == [('Home', '/home.php'), ('Quests', '/missions.php'), ('Battle', '/fight.php'),
                         ('Armory', '/equipment.php'), ('Recruit', '/group.php')], pairs
        menu = ET.parse(OUT / 'decoded/res/menu/menu.xml').getroot()
        labels = [entry.get(ANDROID + 'title') for entry in menu]
        assert labels == ['Home', 'Quests', 'Battle', 'Armory', 'Land', 'Recruit']
        assert '"/investment.php"' in method(main_path, 'onOptionsItemSelected')
        menu_creation = method('com/storm8/base/Storm8MainActivity.dex.txt', 'onCreateOptionsMenu')
        instructions = [line for line in menu_creation.splitlines() if re.match(r'^[0-9a-f]{4}:', line)]
        assert instructions == ['0000: const/4 v0, 0', '0001: return v0'], instructions
        calls = []
        for path in (OUT / 'disassembly').rglob('*.dex.txt'):
            for line in path.read_text().splitlines():
                if re.match(r'^[0-9a-f]{4}: invoke-', line) and '->loadPageWithHash(' in line:
                    calls.append([str(path.relative_to(OUT)), line])
        assert not calls, calls
        return {'native_tabs': [{'label': label, 'route': route} for label, route in pairs],
                'declared_menu_labels': labels, 'native_menu_callback_returns_false': True,
                'identified_calls_to_loadPageWithHash': len(calls)}

    def assets():
        inventory = read_json('image-inventory.json')
        assert len(inventory) == 30
        for entry in inventory:
            path = ROOT / 'extracted' / entry['path']
            assert digest(path) == entry['sha256']
        backgrounds = [entry for entry in inventory if Path(entry['path']).name.startswith('bg_')]
        assert len(backgrounds) == 6
        assert all(entry['width'] == 320 and entry['height'] == 480 for entry in backgrounds)
        assert len(list((ROOT / 'extracted/res/raw').glob('*.3gp'))) == 11
        resource_map = read_json('resource-id-map.json')
        expected = {'getBankBg': 'drawable/bg_bank', 'getHospitalBg': 'drawable/bg_hospital',
                    'getDefaultBg': 'drawable/bg_default', 'getMissionsBg': 'drawable/bg_missions',
                    'getFightBg': 'drawable/bg_attack', 'getEquipmentBg': 'drawable/bg_equipment'}
        for name, resource in expected.items():
            code = method('com/storm8/kingdoms12/Main.dex.txt', name)
            resource_id = re.search(r'0x7f[0-9a-f]{6}', code).group(0)
            assert resource_map[resource_id] == resource, (name, resource_id, resource)
        return {'unchanged_images': 30, 'background_resource_mappings': expected, 'original_audio_files': 11}

    def gallery():
        path = OUT / 'asset-gallery.html'
        parser = Links()
        parser.feed(path.read_text())
        assert parser.scripts == 0
        for url in parser.urls:
            parsed = urlsplit(url)
            assert not parsed.scheme and not parsed.netloc, url
            target = (path.parent / unquote(parsed.path)).resolve()
            assert target.is_file(), str(target)
            assert target.is_relative_to(PROJECT)
        return {'local_links_checked': len(parser.urls), 'scripts': 0, 'remote_links': 0}

    def tools_parse():
        paths = list((ROOT / 'tools').glob('*.py'))
        for path in paths:
            ast.parse(path.read_text(), filename=str(path))
        return {'python_scripts_parsed': len(paths)}

    def document_links():
        count = 0
        for path in [PROJECT / 'ORIGINAL_GAME_SPEC.md', ROOT / 'README.md']:
            for url in re.findall(r'(?<!!)\[[^\]]+\]\(([^)]+)\)', path.read_text()):
                parsed = urlsplit(url)
                assert not parsed.scheme and not parsed.netloc, (str(path), url)
                target = (path.parent / unquote(parsed.path)).resolve()
                if target != OUT / 'verification.json':
                    assert target.exists(), (str(path), url)
                count += 1
        return {'local_document_links_checked': count}

    check('prototype_preservation', preserved)
    check('apk_and_extraction_integrity', apk_files)
    check('dex_integrity_and_control_flow_structure', dex_audit)
    check('decoded_xml_and_resource_table', xml_and_resources)
    check('navigation_and_reachability_caveats', navigation)
    check('original_assets_and_background_mapping', assets)
    check('gallery_is_local_only', gallery)
    check('analysis_python_syntax', tools_parse)
    check('specification_evidence_links', document_links)
    passed = sum(item['passed'] for item in checks)
    report = {'scope': 'Offline APK/reference validation; not prototype gameplay or Android runtime tests',
              'checks_passed': passed, 'checks_failed': len(checks) - passed,
              'checks': checks, 'details': details,
              'application_code_modified': False, 'gameplay_tests_run_this_analysis': False,
              'apk_executed': False, 'historical_server_contacted': False}
    (OUT / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    return 0 if passed == len(checks) else 1


if __name__ == '__main__':
    sys.exit(main())
