import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="max-w-md text-center text-sm text-muted-foreground">
              {this.state.error.message}
            </p>
            <Button type="button" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
