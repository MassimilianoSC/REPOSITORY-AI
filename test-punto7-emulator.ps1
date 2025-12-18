# PowerShell: Test PUNTO 7 in Emulator
# Repository AI - Multi-Tenancy

$PROJECT_ID = "repository-ai-477311"
$REGION = "europe-west1"
$BASE_URL = "http://localhost:5001/$PROJECT_ID/$REGION"

Write-Host "🧪 Test PUNTO 7 - Emulator" -ForegroundColor Cyan
Write-Host "===========================" -ForegroundColor Cyan
Write-Host ""

Write-Host "⚠️  PREREQUISITI:" -ForegroundColor Yellow
Write-Host "1. Emulator running: firebase emulators:start"
Write-Host "2. Decommentare export devSetClaims in functions/src/index.ts"
Write-Host "3. Rebuild: cd functions; npm run build"
Write-Host ""
Write-Host "Premi ENTER per continuare o CTRL+C per uscire..."
Read-Host

# === TEST 1: Crea Custom Claims ===
Write-Host ""
Write-Host "📝 Test 1: Setta Custom Claims" -ForegroundColor Yellow
Write-Host ""

Write-Host "Inserisci UID utente Owner (da Auth UI): " -NoNewline
$OWNER_UID = Read-Host

Write-Host "Inserisci UID utente Manager (da Auth UI): " -NoNewline
$MANAGER_UID = Read-Host

Write-Host "Inserisci UID utente Member (da Auth UI): " -NoNewline
$MEMBER_UID = Read-Host

Write-Host ""
Write-Host "Settando claims..." -ForegroundColor White

# Owner T1
$url1 = "$BASE_URL/devSetClaims?uid=$OWNER_UID&tenant_id=T1&role=Owner"
Write-Host "  [1/3] Owner T1..." -ForegroundColor White
$response1 = Invoke-RestMethod -Uri $url1 -Method Get
if ($response1 -eq "ok") {
  Write-Host "  ✅ Owner T1 claims set!" -ForegroundColor Green
}

# Manager T1
$url2 = "$BASE_URL/devSetClaims?uid=$MANAGER_UID&tenant_id=T1&role=Manager"
Write-Host "  [2/3] Manager T1..." -ForegroundColor White
$response2 = Invoke-RestMethod -Uri $url2 -Method Get
if ($response2 -eq "ok") {
  Write-Host "  ✅ Manager T1 claims set!" -ForegroundColor Green
}

# Member T1/C1
$url3 = "$BASE_URL/devSetClaims?uid=$MEMBER_UID&tenant_id=T1&role=Member&company_id=C1"
Write-Host "  [3/3] Member T1/C1..." -ForegroundColor White
$response3 = Invoke-RestMethod -Uri $url3 -Method Get
if ($response3 -eq "ok") {
  Write-Host "  ✅ Member T1/C1 claims set!" -ForegroundColor Green
}

# === TEST 2: Crea Dati Test ===
Write-Host ""
Write-Host "📂 Test 2: Crea Dati Test in Firestore" -ForegroundColor Yellow
Write-Host ""

Write-Host "Vai a Firestore UI: http://localhost:4000/firestore" -ForegroundColor Cyan
Write-Host ""
Write-Host "Crea questi documenti:" -ForegroundColor White
Write-Host ""
Write-Host "1. tenants/T1/companies/C1/documents/DOC1"
Write-Host "   { status: 'green', docType: 'DURC' }"
Write-Host ""
Write-Host "2. tenants/T1/companies/C2/documents/DOC2"
Write-Host "   { status: 'yellow', docType: 'VISURA' }"
Write-Host ""
Write-Host "3. tenants/T1/kb_chunks/CHUNK1"
Write-Host "   { text: 'Normativa DURC...', source: 'kb/durc.pdf' }"
Write-Host ""
Write-Host "Premi ENTER quando hai finito..."
Read-Host

# === TEST 3: Verifica Rules ===
Write-Host ""
Write-Host "🔐 Test 3: Verifica Firestore Rules" -ForegroundColor Yellow
Write-Host ""

Write-Host "Test da eseguire manualmente (client SDK o Rules Playground):" -ForegroundColor White
Write-Host ""
Write-Host "✅ DOVREBBERO PASSARE:" -ForegroundColor Green
Write-Host "  - Member T1/C1 READ  tenants/T1/companies/C1/documents/DOC1"
Write-Host "  - Member T1/C1 WRITE tenants/T1/companies/C1/documents/DOC1"
Write-Host "  - Member T1/C1 READ  tenants/T1/kb_chunks/CHUNK1"
Write-Host "  - Manager T1   READ  tenants/T1/companies/C1/documents/DOC1"
Write-Host "  - Manager T1   READ  tenants/T1/companies/C2/documents/DOC2"
Write-Host "  - Manager T1   WRITE tenants/T1/kb_chunks/CHUNK1"
Write-Host ""
Write-Host "❌ DOVREBBERO FALLIRE:" -ForegroundColor Red
Write-Host "  - Member T1/C1 READ  tenants/T1/companies/C2/documents/DOC2"
Write-Host "  - Member T1/C1 WRITE tenants/T1/kb_chunks/CHUNK1"
Write-Host "  - Manager T1   READ  tenants/T2/companies/C1/documents/DOC3"
Write-Host ""

Write-Host "Verifica Rules Playground: http://localhost:4000/firestore" -ForegroundColor Cyan
Write-Host ""

# === TEST 4: Flusso Inviti ===
Write-Host ""
Write-Host "✉️  Test 4: Flusso Inviti" -ForegroundColor Yellow
Write-Host ""

Write-Host "1. Crea invito in Firestore:" -ForegroundColor White
Write-Host "   tenants/T1/invites/INV1"
Write-Host "   {"
Write-Host '     email: "newuser@test.com",'
Write-Host '     role: "Member",'
Write-Host '     company_id: "C1",'
Write-Host '     expiresAt: Timestamp(2025-12-31),'
Write-Host '     accepted: false'
Write-Host "   }"
Write-Host ""
Write-Host "2. Autentica newuser@test.com (email-link o custom token)"
Write-Host ""
Write-Host "3. Chiama acceptInvite dal client:"
Write-Host '   httpsCallable(functions, "acceptInvite")({ tid: "T1", inviteId: "INV1" })'
Write-Host ""
Write-Host "4. Reload token: await auth.currentUser.getIdToken(true)"
Write-Host ""
Write-Host "5. Verifica claims: await auth.currentUser.getIdTokenResult()"
Write-Host ""

# === RIEPILOGO ===
Write-Host ""
Write-Host "===========================" -ForegroundColor Cyan
Write-Host "🎯 Test Setup Completato!" -ForegroundColor Green
Write-Host ""
Write-Host "UIDs configurati:" -ForegroundColor White
Write-Host "  Owner:   $OWNER_UID (T1)" -ForegroundColor Cyan
Write-Host "  Manager: $MANAGER_UID (T1)" -ForegroundColor Cyan
Write-Host "  Member:  $MEMBER_UID (T1/C1)" -ForegroundColor Cyan
Write-Host ""
Write-Host "📚 Vedi dettagli test:" -ForegroundColor White
Write-Host "   docs/MULTI_TENANCY_GUIDE.md" -ForegroundColor Cyan
Write-Host ""

