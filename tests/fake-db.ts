// A tiny in-memory stand-in for the Supabase client, just enough of the query
// builder for the agent engine tests (select / insert / upsert / update with
// eq, neq, lt, lte, gt, gte, is, in, order, limit, single, maybeSingle).
// Selected columns are ignored: every query returns whole rows.

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

let nextId = 1;
const norm = (v: unknown) => (v === undefined ? null : v);

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private max: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private op: "select" | "insert" | "upsert" | "update" = "select";
  private payload: Row[] = [];
  private patch: Row = {};
  private opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};

  private rows: Row[];
  constructor(rows: Row[]) {
    this.rows = rows;
  }

  select() {
    return this;
  }
  insert(v: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(v) ? v : [v];
    return this;
  }
  upsert(v: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.payload = Array.isArray(v) ? v : [v];
    this.opts = opts;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => norm(r[c]) === v);
    return this;
  }
  neq(c: string, v: unknown) {
    this.filters.push((r) => norm(r[c]) !== v);
    return this;
  }
  is(c: string, v: unknown) {
    return this.eq(c, v);
  }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[c]));
    return this;
  }
  private cmp(c: string, test: (a: string, b: string) => boolean, v: unknown) {
    this.filters.push((r) => r[c] != null && test(String(r[c]), String(v)));
    return this;
  }
  lt(c: string, v: unknown) {
    return this.cmp(c, (a, b) => a < b, v);
  }
  lte(c: string, v: unknown) {
    return this.cmp(c, (a, b) => a <= b, v);
  }
  gt(c: string, v: unknown) {
    return this.cmp(c, (a, b) => a > b, v);
  }
  gte(c: string, v: unknown) {
    return this.cmp(c, (a, b) => a >= b, v);
  }
  order(col: string, o: { ascending?: boolean } = {}) {
    this.orders.push({ col, asc: o.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  private run(): Row[] {
    if (this.op === "insert" || this.op === "upsert") {
      const keys = this.opts.onConflict?.split(",") ?? [];
      const out: Row[] = [];
      for (const p of this.payload) {
        const existing = keys.length ? this.rows.find((r) => keys.every((k) => r[k] === p[k])) : undefined;
        if (existing) {
          if (this.opts.ignoreDuplicates) continue;
          Object.assign(existing, p);
          out.push(existing);
        } else {
          const row = { id: `row-${nextId++}`, created_at: new Date().toISOString(), ...p };
          this.rows.push(row);
          out.push(row);
        }
      }
      return out;
    }
    let found = this.rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") {
      for (const r of found) Object.assign(r, this.patch);
      return found;
    }
    for (const o of [...this.orders].reverse()) {
      found = [...found].sort((a, b) => String(a[o.col] ?? "").localeCompare(String(b[o.col] ?? "")) * (o.asc ? 1 : -1));
    }
    return this.max == null ? found : found.slice(0, this.max);
  }

  then<A = { data: unknown; error: null }, B = never>(ok?: ((v: { data: unknown; error: null }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    const rows = this.run();
    const data = this.mode === "many" ? rows : (rows[0] ?? null);
    return Promise.resolve({ data, error: null }).then(ok, bad);
  }
}

export function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = { ...seed };
  return {
    tables,
    from(name: string) {
      tables[name] ??= [];
      return new Query(tables[name]);
    },
  };
}
