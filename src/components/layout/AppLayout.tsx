import { ReactNode, useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { TaxYearProvider } from '@/contexts/TaxYearContext';

interface AppLayoutProps {
  children: ReactNode;
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function AppLayout({ children, currentPath, onNavigate }: AppLayoutProps) {
  return (
    <TaxYearProvider>
      <div className="min-h-screen bg-background">
        <AppSidebar currentPath={currentPath} onNavigate={onNavigate} />
        <main className="ml-64 min-h-screen">
          {children}
        </main>
      </div>
    </TaxYearProvider>
  );
}
