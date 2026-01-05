import { ReactNode } from 'react';
import { AppSidebar } from './AppSidebar';
import { WorkflowHeader } from './WorkflowHeader';
import { TaxYearProvider } from '@/contexts/TaxYearContext';
import { WorkflowProvider } from '@/contexts/WorkflowContext';

interface AppLayoutProps {
  children: ReactNode;
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function AppLayout({ children, currentPath, onNavigate }: AppLayoutProps) {
  return (
    <TaxYearProvider>
      <WorkflowProvider>
        <div className="min-h-screen bg-background">
          <AppSidebar currentPath={currentPath} onNavigate={onNavigate} />
          <main className="ml-64 min-h-screen flex flex-col">
            <WorkflowHeader />
            <div className="flex-1">
              {children}
            </div>
          </main>
        </div>
      </WorkflowProvider>
    </TaxYearProvider>
  );
}
