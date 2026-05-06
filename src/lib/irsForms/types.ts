export interface FieldDefinition {
  id: string;
  page: number;
  rect: [number, number, number, number];
  type: 'text' | 'checkbox';
  description?: string;
}

export interface FormDefinition {
  form: string;
  year: number;
  pdfFilename: string;
  fields: Record<string, FieldDefinition>;
}

/** Semantic key → display string or checkbox export value */
export type FormFieldValues = Record<string, string>;
