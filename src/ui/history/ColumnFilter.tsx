// SPDX-License-Identifier: CDDL-1.1
import {messages} from '../locales/en';
import {PeoplePicker} from '../peoplePicker/PeoplePicker';
import type {PeopleClient} from '../peoplePicker/PeopleClient';
import type {FilterValue, HistoryColumn} from './types';

function localTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

interface Props {
  column: HistoryColumn;
  id: string;
  open: boolean;
  value?: FilterValue;
  clearVersion: number;
  peopleClient: PeopleClient;
  onChange: (value: FilterValue | undefined) => void;
}

export function ColumnFilter({column, id, open, value, clearVersion, peopleClient, onChange}: Props) {
  const text = typeof value === 'string' ? value : '';
  const range = typeof value === 'object' ? value : {};

  function updateRange(part: 'from' | 'to', input: string) {
    const next = {...range};
    if (input) {
      const date = new Date(input);
      if (!Number.isFinite(date.getTime())) return;
      next[part] = date.toISOString();
    } else {
      delete next[part];
    }
    onChange(Object.keys(next).length ? next : undefined);
  }

  return (
    <div id={id + '-controls'} hidden={!open} className="history-column-filter">
      {open && <>
        <label className="sr-only" htmlFor={id}>{column.header === 'Subject' ? messages.filters.subjectId : column.header}</label>
        {column.filterType === 'text' && (
          <input id={id} className="form-control" type="search" placeholder={messages.filters.startsWith} value={text}
            onInput={event => {
              const input = event.currentTarget.value;
              onChange(input.trim() ? input : undefined);
            }} />
        )}
        {column.filterType === 'enum' && (
          <select id={id} className="form-control" value={text}
            onChange={event => onChange(event.currentTarget.value || undefined)}>
            <option value="">{messages.common.all}</option>
            {column.filterValues?.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        )}
        {column.filterType === 'person' && (
          <PeoplePicker key={id + clearVersion} id={id} label={column.header} value={text}
            onChange={next => onChange(next || undefined)} client={peopleClient} />
        )}
        {column.filterType === 'date' && (['from', 'to'] as const).map(part => (
          <div key={part}>
            <label className="small" htmlFor={id + '-' + part}>
              {part === 'from' ? messages.filters.from : messages.filters.to}
            </label>
            <input id={id + '-' + part} aria-label={part === 'from' ? messages.filters.fromLabel(column.header) : messages.filters.toLabel(column.header)} type="datetime-local"
              className="form-control" value={localTime(range[part])}
              onInput={event => updateRange(part, event.currentTarget.value)} />
          </div>
        ))}
      </>}
    </div>
  );
}
