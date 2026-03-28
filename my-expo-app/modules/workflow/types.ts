export type MeasurementType = 'manual' | 'digital';

export interface StepDefinition {
  name: string;
  label: string;
  order: number;
  requires_approval: boolean;
  blocks_on_approval: boolean;
}

export type WorkflowTemplate = StepDefinition[];
