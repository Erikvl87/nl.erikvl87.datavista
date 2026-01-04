import React, { useEffect, useState } from 'react';
import styles from './styles.module.css';
import './variables.css';
import appConfig from '@homeycompose/app.json';

// ============================================================================
// Types
// ============================================================================

interface FlowCardArgValue {
  id: string;
  title?: Record<string, string>;
}

interface FlowCardArg {
  name: string;
  type: string;
  title?: Record<string, string>;
  placeholder?: Record<string, string>;
  required?: boolean;
  // Common
  value?: unknown;
  // Dropdown / Multiselect
  values?: FlowCardArgValue[];
  conjunction?: string;
  // Number / Range
  min?: number;
  max?: number;
  step?: number;
  // Range specific
  label?: string;
  labelMultiplier?: number;
  labelDecimals?: number;
  // Device
  filter?: string;
}

interface FlowCardData {
  title: Record<string, string>;
  titleFormatted?: Record<string, string>;
  hint?: Record<string, string>;
  args?: FlowCardArg[];
  droptoken?: string[];
  duration?: boolean;
}

interface FlowCardProps {
  /** The flow card JSON data (use this OR source) */
  data?: FlowCardData;
  /** Path to flow card JSON relative to @homeycompose/flow/ (e.g., "actions/set-range.json") */
  source?: string;
  /** Language code (defaults to 'en') */
  lang?: string;
  /** Icon URL for the flow card */
  iconUrl?: string;
  /** Background color for the icon */
  iconColor?: string;
  /** Clamp the title to 2 lines (defaults to false) */
  clampTitle?: boolean;
}

// ============================================================================
// Argument Type Configuration
// ============================================================================

interface ArgTypeConfig {
  label: string;
  description: string;
  getDetails: (arg: FlowCardArg, lang: string) => ArgDetail[];
}

interface ArgDetail {
  label: string;
  value: string;
}

const ARG_TYPE_CONFIGS: Record<string, ArgTypeConfig> = {
  text: {
    label: 'Text',
    description: 'Free text input. Supports text, number, and boolean tokens.',
    getDetails: () => [],
  },
  autocomplete: {
    label: 'Autocomplete',
    description: 'Text input with autocomplete suggestions.',
    getDetails: () => [],
  },
  number: {
    label: 'Number',
    description: 'Numeric input. Supports tokens.',
    getDetails: (arg) => {
      const details: ArgDetail[] = [];
      if (arg.min !== undefined) details.push({ label: 'Min', value: String(arg.min) });
      if (arg.max !== undefined) details.push({ label: 'Max', value: String(arg.max) });
      if (arg.step !== undefined) details.push({ label: 'Step', value: String(arg.step) });
      return details;
    },
  },
  range: {
    label: 'Range',
    description: 'Slider with min/max values.',
    getDetails: (arg) => {
      const details: ArgDetail[] = [];
      if (arg.min !== undefined) details.push({ label: 'Min', value: String(arg.min) });
      if (arg.max !== undefined) details.push({ label: 'Max', value: String(arg.max) });
      if (arg.step !== undefined) details.push({ label: 'Step', value: String(arg.step) });
      if (arg.label) details.push({ label: 'Unit', value: arg.label });
      if (arg.labelMultiplier !== undefined) details.push({ label: 'Multiplier', value: String(arg.labelMultiplier) });
      if (arg.labelDecimals !== undefined) details.push({ label: 'Decimals', value: String(arg.labelDecimals) });
      return details;
    },
  },
  date: {
    label: 'Date',
    description: 'Date picker (dd-mm-yyyy).',
    getDetails: () => [],
  },
  time: {
    label: 'Time',
    description: 'Time picker (HH:mm).',
    getDetails: () => [],
  },
  dropdown: {
    label: 'Dropdown',
    description: 'Select one option from a list.',
    getDetails: (arg, lang) => {
      if (!arg.values?.length) return [];
      const options = arg.values.map(v => v.title?.[lang] || v.title?.['en'] || v.id).join(', ');
      return [{ label: 'Options', value: options }];
    },
  },
  multiselect: {
    label: 'Multiselect',
    description: 'Select multiple options from a list.',
    getDetails: (arg, lang) => {
      const details: ArgDetail[] = [];
      if (arg.values?.length) {
        const options = arg.values.map(v => v.title?.[lang] || v.title?.['en'] || v.id).join(', ');
        details.push({ label: 'Options', value: options });
      }
      if (arg.conjunction) details.push({ label: 'Conjunction', value: arg.conjunction });
      return details;
    },
  },
  checkbox: {
    label: 'Checkbox',
    description: 'Boolean toggle (true/false). Supports boolean tokens.',
    getDetails: () => [],
  },
  color: {
    label: 'Color',
    description: 'Color picker. Returns HEX value (e.g., #FF0000).',
    getDetails: () => [],
  },
  device: {
    label: 'Device',
    description: 'Device selector.',
    getDetails: (arg) => {
      if (!arg.filter) return [];
      return [{ label: 'Filter', value: arg.filter }];
    },
  },
};

function getArgTypeConfig(type: string): ArgTypeConfig {
  return ARG_TYPE_CONFIGS[type] || {
    label: type.charAt(0).toUpperCase() + type.slice(1),
    description: `Input of type "${type}".`,
    getDetails: () => [],
  };
}

// ============================================================================
// ArgChip Component
// ============================================================================

function ArgChip({ 
  arg, 
  displayText, 
  lang 
}: { 
  arg: FlowCardArg; 
  displayText: string; 
  lang: string;
}): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleClose = () => setIsOpen(false);

  const typeConfig = getArgTypeConfig(arg.type);
  const typeDetails = typeConfig.getDetails(arg, lang);

  // Format default value for display
  const formatDefaultValue = (value: unknown): string | undefined => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
  };

  const defaultValue = formatDefaultValue(arg.value);

  const isOptional = arg.required === false;

  return (
    <span className={styles.argWrapper}>
      <span 
        className={`${styles.arg} ${isOptional ? styles.argOptional : ''} ${isOpen ? styles.argActive : ''}`}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleClick(e as unknown as React.MouseEvent)}
      >
        {displayText}
      </span>
      {isOpen && (
        <>
          <div className={styles.argOverlay} onClick={handleClose} />
          <div className={styles.argPopover}>
            <div className={styles.argPopoverHeader}>
              <span className={styles.argPopoverName}>{arg.name}</span>
              <span className={`${styles.argPopoverBadge} ${arg.required === false ? styles.argPopoverBadgeOptional : ''}`}>
                {arg.required === false ? 'Optional' : 'Required'}
              </span>
            </div>
            
            <div className={styles.argPopoverRow}>
              <span className={styles.argPopoverLabel}>Type</span>
              <span className={styles.argPopoverValue}>{typeConfig.label}</span>
            </div>
            
            <div className={styles.argPopoverDescription}>
              {typeConfig.description}
            </div>

            {defaultValue !== undefined && (
              <div className={styles.argPopoverRow}>
                <span className={styles.argPopoverLabel}>Default</span>
                <span className={styles.argPopoverValue}>{defaultValue}</span>
              </div>
            )}

            {typeDetails.map((detail, index) => (
              <div key={index} className={styles.argPopoverRow}>
                <span className={styles.argPopoverLabel}>{detail.label}</span>
                <span className={styles.argPopoverValue}>{detail.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

/**
 * Parses the titleFormatted string and replaces [[argName]] with styled arg chips
 */
function parseTitle(titleFormatted: string, args: FlowCardArg[] = [], lang: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\[\[(\w+)\]\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIndex = 0;

  while ((match = regex.exec(titleFormatted)) !== null) {
    if (match.index > lastIndex) {
      parts.push(titleFormatted.slice(lastIndex, match.index));
    }

    const argName = match[1];
    const argDef = args.find(a => a.name === argName);
    const displayText = argDef?.title?.[lang] 
      || argDef?.title?.['en'] 
      || argDef?.placeholder?.[lang] 
      || argDef?.placeholder?.['en'] 
      || argName;

    if (argDef) {
      parts.push(
        <ArgChip 
          key={keyIndex++} 
          arg={argDef} 
          displayText={displayText} 
          lang={lang} 
        />
      );
    } else {
      parts.push(
        <span key={keyIndex++} className={styles.arg}>
          {displayText}
        </span>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < titleFormatted.length) {
    parts.push(titleFormatted.slice(lastIndex));
  }

  return parts;
}

export default function FlowCard({
  data,
  source,
  lang = 'en',
  iconUrl = '/img/logo.svg',
  iconColor = appConfig.brandColor,
  clampTitle = false,
}: FlowCardProps): React.ReactElement | null {
  const [flowData, setFlowData] = useState<FlowCardData | null>(data ?? null);

  useEffect(() => {
    if (source && !data) {
      import(`@homeycompose/flow/${source}`)
        .then((module) => setFlowData(module.default))
        .catch((err) => console.error(`Failed to load flow card: ${source}`, err));
    }
  }, [source, data]);

  if (!flowData) {
    return null;
  }

  const appName = appConfig.name[lang] ?? appConfig.name.en;
  const titleFormatted = flowData.titleFormatted?.[lang] 
    || flowData.titleFormatted?.['en'] 
    || flowData.title?.[lang] 
    || flowData.title?.['en'] 
    || '';
  const hint = flowData.hint?.[lang] || flowData.hint?.['en'];
  const titleParts = parseTitle(titleFormatted, flowData.args, lang);

  return (
    <div className={styles.flowcardContainer}>
      <div className={styles.gridBackground} />
      <div className={styles.flowcard}>
        <div className={styles.icon} style={{ backgroundColor: iconColor }}>
          <div 
            className={styles.iconInner} 
            style={{ 
              maskImage: `url(${iconUrl})`,
              WebkitMaskImage: `url(${iconUrl})`,
            }} 
          />
        </div>
        <div className={styles.text}>
          <div className={styles.owner}>{appName}</div>
          <div className={clampTitle ? styles.titleClamped : styles.title}>{titleParts}</div>
        </div>
        {hint && (
          <div className={styles.tooltipWrapper}>
            <div className={styles.tooltipIcon}>i</div>
            <div className={styles.tooltip}>
              <div className={styles.tooltipText}>{hint}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
