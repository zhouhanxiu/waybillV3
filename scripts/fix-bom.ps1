$path = "c:\Users\ztocc\CodeBuddy\20260704155001-v3\scripts\auto-test.ps1"
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$utf8BOM = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllText($path, $content, $utf8BOM)
Write-Host "BOM added successfully"
