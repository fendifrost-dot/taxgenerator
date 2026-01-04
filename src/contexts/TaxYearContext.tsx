import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { TaxYear, TaxYearConfig, StateConfig } from '@/types/tax';

interface TaxYearContextType {
  currentYear: TaxYear | null;
  yearConfig: TaxYearConfig | null;
  setCurrentYear: (year: TaxYear) => void;
  updateYearConfig: (config: Partial<TaxYearConfig>) => void;
  addState: (state: StateConfig) => void;
  removeState: (stateCode: string) => void;
  lockYear: () => void;
  isYearSelected: boolean;
  availableYears: TaxYear[];
}

const TaxYearContext = createContext<TaxYearContextType | undefined>(undefined);

// Generate available years (current year and 6 years back)
const generateAvailableYears = (): TaxYear[] => {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, i) => currentYear - i);
};

export function TaxYearProvider({ children }: { children: ReactNode }) {
  const [currentYear, setCurrentYearState] = useState<TaxYear | null>(null);
  const [yearConfig, setYearConfig] = useState<TaxYearConfig | null>(null);
  const availableYears = generateAvailableYears();

  const setCurrentYear = useCallback((year: TaxYear) => {
    setCurrentYearState(year);
    setYearConfig({
      year,
      isLocked: false,
      states: [],
    });
  }, []);

  const updateYearConfig = useCallback((config: Partial<TaxYearConfig>) => {
    setYearConfig(prev => prev ? { ...prev, ...config } : null);
  }, []);

  const addState = useCallback((state: StateConfig) => {
    setYearConfig(prev => {
      if (!prev) return null;
      const exists = prev.states.some(s => s.stateCode === state.stateCode);
      if (exists) return prev;
      return { ...prev, states: [...prev.states, state] };
    });
  }, []);

  const removeState = useCallback((stateCode: string) => {
    setYearConfig(prev => {
      if (!prev) return null;
      return { ...prev, states: prev.states.filter(s => s.stateCode !== stateCode) };
    });
  }, []);

  const lockYear = useCallback(() => {
    setYearConfig(prev => {
      if (!prev) return null;
      return { ...prev, isLocked: true, lockedAt: new Date() };
    });
  }, []);

  return (
    <TaxYearContext.Provider
      value={{
        currentYear,
        yearConfig,
        setCurrentYear,
        updateYearConfig,
        addState,
        removeState,
        lockYear,
        isYearSelected: currentYear !== null,
        availableYears,
      }}
    >
      {children}
    </TaxYearContext.Provider>
  );
}

export function useTaxYear() {
  const context = useContext(TaxYearContext);
  if (context === undefined) {
    throw new Error('useTaxYear must be used within a TaxYearProvider');
  }
  return context;
}
