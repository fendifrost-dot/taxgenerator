import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { YearConfiguration } from '@/components/config/YearConfiguration';
import { DocumentsPage } from '@/components/documents/DocumentsPage';
import { TransactionsPage } from '@/components/transactions/TransactionsPage';
import { EvidencePage } from '@/components/evidence/EvidencePage';
import { InvoicesPage } from '@/components/invoices/InvoicesPage';
import { ReconciliationPage } from '@/components/reconciliation/ReconciliationPage';
import { FederalReturnPage } from '@/components/federal/FederalReturnPage';
import { StateReturnsPage } from '@/components/states/StateReturnsPage';
import { DiscrepanciesPage } from '@/components/discrepancies/DiscrepanciesPage';
import { ReportsPage } from '@/components/reports/ReportsPage';
import { FinalizationPage } from '@/components/finalization/FinalizationPage';

const Index = () => {
  const [currentPath, setCurrentPath] = useState('/');

  const renderPage = () => {
    switch (currentPath) {
      case '/':
        return <Dashboard />;
      case '/config':
        return <YearConfiguration />;
      case '/documents':
        return <DocumentsPage />;
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
      case '/discrepancies':
        return <DiscrepanciesPage />;
      case '/reports':
        return <ReportsPage />;
      case '/finalize':
        return <FinalizationPage />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <AppLayout currentPath={currentPath} onNavigate={setCurrentPath}>
      {renderPage()}
    </AppLayout>
  );
};

export default Index;
