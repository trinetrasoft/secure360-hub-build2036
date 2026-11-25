import React from 'react';
import { X } from 'lucide-react';
import Panel from './Panel';
import SectionHead from './SectionHead';
import { C } from '../../theme/colors';

export const EXECUTIVE_DEFAULT_FILTERS = {
  region: 'All',
  dbType: 'All',
};

function FilterField({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="azure-select text-[11px] px-2.5 py-2"
      >
        <option value="All">All</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export function countActiveFilters(filters, defaults = EXECUTIVE_DEFAULT_FILTERS) {
  return Object.keys(defaults).filter((key) => filters[key] !== defaults[key]).length;
}

export default function DashboardFiltersPanel({
  filters,
  onChange,
  onClear,
  regionOptions,
  dbTypeOptions,
}) {
  const activeCount = countActiveFilters(filters);

  return (
    <Panel className="azure-commandbar" padding="p-4">
      <SectionHead
        sub={activeCount ? `${activeCount} active` : 'Slice fleet view'}
        title="Filters"
        action={
          activeCount > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 azure-icon-button px-2 py-1.5"
              style={{ color: C.accent }}
            >
              <X size={12} /> Clear all
            </button>
          ) : null
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <FilterField
          label="Region"
          value={filters.region}
          onChange={(v) => onChange('region', v)}
          options={regionOptions}
        />
        <FilterField
          label="Asset domain"
          value={filters.dbType}
          onChange={(v) => onChange('dbType', v)}
          options={dbTypeOptions}
        />
      </div>
    </Panel>
  );
}
