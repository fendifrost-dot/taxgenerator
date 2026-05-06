import type { IndividualReturnInput } from '@/types/individualReturn';
import type { SupportedFormId, TaxYear } from '@/lib/irsForms/loadForms';
import { loadForm } from '@/lib/irsForms/loadForms';
import { computeIndividualReturn } from '@/lib/irsForms/individualReturnCompute';
import { fillAndFlattenForm, mergePdfs } from '@/lib/irsForms/pdfFiller';
import {
  values1040,
  values1040S1,
  values1040S2,
  values1040SC,
  values1040SSE,
  values8959,
} from '@/lib/irsForms/entityReturnMapper';

export interface ScheduleCFederalPacketInput {
  individual: IndividualReturnInput;
}

/** Forms and merge order for a Schedule C sole proprietor federal filing. */
export function planScheduleCFederalForms(): SupportedFormId[] {
  return ['1040', '1040s1', '1040s2', '1040sc', '1040sse', '8959'];
}

function assertScheduleCPacket(input: ScheduleCFederalPacketInput): void {
  if (!input.individual.scheduleC || !input.individual.scheduleCSummary) {
    throw new Error('Schedule C federal packet requires individual.scheduleC and individual.scheduleCSummary');
  }
}

/** Build merged PDF bytes for Form 1040 + Schedules 1–2 + C + SE + Form 8959 (Schedule C filer). */
export async function generateScheduleCFederalPdfPacket(input: ScheduleCFederalPacketInput): Promise<Uint8Array> {
  assertScheduleCPacket(input);
  const ind = input.individual;
  const year = ind.taxYear as TaxYear;
  const summary = computeIndividualReturn(ind);
  const entityIn = ind.scheduleC!;
  const entitySummary = ind.scheduleCSummary!;

  const plan = planScheduleCFederalForms();
  const parts: Uint8Array[] = [];

  for (const formId of plan) {
    const { definition, pdfBytes } = await loadForm(formId, year);
    let values: import('@/lib/irsForms/types').FormFieldValues = {};

    switch (formId) {
      case '1040':
        values = values1040(ind, summary, entityIn);
        break;
      case '1040s1':
        values = values1040S1(ind, summary);
        break;
      case '1040s2':
        values = values1040S2(ind, summary);
        break;
      case '1040sc':
        values = values1040SC(entityIn, entitySummary);
        break;
      case '1040sse':
        values = values1040SSE(entityIn, summary);
        break;
      case '8959':
        values = values8959(ind, summary);
        break;
      default:
        break;
    }

    parts.push(await fillAndFlattenForm(pdfBytes, definition, values));
  }

  return mergePdfs(parts);
}

export { computeIndividualReturn } from '@/lib/irsForms/individualReturnCompute';
