#!/usr/bin/env python3
"""Read synthetic emulator evidence; emit only fixed categories and booleans."""
import json,sys
from pathlib import Path
try:
 stage,code,directory=sys.argv[1:4]
 require_pair=sys.argv[4:]==['--verify-installed-pair']
 assert len(sys.argv)==4 or require_pair
 assert stage in {'BOOT','FONT_SCALE','INSTALL_APP','INSTALL_TEST','INSTRUMENT'}
 code=int(code);assert 0<code<256
 root=Path(directory)
 def read(name):
  p=root/name
  return p.read_bytes()[:262144].decode('utf-8','replace') if p.is_file() else ''
 logs=read('package-log.txt').lower()
 result={'stage':stage,'exit_code':code,'adb_online':read('adb-state.txt').strip()=='device',
  'adb_query_completed':(root/'adb-state.complete').is_file(),'boot_query_completed':(root/'boot.complete').is_file(),
  'boot_completed':read('boot.txt').strip()=='1',
  'app_registered':read('app-path.txt').strip().startswith('package:/data/app/'),
  'test_registered':read('test-path.txt').strip().startswith('package:/data/app/'),
  'app_query_completed':(root/'app-path.complete').is_file(),'test_query_completed':(root/'test-path.complete').is_file(),
  'instrumentation_query_completed':(root/'instrumentation.complete').is_file(),'package_log_query_completed':(root/'package-log.complete').is_file(),
  'instrumentation_registered':any(line.split()==['instrumentation:game.kingdomcome.alpha.debug.test/game.kingdomcome.alpha.ShellInstrumentation','(target=game.kingdomcome.alpha.debug)'] for line in read('instrumentation.txt').splitlines()),
  'exact_app_apk_bytes':read('app-apk-match.txt').strip()=='MATCH','exact_test_apk_bytes':read('test-apk-match.txt').strip()=='MATCH',
  'verification_activity':'verif' in logs,'dexopt_activity':'dexopt' in logs or 'dex2oat' in logs,
  'installer_error':'install_failed' in logs or 'failed to install' in logs,
  'system_fatal':'fatal exception' in logs or 'watchdog' in logs}
 if require_pair:
  required=['adb_online','adb_query_completed','boot_query_completed','boot_completed','app_query_completed','test_query_completed','app_registered','test_registered','instrumentation_query_completed','instrumentation_registered','exact_app_apk_bytes','exact_test_apk_bytes']
  if stage=='INSTALL_TEST' and code==124 and all(result[k] is True for k in required) and not result['installer_error'] and not result['system_fatal']:
   print('ANDROID_EMULATOR_INSTALL: VERIFIED_EXACT_APK_PAIR_AFTER_CLIENT_TIMEOUT; no_retry=true')
  else:
   print('ANDROID_EMULATOR_FAILURE: '+json.dumps(result,sort_keys=True));sys.exit(1)
 else:print('ANDROID_EMULATOR_FAILURE: '+json.dumps(result,sort_keys=True))
except Exception:
 print('ANDROID_EMULATOR_FAILURE: {"category":"DIAGNOSTIC_UNAVAILABLE"}')
 if '--verify-installed-pair' in sys.argv:sys.exit(1)
