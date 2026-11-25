import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useSettings } from './db/settings';
import { BottomNav } from './components/BottomNav';
import { QuickAddSheet } from './components/QuickAddSheet';
import Home from './pages/Home';
import Settings from './pages/Settings';
import Wizard from './pages/Wizard';
import Calendar from './pages/Calendar';
import Balances from './pages/Balances';
import Missions from './pages/Missions';
import MissionForm from './pages/MissionForm';
import MissionDetail from './pages/MissionDetail';
import CarHome from './pages/car/CarHome';
import LoanPage from './pages/car/LoanPage';
import VehiclePage from './pages/car/VehiclePage';
import DocumentsPage from './pages/car/DocumentsPage';
import ExpensesPage from './pages/expenses/ExpensesPage';
import CategoriesPage from './pages/expenses/CategoriesPage';
import DaycarePage from './pages/daycare/DaycarePage';
import KeywordsPage from './pages/settings/KeywordsPage';

// Chargé à la demande (graphiques) pour garder le démarrage rapide.
const Recap = lazy(() => import('./pages/Recap'));
// États des lieux (caméra, analyse, SDK de l'IA) : chargés à l'ouverture.
const InspectionsPage = lazy(() => import('./pages/car/inspections/InspectionsPage'));
const InspectionPage = lazy(() => import('./pages/car/inspections/InspectionPage'));
const loading = <p className="pt-10 text-center text-slate-500">Chargement…</p>;
import { AccessoriesPage, ChecksPage, FuelPage, InsurancePage, MaintenancePage, MiscPage } from './pages/car/CarLists';
import { runStartupTasks } from './lib/engine';
import { notifyDueReminders } from './lib/notify';

/** Une erreur d'écran est oubliée dès qu'on change de page. */
function Guarded({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}

export default function App() {
  const settings = useSettings();
  const [addOpen, setAddOpen] = useState(false);
  const onboarded = settings?.onboarded ?? false;

  // À chaque ouverture et au retour au premier plan : fériés, acquisitions de congé manquantes, synchro calendrier.
  useEffect(() => {
    if (!onboarded) return;
    const run = () => runStartupTasks().then(notifyDueReminders).catch((e) => console.warn('Tâches de démarrage', e));
    void run();
    const onVisible = () => document.visibilityState === 'visible' && void run();
    document.addEventListener('visibilitychange', onVisible);
    // Si l'app reste ouverte au passage d'une fin de mois.
    const timer = window.setInterval(() => void run(), 60 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [onboarded]);

  if (!settings) return null; // chargement IndexedDB (quelques ms)
  if (!settings.onboarded) return <Wizard />;

  return (
    <HashRouter>
      <main className="mx-auto max-w-md px-4 pt-[env(safe-area-inset-top)] pb-28">
        <Guarded>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/recap"
            element={
              <Suspense fallback={<p className="pt-10 text-center text-slate-500">Chargement…</p>}>
                <Recap />
              </Suspense>
            }
          />
          <Route path="/reglages" element={<Settings />} />
          <Route path="/calendrier" element={<Calendar />} />
          <Route path="/soldes" element={<Balances />} />
          <Route path="/missions" element={<Missions />} />
          <Route path="/missions/nouvelle" element={<MissionForm />} />
          <Route path="/missions/:id" element={<MissionDetail />} />
          <Route path="/missions/:id/modifier" element={<MissionForm />} />
          <Route path="/voiture" element={<CarHome />} />
          <Route path="/voiture/vehicule" element={<VehiclePage />} />
          <Route path="/voiture/carburant" element={<FuelPage />} />
          <Route path="/voiture/entretien" element={<MaintenancePage />} />
          <Route path="/voiture/credit" element={<LoanPage />} />
          <Route path="/voiture/assurance" element={<InsurancePage />} />
          <Route path="/voiture/controles" element={<ChecksPage />} />
          <Route path="/voiture/accessoires" element={<AccessoriesPage />} />
          <Route path="/voiture/divers" element={<MiscPage />} />
          <Route path="/voiture/documents" element={<DocumentsPage />} />
          <Route path="/voiture/etats-des-lieux" element={<Suspense fallback={loading}><InspectionsPage /></Suspense>} />
          <Route path="/voiture/etats-des-lieux/:id" element={<Suspense fallback={loading}><InspectionPage /></Suspense>} />
          <Route path="/depenses" element={<ExpensesPage />} />
          <Route path="/depenses/categories" element={<CategoriesPage />} />
          <Route path="/creche" element={<DaycarePage />} />
          <Route path="/reglages/mots-cles" element={<KeywordsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Guarded>
      </main>
      <BottomNav onAdd={() => setAddOpen(true)} />
      <QuickAddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </HashRouter>
  );
}
