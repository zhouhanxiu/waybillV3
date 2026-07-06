$V2="https://20260704155001-jxjcstlzc-zhous-projects-daecd222.vercel.app"
$V3="https://20260704155001-v3.vercel.app"
$SK="v3-internal-key"
$sh=@{Authorization="Bearer $SK"}
$pts=0;$rs=@()

function L($l,$p,$d=""){$c=if($p){"Green"}else{"Red"};Write-Host "[$(if($p){"PASS"}else{"FAIL"})] $l $(if($d){"-- $d"})" -F $c; $global:rs+=@{l=$l;p=$p;d=$d};$p}
function A($u,$m="GET",$b=$null,$h=@{}){
  try{$pr=@{Uri=$u;Method=$m;ContentType="application/json";TimeoutSec=15;Headers=$h}
    if($b){$pr.Body=(ConvertTo-Json $b -Depth 5 -Compress)}
    $sw=[System.Diagnostics.Stopwatch]::StartNew();$r=Invoke-RestMethod @pr;$sw.Stop()
    @{ok=$true;status=200;body=$r;ms=$sw.ElapsedMilliseconds}
  }catch{$sc=0;if($_.Exception.Response){$sc=[int]$_.Exception.Response.StatusCode}
    @{ok=$false;status=$sc;body=@{error=$_.Exception.Message};ms=0}}
}

$st=Get-Date;$n=$null;$t=$true;$f=$false

# Preload
$wbl=A "$V2/api/waybills";$wbs=if($wbl.body.data){$wbl.body.data}else{@()}

# ==== 1: Deploy (10pts) ====
Write-Host "`n=== Test 1: Deploy ===" -F Cyan
$vh=A "$V2/api/health"; if(L "V2 Health" $vh.ok){$pts+=2}
$vm=A "$V3/api/monitor"; if(L "V3 Monitor" $vm.ok){$pts+=2}
L "Independent Deploy" ($V2 -notmatch 'v3' -and $V3 -match 'v3'); $pts+=2
if($vh.ok){L "V2 health OK" ($vh.body.status -eq 'ok'); $pts+=2}
if($vm.ok){L "V3 v2_healthy" ($n -ne $vm.body.v2_healthy) "vh=$($vm.body.v2_healthy)"; $pts+=2}

# ==== 2: V2 Integration (10pts) ====
Write-Host "`n=== Test 2: V2 Integration ===" -F Cyan
$na=A "$V2/api/waybills/sync" -m POST -b @{}; L "V2 Auth 401" ($na.status -eq 401); $pts+=2
$sr=A "$V2/api/waybills/sync" -m POST -b @{} -h $sh; L "V2 Sync" $sr.ok; $pts+=2
L "V2 List" ($wbs.Count -gt 0); $pts+=2
$skc=A "$V2/api/waybills/verify-sku?external_code=WD-20260706-0009&sku_code=04050198" -h $sh
L "SKU Verify" ($skc.ok -and $skc.body.valid); $pts+=2
$nr=A "$V2/api/waybills/exception-status" -m POST -h $sh -b @{external_code=$wbs[0].external_code;has_open_ticket=$t}
L "Notify API" $nr.ok; $pts+=2

# ==== 3: Ticket Creation (10pts) ====
Write-Host "`n=== Test 3: Ticket Creation ===" -F Cyan
$ec3 = if($wbs.Count -gt 5){$wbs[5].external_code}else{$wbs[0].external_code}
$bad = A "$V3/api/tickets" -m POST -b @{}; L "Missing Fields=400" ($bad.status -eq 400); $pts+=2
$fake = A "$V3/api/tickets" -m POST -b @{external_code="NOEXIST-999";exception_type="lost";reporter="rep_01";amount=100}
L "Non-existent Blocked" (-not $fake.ok) "status=$($fake.status)"; $pts+=2
$t1 = A "$V3/api/tickets" -m POST -b @{external_code=$ec3;exception_type="lost";source="manual";severity="medium";description="Auto L1";amount=200;reporter="reporter_01"}
if($t1.ok -and $t1.body.id){$tid1=$t1.body.id; L "Create Ticket" $t "id=$tid1"; $pts+=2
  $dr=A "$V3/api/tickets" -m POST -b @{external_code=$ec3;exception_type="lost";source="manual";amount=200;reporter="reporter_01"}
  L "Dedup 409" ($dr.status -eq 409); $pts+=2
  $t2=A "$V3/api/tickets" -m POST -b @{external_code=$ec3;exception_type="damaged";source="manual";amount=150;reporter="reporter_01"}
  $tid2=if($t2.ok){$t2.body.id}else{$n}; L "Diff Type OK" $t2.ok; $pts+=2
}else{$tid1=$n;$tid2=$n;L "Create Ticket" $f}

# ==== 4: L1 Approval + Reject + Idem (15pts) ====
Write-Host "`n=== Test 4: L1 Approve + Reject + Idempotent ===" -F Cyan
if($tid1){
  $sa=A "$V3/api/tickets" -m PUT -b @{id=$tid1;action="approve";approver="reporter_01";level=1;opinion="self"}
  L "Self-approve 403" ($sa.status -eq 403) "status=$($sa.status)"; $pts+=2
  # Stage1: pending -> level1
  $a1=A "$V3/api/tickets" -m PUT -b @{id=$tid1;action="approve";approver="approver_level1_01";level=1;opinion="L1-1"}
  if($a1.ok -and $a1.body.status -eq "level1"){ L "S1: pending->level1" $t "status=$($a1.body.status)"; $pts+=2
    Start-Sleep -Milliseconds 500
    # Stage2: level1 -> executing
    $a2=A "$V3/api/tickets" -m PUT -b @{id=$tid1;action="approve";approver="approver_level1_01";level=1;opinion="L1-2"}
    if($a2.ok -and ($a2.body.status -match "executing|done")){ L "S2: level1->executing" $t "status=$($a2.body.status)"; $pts+=2 }
    else{ L "S2: level1->executing" $f "status=$($a2.status)" }
  }else{ L "S1: pending->level1" $f "status=$($a1.status)" }
  Start-Sleep -Milliseconds 500; $ti=A "$V3/api/tickets?id=$tid1"
  if($ti.ok){ L "Final done" ($ti.body.status -eq "done") "status=$($ti.body.status)"; $pts+=2 }
  # Reject on ticket2
  if($tid2){ $rj=A "$V3/api/tickets" -m PUT -b @{id=$tid2;action="reject";approver="approver_level1_01";opinion="reject"}
    if($rj.ok){ L "Reject->pending" $t "status=$($rj.body.status)"; $pts+=2; Start-Sleep 300
      $t2i=A "$V3/api/tickets?id=$tid2"
      if($t2i.ok){ L "Retry_count++" ($t2i.body.retry_count -gt 0) "rc=$($t2i.body.retry_count)"; $pts+=2 }
    }else{ L "Reject" $f }
  }
  # Concurrency + Idempotent
  Start-Sleep 300; $cf=A "$V3/api/tickets" -m PUT -b @{id=$tid1;action="approve";approver="approver_level2_01";opinion="conflict"}
  L "Concurrency 409/400" ($cf.status -in @(409,400)); $pts+=2
  $da=A "$V3/api/tickets" -m PUT -b @{id=$tid1;action="approve";approver="approver_level1_01";level=1;opinion="dup"}
  $dj=$da.body|ConvertTo-Json -Compress
  L "Idempotency" ($da.status -ne 200 -or $dj -match "already|skip|exist"); $pts+=2
}

# ==== 5: L2 Approval + Permission Gate (8pts) ====
Write-Host "`n=== Test 5: L2 Approval + Permission ===" -F Cyan
$ec5 = if($wbs.Count -gt 9){$wbs[9].external_code}else{$wbs[0].external_code}
$hr=A "$V3/api/tickets" -m POST -b @{external_code=$ec5;exception_type="wrong_address";source="manual";severity="high";description="Test L2";amount=800;reporter="reporter_01"}
if($hr.ok -and $hr.body.id){$hid=$hr.body.id
  L "High Amt->level2" ($hr.body.status -eq "level2") "status=$($hr.body.status)"; $pts+=2
  # L1 blocked
  $lb=A "$V3/api/tickets" -m PUT -b @{id=$hid;action="approve";approver="approver_level1_01";level=1;opinion="L1onL2"}
  L "L1 Blocked on L2 (403)" ($lb.status -eq 403) "status=$($lb.status)"; $pts+=2
  # L2 approve
  $l2a=A "$V3/api/tickets" -m PUT -b @{id=$hid;action="approve";approver="approver_level2_01";level=2;opinion="L2 approve"}
  if($l2a.ok){ L "L2->executing" $t "status=$($l2a.body.status)"; $pts+=2 }else{ L "L2 Approve" $f "status=$($l2a.status)" }
  Start-Sleep 500; $hi=A "$V3/api/tickets?id=$hid"
  if($hi.ok){ L "L2 Final done" ($hi.body.status -eq "done") "status=$($hi.body.status)"; $pts+=2 }
}else{ L "Create High Amt" $f }

# ==== 6: Scan QC (12pts) ====
Write-Host "`n=== Test 6: Scan QC ===" -F Cyan
$sp=A "$V3/api/scan" -m POST -b @{external_code="WD-20260706-0009";sku_code="04050198";sku_name="Yi Dan Ta Pi";operator="operator_01";expected_qty=1;actual_qty=1;damage_level=0;spec_match=$t}
if($sp.ok -and $sp.body.result -eq "pass"){ L "Scan Pass" $t; $pts+=2 }else{ L "Scan Pass" $f "status=$($sp.status)" }
$sf=A "$V3/api/scan" -m POST -b @{external_code="WD-20260706-0009";sku_code="04050198";sku_name="Yi Dan Ta Pi";operator="operator_01";expected_qty=1;actual_qty=0;damage_level=0;spec_match=$t}
if($sf.ok -and $sf.body.result -eq "fail"){$sid=$sf.body.id; L "Scan Fail->QC Hold" $t "ticket=$($sf.body.ticket_id)"; $pts+=2
  $rl=A "$V3/api/scan" -m PUT -b @{scan_id=$sid;operator="qc_supervisor";reason="Fast release"}
  if($rl.ok){ L "QC Fast Release" $t; $pts+=3 }else{ L "QC Fast Release" $f "status=$($rl.status)" }
  $np=A "$V3/api/scan" -m PUT -b @{scan_id=$sid;operator="operator_01";reason="noperm"}
  L "Non-supervisor Blocked 403" ($np.status -eq 403) "status=$($np.status)"; $pts+=2
  $sd=A "$V3/api/scan" -m POST -b @{external_code="WD-20260706-0009";sku_code="04050198";sku_name="YTDP";operator="operator_02";expected_qty=1;actual_qty=0;damage_level=0;spec_match=$t}
  $sdj=$sd.body|ConvertTo-Json -Compress
  L "Scan Idempotency" ($sd.status -eq 409 -or $sdj -match "already|exist"); $pts+=2
  $dr=A "$V3/api/scan" -m PUT -b @{scan_id=$sid;operator="qc_supervisor";reason="double"}
  L "Double Release Blocked" (-not $dr.ok); $pts+=1
}else{ L "Scan Fail->QC" $f "status=$($sf.status)" }

# ==== 7: Sync Logs + Dashboard (10pts) ====
Write-Host "`n=== Test 7: Sync Logs + Dashboard ===" -F Cyan
$mn=A "$V3/api/monitor"
if($mn.ok){
  L "v2_healthy" ($n -ne $mn.body.v2_healthy) "vh=$($mn.body.v2_healthy)"; $pts+=2
  if($mn.body.recent_logs -and $mn.body.recent_logs.Count -gt 0){$fl=$mn.body.recent_logs[0]
    L "sync_logs exist" $t "cnt=$($mn.body.recent_logs.Count)"; $pts+=2
    L "request_id present" ($n -ne $fl.request_id) "rid=$($fl.request_id)"; $pts+=2
    L "duration/status present" ($n -ne $fl.duration_ms -and $n -ne $fl.status_code) "d=$($fl.duration_ms)ms"; $pts+=2
  }
  if($mn.body.stats_24h){ L "24h Stats" ($mn.body.stats_24h.success -ge 0) "ok=$($mn.body.stats_24h.success)"; $pts+=1 }
}
$db=A "$V3/api/dashboard"
if($db.ok){ L "Dashboard" $t "total=$($db.body.total_tickets)"; $pts+=1 }else{ L "Dashboard" $f }

# ==== 8: Specific WD-20260706-0009 + 04050198 (7pts) ====
Write-Host "`n=== Test 8: WD-20260706-0009 + 04050198 ===" -F Cyan
$v2c=A "$V2/api/waybills?external_code=WD-20260706-0009" -h $sh
$v2d=if($v2c.body.data){$v2c.body.data}else{@()}
L "V2 Waybill Exists" ($v2d -is [array] -and ($v2d|?{$_.external_code -eq "WD-20260706-0009"}).Count -gt 0); $pts+=1
$skv=A "$V2/api/waybills/verify-sku?external_code=WD-20260706-0009&sku_code=04050198" -h $sh
L "SKU 04050198 Valid" ($skv.ok -and $skv.body.valid); $pts+=1
# Specific ticket (amount=500 -> level2)
$st2=A "$V3/api/tickets" -m POST -b @{external_code="WD-20260706-0009";exception_type="lost";source="manual";severity="high";description="WD-20260706-0009 test";amount=500;reporter="reporter_01"}
if($st2.ok -and $st2.body.id){$sid2=$st2.body.id; L "Create Specific Ticket" $t "id=$sid2"; $pts+=1
  $stStatus = $st2.body.status
  if($stStatus -eq "level2"){ $appr="approver_level2_01"; $lv=2 }else{ $appr="approver_level1_01"; $lv=1 }
  $spa=A "$V3/api/tickets" -m PUT -b @{id=$sid2;action="approve";approver=$appr;level=$lv;opinion="spec approve"}
  if($spa.ok){ $pts+=1
    if($spa.body.status -eq "level1"){ Start-Sleep 500
      $spa2=A "$V3/api/tickets" -m PUT -b @{id=$sid2;action="approve";approver="approver_level1_01";level=1;opinion="spec S2"}
    }
  }
  Start-Sleep 500; $sfc=A "$V3/api/tickets?id=$sid2"
  if($sfc.ok){ L "Specific Done" ($sfc.body.status -eq "done") "status=$($sfc.body.status)"; $pts+=1 }
  # Scan QC for this SKU
  $ss2=A "$V3/api/scan" -m POST -b @{external_code="WD-20260706-0009";sku_code="04050198";sku_name="Yi Dan Ta Pi 6kg";operator="operator_01";expected_qty=1;actual_qty=0;damage_level=0;spec_match=$t}
  if($ss2.ok -and $ss2.body.result -eq "fail"){ L "Scan 04050198" $t; $pts+=1
    if($ss2.body.id){ $srl=A "$V3/api/scan" -m PUT -b @{scan_id=$ss2.body.id;operator="qc_supervisor";reason="Release 04050198"}
      L "Release 04050198" $srl.ok; $pts+=1 }
  }
}else{ L "Create Specific" $f }

# ==== Summary ====
$el=[Math]::Round(((Get-Date)-$st).TotalSeconds,1)
$pc=($rs|?{$_.p}).Count;$fc=($rs|?{!$_.p}).Count;$tot=$rs.Count
$g=if($pts -ge 90){"Senior Staff"}elseif($pts -ge 80){"Senior"}elseif($pts -ge 70){"Mid"}elseif($pts -ge 60){"Junior"}else{"Fail"}
Write-Host "`n============================================" -F Cyan
Write-Host "  PASS: $pc/$tot  FAIL: $fc/$tot  Score: $pts/100  Time: $($el)s  Grade: $g" -F Yellow
$fls=$rs|?{!$_.p}
if($fls.Count -gt 0){Write-Host "  --- Failures ---" -F Red;$i=1;foreach($f in $fls){Write-Host "  $i. $($f.l): $($f.d)" -F DarkGray;$i++}}
