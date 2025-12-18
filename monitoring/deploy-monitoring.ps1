# PowerShell: Deploy completo monitoring per Expiry Alerts
# Repository AI - Step 6.B completato

$PROJECT_ID = "repository-ai-477311"

Write-Host "🚀 Deploy Monitoring Completo - Expiry Alerts" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# === STEP 1: Metriche ===
Write-Host "📊 Step 1: Creazione Metriche Log-Based" -ForegroundColor Yellow
Write-Host ""

# Metrica 1: Email Sent (Counter)
Write-Host "  [1/2] Metrica: expiry_alerts_email_sent (Counter)..." -ForegroundColor White
gcloud logging metrics create expiry_alerts_email_sent `
  --project=$PROJECT_ID `
  --description="Conteggio email di scadenza inviate (una entry per email)" `
  --log-filter='resource.type="cloud_function"
               AND (labels.function_name="sendExpiryAlerts" OR labels.function_name="sendExpiryAlertsDryRun")
               AND jsonPayload.type="expiryAlerts"
               AND jsonPayload.event="email_sent"' 2>&1

if ($LASTEXITCODE -eq 0) {
  Write-Host "  ✅ expiry_alerts_email_sent creata!" -ForegroundColor Green
} else {
  Write-Host "  ⚠️  Metrica già esistente o errore (ok se già presente)" -ForegroundColor Yellow
}

# Metrica 2: Errors (Counter)
Write-Host "  [2/2] Metrica: expiry_alerts_errors (Counter)..." -ForegroundColor White
gcloud logging metrics create expiry_alerts_errors `
  --project=$PROJECT_ID `
  --description="Conteggio errori nelle funzioni sendExpiryAlerts" `
  --log-filter='resource.type="cloud_function"
               AND (labels.function_name="sendExpiryAlerts" OR labels.function_name="sendExpiryAlertsDryRun")
               AND (severity="ERROR" OR severity="CRITICAL")' 2>&1

if ($LASTEXITCODE -eq 0) {
  Write-Host "  ✅ expiry_alerts_errors creata!" -ForegroundColor Green
} else {
  Write-Host "  ⚠️  Metrica già esistente o errore (ok se già presente)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "⏳ Attendere 2 minuti per propagazione metriche..." -ForegroundColor Cyan
Start-Sleep -Seconds 120

# === STEP 2: Alert Policies ===
Write-Host ""
Write-Host "🔔 Step 2: Creazione Alert Policies" -ForegroundColor Yellow
Write-Host ""

# Alert 1: Heartbeat
Write-Host "  [1/3] Alert: Heartbeat Missing (Metric Absence)..." -ForegroundColor White
gcloud alpha monitoring policies create `
  --project=$PROJECT_ID `
  --policy-from-file=monitoring/alerts/heartbeat-absence.json 2>&1

if ($LASTEXITCODE -eq 0) {
  Write-Host "  ✅ Heartbeat alert creato!" -ForegroundColor Green
} else {
  Write-Host "  ⚠️  Alert già esistente o errore" -ForegroundColor Yellow
}

# Alert 2: Zero Emails
Write-Host "  [2/3] Alert: Zero Emails Sent..." -ForegroundColor White
gcloud alpha monitoring policies create `
  --project=$PROJECT_ID `
  --policy-from-file=monitoring/alerts/zero-emails.json 2>&1

if ($LASTEXITCODE -eq 0) {
  Write-Host "  ✅ Zero Emails alert creato!" -ForegroundColor Green
} else {
  Write-Host "  ⚠️  Alert già esistente o errore" -ForegroundColor Yellow
}

# Alert 3: Errors
Write-Host "  [3/3] Alert: Errors Detected..." -ForegroundColor White
gcloud alpha monitoring policies create `
  --project=$PROJECT_ID `
  --policy-from-file=monitoring/alerts/errors.json 2>&1

if ($LASTEXITCODE -eq 0) {
  Write-Host "  ✅ Errors alert creato!" -ForegroundColor Green
} else {
  Write-Host "  ⚠️  Alert già esistente o errore" -ForegroundColor Yellow
}

# === RIEPILOGO ===
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "✅ Deploy Monitoring Completato!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Metriche create:" -ForegroundColor White
Write-Host "   - expiry_alerts_email_sent (Counter)"
Write-Host "   - expiry_alerts_errors (Counter)"
Write-Host ""
Write-Host "🔔 Alert Policies create:" -ForegroundColor White
Write-Host "   - Heartbeat Missing (23.5h metric absence)"
Write-Host "   - Zero Emails Sent (threshold < 1 in 2h)"
Write-Host "   - Errors Detected (threshold > 0 in 1h)"
Write-Host ""
Write-Host "🌐 Console Links:" -ForegroundColor White
Write-Host "   Metriche: https://console.cloud.google.com/logs/metrics?project=$PROJECT_ID" -ForegroundColor Cyan
Write-Host "   Alerts:   https://console.cloud.google.com/monitoring/alerting/policies?project=$PROJECT_ID" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  IMPORTANTE: Configura Notification Channels per ricevere alert!" -ForegroundColor Yellow
Write-Host "   https://console.cloud.google.com/monitoring/alerting/notifications?project=$PROJECT_ID" -ForegroundColor Cyan
Write-Host ""

