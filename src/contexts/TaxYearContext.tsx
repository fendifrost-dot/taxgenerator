import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { TaxYear, TaxYearConfig, StateConfig, YearStatus, VersionSnapshot } from '@/types/tax';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TaxYearContextType {
  currentYear: TaxYear | null;
  yearConfig: TaxYearConfig | null;
  setCurrentYear: (year: TaxYear) => void;
  updateYearConfig: (config: Partial<TaxYearConfig>) => void;
  addState: (state: StateConfig) => void;
  removeState: (stateCode: string) => void;
  updateStateStatus: (stateCode: string, status: StateConfig['status']) => void;
  finalizeYear: () => Promise<boolean>;
  lockYear: () => Promise<boolean>;
  createVersionSnapshot: (changeLog: string) => Promise<void>;
  isYearSelected: boolean;
  availableYears: TaxYear[];
  canFinalize: boolean;
  canLock: boolean;
  loading: boolean;
}

const TaxYearContext = createContext<TaxYearContextType | undefined>(undefined);

const generateAvailableYears = (): TaxYear[] => {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, i) => currentYear - i);
};

export function TaxYearProvider({ children }: { children: ReactNode }) {
  const [currentYear, setCurrentYearState] = useState<TaxYear | null>(null);
  const [yearConfig, setYearConfig] = useState<TaxYearConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const availableYears = generateAvailableYears();

  // Load year config from Supabase when year changes
  const loadYearConfig = useCallback(async (year: TaxYear) => {
    setLoading(true);
    try {
      const { data: configRow, error } = await supabase
        .from('tax_year_configs')
        .select('*, state_configs(*)')
        .eq('year', year)
        .maybeSingle();

      if (error) throw error;

      if (configRow) {
        const states: StateConfig[] = (configRow.state_configs || []).map((s: any) => ({
          stateCode: s.state_code,
          stateName: s.state_name,
          residencyStatus: s.residency_status,
          hasBusinessNexus: s.has_business_nexus,
          status: s.status || 'not_started',
        }));

        setYearConfig({
          year: configRow.year,
          status: (configRow.status as YearStatus) || 'draft',
          version: configRow.version || 1,
          versionHistory: [],
          isLocked: configRow.is_locked || false,
          lockedAt: configRow.locked_at ? new Date(configRow.locked_at) : undefined,
          finalizedAt: configRow.finalized_at ? new Date(configRow.finalized_at) : undefined,
          states,
          createdAt: new Date(configRow.created_at),
          lastModified: new Date(configRow.last_modified),
        });
      } else {
        // Create new year config in DB
        const { data: newConfig, error: insertError } = await supabase
          .from('tax_year_configs')
          .insert({ year, status: 'draft', version: 1, is_locked: false })
          .select()
          .single();

        if (insertError) throw insertError;

        setYearConfig({
          year,
          status: 'draft',
          version: 1,
          versionHistory: [],
          isLocked: false,
          states: [],
          createdAt: new Date(newConfig.created_at),
          lastModified: new Date(newConfig.last_modified),
        });
      }
    } catch (err: any) {
      console.error('Failed to load year config:', err);
      toast.error('Failed to load year configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  const setCurrentYear = useCallback((year: TaxYear) => {
    setCurrentYearState(year);
    loadYearConfig(year);
  }, [loadYearConfig]);

  const updateYearConfig = useCallback(async (config: Partial<TaxYearConfig>) => {
    if (!currentYear || !yearConfig) return;
    try {
      const dbUpdate: any = {};
      if (config.status !== undefined) dbUpdate.status = config.status;
      if (config.version !== undefined) dbUpdate.version = config.version;
      if (config.isLocked !== undefined) dbUpdate.is_locked = config.isLocked;
      if (config.lockedAt !== undefined) dbUpdate.locked_at = config.lockedAt?.toISOString();
      if (config.finalizedAt !== undefined) dbUpdate.finalized_at = config.finalizedAt?.toISOString();

      if (Object.keys(dbUpdate).length > 0) {
        const { error } = await supabase
          .from('tax_year_configs')
          .update(dbUpdate)
          .eq('year', currentYear);
        if (error) throw error;
      }

      setYearConfig(prev => prev ? { ...prev, ...config, lastModified: new Date() } : null);
    } catch (err: any) {
      console.error('Failed to update year config:', err);
      toast.error('Failed to update year configuration');
    }
  }, [currentYear, yearConfig]);

  const getConfigId = useCallback(async (): Promise<string | null> => {
    if (!currentYear) return null;
    const { data } = await supabase
      .from('tax_year_configs')
      .select('id')
      .eq('year', currentYear)
      .single();
    return data?.id || null;
  }, [currentYear]);

  const addState = useCallback(async (state: StateConfig) => {
    if (!yearConfig || yearConfig.isLocked) return;
    const exists = yearConfig.states.some(s => s.stateCode === state.stateCode);
    if (exists) return;

    try {
      const configId = await getConfigId();
      if (!configId) return;

      const { error } = await supabase.from('state_configs').insert({
        tax_year_config_id: configId,
        state_code: state.stateCode,
        state_name: state.stateName,
        residency_status: state.residencyStatus,
        has_business_nexus: state.hasBusinessNexus,
        status: 'not_started',
      });
      if (error) throw error;

      setYearConfig(prev => {
        if (!prev) return null;
        return {
          ...prev,
          states: [...prev.states, { ...state, status: 'not_started' }],
          lastModified: new Date(),
        };
      });
    } catch (err: any) {
      console.error('Failed to add state:', err);
      toast.error('Failed to add state');
    }
  }, [yearConfig, getConfigId]);

  const removeState = useCallback(async (stateCode: string) => {
    if (!yearConfig || yearConfig.isLocked) return;
    try {
      const configId = await getConfigId();
      if (!configId) return;

      const { error } = await supabase
        .from('state_configs')
        .delete()
        .eq('tax_year_config_id', configId)
        .eq('state_code', stateCode);
      if (error) throw error;

      setYearConfig(prev => {
        if (!prev) return null;
        return {
          ...prev,
          states: prev.states.filter(s => s.stateCode !== stateCode),
          lastModified: new Date(),
        };
      });
    } catch (err: any) {
      console.error('Failed to remove state:', err);
      toast.error('Failed to remove state');
    }
  }, [yearConfig, getConfigId]);

  const updateStateStatus = useCallback(async (stateCode: string, status: StateConfig['status']) => {
    if (!yearConfig || yearConfig.isLocked) return;
    try {
      const configId = await getConfigId();
      if (!configId) return;

      const { error } = await supabase
        .from('state_configs')
        .update({ status })
        .eq('tax_year_config_id', configId)
        .eq('state_code', stateCode);
      if (error) throw error;

      setYearConfig(prev => {
        if (!prev) return null;
        return {
          ...prev,
          states: prev.states.map(s => s.stateCode === stateCode ? { ...s, status } : s),
          lastModified: new Date(),
        };
      });
    } catch (err: any) {
      console.error('Failed to update state status:', err);
      toast.error('Failed to update state status');
    }
  }, [yearConfig, getConfigId]);

  const createVersionSnapshot = useCallback(async (changeLog: string) => {
    if (!yearConfig || yearConfig.isLocked || !currentYear) return;

    try {
      const newVersion = yearConfig.version + 1;
      const { error } = await supabase
        .from('tax_year_configs')
        .update({ version: newVersion })
        .eq('year', currentYear);
      if (error) throw error;

      const snapshot: VersionSnapshot = {
        version: yearConfig.version,
        createdAt: new Date(),
        changeLog,
        snapshotId: `v${yearConfig.version}-${Date.now()}`,
      };

      setYearConfig(prev => {
        if (!prev) return null;
        return {
          ...prev,
          version: newVersion,
          versionHistory: [...prev.versionHistory, snapshot],
          lastModified: new Date(),
        };
      });
    } catch (err: any) {
      console.error('Failed to create version snapshot:', err);
      toast.error('Failed to create version snapshot');
    }
  }, [yearConfig, currentYear]);

  const finalizeYear = useCallback(async (): Promise<boolean> => {
    if (!yearConfig || yearConfig.isLocked || !currentYear) return false;
    if (yearConfig.states.length === 0) return false;

    try {
      await createVersionSnapshot('Finalized for filing');

      const now = new Date();
      const { error } = await supabase
        .from('tax_year_configs')
        .update({ status: 'finalized', finalized_at: now.toISOString() })
        .eq('year', currentYear);
      if (error) throw error;

      setYearConfig(prev => {
        if (!prev) return null;
        return { ...prev, status: 'finalized', finalizedAt: now, lastModified: now };
      });
      return true;
    } catch (err: any) {
      console.error('Failed to finalize year:', err);
      toast.error('Failed to finalize year');
      return false;
    }
  }, [yearConfig, currentYear, createVersionSnapshot]);

  const lockYear = useCallback(async (): Promise<boolean> => {
    if (!yearConfig || yearConfig.status !== 'finalized' || !currentYear) return false;

    try {
      const now = new Date();
      const { error } = await supabase
        .from('tax_year_configs')
        .update({ status: 'locked', is_locked: true, locked_at: now.toISOString() })
        .eq('year', currentYear);
      if (error) throw error;

      setYearConfig(prev => {
        if (!prev) return null;
        return { ...prev, status: 'locked', isLocked: true, lockedAt: now, lastModified: now };
      });
      return true;
    } catch (err: any) {
      console.error('Failed to lock year:', err);
      toast.error('Failed to lock year');
      return false;
    }
  }, [yearConfig, currentYear]);

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
        loading,
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