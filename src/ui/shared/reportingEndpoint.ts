// SPDX-License-Identifier: CDDL-1.1
export const endpoint = 'endpoint/governanceReport?';
export interface Choice {id:string;title:string;description?:string}
export type Request = (uri:string)=>PromiseLike<unknown>;
