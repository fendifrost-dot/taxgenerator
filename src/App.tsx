import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { ClientUploadPortal } from "@/components/portal/ClientUploadPortal";
import { ClientQuestionnairePortal } from "@/components/portal/ClientQuestionnairePortal";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            {/* Public client portal routes — no auth required, no AppLayout */}
            <Route path="/portal/upload/:token" element={<ClientUploadPortal />} />
            <Route path="/portal/questionnaire/:token" element={<ClientQuestionnairePortal />} />

            {/* Preparer app — wrapped in AuthProvider for optional Supabase auth */}
            <Route path="/" element={<AuthProvider><Index /></AuthProvider>} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
