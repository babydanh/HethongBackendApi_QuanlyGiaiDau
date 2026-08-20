$patterns = @('organizer','organiser','verifiedEmail','emailVerified','verify-email','verification','assignRole','role')
Get-ChildItem -Path (Join-Path $PSScriptRoot 'src') -Recurse -File -Include *.ts,*.tsx |
  Select-String -Pattern $patterns -CaseSensitive:$false |
  Where-Object { $_.Path -notmatch '\\node_modules\\' } |
  ForEach-Object { "{0}:{1}:{2}" -f $_.Path, $_.LineNumber, $_.Line.Trim() }
