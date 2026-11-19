// SPDX-License-Identifier: CDDL-1.1
import {messages} from '../locales/en';
import {useEffect, useState} from 'preact/hooks';
import type {ReportingClient} from './ReportingClient';
import {nextCursor, type Catalog, type Cursor, type Page} from './types';

interface Options {
  client: ReportingClient;
  catalog: Catalog;
  workflow: string;
  cursor: Cursor;
  filters: string;
  ready: boolean;
  invalidRange: boolean;
  myTasks: boolean;
}

export function useHistoryPage({client, catalog, workflow, cursor, filters, ready, invalidRange, myTasks}: Options) {
  const [page, setPage] = useState<Page | null>(null);
  const [following, setFollowing] = useState<Cursor | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    setPage(null);
    setFollowing(null);
    setError('');
    const enabled = Boolean(workflow) && !invalidRange;
    setLoading(enabled);
    if (!enabled || !ready) return;

    let active = true;
    client.getPage(cursor, workflow, JSON.parse(filters), {taskLinks: true}).then(result => {
      if (!active) return;
      const headers = catalog.columns.map(column => column.header);
      if (result.columns.length !== headers.length || headers.some((header, index) => header !== result.columns[index])) {
        throw Error('Report schema changed');
      }
      const next = nextCursor(result, cursor);
      setPage(result);
      setFollowing(next);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setError(myTasks ? messages.history.tasksError
        : messages.history.historyError);
      setLoading(false);
    });
    return () => { active = false; };
  }, [client, catalog, workflow, cursor, filters, ready, invalidRange, myTasks, refresh]);

  return {page, following, loading, error, refreshPage: () => setRefresh(version => version + 1)};
}
