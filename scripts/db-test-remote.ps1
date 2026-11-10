# Runs supabase/tests/*.test.sql against the LINKED Supabase project without Docker
# (`supabase test db` needs Docker even with --remote).
#
#   npm run db:test:remote            (or: powershell -File scripts/db-test-remote.ps1)
#
# Safety: each file runs in ONE transaction that always ends with an exception, so nothing
# is ever committed. The exception message carries the TAP lines of failed assertions.
# Use it on the dev project only.
param([string]$Project = (Split-Path $PSScriptRoot -Parent))

$ErrorActionPreference = 'Continue'
$tmpDir = Join-Path ([IO.Path]::GetTempPath()) 'exam-platform-db-tests'
New-Item -ItemType Directory -Force $tmpDir | Out-Null
$utf8 = New-Object Text.UTF8Encoding $false
$total = 0; $failed = 0; $broken = 0

foreach ($tf in Get-ChildItem (Join-Path $Project 'supabase\tests\*.test.sql') | Sort-Object Name) {
  $sql = Get-Content $tf.FullName -Raw
  # Record every assertion's TAP line in a temp table...
  $sql = $sql -replace '(?m)^(select plan\(\d+\);)',
    "`$1`ncreate temp table tap_out (n serial, line text);`ngrant all on tap_out to public;`ngrant usage, select on sequence tap_out_n_seq to public;"
  $sql = $sql -replace '(?m)^select (ok|is|isnt|throws_ok|lives_ok|results_eq|set_eq|bag_eq|cmp_ok|matches)\(',
    'insert into tap_out (line) select $1('
  # ...and instead of finish() + rollback, abort with a summary (guarantees no commit).
  $sql = $sql -replace '(?m)^select \* from finish\(\);\s*$', ''
  $sql = $sql -replace '(?m)^rollback;\s*$', @'
do $tap$
begin
  raise exception 'TAPRESULT ran=% failed=% planned=% [%]TAPEND',
    (select count(*) from tap_out),
    (select count(*) from tap_out where line not like 'ok %'),
    (select value from __tcache__ where label = 'plan' limit 1),
    coalesce((select string_agg(split_part(line, E'\n', 1), ' || ' order by n) from tap_out where line not like 'ok %'), '');
end
$tap$;
'@
  $tmp = Join-Path $tmpDir $tf.Name
  [IO.File]::WriteAllText($tmp, $sql, $utf8)

  $out = (& npx supabase db query --remote --yes -f $tmp 2>&1 | Out-String)
  $m = [regex]::Match($out, 'TAPRESULT ran=(\d+) failed=(\d+) planned=(\d*) \[(.*?)\]TAPEND')
  if ($m.Success) {
    $ran = [int]$m.Groups[1].Value; $bad = [int]$m.Groups[2].Value; $plan = $m.Groups[3].Value
    $flag = if ($bad -gt 0 -or ($plan -and [int]$plan -ne $ran)) { 'FAIL' } else { 'ok  ' }
    "$flag $($tf.Name): $ran/$plan assertions, $bad failed"
    if ($m.Groups[4].Value) { $m.Groups[4].Value -split ' \|\| ' | ForEach-Object { "       $_" } }
    $total += $ran; $failed += $bad
  } else {
    "FAIL $($tf.Name): the file did not run to the end"
    ([regex]::Match($out, '"message":"([^"]*)"').Groups[1].Value -replace '\\n', ' ')
    $broken++
  }
}
""
"Total: $total assertions, $failed failed, $broken file(s) broken"
if ($failed -gt 0 -or $broken -gt 0) { exit 1 }
