import { WorkflowGates } from '@/types/tax';

/** Gates required before federal return generation or year finalization (excludes stub federalValidated). */
export function passesFederalAndFinalizationGates(gates: WorkflowGates): boolean {
  return (
    gates.taxYearSelected &&
    gates.statesConfigured &&
    gates.requiredFormsUploaded &&
    gates.noUnresolvedTransactions &&
    gates.noMaterialDiscrepancies &&
    gates.incomeReconciled &&
    gates.evidenceComplete
  );
}

/** Full gate check including federal validation — swap in when return validation pipeline exists. */
export function passesFullValidationGates(gates: {
  taxYearSelected: boolean;
  statesConfigured: boolean;
  requiredFormsUploaded: boolean;
  noUnresolvedTransactions: boolean;
  noMaterialDiscrepancies: boolean;
  incomeReconciled: boolean;
  evidenceComplete: boolean;
  federalValidated: boolean;
}): boolean {
  return (
    gates.taxYearSelected &&
    gates.statesConfigured &&
    gates.requiredFormsUploaded &&
    gates.noUnresolvedTransactions &&
    gates.noMaterialDiscrepancies &&
    gates.incomeReconciled &&
    gates.evidenceComplete &&
    gates.federalValidated
  );
}
