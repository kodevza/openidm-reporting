// SPDX-License-Identifier: CDDL-1.1
import {functionalUpdate, type ColumnVisibilityState, type Updater} from '@tanstack/preact-table';
import {useMemo, useState} from 'preact/hooks';
import type {HistoryColumn} from './types';

export const columnId = (column: HistoryColumn) => column.key || column.header;

export function useColumnVisibility(columns: HistoryColumn[], myTasks: boolean) {
  const storageKey = myTasks ? 'openidm.my-tasks.columns.v1' : 'openidm.workflow-history.columns.v1';
  const defaults = useMemo(() => Object.fromEntries(columns.map(column => [columnId(column), column.visible])), [columns]);
  const schema = columns.map(column => column.header);
  const [visibility, setVisibility] = useState<ColumnVisibilityState>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && JSON.stringify(saved.schema) === JSON.stringify(schema) &&
          Array.isArray(saved.visible) && saved.visible.length &&
          saved.visible.every((header: string) => schema.includes(header))) {
        return Object.fromEntries(columns.map(column => [columnId(column), saved.visible.includes(column.header)]));
      }
    } catch { /* Preferences are optional. */ }
    return defaults;
  });

  function updateVisibility(updater: Updater<ColumnVisibilityState>) {
    const next = functionalUpdate(updater, visibility);
    const visible = columns.filter(column => next[columnId(column)] !== false).map(column => column.header);
    if (!visible.length) return;
    setVisibility(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify({schema, visible}));
    } catch { /* Preferences are optional. */ }
  }

  function resetVisibility() {
    setVisibility(defaults);
    try {
      localStorage.removeItem(storageKey);
    } catch { /* Preferences are optional. */ }
  }

  return {visibility, updateVisibility, resetVisibility};
}
