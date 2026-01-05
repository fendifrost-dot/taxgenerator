import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { TaxYear, TaxYearConfig, StateConfig, YearStatus, VersionSnapshot } from '@/types/tax';

interface TaxYearContextType {
  currentYear: TaxYear | null;
  yearConfig: TaxYearConfig | null;
  setCurrentYear: (year: TaxYear) => void;
  updateYearConfig: (config: Partial<TaxYearConfig>) => void;
  addState: (state: StateConfig) => void;
  removeState: (stateCode: string) => void;
  updateStateStatus: (stateCode: string, status: StateConfig['status']) => void;
  finalizeYear: () => boolean;
  lockYear: () => boolean;
  createVersionSnapshot: (changeLog: string) => void;
  isYearSelected: boolean;
  availableYears: TaxYear[];
  canFinalize: boolean;
  canLock: boolean;
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
      status: 'draft',
      version: 1,
      versionHistory: [],
      isLocked: false,
      states: [],
      createdAt: new Date(),
      lastModified: new Date(),
    });
  }, []);

  const updateYearConfig = useCallback((config: Partial<TaxYearConfig>) => {
    setYearConfig(prev => {
      if (!prev) return null;
      return { ...prev, ...config, lastModified: new Date() };
    });
  }, []);

  const addState = useCallback((state: StateConfig) => {
    setYearConfig(prev => {
      if (!prev) return null;
      if (prev.isLocked) return prev; // Cannot modify locked year
      const exists = prev.states.some(s => s.stateCode === state.stateCode);
      if (exists) return prev;
      return { 
        ...prev, 
        states: [...prev.states, { ...state, status: 'not_started' }],
        lastModified: new Date(),
      };
    });
  }, []);

  const removeState = useCallback((stateCode: string) => {
    setYearConfig(prev => {
      if (!prev) return null;
      if (prev.isLocked) return prev; // Cannot modify locked year
      return { 
        ...prev, 
        states: prev.states.filter(s => s.stateCode !== stateCode),
        lastModified: new Date(),
      };
    });
  }, []);

  const updateStateStatus = useCallback((stateCode: string, status: StateConfig['status']) => {
    setYearConfig(prev => {
      if (!prev) return null;
      if (prev.isLocked) return prev;
      return {
        ...prev,
        states: prev.states.map(s => 
          s.stateCode === stateCode ? { ...s, status } : s
        ),
        lastModified: new Date(),
      };
    });
  }, []);

  const createVersionSnapshot = useCallback((changeLog: string) => {
    setYearConfig(prev => {
      if (!prev) return null;
      if (prev.isLocked) return prev;
      
      const snapshot: VersionSnapshot = {
        version: prev.version,
        createdAt: new Date(),
        changeLog,
        snapshotId: `v${prev.version}-${Date.now()}`,
      };
      
      return {
        ...prev,
        version: prev.version + 1,
        versionHistory: [...prev.versionHistory, snapshot],
        lastModified: new Date(),
      };
    });
  }, []);

  const finalizeYear = useCallback((): boolean => {
    if (!yearConfig || yearConfig.isLocked) return false;
    if (yearConfig.states.length === 0) return false;
    
    // Create a version snapshot before finalizing
    createVersionSnapshot('Finalized for filing');
    
    setYearConfig(prev => {
      if (!prev) return null;
      return {
        ...prev,
        status: 'finalized',
        finalizedAt: new Date(),
        lastModified: new Date(),
      };
    });
    
    return true;
  }, [yearConfig, createVersionSnapshot]);

  const lockYear = useCallback((): boolean => {
    if (!yearConfig || yearConfig.status !== 'finalized') return false;
    
    setYearConfig(prev => {
      if (!prev) return null;
      return {
        ...prev,
        status: 'locked',
        isLocked: true,
        lockedAt: new Date(),
        lastModified: new Date(),
      };
    });
    
    return true;
  }, [yearConfig]);

  const canFinalize = yearConfig ? 
    yearConfig.status === 'draft' && yearConfig.states.length > 0 : false;
  
  const canLock = yearConfig ? 
    yearConfig.status === 'finalized' && !yearConfig.isLocked : false;

  return (
    <TaxYearContext.Provider
      value={{
        currentYear,
        yearConfig,
        setCurrentYear,
        updateYearConfig,
        addState,
        removeState,
        updateStateStatus,
        finalizeYear,
        lockYear,
        createVersionSnapshot,
        isYearSelected: currentYear !== null,
        availableYears,
        canFinalize,
        canLock,
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
