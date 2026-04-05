import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { YearConfiguration } from '@/components/config/YearConfiguration';
import { DocumentsPage } from '@/components/documents/DocumentsPage';
import { DocumentUploadPage } from '@/components/documents/DocumentUploadPage';
import { TransactionsPage } from '@/components/transactions/TransactionsPage';
import { EvidencePage } from '@/components/evidence/EvidencePage';
import { InvoicesPage } from '@/components/invoices/InvoicesPage';
import { ReconciliationPage } from '@/components/reconciliation/ReconciliationPage';
import { FederalReturnPage } from '@/components/federal/FederalReturnPage';
import { StateReturnsPage } from '@/components/states/StateReturnsPage';
import { DiscrepanciesPage } from '@/components/discrepancies/DiscrepanciesPage';
import { ReportsPage } from '@/components/reports/ReportsPage';
import { FinalizationPage } from '@/components/finalization/FinalizationPage';
import { ClientListPage } from '@/components/clients/ClientListPage';
import { ClientDetailPage } from '@/components/clients/ClientDetailPage';
import { OptimizationInterview } from '@/components/optimization/OptimizationInterview';
import { PriorYearBuilderPage } from '@/components/prior-year/PriorYearBuilderPage';
import { EntityReturnBuilderPage } from '@/components/business-entities/EntityReturnBuilderPage';
import { FilingCenterPage } from '@/components/filing/FilingCenterPage';
import { AmendmentPage } from '@/components/amendment/AmendmentPage';
import { EstimatedTaxPage } from '@/components/estimated/EstimatedTaxPage';
import { PreparerSettingsPage } from '@/components/config/PreparerSettingsPage';
import { TaxCalculatorPage } from '@/components/calculator/TaxCalculatorPage';
import { LoginPage } from '@/components/auth/LoginPage';
import { useAuth } from '@/contexts/AuthContext';
import { isSupabaseConfigured } from '@/lib/supabaseClient';

const Index = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentPath, setCurrentPath] = useState('/');

  // Show login screen when Supabase is configured but user is not authenticated
  if (isSupabaseConfigured() && !isLoading && !isAuthenticated) {
    return <LoginPage />;
  }
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  const navigate = (path: string) => setCurrentPath(path);

  const renderPage = () => {
    // Client detail: /client/<clientId>
    if (currentPath.startsWith('/client/')) {
      const clientId = currentPath.slice('/client/'.length);
      return (
        <ClientDetailPage
          clientId={clientId}
          onBack={() => navigate('/clients')}
          onRunOptimizer={(returnId) => navigate(`/optimize/${returnId}`)}
        />
      );
    }

    // Optimization interview: /optimize/<returnId>
    if (currentPath.startsWith('/optimize/')) {
      const returnId = currentPath.slice('/optimize/'.length);
      return (
        <OptimizationInterview
          returnId={returnId}
          onBack={() => {
            // Go back to the client detail that launched us (can't know clientId here,
            // so fall back to clients list)
            navigate('/clients');
          }}
        />
      );
    }

    switch (currentPath) {
      case '/':
        return <Dashboard />;
      case '/config':
        return <YearConfiguration />;
      case '/documents':
        return <DocumentsPage />;
      case '/parse':
        return <DocumentUploadPage />;
      case '/transactions':
        return <TransactionsPage />;
      case '/evidence':
        return <EvidencePage />;
      case '/invoices':
        return <InvoicesPage />;
      case '/reconciliation':
        return <ReconciliationPage />;
      case '/federal':
        return <FederalReturnPage />;
      case '/states':
        return <StateReturnsPage />;
      case '/calculator':
        return <TaxCalculatorPage />;
      case '/discrepancies':
        return <DiscrepanciesPage />;
      case '/reports':
        return <ReportsPage />;
      case '/finalize':
        return <FinalizationPage />;
      case '/clients':
        return (
          <ClientListPage
            onSelect={(clientId) => navigate(`/client/${clientId}`)}
          />
        );
      case '/prior-year':
        return <PriorYearBuilderPage />;
      case '/entity-return':
        return <EntityReturnBuilderPage />;
      case '/filing':
        return <FilingCenterPage />;
      case '/amendments':
        return <AmendmentPage />;
      case '/estimated-tax':
        return <EstimatedTaxPage />;
      case '/preparer-settings':
        return <PreparerSettingsPage />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <AppLayout currentPath={currentPath} onNavigate={navigate}>
      {renderPage()}
    </AppLayout>
  );
};

export default Index;
