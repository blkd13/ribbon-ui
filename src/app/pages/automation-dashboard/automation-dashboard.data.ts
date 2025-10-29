import { JobForm } from './automation-dashboard.models';

export const DEFAULT_JOB_FORM: JobForm = {
  projectId: '',
  name: '',
  description: '',
  trigger: 'manual',
  schedule: null,
  model: 'gpt-4o',
  providerName: 'openai',
  promptTemplate: '以下の文章を要約してください。\n\n{{text_column}}',
  input: { source: 'upload' },
  parallelism: 10,
  retryLimit: 3,
};
