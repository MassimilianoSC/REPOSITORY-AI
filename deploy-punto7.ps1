# PowerShell: Deploy PUNTO 7 - Multi-Tenancy + Custom Claims
# Repository AI

$PROJECT_ID = "repository-ai-477311"

Write-Host "🚀 Deploy PUNTO 7: Multi-Tenancy + Custom Claims" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# === STEP 1: Build Functions ===
Write-Host "🔨 Step 1: Build Functions" -ForegroundColor Yellow
Write-Host ""

cd functions
npm run build

if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ Build failed!" -ForegroundColor Red
  exit 1
}

Write-Host "✅ Functions built successfully!" -ForegroundColor Green
cd ..

# === STEP 2: Deploy Firestore Rules ===
Write-Host ""
Write-Host "📜 Step 2: Deploy Firestore Rules" -ForegroundColor Yellow
Write-Host ""

firebase deploy --only firestore:rules --project=$PROJECT_ID

if ($LASTEXITCODE -eq 0) {
  Write-Host "✅ Firestore rules deployed!" -ForegroundColor Green
} else {
  Write-Host "⚠️  Firestore rules deploy failed" -ForegroundColor Yellow
}

# === STEP 3: Deploy Storage Rules ===
Write-Host ""
Write-Host "🗄️  Step 3: Deploy Storage Rules" -ForegroundColor Yellow
Write-Host ""

firebase deploy --only storage:rules --project=$PROJECT_ID

if ($LASTEXITCODE -eq 0) {
  Write-Host "✅ Storage rules deployed!" -ForegroundColor Green
} else {
  Write-Host "⚠️  Storage rules deploy failed" -ForegroundColor Yellow
}

# === STEP 4: Deploy Functions ===
Write-Host ""
Write-Host "⚡ Step 4: Deploy Functions" -ForegroundColor Yellow
Write-Host ""

Write-Host "Deploying acceptInvite (production)..." -ForegroundColor White
firebase deploy --only functions:acceptInvite --project=$PROJECT_ID

if ($LASTEXITCODE -eq 0) {
  Write-Host "✅ acceptInvite deployed!" -ForegroundColor Green
} else {
  Write-Host "⚠️  acceptInvite deploy failed" -ForegroundColor Yellow
}

# === RIEPILOGO ===
Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "✅ Deploy PUNTO 7 Completato!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Componenti deployati:" -ForegroundColor White
Write-Host "   - Firestore Rules (multi-tenant + company scope)"
Write-Host "   - Storage Rules (path matching claims)"
Write-Host "   - Function: acceptInvite (callable)"
Write-Host ""
Write-Host "🧪 Test Emulator:" -ForegroundColor White
Write-Host "   1. firebase emulators:start"
Write-Host "   2. Crea utenti in Auth UI"
Write-Host "   3. Setta claims con devSetClaims (vedi docs)"
Write-Host "   4. Testa Firestore/Storage rules"
Write-Host ""
Write-Host "📚 Documentazione:" -ForegroundColor White
Write-Host "   docs/MULTI_TENANCY_GUIDE.md" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  TODO Manuale:" -ForegroundColor Yellow
Write-Host "   - Abilitare Email-Link Auth in Console:"
Write-Host "     https://console.firebase.google.com/project/$PROJECT_ID/authentication/providers" -ForegroundColor Cyan
Write-Host "   - Aggiungere domini autorizzati (localhost, *.web.app)"
Write-Host ""

