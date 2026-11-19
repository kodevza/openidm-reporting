// SPDX-License-Identifier: CDDL-1.1
import {useMemo, useState} from 'preact/hooks';
import {
  useTable, tableFeatures, columnFilteringFeature, columnVisibilityFeature,
  rowPaginationFeature, functionalUpdate,
  type ColumnFiltersState, type PaginationState, type Updater,
} from '@tanstack/preact-table';
import {initialCursor, type Catalog, type Cursor, type Filters, type FilterValue, type HistoryColumn, type TableRow} from './types';
import {useDebounced} from '../shared/useDebounced';
import type {ReportingClient} from './ReportingClient';
import {useHistoryPage} from './useHistoryPage';
import {columnId as idFor, useColumnVisibility} from './useColumnVisibility';

const features = tableFeatures({columnFilteringFeature, columnVisibilityFeature, rowPaginationFeature});

export function useHistoryTable(catalog: Catalog, client: ReportingClient, myTasks: boolean) {
  const {visibility, updateVisibility, resetVisibility} = useColumnVisibility(catalog.columns, myTasks);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({pageIndex: 0, pageSize: 50});
  const [position, setPosition] = useState<{cursor: Cursor; back: Cursor[]}>({cursor: initialCursor, back: []});
  const [selected, setSelected] = useState('*');
  const [clearVersion, setClearVersion] = useState(0);

  const filters = useMemo(
    () => Object.fromEntries(columnFilters.map(filter => [filter.id, filter.value])) as Filters,
    [columnFilters],
  );
  const serialized = JSON.stringify(filters);
  const debounced = useDebounced(serialized);
  const invalidRange = Object.values(filters).some(
    value => typeof value === 'object' && value.from && value.to && value.from > value.to,
  );
  const {page, following, loading, error, refreshPage} = useHistoryPage({
    client, catalog, workflow: selected, cursor: position.cursor, filters: debounced,
    ready: serialized === debounced, invalidRange, myTasks,
  });

  const data = useMemo<TableRow[]>(() => page ? page.rows.map((values, index) => ({
    values,
    raw: page.rawRows?.[index] || values,
    links: page.links?.[index] || [],
    taskId: page.taskIds?.[index],
  })) : [], [page]);
  const definitions = useMemo(() => catalog.columns.map((column, index) => ({
    id: idFor(column),
    header: column.header,
    accessorFn: (row: TableRow) => row.values[index],
    enableColumnFilter: !!column.filterType,
  })), [catalog]);

  const table = useTable({
    features,
    columns: definitions,
    data,
    manualFiltering: true,
    manualPagination: true,
    state: {columnFilters, columnVisibility: visibility, pagination},
    onColumnFiltersChange: updateFilters,
    onColumnVisibilityChange: updateVisibility,
    onPaginationChange: updatePagination,
    pageCount: pagination.pageIndex + (following ? 2 : 1),
  });

  function resetPage() {
    setPosition({cursor: initialCursor, back: []});
    setPagination({pageIndex: 0, pageSize: 50});
  }

  function updateFilters(updater: Updater<ColumnFiltersState>) {
    setColumnFilters(previous => functionalUpdate(updater, previous));
    resetPage();
  }

  function updatePagination(updater: Updater<PaginationState>) {
    const next = functionalUpdate(updater, pagination);
    if (next.pageIndex > pagination.pageIndex && following) {
      setPosition({cursor: following, back: [...position.back, position.cursor]});
      setPagination(next);
    } else if (next.pageIndex < pagination.pageIndex && position.back.length) {
      setPosition({
        cursor: position.back[position.back.length - 1],
        back: position.back.slice(0, -1),
      });
      setPagination(next);
    }
  }

  function setFilter(column: HistoryColumn, value: FilterValue | undefined) {
    table.getColumn(idFor(column))!.setFilterValue(value);
  }

  function selectWorkflow(workflow: string) {
    setSelected(workflow);
    resetPage();
  }

  function removeFilter(column: HistoryColumn) {
    setFilter(column, undefined);
    setClearVersion(version => version + 1);
  }

  function clearFilters() {
    table.resetColumnFilters(true);
    setClearVersion(version => version + 1);
  }

  return {
    table, columnFilters, selected, selectWorkflow, filters, setFilter, removeFilter, clearFilters, clearVersion,
    visibility, resetVisibility, following, loading, error, refreshPage, invalidRange,
    rowCount: data.length, pageIndex: pagination.pageIndex,
  };
}

export type HistoryTableModel = ReturnType<typeof useHistoryTable>;
