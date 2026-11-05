#!/usr/bin/env python3
"""Read synthetic emulator evidence; emit only fixed categories and booleans."""
import json,sys
from pathlib import Path
try:
 stage,code,directory=sys.argv[1:]
 assert stage in {'BOOT','FONT_SCALE','INSTALL_APP','INSTALL_TEST','INSTRUMENT'}
 code=int(code);assert 0<code<256
 root=Path(directory)
 def read(name):
  p=root/name
  return p.read_bytes()[:262144].decode('utf-8','replace') if p.is_file() else ''
 logs=read('package-log.txt').lower()
 result={'stage':stage,'exit_code':code,'adb_online':read('adb-state.txt').strip()=='device',
  'boot_completed':read('boot.txt').strip()=='1',
  'app_registered':read('app-path.txt').strip().startswith('package:/data/app/'),
  'test_registered':read('test-path.txt').strip().startswith('package:/data/app/'),
  'app_query_completed':(root/'app-path.complete').is_file(),'test_query_completed':(root/'test-path.complete').is_file(),
  'instrumentation_query_completed':(root/'instrumentation.complete').is_file(),'package_log_query_completed':(root/'package-log.complete').is_file(),
  'instrumentation_registered':'game.kingdomcome.alpha.debug.test/game.kingdomcome.alpha.ShellInstrumentation' in read('instrumentation.txt'),
  'exact_test_apk_bytes':read('apk-match.txt').strip()=='MATCH',
  'verification_activity':'verif' in logs,'dexopt_activity':'dexopt' in logs or 'dex2oat' in logs,
  'installer_error':'install_failed' in logs or 'failed to install' in logs,
  'system_fatal':'fatal exception' in logs or 'watchdog' in logs}
 print('ANDROID_EMULATOR_FAILURE: '+json.dumps(result,sort_keys=True))
except Exception:
 print('ANDROID_EMULATOR_FAILURE: {"category":"DIAGNOSTIC_UNAVAILABLE"}')
