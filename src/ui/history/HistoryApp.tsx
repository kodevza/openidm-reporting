// SPDX-License-Identifier: CDDL-1.1
import {useEffect, useMemo, useState} from 'preact/hooks';
import {messages} from '../locales/en';
import type {Request} from '../shared/reportingEndpoint';
import {PeopleClient} from '../peoplePicker/PeopleClient';
import {ReportingClient} from './ReportingClient';
import {ActiveHistoryFilters, HistoryColumnChoices, HistoryPagination, HistoryToolbar} from './HistoryControls';
import {HistoryTable} from './HistoryTable';
import type {Catalog} from './types';
import {useHistoryTable, type HistoryTableModel} from './useHistoryTable';
import {useTaskSelection} from './useTaskSelection';
import {useHistoryDownload} from './useHistoryDownload';

export function HistoryApp({request, myTasks = false, rejectTask}: {request: Request; myTasks?: boolean; rejectTask?: ReportProps['rejectTask']}) {
  const client = useMemo(() => new ReportingClient(request), [request]);
  const peopleClient = useMemo(() => new PeopleClient(request), [request]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setCatalogError('');
    client.getCatalog().then(data => {
      if (active) setCatalog(data);
    }).catch(() => {
      if (active) {
        setCatalogError(myTasks ? messages.history.tasksCatalogError : messages.history.workflowsError);
      }
    });
    return () => { active = false; };
  }, [client, reload, myTasks]);

  if (!catalog) {
    const loadingMessage = myTasks ? messages.history.loadingTasks : messages.history.loadingWorkflows;
    return (
      <div role="status">
        {catalogError || loadingMessage}
        {catalogError && (
          <button className="btn btn-default" onClick={() => setReload(version => version + 1)}>
            {messages.common.retry}
          </button>
        )}
      </div>
    );
  }

  return <Report catalog={catalog} client={client} peopleClient={peopleClient} myTasks={myTasks} rejectTask={myTasks ? rejectTask : undefined}/>;
}

interface ReportProps {
  catalog: Catalog;
  client: ReportingClient;
  peopleClient: PeopleClient;
  myTasks: boolean;
  rejectTask?: (id: string) => Promise<void>;
}

function historyStatus(model: HistoryTableModel, myTasks: boolean) {
  const {selected, invalidRange, loading, error, rowCount, pageIndex} = model;
  if (!selected) return messages.history.selectWorkflowPrompt;
  if (invalidRange) return messages.history.invalidRange;
  if (loading) return myTasks ? messages.history.loadingTasks : messages.history.loadingHistory;
  if (error) return error;
  if (!rowCount) return myTasks ? messages.history.noTasks : messages.history.noHistory;
  return messages.history.pageSummary(rowCount, pageIndex + 1);
}

function Report({catalog, client, peopleClient, myTasks, rejectTask}: ReportProps) {
  const model = useHistoryTable(catalog, client, myTasks);
  const {selected, selectWorkflow, filters, invalidRange} = model;
  const {download, downloading, exportError} = useHistoryDownload(client, catalog.workflows, selected, filters, invalidRange);
  const selection = useTaskSelection(client, rejectTask, model.refreshPage);
  const [showColumns, setShowColumns] = useState(false);

  return (
    <div data-table-engine="tanstack-preact-table" className="workflow-history-preact panel panel-default">
      <HistoryToolbar
        workflows={catalog.workflows}
        myTasks={myTasks}
        selected={selected}
        onSelectWorkflow={selectWorkflow}
        showColumns={showColumns}
        onToggleColumns={() => setShowColumns(open => !open)}
        downloading={downloading}
        downloadDisabled={!selected || downloading || invalidRange}
        download={download}
      />
      <ActiveHistoryFilters columns={catalog.columns} model={model}/>
      {invalidRange && <p role="alert" className="text-danger">{messages.filters.invalidRange}</p>}
      {showColumns && <HistoryColumnChoices model={model}/>}
      <p role="status" className="text-muted history-status">{historyStatus(model, myTasks)}</p>
      {exportError && <p role="alert" className="text-danger">{exportError}</p>}
      {rejectTask && (
        <div className="history-toolbar">
          <button type="button" className="btn btn-default" disabled={selection.busy} onClick={selection.selectAll}>
            Select all pending tasks
          </button>{' '}
          <button type="button" className="btn btn-default" disabled={selection.busy || !selection.ids.size} onClick={selection.clear}>
            Clear selection
          </button>{' '}
          <button type="button" className="btn btn-danger" disabled={selection.busy || !selection.ids.size} onClick={selection.reject}>
            Reject selected ({selection.ids.size})
          </button>
          <p role="status">{selection.status}</p>
        </div>
      )}
      <HistoryTable catalog={catalog} model={model} peopleClient={peopleClient} myTasks={myTasks} selection={rejectTask ? selection : undefined}/>
      <HistoryPagination model={model}/>
    </div>
  );
}
