# PowerShell: Crea metrica Counter per errori nelle funzioni di alert scadenze

gcloud logging metrics create expiry_alerts_errors `
  --project=repository-ai-477311 `
  --description="Conteggio errori nelle funzioni sendExpiryAlerts" `
  --log-filter='resource.type="cloud_function"
               AND (labels.function_name="sendExpiryAlerts" OR labels.function_name="sendExpiryAlertsDryRun")
               AND (severity="ERROR" OR severity="CRITICAL")'

Write-Host "✅ Metrica Counter 'expiry_alerts_errors' creata con successo!" -ForegroundColor Green
Write-Host ""
Write-Host "Verifica su: https://console.cloud.google.com/logs/metrics?project=repository-ai-477311"

