#!/usr/bin/env python3
"""Read-only exact-source CI gate. No provider/credential payload is printed."""
import json,os,subprocess
try:
 assert os.environ.get('GITHUB_REPOSITORY')=='catillatio/test'
 assert os.environ.get('GITHUB_REF')=='refs/heads/release/production'
 assert os.environ.get('GITHUB_EVENT_NAME')=='workflow_dispatch'
 sha=os.environ['GITHUB_SHA'];assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==sha
 def api(path):return json.loads(subprocess.check_output(['gh','api',path],stderr=subprocess.DEVNULL))
 assert api('repos/catillatio/test/git/ref/heads/release/production')['object']['sha']==sha
 runs=api('repos/catillatio/test/actions/workflows/checks.yml/runs?head_sha='+sha+'&event=push&per_page=10')['workflow_runs']
 run=next(x for x in runs if x['head_sha']==sha and x['status']=='completed' and x['conclusion']=='success')
 jobs=api('repos/catillatio/test/actions/runs/'+str(run['id'])+'/jobs?per_page=100')['jobs']
 assert len(jobs)>=10 and all(x['status']=='completed' and x['conclusion']=='success' for x in jobs)
 assert {'plan','validation','recovery','checks'}<=set(x['name'] for x in jobs)
except Exception:raise SystemExit('ANDROID_SOURCE: STOP — EXACT_HEAD_CI_REQUIRED')
print('ANDROID_SOURCE: PASS — protected branch and complete exact-head push CI')
