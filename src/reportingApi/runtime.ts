// SPDX-License-Identifier: CDDL-1.1
interface CellPresentation { kind: 'user' | 'entraObject'; localIdPath?: string; tenantIdPath?: string; sourcePath?: string; objectTypePath?: string; }
type ReportCell = string | number | boolean | null;
interface ReportColumn { filterType?: 'text' | 'person' | 'enum' | 'date'; filterValues?: ReportingApi.ReportChoice[]; presentation?: CellPresentation; header: string; visible?: boolean; path?: string; value?: ReportCell; }
interface ReportProfile { id: string; title: string; filename: string; source?: string; sources?: string[]; filter?: string; columns: ReportColumn[]; }
interface ReportingConfig { defaultReport: string; reports: ReportProfile[]; }
declare var request: { method: string; additionalParameters?: Record<string, any> };
declare var context: { security?: { authenticationId?: string; authorization?: { roles?: string[]; id?: string; component?: string } } };
declare var openidm: ReportingApi.IDM;
namespace ReportingApi {
    export interface ReportChoice {
        id: string;
        title: string;
    }

    export interface PeopleDictionary {
        items: (ReportChoice & {description: string})[];
        nextOffset: number | null;
    }

    export interface ReportOptions {
        allowed: true;
        reports: ReportChoice[];
        workflows?: ReportChoice[];
        columns: {
            header: string;
            visible: boolean;
            key?: string;
            filterType?: ReportColumn['filterType'];
            filterValues?: ReportChoice[];
        }[];
    }

    export interface RenderedRows {
        header: string;
        csv: string;
        rows: ReportCell[][];
        rawRows: ReportCell[][];
        links: (string | null)[][];
    }

    export interface ReportPage extends RenderedRows {
        report: string;
        filename: string;
        columns: string[];
        taskIds?: (string | null)[];
        nextOffset: number | null;
        nextSourceIndex: number | null;
    }

    export type EndpointResponse = PeopleDictionary | ReportOptions | ReportPage;

    export interface IDM {
        read(path: string): any;
        query(path: string, params: object, fields: string[]): any;
    }

    // Parsing OpenIDM's JSON wrappers restores native array and object types.
    export function nativeObject(value: any): any {
        var json = String(value);
        return value && typeof value === 'object' && json.charAt(0) === '{'
            ? JSON.parse(json) : value;
    }

    export function badFilter(): never { throw {code:400, message:'Invalid report filter'}; }

    export const presentationPaths: ReadonlyArray<Exclude<keyof CellPresentation, 'kind'>> =
        ['localIdPath', 'tenantIdPath', 'sourcePath', 'objectTypePath'];
}
