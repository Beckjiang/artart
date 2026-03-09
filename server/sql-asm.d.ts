declare module 'sql.js/dist/sql-asm.js' {
  export interface QueryExecResult {
    columns: string[]
    values: Array<Array<string | number | null>>
  }

  export interface Statement {
    bind(values?: Record<string, unknown> | unknown[]): void
    step(): boolean
    getAsObject(): Record<string, unknown>
    free(): void
  }

  export class Database {
    constructor(data?: Uint8Array)
    run(sql: string, params?: Record<string, unknown> | unknown[]): Database
    exec(sql: string, params?: Record<string, unknown> | unknown[]): QueryExecResult[]
    prepare(sql: string, params?: Record<string, unknown> | unknown[]): Statement
    export(): Uint8Array
  }

  export interface SqlJsStatic {
    Database: typeof Database
  }

  export default function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>
}
