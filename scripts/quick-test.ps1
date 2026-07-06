$headers = @{ Authorization = "Bearer v3-internal-key" }

# Test 1: Waybill WD-20260706-0009 detail
Write-Host "=== Waybill Detail: WD-20260706-0009 ==="
try {
    $r = Invoke-RestMethod "https://20260704155001-jxjcstlzc-zhous-projects-daecd222.vercel.app/api/waybills?id=wb_hveu12j2_mr8k7dxv" -Headers $headers -TimeoutSec 15
    Write-Host ($r | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "ERR: $($_.Exception.Message)"
}

# Test 2: SKU Verify WD-20260706-0009 + 04050198
Write-Host "`n=== SKU Verify: WD-20260706-0009 / 04050198 ==="
try {
    $r = Invoke-RestMethod "https://20260704155001-jxjcstlzc-zhous-projects-daecd222.vercel.app/api/waybills/verify-sku?external_code=WD-20260706-0009&sku_code=04050198" -Headers $headers -TimeoutSec 15
    Write-Host ($r | ConvertTo-Json -Depth 2)
} catch {
    Write-Host "ERR: $($_.Exception.Message)"
}

# Test 3: SKU Verify PS2604210007 + SKU-001
Write-Host "`n=== SKU Verify: PS2604210007 / SKU-001 ==="
try {
    $r = Invoke-RestMethod "https://20260704155001-jxjcstlzc-zhous-projects-daecd222.vercel.app/api/waybills/verify-sku?external_code=PS2604210007&sku_code=SKU-001" -Headers $headers -TimeoutSec 15
    Write-Host ($r | ConvertTo-Json -Depth 2)
} catch {
    Write-Host "ERR: $($_.Exception.Message)"
}

# Test 4: V3 scan with valid SKU
Write-Host "`n=== V3 Scan: WD-20260706-0009 / 04050198 (qty=10, actual=10) ==="
try {
    $body = @{
        external_code = "WD-20260706-0009"
        sku_code = "04050198"
        sku_name = "Yi Dan Ta Pi"
        operator = "operator_01"
        expected_qty = 10
        actual_qty = 10
        damage_level = 0
        spec_match = $true
    }
    $r = Invoke-RestMethod "https://20260704155001-v3.vercel.app/api/scan" -Method POST -Body ($body | ConvertTo-Json -Compress) -ContentType "application/json" -TimeoutSec 15
    Write-Host ($r | ConvertTo-Json -Depth 2)
} catch {
    Write-Host "ERR: $($_.Exception.Message) - $($_.ErrorDetails.Message)"
}
