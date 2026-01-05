import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { YearConfiguration } from '@/components/config/YearConfiguration';
import { DocumentsPage } from '@/components/documents/DocumentsPage';
import { TransactionsPage } from '@/components/transactions/TransactionsPage';
import { InvoicesPage } from '@/components/invoices/InvoicesPage';
import { DiscrepanciesPage } from '@/components/discrepancies/DiscrepanciesPage';
import { FinalizationPage } from '@/components/finalization/FinalizationPage';
import { NotImplementedPage } from '@/components/common/NotImplementedPage';

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
        return (
          <NotImplementedPage
            title="Evidence Locker"
            description="Attach receipts, invoices, and supporting documentation to substantiate expenses"
            blocksDownstream={['Federal Return generation for deductible expenses']}
          />
        );
      case '/invoices':
        return <InvoicesPage />;
      case '/federal':
        return (
          <NotImplementedPage
            title="Federal Return"
            description="Prepare Form 1040 and associated schedules"
            blocksDownstream={['State Returns (federal must finalize first)']}
            requiredGates={['All transactions resolved', 'Required forms uploaded', 'No material discrepancies']}
          />
        );
      case '/states':
        return (
          <NotImplementedPage
            title="State Returns"
            description="Prepare state income tax returns derived from federal data"
            blocksDownstream={['Audit pack generation']}
            requiredGates={['Federal return finalized', 'State forms uploaded']}
          />
        );
      case '/discrepancies':
        return <DiscrepanciesPage />;
      case '/reports':
        return (
          <NotImplementedPage
            title="Reports & P&L"
            description="Generate monthly, quarterly, and annual profit & loss statements"
            blocksDownstream={['Audit pack export']}
          />
        );
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
