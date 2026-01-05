import { 
  LayoutDashboard, 
  FileText, 
  Receipt, 
  FolderArchive,
  FileCheck,
  Calculator,
  AlertTriangle,
  Lock,
  Settings,
  BarChart3,
  Building2,
  Link as LinkIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTaxYear } from '@/contexts/TaxYearContext';

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  disabled?: boolean;
  badge?: string;
}

const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
      { icon: Settings, label: 'Year Configuration', href: '/config' },
    ],
  },
  {
    title: 'Ingestion',
    items: [
      { icon: FileText, label: 'Documents', href: '/documents' },
      { icon: Receipt, label: 'Transactions', href: '/transactions' },
      { icon: LinkIcon, label: 'Reconciliation', href: '/reconciliation' },
    ],
  },
  {
    title: 'Substantiation',
    items: [
      { icon: FolderArchive, label: 'Evidence Locker', href: '/evidence' },
      { icon: FileCheck, label: 'Invoices', href: '/invoices' },
    ],
  },
  {
    title: 'Preparation',
    items: [
      { icon: Calculator, label: 'Federal Return', href: '/federal' },
      { icon: Building2, label: 'State Returns', href: '/states' },
    ],
  },
  {
    title: 'Validation',
    items: [
      { icon: AlertTriangle, label: 'Discrepancies', href: '/discrepancies' },
      { icon: BarChart3, label: 'Reports', href: '/reports' },
      { icon: Lock, label: 'Finalization', href: '/finalize' },
    ],
  },
];

interface AppSidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function AppSidebar({ currentPath, onNavigate }: AppSidebarProps) {
  const { currentYear, yearConfig } = useTaxYear();

  return (
    <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col h-screen fixed left-0 top-0">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-sidebar-primary rounded flex items-center justify-center">
            <Calculator className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">Tax Forensics</h1>
            <p className="text-xs text-sidebar-foreground/60">Personal Use Only</p>
          </div>
        </div>
      </div>

      {/* Tax Year Display */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="text-xs text-sidebar-foreground/60 uppercase tracking-wider mb-1">
          Active Tax Year
        </div>
        {currentYear ? (
          <div className="flex items-center gap-2">
            <span className="text-2xl font-mono font-semibold text-sidebar-primary">
              {currentYear}
            </span>
            {yearConfig?.isLocked && (
              <Lock className="w-4 h-4 text-sidebar-foreground/40" />
            )}
            {yearConfig?.status === 'finalized' && !yearConfig.isLocked && (
              <span className="text-xs text-sidebar-foreground/60">v{yearConfig.version}</span>
            )}
          </div>
        ) : (
          <div className="text-sm text-sidebar-foreground/40 italic">
            Not selected
          </div>
        )}
        {yearConfig?.status && yearConfig.status !== 'draft' && (
          <div className="text-xs text-sidebar-foreground/60 mt-1 capitalize">
            Status: {yearConfig.status}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {navSections.map((section) => (
          <div key={section.title} className="mb-6">
            <div className="px-4 mb-2 text-xs text-sidebar-foreground/40 uppercase tracking-wider">
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = currentPath === item.href;
                const isDisabled = !currentYear && item.href !== '/' && item.href !== '/config';
                
                return (
                  <li key={item.href}>
                    <button
                      onClick={() => !isDisabled && onNavigate(item.href)}
                      disabled={isDisabled}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        isActive && "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-sidebar-primary",
                        isDisabled && "opacity-40 cursor-not-allowed hover:bg-transparent"
                      )}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                      {item.badge && (
                        <span className="ml-auto text-xs bg-sidebar-primary text-sidebar-primary-foreground px-1.5 py-0.5 rounded">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <p className="text-xs text-sidebar-foreground/40 text-center">
          Not for commercial use<br />
          No e-file • Print only
        </p>
      </div>
    </aside>
  );
}
