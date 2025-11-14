# Script PowerShell per creare metriche e alert
# Esegui dopo aver installato gcloud CLI e fatto login con: gcloud auth login

# Set project
gcloud config set project repository-ai-477311

# ============================================
# STEP 1: Crea Metriche Log-Based
# ============================================

Write-Host "Creating metric: expiry_alerts_sent..." -ForegroundColor Cyan

gcloud logging metrics create expiry_alerts_sent `
  --description="Numero di email inviate per esecuzione (sendExpiryAlerts|DryRun)" `
  --log-filter='resource.type="cloud_function" AND jsonPayload.type="expiryAlerts"' `
  --value-extractor='EXTRACT(jsonPayload.sent)' `
  --metric-kind=DELTA `
  --value-type=INT64

Write-Host "Creating metric: expiry_alerts_errors..." -ForegroundColor Cyan

gcloud logging metrics create expiry_alerts_errors `
  --description="Errori nelle funzioni di alert scadenze" `
  --log-filter='resource.type="cloud_function" AND severity>=ERROR AND (labels.function_name="sendExpiryAlerts" OR labels.function_name="sendExpiryAlertsDryRun")' `
  --metric-kind=DELTA `
  --value-type=INT64

# ============================================
# STEP 2: Crea Alert Policy per Errori
# ============================================

Write-Host "Creating alert policy: errors..." -ForegroundColor Cyan

@'
{
  "displayName": "Expiry Alerts - ERROR > 0 (1h)",
  "combiner": "OR",
  "conditions": [{
    "displayName": "expiry_alerts_errors > 0",
    "conditionThreshold": {
      "filter": "metric.type=\"logging.googleapis.com/user/expiry_alerts_errors\"",
      "aggregations": [{ "alignmentPeriod": "3600s", "perSeriesAligner": "ALIGN_SUM" }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 0,
      "duration": "0s",
      "trigger": { "count": 1 }
    }
  }],
  "notificationChannels": []
}
'@ | Set-Content -Encoding UTF8 alert_errors.json

gcloud alpha monitoring policies create --policy-from-file=alert_errors.json

# ============================================
# STEP 3: Crea Alert Policy per Zero Emails
# ============================================

Write-Host "Creating alert policy: zero emails..." -ForegroundColor Cyan

@'
{
  "displayName": "Expiry Alerts - Zero emails sent (2h)",
  "combiner": "OR",
  "conditions": [{
    "displayName": "expiry_alerts_sent == 0",
    "conditionThreshold": {
      "filter": "metric.type=\"logging.googleapis.com/user/expiry_alerts_sent\"",
      "aggregations": [{ "alignmentPeriod": "3600s", "perSeriesAligner": "ALIGN_SUM" }],
      "comparison": "COMPARISON_EQ",
      "thresholdValue": 0,
      "duration": "7200s",
      "trigger": { "count": 1 }
    }
  }],
  "notificationChannels": []
}
'@ | Set-Content -Encoding UTF8 alert_zero_emails.json

gcloud alpha monitoring policies create --policy-from-file=alert_zero_emails.json

Write-Host "Done! Check Cloud Console for metrics and alerts." -ForegroundColor Green
Write-Host "Add notification channels in: https://console.cloud.google.com/monitoring/alerting?project=repository-ai-477311" -ForegroundColor Yellow

# Cleanup
Remove-Item alert_errors.json, alert_zero_emails.json -ErrorAction SilentlyContinue

