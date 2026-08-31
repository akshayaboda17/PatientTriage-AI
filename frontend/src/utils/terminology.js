/**
 * Centralized Clinical & Healthcare Terminology Dictionary for PatientTriage.ai.
 * Maps internal backend values and technical codes to clear, professional,
 * clinician-friendly user-facing labels with primary/secondary visual hierarchy.
 */

/**
 * Emergency Severity Index (ESI) / Priority Levels
 * Primary: Human-understandable care priority
 * Secondary: Reference ESI Level
 */
export const PRIORITY_LEVELS = {
  1: {
    primary: 'Critical — Immediate Care',
    secondary: 'ESI Level 1',
    description: 'Requires immediate life-saving clinical intervention without delay (0 min wait).',
    badgeCls: 'bg-rose-600 text-white',
    borderCls: 'border-rose-500',
    colorText: 'text-rose-400',
    bgLight: 'bg-rose-950/40 text-rose-300 border-rose-600/60'
  },
  2: {
    primary: 'Emergency — Immediate Assessment',
    secondary: 'ESI Level 2',
    description: 'High risk of acute deterioration, severe pain, or altered mental status (≤10-15 min wait).',
    badgeCls: 'bg-amber-500 text-slate-950',
    borderCls: 'border-amber-500',
    colorText: 'text-amber-400',
    bgLight: 'bg-amber-950/40 text-amber-300 border-amber-600/60'
  },
  3: {
    primary: 'Urgent — Prompt Assessment',
    secondary: 'ESI Level 3',
    description: 'Moderate urgency requiring multiple diagnostic resources and stable vitals (≤30-45 min wait).',
    badgeCls: 'bg-yellow-500 text-slate-950',
    borderCls: 'border-yellow-500',
    colorText: 'text-yellow-400',
    bgLight: 'bg-yellow-950/40 text-yellow-300 border-yellow-600/60'
  },
  4: {
    primary: 'Less Urgent',
    secondary: 'ESI Level 4',
    description: 'Low complexity condition requiring a single diagnostic or treatment resource (≤60-90 min wait).',
    badgeCls: 'bg-emerald-600 text-white',
    borderCls: 'border-emerald-500',
    colorText: 'text-emerald-400',
    bgLight: 'bg-emerald-950/40 text-emerald-300 border-emerald-600/60'
  },
  5: {
    primary: 'Non-Urgent',
    secondary: 'ESI Level 5',
    description: 'Routine minor symptoms or exam with no diagnostic resources required (≤120 min wait).',
    badgeCls: 'bg-blue-600 text-white',
    borderCls: 'border-blue-500',
    colorText: 'text-blue-400',
    bgLight: 'bg-blue-950/40 text-blue-300 border-blue-600/60'
  }
};

export const getPriorityMeta = (level) => {
  const num = Number(level);
  return PRIORITY_LEVELS[num] || PRIORITY_LEVELS[3];
};

/**
 * Patient Workflow & Safety Statuses
 * Internal codes: STABLE, MONITOR, REASSESS, ESCALATE
 */
export const PATIENT_STATUSES = {
  STABLE: {
    label: 'Stable',
    badgeCls: 'bg-emerald-950 text-emerald-300 border-emerald-800',
    description: 'Vital signs and clinical presentation are physiologically stable.'
  },
  MONITOR: {
    label: 'Monitoring',
    badgeCls: 'bg-cyan-950 text-cyan-300 border-cyan-700',
    description: 'Routine continuous clinical monitoring active.'
  },
  REASSESS: {
    label: 'Reassessment Required',
    badgeCls: 'bg-amber-500 text-slate-950 font-bold',
    description: 'Time elapsed or symptoms indicate bedside vitals re-evaluation is required.'
  },
  ESCALATE: {
    label: 'Immediate Attention',
    badgeCls: 'bg-rose-600 text-white font-bold animate-pulse',
    description: 'Condition may be worsening or AI confidence is low. Attending clinician review required.'
  }
};

export const getPatientStatusMeta = (status) => {
  if (!status) return PATIENT_STATUSES.STABLE;
  const key = String(status).toUpperCase();
  return PATIENT_STATUSES[key] || {
    label: status.replace(/_/g, ' '),
    badgeCls: 'bg-slate-800 text-slate-300 border-slate-700',
    description: 'Status active.'
  };
};

/**
 * Visit Statuses (ED Encounter States)
 */
export const VISIT_STATUSES = {
  WAITING: { label: 'Waiting for Care', cls: 'bg-amber-950/80 text-amber-300 border-amber-700' },
  IN_TRIAGE: { label: 'In Triage Assessment', cls: 'bg-cyan-950/80 text-cyan-300 border-cyan-700' },
  IN_TREATMENT: { label: 'In Treatment', cls: 'bg-indigo-950/80 text-indigo-300 border-indigo-700' },
  DISCHARGED: { label: 'Discharged', cls: 'bg-emerald-950/80 text-emerald-300 border-emerald-700' },
  ADMITTED: { label: 'Admitted to Inpatient', cls: 'bg-purple-950/80 text-purple-300 border-purple-700' }
};

export const getVisitStatusMeta = (status) => {
  if (!status) return { label: 'Waiting for Care', cls: 'bg-slate-800 text-slate-300 border-slate-700' };
  const key = String(status).toUpperCase();
  return VISIT_STATUSES[key] || { label: status.replace(/_/g, ' '), cls: 'bg-slate-800 text-slate-300 border-slate-700' };
};

/**
 * AI Confidence Tiers
 */
export const CONFIDENCE_TIERS = {
  HIGH: {
    label: 'AI Confidence: High',
    shortLabel: 'High',
    badgeCls: 'bg-emerald-950/80 text-emerald-300 border-emerald-700',
    helpText: 'AI assessment is well-supported by observed intake vitals.'
  },
  MODERATE: {
    label: 'AI Confidence: Moderate',
    shortLabel: 'Moderate',
    badgeCls: 'bg-amber-950/80 text-amber-300 border-amber-700',
    helpText: 'AI assessment has moderate certainty. Follow standard clinical guidelines.'
  },
  LOW: {
    label: 'AI Confidence: Low — Clinical Review Recommended',
    shortLabel: 'Low ⚠️',
    badgeCls: 'bg-rose-950 text-rose-300 border-rose-600 animate-pulse',
    helpText: 'AI assessment is uncertain due to atypical vital parameters. Attending clinician review recommended.'
  }
};

export const getConfidenceMeta = (confidence) => {
  if (!confidence) return CONFIDENCE_TIERS.HIGH;
  const key = String(confidence).toUpperCase();
  return CONFIDENCE_TIERS[key] || CONFIDENCE_TIERS.MODERATE;
};

/**
 * AI Risk Categories
 */
export const RISK_CATEGORIES = {
  CRITICAL: { label: 'Critical Risk', cls: 'bg-rose-950/90 text-rose-300 border-rose-700' },
  HIGH: { label: 'High Risk', cls: 'bg-rose-950/90 text-rose-300 border-rose-700' },
  MODERATE: { label: 'Moderate Risk', cls: 'bg-amber-950/90 text-amber-300 border-amber-700' },
  LOW: { label: 'Low Risk', cls: 'bg-emerald-950/90 text-emerald-300 border-emerald-700' }
};

export const getRiskCategoryMeta = (cat) => {
  if (!cat) return RISK_CATEGORIES.MODERATE;
  const key = String(cat).toUpperCase();
  return RISK_CATEGORIES[key] || RISK_CATEGORIES.MODERATE;
};

/**
 * Roles & Role Labels
 */
export const ROLE_LABELS = {
  CLINICAL_DIRECTOR: 'Clinical Director',
  HOSPITAL_ADMIN: 'Hospital Administrator',
  EMERGENCY_PHYSICIAN: 'Emergency Physician',
  TRIAGE_NURSE: 'Triage Nurse',
  STAFF_NURSE: 'Staff Nurse',
  EMERGENCY_TECHNICIAN: 'Emergency Medical Technician'
};

export const getRoleLabel = (role) => {
  if (!role) return 'Staff';
  return ROLE_LABELS[role] || role.replace(/_/g, ' ');
};

/**
 * Audit Action & Entity Translations
 */
export const AUDIT_ACTIONS = {
  HOSPITAL_ONBOARDED: 'Hospital Facility Created',
  PATIENT_REGISTERED: 'Patient Registered',
  ENCOUNTER_CREATED: 'Patient Visit Started',
  TRIAGE_ASSESSED: 'Care Priority Assigned',
  VITALS_RECORDED: 'Vital Signs Recorded',
  AI_ASSESSMENT_GENERATED: 'AI Risk Assessment Generated',
  CLINICAL_DECISION_RECORDED: 'Clinical Decision Signed',
  AI_ASSESSMENT_OVERRIDDEN: 'AI Assessment Overridden',
  ALERT_ACKNOWLEDGED: 'Clinical Alert Acknowledged',
  ALERT_RESOLVED: 'Clinical Alert Resolved',
  ALERT_DISMISSED: 'Clinical Alert Dismissed',
  STAFF_CREATED: 'Staff Account Created',
  STAFF_DEACTIVATED: 'Staff Account Deactivated',
  SURGE_MODE_ACTIVATED: 'Surge Care Mode Activated',
  SURGE_MODE_DEACTIVATED: 'Surge Care Mode Deactivated'
};

export const formatAuditAction = (action) => {
  if (!action) return 'Action Completed';
  return AUDIT_ACTIONS[action] || action.replace(/_/g, ' ');
};

export const AUDIT_ENTITIES = {
  HOSPITAL: 'Hospital Facility',
  PATIENT: 'Patient Record',
  ENCOUNTER: 'Patient Visit',
  OBSERVATION: 'Vital Signs Record',
  AI_RISK: 'AI Risk Assessment',
  ALERT: 'Clinical Alert',
  PHYSICIAN_REVIEW: 'Physician Clinical Decision',
  STAFF: 'Staff Account',
  HOSPITAL_CONFIG: 'Facility Settings'
};

export const formatAuditEntity = (entity) => {
  if (!entity) return 'Record';
  return AUDIT_ENTITIES[entity] || entity.replace(/_/g, ' ');
};

export const AUDIT_ACTOR_TYPES = {
  HUMAN: 'Clinical Staff',
  AI_MODEL: 'AI Deterioration Engine',
  SYSTEM: 'Automated System'
};

export const formatAuditActorType = (actorType) => {
  if (!actorType) return 'Clinical Staff';
  return AUDIT_ACTOR_TYPES[actorType] || actorType;
};

export const AUDIT_RESULTS = {
  SUCCESS: { label: 'Completed', cls: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60' },
  FAILURE: { label: 'Failed', cls: 'bg-rose-950/80 text-rose-300 border-rose-800/60' },
  DENIED: { label: 'Access Restricted', cls: 'bg-amber-950/80 text-amber-300 border-amber-800/60' }
};

export const formatAuditResult = (res) => {
  if (!res) return { label: 'Completed', cls: 'bg-slate-800 text-slate-300 border-slate-700' };
  return AUDIT_RESULTS[res] || { label: res, cls: 'bg-slate-800 text-slate-300 border-slate-700' };
};
