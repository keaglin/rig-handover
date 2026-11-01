import type { DigestRow, Night } from '../digest/types.js';

const dash = '—';

function Row(props: { row: DigestRow }) {
  const r = props.row;
  const warn = r.retries >= 3 || r.fails > 0;
  return (
    <tr class={warn ? 'warn' : undefined}>
      <td>{r.job}</td>
      <td>{r.owner ?? dash}</td>
      <td>{r.runs}</td>
      <td>{r.retries}</td>
      <td>{r.lastStatus}</td>
      <td>{r.lastError ?? dash}</td>
      <td>{r.firstAt}</td>
      <td>{r.lastAt}</td>
    </tr>
  );
}

export function DigestPage(props: { night: Night }) {
  const n = props.night;
  return (
    <>
      <h1>{n.night}</h1>
      {n.badLines > 0 && (
        <p class="mute">{n.badLines === 1 ? '1 bad line skipped' : `${n.badLines} bad lines skipped`}</p>
      )}
      {n.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {n.rows.map((r) => (
              <Row row={r} />
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
