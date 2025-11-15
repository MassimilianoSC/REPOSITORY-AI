/**
 * Email Notifications - Step 8E
 * Trigger automatici per notifiche email via Firebase Extension "Trigger Email"
 * 
 * Setup richiesto:
 * 1. Installa Firebase Extension: "Trigger Email from Firestore"
 * 2. Configura collection: "mail"
 * 3. Configura SMTP o usa Firebase default
 * 
 * Reference: https://extensions.dev/extensions/firebase/firestore-send-email
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";

interface EmailRecipient {
  email: string;
  name?: string;
}

interface EmailMessage {
  subject: string;
  text: string;
  html?: string;
}

/**
 * Invia email "Documento Non Idoneo" al caricatore
 */
export async function sendDocumentNonIdoneoEmail(
  docPath: string,
  docType: string,
  company: string,
  uploaderEmail: string,
  reason: string
) {
  const db = getFirestore();
  
  await db.collection("mail").add({
    to: [uploaderEmail],
    message: {
      subject: `🔴 Documento ${docType} non idoneo - ${company}`,
      text: `Il documento ${docType} caricato per ${company} è stato valutato come NON IDONEO.\n\nMotivo: ${reason}\n\nAccedi alla piattaforma per maggiori dettagli e caricare una nuova versione.`,
      html: `
        <h2>🔴 Documento Non Idoneo</h2>
        <p>Il documento <strong>${docType}</strong> caricato per <strong>${company}</strong> è stato valutato come <strong>NON IDONEO</strong>.</p>
        <p><strong>Motivo:</strong> ${reason}</p>
        <p><a href="https://app.sikuro.it/document/${docPath.split('/').pop()}">Visualizza dettagli</a></p>
        <p>Accedi alla piattaforma per caricare una nuova versione.</p>
      `,
    },
    timestamp: FieldValue.serverTimestamp(),
  });

  console.log(JSON.stringify({
    type: "email_sent",
    emailType: "doc_non_idoneo",
    docPath,
    to: uploaderEmail,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Invia email "Nuovo Documento da Verificare" al verificatore
 */
export async function sendNewDocumentForVerifierEmail(
  docPath: string,
  docType: string,
  company: string,
  verifierEmail: string
) {
  const db = getFirestore();
  
  await db.collection("mail").add({
    to: [verifierEmail],
    message: {
      subject: `🔔 Nuovo documento da verificare - ${company} / ${docType}`,
      text: `Un nuovo documento ${docType} è stato caricato da ${company} ed è in attesa di verifica.\n\nAccedi alla piattaforma per verificarlo.`,
      html: `
        <h2>🔔 Nuovo Documento da Verificare</h2>
        <p>Un nuovo documento <strong>${docType}</strong> è stato caricato da <strong>${company}</strong> ed è in attesa di verifica.</p>
        <p><a href="https://app.sikuro.it/document/${docPath.split('/').pop()}">Verifica ora</a></p>
      `,
    },
    timestamp: FieldValue.serverTimestamp(),
  });

  console.log(JSON.stringify({
    type: "email_sent",
    emailType: "new_doc_for_verifier",
    docPath,
    to: verifierEmail,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Invia email "Documento in Scadenza" al caricatore
 */
export async function sendDocumentExpiringEmail(
  docPath: string,
  docType: string,
  company: string,
  uploaderEmail: string,
  expiresAt: Date,
  daysRemaining: number
) {
  const db = getFirestore();
  
  await db.collection("mail").add({
    to: [uploaderEmail],
    message: {
      subject: `🟠 Documento ${docType} in scadenza tra ${daysRemaining} giorni - ${company}`,
      text: `Il documento ${docType} di ${company} scadrà il ${expiresAt.toLocaleDateString('it-IT')} (tra ${daysRemaining} giorni).\n\nAccedi alla piattaforma per caricare una nuova versione.`,
      html: `
        <h2>🟠 Documento in Scadenza</h2>
        <p>Il documento <strong>${docType}</strong> di <strong>${company}</strong> scadrà il <strong>${expiresAt.toLocaleDateString('it-IT')}</strong> (tra ${daysRemaining} giorni).</p>
        <p><a href="https://app.sikuro.it/upload">Carica nuova versione</a></p>
      `,
    },
    timestamp: FieldValue.serverTimestamp(),
  });

  console.log(JSON.stringify({
    type: "email_sent",
    emailType: "doc_expiring",
    docPath,
    to: uploaderEmail,
    daysRemaining,
    timestamp: new Date().toISOString(),
  }));
}

