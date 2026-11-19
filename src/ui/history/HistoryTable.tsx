// SPDX-License-Identifier: CDDL-1.1
import {useState} from 'preact/hooks';
import {messages} from '../locales/en';
import type {PeopleClient} from '../peoplePicker/PeopleClient';
import {ColumnFilter} from './ColumnFilter';
import type {Catalog, FilterValue, HistoryColumn, TableRow} from './types';
import {columnId} from './useColumnVisibility';
import type {HistoryTableModel} from './useHistoryTable';

function columnWidth(column: HistoryColumn) {
  if (column.filterType === 'date') return 240;
  if (column.filterType === 'person') return 250;
  if (column.header === 'Subject') return 310;
  if (column.header === 'Reason') return 300;
  return column.filterType === 'enum' ? 160 : 240;
}

function HistoryCell({row, index, workflowHref}: {row: TableRow; index: number; workflowHref?: string}) {
  const text = row.values[index] == null ? '' : String(row.values[index]);
  const href = row.links[index];
  const raw = row.raw[index];
  const title = raw && raw !== text ? String(raw) : undefined;
  let content = <>{text}</>;

  if (workflowHref && text) {
    content = <a href={workflowHref}>{text}</a>;
  } else if (href && /^https:\/\/entra\.microsoft\.com\/[0-9a-f-]{36}\/#view\//i.test(href)) {
    content = (
      <a href={href} target="_blank" rel="noopener noreferrer" title={messages.history.openInEntra(title)}>
        {text}
      </a>
    );
  }

  return <td className="history-cell" title={title}>{content}</td>;
}

interface Props {
  catalog: Catalog;
  model: HistoryTableModel;
  peopleClient: PeopleClient;
  myTasks: boolean;
}

export function HistoryTable({catalog, model, peopleClient, myTasks}: Props) {
  const {table, visibility, clearVersion, setFilter} = model;
  const [openFilters, setOpenFilters] = useState<Record<string, boolean>>({});
  const {columns} = catalog;
  const explicitProcessIdIndex = columns.findIndex(column => column.key === 'processId');
  const processIdIndex = explicitProcessIdIndex >= 0
    ? explicitProcessIdIndex
    : columns.findIndex(column => column.key === '_id');
  const visibleColumns = columns.filter(column => visibility[columnId(column)] !== false);
  const minWidth = visibleColumns.reduce((sum, column) => sum + columnWidth(column), 0);

  return (
    <div className="table-responsive">
      <table className="table table-striped table-hover history-table" style={{'--history-table-min-width': minWidth + 'px'}}>
        <colgroup>
          {visibleColumns.map(column => (
            <col key={columnId(column)} style={{'--history-column-width': columnWidth(column) + 'px'}}/>
          ))}
        </colgroup>
        <caption>{myTasks ? messages.history.tasksCaption : messages.history.caption}</caption>
        <thead>
          {table.getHeaderGroups().map(group => (
            <tr key={group.id}>
              {group.headers.map(header => {
                const key = header.column.id;
                const index = columns.findIndex(column => columnId(column) === key);
                const column = columns[index];
                const id = 'history-filter-' + index;
                const open = !!openFilters[key];
                const value = header.column.getFilterValue() as FilterValue | undefined;
                const filterLabel = messages.filters.open(column.header);

                return (
                  <th key={header.id} scope="col">
                    <div className="history-header">
                      <span>{column.header}</span>
                      {column.filterType && (
                        <button
                          type="button"
                          className={'btn btn-xs history-filter-toggle ' + (value ? 'btn-primary' : 'btn-link')}
                          aria-label={filterLabel}
                          title={filterLabel}
                          aria-expanded={open}
                          aria-controls={id + '-controls'}
                          onClick={() => setOpenFilters(previous => ({...previous, [key]: !open}))}
                        >
                          <i className="fa fa-filter" aria-hidden="true"/>
                        </button>
                      )}
                    </div>
                    {column.filterType && (
                      <ColumnFilter
                        column={column} id={id} open={open} value={value}
                        clearVersion={clearVersion} peopleClient={peopleClient}
                        onChange={next => setFilter(column, next)}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => {
            const processId = row.original.raw[processIdIndex];
            const workflowHref = !myTasks && processId != null && String(processId).trim()
              ? '../admin/#workflow/processinstance/' + encodeURIComponent(String(processId))
              : undefined;
            return (
              <tr key={row.id}>
                {row.getVisibleCells().map(cell => {
                  const index = columns.findIndex(column => columnId(column) === cell.column.id);
                  const taskId = row.original.taskId;
                  const href = index === processIdIndex ? workflowHref
                    : columns[index].key === 'status' && typeof taskId === 'string' && taskId
                      ? '../admin/#workflow/taskinstance/' + encodeURIComponent(taskId)
                      : undefined;
                  return <HistoryCell key={cell.id} row={row.original} index={index} workflowHref={href}/>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
