$roots = @('admin','users','auth')
foreach ($root in $roots) {
  $path = Join-Path $PSScriptRoot (Join-Path 'src/modules' $root)
  if (Test-Path $path) {
    Write-Output "[$root]"
    Get-ChildItem -Path $path -Recurse -File -Include *.ts,*.tsx | ForEach-Object { $_.FullName }
  }
}
