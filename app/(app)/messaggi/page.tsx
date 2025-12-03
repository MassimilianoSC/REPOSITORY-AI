'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Send, Loader2, Building2, AlertCircle, 
  Users, ChevronRight, Sparkles, Clock
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useMessages } from '@/hooks/useMessages';
import { getFirebaseDb } from '@/lib/firebaseClient';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';

type Company = { id: string; name: string };

export default function MessaggiPage() {
  const { tenantId, role, companyIds, uid, email, loading: authLoading } = useAuth();
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isHQ = role === 'manager' || role === 'verifier';

  // Carica lista aziende
  useEffect(() => {
    if (!tenantId || authLoading) {
      setCompaniesLoading(false);
      return;
    }

    const db = getFirebaseDb();

    if (isHQ) {
      // HQ: carica tutte le aziende
      const q = query(
        collection(db, `tenants/${tenantId}/companies`),
        orderBy('name', 'asc')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list: Company[] = [];
        snapshot.forEach((doc) => {
          if (doc.data().isActive !== false) {
            list.push({ id: doc.id, name: doc.data().name || doc.id });
          }
        });
        setCompanies(list);
        setCompaniesLoading(false);
        // Auto-seleziona la prima azienda se nessuna selezionata
        if (list.length > 0 && !selectedCompany) {
          setSelectedCompany(list[0].id);
        }
      });
      return () => unsubscribe();
    } else {
      // Uploader: carica solo le proprie aziende
      const loadCompanies = async () => {
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const list: Company[] = [];
          for (const cid of companyIds) {
            const docRef = doc(db, `tenants/${tenantId}/companies/${cid}`);
            const snap = await getDoc(docRef);
            if (snap.exists() && snap.data().isActive !== false) {
              list.push({ id: snap.id, name: snap.data().name || snap.id });
            }
          }
          setCompanies(list);
          // Auto-seleziona se c'è una sola azienda
          if (list.length === 1) {
            setSelectedCompany(list[0].id);
          } else if (list.length > 0 && !selectedCompany) {
            setSelectedCompany(list[0].id);
          }
        } catch (err) {
          console.error('Error loading companies:', err);
        } finally {
          setCompaniesLoading(false);
        }
      };
      loadCompanies();
    }
  }, [tenantId, authLoading, isHQ, companyIds, selectedCompany]);

  // Hook messaggi
  const { messages, loading: messagesLoading, sendMessage, sending } = useMessages(
    tenantId || '',
    selectedCompany,
    uid || '',
    email || '',
    role as 'manager' | 'verifier' | 'uploader'
  );

  // Scroll automatico ai nuovi messaggi
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Invia messaggio
  const handleSend = async () => {
    if (!messageText.trim() || sending) return;
    try {
      await sendMessage(messageText);
      setMessageText('');
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Errore invio messaggio');
    }
  };

  // Loading
  if (authLoading || companiesLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center text-slate-500">
          <Loader2 className="w-12 h-12 mx-auto mb-3 animate-spin text-slate-400" />
          <p>Caricamento...</p>
        </div>
      </div>
    );
  }

  // Non autenticato
  if (!tenantId) {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-slate-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-yellow-400" />
          <p>Sessione non valida. Effettua nuovamente il login.</p>
        </div>
      </div>
    );
  }

  const selectedCompanyName = companies.find(c => c.id === selectedCompany)?.name || selectedCompany;

  return (
    <div className="p-8 max-w-6xl mx-auto h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <MessageSquare className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600">
                Messaggi
              </h1>
              <p className="text-slate-500 mt-1">
                {isHQ ? 'Comunica con le aziende fornitrici' : 'Comunica con HQ'}
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-xl border border-indigo-200">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-medium text-indigo-700">Chat</span>
          </div>
        </div>
      </div>

      {/* Layout Chat */}
      <div className="flex gap-6 h-[calc(100%-120px)]">
        {/* Sidebar Aziende (solo se più di una azienda o HQ) */}
        {(isHQ || companies.length > 1) && (
          <div className="w-72 flex-shrink-0">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 h-full overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50">
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-500" />
                  {isHQ ? 'Aziende' : 'Le tue Aziende'}
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {companies.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    Nessuna azienda disponibile
                  </div>
                ) : (
                  <div className="space-y-1">
                    {companies.map((company) => (
                      <button
                        key={company.id}
                        onClick={() => setSelectedCompany(company.id)}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all ${
                          selectedCompany === company.id
                            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25'
                            : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          selectedCompany === company.id 
                            ? 'bg-white/20' 
                            : 'bg-gradient-to-br from-slate-100 to-slate-200'
                        }`}>
                          <Building2 className={`w-5 h-5 ${
                            selectedCompany === company.id ? 'text-white' : 'text-slate-500'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{company.name}</p>
                          <p className={`text-xs truncate ${
                            selectedCompany === company.id ? 'text-indigo-100' : 'text-slate-400'
                          }`}>
                            {company.id}
                          </p>
                        </div>
                        {selectedCompany === company.id && (
                          <ChevronRight className="w-4 h-4 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Area Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedCompany ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 h-full overflow-hidden flex flex-col">
              {/* Header Chat */}
              <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-800">{selectedCompanyName}</h2>
                    <p className="text-xs text-slate-500">
                      {isHQ ? 'Chat con azienda fornitrice' : 'Chat con HQ'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Messaggi */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                {messagesLoading ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
                      <MessageSquare className="w-8 h-8 text-indigo-400" />
                    </div>
                    <p className="text-slate-500 font-medium">Nessun messaggio</p>
                    <p className="text-sm text-slate-400 mt-1">
                      Inizia la conversazione inviando un messaggio
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOwnMessage = msg.senderUid === uid;
                    const isFromHQ = msg.senderRole === 'manager' || msg.senderRole === 'verifier';
                    
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[70%] ${isOwnMessage ? 'order-2' : 'order-1'}`}>
                          {/* Sender info */}
                          <div className={`flex items-center gap-2 mb-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                            <span className={`text-xs font-medium ${
                              isFromHQ ? 'text-indigo-600' : 'text-emerald-600'
                            }`}>
                              {isOwnMessage ? 'Tu' : (isFromHQ ? 'HQ' : msg.senderEmail?.split('@')[0])}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              isFromHQ ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {isFromHQ ? (msg.senderRole === 'manager' ? 'Admin' : 'Verifier') : 'Azienda'}
                            </span>
                          </div>
                          
                          {/* Message bubble */}
                          <div className={`px-4 py-3 rounded-2xl ${
                            isOwnMessage
                              ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-br-md'
                              : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm'
                          }`}>
                            <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                          </div>
                          
                          {/* Timestamp */}
                          <div className={`flex items-center gap-1 mt-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span className="text-[10px] text-slate-400">
                              {msg.createdAt instanceof Date 
                                ? msg.createdAt.toLocaleString('it-IT', { 
                                    day: '2-digit', 
                                    month: '2-digit', 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                  })
                                : '...'
                              }
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input messaggio */}
              <div className="p-4 border-t border-slate-100 bg-white">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Scrivi un messaggio..."
                    className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    disabled={sending}
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !messageText.trim()}
                    className="px-5 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/25 flex items-center gap-2 font-medium"
                  >
                    {sending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        Invia
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 h-full flex items-center justify-center">
              <div className="text-center">
                <Users className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <p className="text-slate-500 font-medium">Seleziona un&apos;azienda</p>
                <p className="text-sm text-slate-400 mt-1">
                  Scegli un&apos;azienda dalla lista per iniziare a chattare
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
