$src = Join-Path $PSScriptRoot 'src'
$out = Join-Path $PSScriptRoot 'verification-key.txt'
$patterns = @('verification-tickets','VerificationTicket','verification ticket','isEmailVerified','assign.*ORGANIZER','ORGANIZER.*role')
Get-ChildItem -Path $src -Recurse -File -Include *.ts |
  Select-String -Pattern $patterns -CaseSensitive:$false |
  ForEach-Object { '{0}:{1}:{2}' -f $_.Path, $_.LineNumber, $_.Line.Trim() } |
  Out-File -Encoding utf8 $out
