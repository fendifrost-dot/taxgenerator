import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { YearConfiguration } from '@/components/config/YearConfiguration';
import { DocumentsPage } from '@/components/documents/DocumentsPage';
import { TransactionsPage } from '@/components/transactions/TransactionsPage';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';

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
          <PlaceholderPage
            title="Evidence Locker"
            description="Attach receipts, invoices, and supporting documentation to substantiate expenses"
          />
        );
      case '/invoices':
        return (
          <PlaceholderPage
            title="Invoice System"
            description="Manage formal and memorialized transaction invoices"
          />
        );
      case '/federal':
        return (
          <PlaceholderPage
            title="Federal Return"
            description="Prepare Form 1040 and associated schedules"
          />
        );
      case '/states':
        return (
          <PlaceholderPage
            title="State Returns"
            description="Prepare state income tax returns derived from federal data"
          />
        );
      case '/discrepancies':
        return (
          <PlaceholderPage
            title="Discrepancy Resolution"
            description="Review and resolve conflicts between data sources"
          />
        );
      case '/reports':
        return (
          <PlaceholderPage
            title="Reports & P&L"
            description="Generate monthly, quarterly, and annual profit & loss statements"
          />
        );
      case '/finalize':
        return (
          <PlaceholderPage
            title="Finalization & Locking"
            description="Lock tax year for immutable, reproducible output"
          />
        );
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
