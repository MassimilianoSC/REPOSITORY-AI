'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  X, Building2, HardHat, FileText, Users, ChevronRight, 
  Clock, ArrowRight, Check, MapPin, ExternalLink
} from 'lucide-react';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebaseClient';

interface NavigationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  isHQ: boolean;
  companyIds?: string[];
}

interface Company {
  id: string;
  name: string;
}

interface Cantiere {
  id: string;
  nome: string;
  indirizzo?: string;
}

type Destination = 'imprese' | 'documenti-itp' | 'cantiere-gestione' | 'documenti-cantiere' | 'personale';

const DESTINATIONS = [
  { 
    key: 'documenti-itp' as Destination, 
    label: 'Documenti Impresa (ITP)', 
    icon: FileText, 
    color: 'text-violet-600 bg-violet-100',
    description: 'Documenti idoneità tecnico-professionale',
    requiresCantiere: false,
  },
  { 
    key: 'cantiere-gestione' as Destination, 
    label: 'Gestisci Cantiere', 
    icon: HardHat, 
    color: 'text-orange-600 bg-orange-100',
    description: 'Modifica dettagli e informazioni cantiere',
    requiresCantiere: true,
  },
  { 
    key: 'documenti-cantiere' as Destination, 
    label: 'Documenti Cantiere', 
    icon: FileText, 
    color: 'text-amber-600 bg-amber-100',
    description: 'PSC, POS, Accettazione PSC',
    requiresCantiere: true,
  },
  { 
    key: 'personale' as Destination, 
    label: 'Personale', 
    icon: Users, 
    color: 'text-blue-600 bg-blue-100',
    description: 'Archivio dipendenti e documenti',
    requiresCantiere: false, // Può essere filtrato per cantiere, ma non obbligatorio
  },
];

export function NavigationSheet({ isOpen, onClose, tenantId, isHQ, companyIds = [] }: NavigationSheetProps) {
  const router = useRouter();
  
  // Step corrente (1, 2, 3)
  const [currentStep, setCurrentStep] = useState(1);
  
  // Selezioni
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [selectedCantiere, setSelectedCantiere] = useState<Cantiere | null>(null);
  const [selectedDestination, setSelectedDestination] = useState<Destination | null>(null);
  
  // Dati
  const [companies, setCompanies] = useState<Company[]>([]);
  const [cantieri, setCantieri] = useState<Cantiere[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Recenti (localStorage)
  const [recents, setRecents] = useState<{companyId: string; companyName: string}[]>([]);

  // Carica recenti da localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('nav-recents');
      if (stored) {
        try {
          setRecents(JSON.parse(stored));
        } catch {}
      }
    }
  }, []);

  // Salva nei recenti
  const saveToRecents = (company: Company) => {
    const newRecents = [
      { companyId: company.id, companyName: company.name },
      ...recents.filter(r => r.companyId !== company.id)
    ].slice(0, 5);
    setRecents(newRecents);
    localStorage.setItem('nav-recents', JSON.stringify(newRecents));
  };

  // Carica imprese
  useEffect(() => {
    if (!isOpen || !tenantId) return;
    
    setLoading(true);
    const db = getFirebaseDb();
    
    if (isHQ) {
      // HQ vede tutte le imprese
      const q = query(
        collection(db, `tenants/${tenantId}/companies`),
        orderBy('name', 'asc')
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs
          .filter(doc => doc.data().isActive !== false)
          .map(doc => ({ id: doc.id, name: doc.data().name as string }));
        setCompanies(list);
        setLoading(false);
      });
      
      return () => unsubscribe();
    } else {
      // Uploader vede solo le sue imprese
      const loadCompanies = async () => {
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
        setLoading(false);
      };
      
      loadCompanies();
    }
  }, [isOpen, tenantId, isHQ, companyIds]);

  // Carica cantieri quando selezioni un'impresa
  useEffect(() => {
    if (!selectedCompany || !tenantId) {
      setCantieri([]);
      return;
    }
    
    const db = getFirebaseDb();
    const q = query(
      collection(db, `tenants/${tenantId}/companies/${selectedCompany.id}/cantieri`),
      orderBy('nome', 'asc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs
        .filter(doc => doc.data().isActive !== false)
        .map(doc => ({ 
          id: doc.id, 
          nome: doc.data().nome as string,
          indirizzo: doc.data().indirizzo as string | undefined
        }));
      setCantieri(list);
    });
    
    return () => unsubscribe();
  }, [selectedCompany, tenantId]);

  // Reset quando si chiude
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(1);
      setSelectedCompany(null);
      setSelectedCantiere(null);
      setSelectedDestination(null);
    }
  }, [isOpen]);

  // Seleziona impresa
  const handleSelectCompany = (company: Company) => {
    setSelectedCompany(company);
    setSelectedCantiere(null);
    setSelectedDestination(null);
    saveToRecents(company);
    setCurrentStep(2);
  };

  // Seleziona cantiere
  const handleSelectCantiere = (cantiere: Cantiere | null) => {
    setSelectedCantiere(cantiere);
    setSelectedDestination(null);
    setCurrentStep(3);
  };

  // Vai alla destinazione
  const handleGo = () => {
    if (!selectedCompany || !selectedDestination) return;
    
    let url = '';
    
    switch (selectedDestination) {
      case 'imprese':
        url = '/admin/aziende';
        break;
      case 'documenti-itp':
        url = `/upload?tab=itp&company=${encodeURIComponent(selectedCompany.id)}`;
        break;
      case 'cantiere-gestione':
        url = `/cantieri?cid=${encodeURIComponent(selectedCompany.id)}`;
        break;
      case 'documenti-cantiere':
        url = `/upload?tab=cantieri&company=${encodeURIComponent(selectedCompany.id)}${selectedCantiere ? `&cantiere=${encodeURIComponent(selectedCantiere.id)}` : ''}`;
        break;
      case 'personale':
        url = `/upload?tab=personale&company=${encodeURIComponent(selectedCompany.id)}${selectedCantiere ? `&cantiere=${encodeURIComponent(selectedCantiere.id)}` : ''}`;
        break;
    }
    
    router.push(url);
    onClose();
  };

  // Breadcrumb
  const breadcrumb = [
    selectedCompany?.name,
    selectedCantiere?.nome,
    DESTINATIONS.find(d => d.key === selectedDestination)?.label
  ].filter(Boolean).join(' / ');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Sheet */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Naviga</h2>
              {breadcrumb && (
                <p className="text-sm text-teal-600 font-medium mt-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {breadcrumb}
                </p>
              )}
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Stepper */}
          <div className="flex items-center gap-2 mt-4">
            {[
              { step: 1, label: 'Impresa', icon: Building2 },
              { step: 2, label: 'Cantiere', icon: HardHat },
              { step: 3, label: 'Destinazione', icon: ArrowRight },
            ].map((item, idx) => (
              <div key={item.step} className="flex items-center">
                <button
                  onClick={() => item.step < currentStep && setCurrentStep(item.step)}
                  disabled={item.step > currentStep}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    item.step === currentStep
                      ? 'bg-teal-500 text-white shadow-sm'
                      : item.step < currentStep
                      ? 'bg-teal-100 text-teal-700 hover:bg-teal-200 cursor-pointer'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {item.step < currentStep ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <item.icon className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">{item.label}</span>
                  <span className="sm:hidden">{item.step}</span>
                </button>
                {idx < 2 && (
                  <ChevronRight className={`w-4 h-4 mx-1 ${
                    item.step < currentStep ? 'text-teal-400' : 'text-slate-300'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-180px)]">
          
          {/* Step 1: Seleziona Impresa */}
          {currentStep === 1 && (
            <div className="space-y-4">
              {/* Link a tutte le imprese (solo HQ) */}
              {isHQ && (
                <button
                  onClick={() => {
                    router.push('/admin/aziende');
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-slate-800">Vai a Gestione Imprese</p>
                      <p className="text-xs text-slate-500">Crea, modifica o elimina imprese</p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
                </button>
              )}
              
              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm font-medium text-slate-600 mb-3">Oppure seleziona un'impresa:</p>
                
                {/* Recenti */}
                {recents.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Recenti
                    </p>
                    <div className="space-y-1">
                      {recents.map(recent => {
                        const company = companies.find(c => c.id === recent.companyId);
                        if (!company) return null;
                        return (
                          <button
                            key={recent.companyId}
                            onClick={() => handleSelectCompany(company)}
                            className="w-full flex items-center justify-between p-3 hover:bg-teal-50 rounded-lg transition-colors group"
                          >
                            <span className="font-medium text-slate-700">{recent.companyName}</span>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {/* Tutte le imprese */}
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Tutte le imprese
                </p>
                {loading ? (
                  <div className="text-center py-8 text-slate-400">Caricamento...</div>
                ) : companies.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">Nessuna impresa trovata</div>
                ) : (
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {companies.map(company => (
                      <button
                        key={company.id}
                        onClick={() => handleSelectCompany(company)}
                        className="w-full flex items-center justify-between p-3 hover:bg-teal-50 rounded-lg transition-colors group"
                      >
                        <span className="font-medium text-slate-700">{company.name}</span>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Step 2: Seleziona Cantiere (opzionale) */}
          {currentStep === 2 && selectedCompany && (
            <div className="space-y-4">
              {/* Info impresa selezionata */}
              <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-teal-500 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-teal-900">{selectedCompany.name}</p>
                    <p className="text-xs text-teal-600">{cantieri.length} cantieri</p>
                  </div>
                </div>
              </div>
              
              {/* Opzione: Salta cantiere */}
              <button
                onClick={() => handleSelectCantiere(null)}
                className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-violet-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-slate-800">Salta selezione cantiere</p>
                    <p className="text-xs text-slate-500">Vai direttamente ai documenti impresa o personale</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
              </button>
              
              {/* Lista cantieri */}
              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm font-medium text-slate-600 mb-3">Oppure seleziona un cantiere:</p>
                
                {cantieri.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <HardHat className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p>Nessun cantiere per questa impresa</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {cantieri.map(cantiere => (
                      <button
                        key={cantiere.id}
                        onClick={() => handleSelectCantiere(cantiere)}
                        className="w-full flex items-center justify-between p-3 hover:bg-orange-50 rounded-lg transition-colors group border border-transparent hover:border-orange-200"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                            <HardHat className="w-4 h-4 text-orange-600" />
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-slate-700">{cantiere.nome}</p>
                            {cantiere.indirizzo && (
                              <p className="text-xs text-slate-500">{cantiere.indirizzo}</p>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-orange-500" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Step 3: Seleziona Destinazione */}
          {currentStep === 3 && selectedCompany && (
            <div className="space-y-4">
              {/* Info selezione */}
              <div className="p-4 bg-gradient-to-r from-teal-50 to-orange-50 border border-teal-200 rounded-xl">
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="w-4 h-4 text-teal-600" />
                  <span className="font-medium text-teal-800">{selectedCompany.name}</span>
                  {selectedCantiere && (
                    <>
                      <ChevronRight className="w-3 h-3 text-slate-400" />
                      <HardHat className="w-4 h-4 text-orange-600" />
                      <span className="font-medium text-orange-800">{selectedCantiere.nome}</span>
                    </>
                  )}
                </div>
              </div>
              
              {/* Destinazioni */}
              <p className="text-sm font-medium text-slate-600">Dove vuoi andare?</p>
              
              <div className="space-y-2">
                {DESTINATIONS.filter(dest => {
                  // Se non hai selezionato cantiere, nascondi opzioni che lo richiedono
                  if (!selectedCantiere && dest.requiresCantiere) return false;
                  return true;
                }).map(dest => (
                  <button
                    key={dest.key}
                    onClick={() => setSelectedDestination(dest.key)}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                      selectedDestination === dest.key
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dest.color}`}>
                        <dest.icon className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-slate-800">{dest.label}</p>
                        <p className="text-xs text-slate-500">{dest.description}</p>
                      </div>
                    </div>
                    {selectedDestination === dest.key && (
                      <Check className="w-5 h-5 text-teal-600" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between">
            <button
              onClick={() => currentStep > 1 ? setCurrentStep(currentStep - 1) : onClose()}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium transition-colors"
            >
              {currentStep > 1 ? '← Indietro' : 'Annulla'}
            </button>
            
            {currentStep === 3 && selectedDestination && (
              <button
                onClick={handleGo}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-emerald-700 shadow-lg shadow-teal-500/25 transition-all"
              >
                Vai
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

