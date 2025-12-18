# PowerShell: Crea metrica Counter per email scadenze inviate (una entry per email)

gcloud logging metrics create expiry_alerts_email_sent `
  --project=repository-ai-477311 `
  --description="Conteggio email di scadenza inviate (una entry per email)" `
  --log-filter='resource.type="cloud_function"
               AND (labels.function_name="sendExpiryAlerts" OR labels.function_name="sendExpiryAlertsDryRun")
               AND jsonPayload.type="expiryAlerts"
               AND jsonPayload.event="email_sent"'

Write-Host "✅ Metrica Counter 'expiry_alerts_email_sent' creata con successo!" -ForegroundColor Green
Write-Host ""
Write-Host "Verifica su: https://console.cloud.google.com/logs/metrics?project=repository-ai-477311"

