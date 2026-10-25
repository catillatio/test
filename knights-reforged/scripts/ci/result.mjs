export function testResult(entry, output, status, signal, {hosted=process.env.GITHUB_ACTIONS==='true',overflow=false}={}) {
  const counts={};
  for(const [,name,value] of output.matchAll(/^# (tests|pass|fail|cancelled|skipped) (\d+)$/gm))counts[name]=Number(value);
  // Existing, explicitly platform-limited test. Never exempt it on hosted CI.
  const localNamespaceSkip=!hosted&&entry.file==='tests/release-diagnostic.test.mjs'&&counts.skipped===1&&/^ok \d+ - real hosted-runner network namespace executes synthetic checks without production secrets # SKIP$/m.test(output);
  return {passed:status===0&&!signal&&!overflow&&(entry.script || (counts.tests>0&&counts.fail===0&&counts.cancelled===0&&(counts.skipped===0||localNamespaceSkip))),...counts};
}
