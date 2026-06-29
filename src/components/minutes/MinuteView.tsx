import ActionItemsTable from './ActionItemsTable';

interface Minute {
  id: string;
  title: string;
  summary: string;
  topics: string[];
  decisions: string[];
  changes: string[];
  next_steps: string[];
}

interface MinuteViewProps {
  minute: Minute;
}

export default function MinuteView({ minute }: MinuteViewProps) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-semibold mb-2">Resumen</h2>
        <p className="text-gray-700">{minute.summary}</p>
      </section>

      {minute.topics && minute.topics.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Temas</h2>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            {(minute.topics as string[]).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      {minute.decisions && minute.decisions.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Decisiones</h2>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            {(minute.decisions as string[]).map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </section>
      )}

      {minute.changes && minute.changes.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Cambios</h2>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            {(minute.changes as string[]).map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {minute.next_steps && minute.next_steps.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Próximos Pasos</h2>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            {(minute.next_steps as string[]).map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-2">Action Items</h2>
      </section>
    </div>
  );
}
