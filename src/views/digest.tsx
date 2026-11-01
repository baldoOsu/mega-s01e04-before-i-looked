import type { DigestRow, Night } from '../digest/types.js';

const dash = '—';

// A row is marked when it needed 3+ retries or any fail happened (or it ended on a fail).
function isWarn(r: DigestRow): boolean {
  return r.retries >= 3 || r.fails > 0 || r.lastStatus === 'fail';
}

export function DigestPage({ night }: { night: Night }) {
  return (
    <>
      <h1>digest · {night.night}</h1>
      {night.rows.length === 0 ? (
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
            {night.rows.map((r) => (
              <tr class={isWarn(r) ? 'warn' : undefined}>
                <td>{r.job}</td>
                <td>{r.owner ?? dash}</td>
                <td>{r.runs}</td>
                <td>{r.retries}</td>
                <td>{r.lastStatus}</td>
                <td>{r.lastError ?? dash}</td>
                <td>{r.firstAt}</td>
                <td>{r.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {night.badLines > 0 && <p class="mute">{night.badLines} line(s) could not be read</p>}
    </>
  );
}

export function DigestMissing({ night }: { night: string }) {
  return <p>no run log for {night}</p>;
}
