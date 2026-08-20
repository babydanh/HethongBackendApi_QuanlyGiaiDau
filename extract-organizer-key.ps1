$patterns = @('organizer','organiser','request','approve','assign','promote','role')
Select-String -Path (Join-Path $PSScriptRoot 'audit-organizer.txt') -Pattern $patterns -CaseSensitive:$false |
  ForEach-Object { "{0}:{1}" -f $_.LineNumber, $_.Line.Trim() }
