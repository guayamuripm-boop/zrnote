import { Document, Page, Text, View, StyleSheet, Font, pdf } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { StudyAids } from '@/lib/study-aids';
import { isStudyAidsEmpty } from '@/lib/study-aids';

Font.register({
  family: 'Helvetica',
  fonts: [
    { src: 'https://cdn.jsdelivr.net/npm/@react-pdf/fonts/Helvetica/Helvetica-Regular.ttf' },
    { src: 'https://cdn.jsdelivr.net/npm/@react-pdf/fonts/Helvetica/Helvetica-Bold.ttf', fontWeight: 'bold' },
    { src: 'https://cdn.jsdelivr.net/npm/@react-pdf/fonts/Helvetica/Helvetica-Oblique.ttf', fontStyle: 'italic' },
    { src: 'https://cdn.jsdelivr.net/npm/@react-pdf/fonts/Helvetica/Helvetica-BoldOblique.ttf', fontWeight: 'bold', fontStyle: 'italic' },
  ],
});

interface MinuteData {
  summary: string;
  discussion?: Array<{ topic: string; details: string; speaker?: string }>;
  decisions?: string[];
  project_statuses?: Array<{ project: string; status: string; details: string }>;
  blockers?: Array<{ issue: string; impact: string; owner?: string }>;
  ideas?: string[];
  next_steps?: string[];
  action_items?: Array<{
    assignee_name: string;
    description: string;
    priority: string;
    due_date?: string;
    status?: string;
  }>;
  created_at?: string;
  /** Apuntes de clase. Solo los trae el estilo "Clase". */
  study_aids?: StudyAids;
}

interface MeetingData {
  id: string;
  title: string;
  coordination?: string;
  type?: string;
  created_at: string;
  started_at?: string;
  ended_at?: string;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    lineHeight: 1.5,
    color: '#1f2937',
  },
  header: {
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e3a8a',
    marginBottom: 8,
  },
  meta: {
    fontSize: 10,
    color: '#6b7280',
    marginBottom: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e3a8a',
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#dbeafe',
  },
  subsectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 8,
    marginBottom: 4,
  },
  text: {
    fontSize: 11,
    lineHeight: 1.6,
    marginBottom: 4,
  },
  speakerLabel: {
    fontSize: 9,
    color: '#6b7280',
    fontStyle: 'italic',
    marginBottom: 2,
  },
  listItem: {
    marginLeft: 16,
    marginBottom: 4,
  },
  actionItemRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingVertical: 4,
  },
  actionItemCell: {
    flex: 1,
    paddingHorizontal: 4,
  },
  actionItemHeader: {
    fontWeight: 'bold',
    fontSize: 10,
    color: '#374151',
    marginBottom: 2,
  },
  actionItemValue: {
    fontSize: 10,
    color: '#4b5563',
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  priorityAlta: { backgroundColor: '#fef2f2', color: '#dc2626' },
  priorityMedia: { backgroundColor: '#fffbeb', color: '#d97706' },
  priorityBaja: { backgroundColor: '#f0fdf4', color: '#16a34a' },
  footer: {
    marginTop: 30,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    fontSize: 9,
    color: '#9ca3af',
    textAlign: 'center',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
  },
  studyTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#5b21b6',
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#ede9fe',
  },
  term: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  callout: {
    backgroundColor: '#fffbeb',
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
    padding: 8,
    marginBottom: 10,
  },
  // Las tarjetas se imprimen para recortarse: por eso van en rejilla y con
  // borde, no como una lista. En papel una flashcard sin borde no se recorta.
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  card: {
    width: '48%',
    borderWidth: 0.5,
    borderColor: '#c4b5fd',
    borderRadius: 4,
    padding: 8,
    margin: '1%',
    minHeight: 54,
  },
});

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.meta}>
      <Text style={{ fontWeight: 'bold' }}>{label}:</Text> {' '}{value}
    </Text>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const safePriority = priority || 'media';
  const p = safePriority.toLowerCase();
  const baseStyle = styles.priorityBadge;

  if (p === 'alta') {
    return <Text style={[baseStyle, styles.priorityAlta]}>{safePriority.toUpperCase()}</Text>;
  }
  if (p === 'media') {
    return <Text style={[baseStyle, styles.priorityMedia]}>{safePriority.toUpperCase()}</Text>;
  }
  return <Text style={[baseStyle, styles.priorityBaja]}>{safePriority.toUpperCase()}</Text>;
}

function DiscussionItem({ item }: { item: { topic: string; details: string; speaker?: string } }) {
  return (
    <View style={styles.listItem}>
      <Text style={styles.subsectionTitle}>{item.topic}</Text>
      {item.speaker && <Text style={styles.speakerLabel}>Liderado por: {item.speaker}</Text>}
      <Text style={styles.text}>{item.details}</Text>
    </View>
  );
}

const STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  completado: 'Completado',
};

function ActionItemRow({ item }: { item: { assignee_name: string; description: string; priority: string; due_date?: string; status?: string } }) {
  return (
    <View style={styles.actionItemRow}>
      <View style={[styles.actionItemCell, { flex: 1.5 }]}>
        <Text style={styles.actionItemHeader}>Responsable</Text>
        <Text style={styles.actionItemValue}>{item.assignee_name}</Text>
      </View>
      <View style={[styles.actionItemCell, { flex: 3 }]}>
        <Text style={styles.actionItemHeader}>Tarea</Text>
        <Text style={styles.actionItemValue}>{item.description}</Text>
      </View>
      <View style={[styles.actionItemCell, { flex: 1 }]}>
        <Text style={styles.actionItemHeader}>Prioridad</Text>
        <PriorityBadge priority={item.priority} />
      </View>
      <View style={[styles.actionItemCell, { flex: 1 }]}>
        <Text style={styles.actionItemHeader}>Fecha</Text>
        <Text style={styles.actionItemValue}>{item.due_date || '—'}</Text>
      </View>
      <View style={[styles.actionItemCell, { flex: 1 }]}>
        <Text style={styles.actionItemHeader}>Estado</Text>
        <Text style={styles.actionItemValue}>{STATUS_LABEL[item.status || 'pendiente'] || item.status}</Text>
      </View>
    </View>
  );
}

/**
 * La guia de estudio, en su propia pagina.
 *
 * Va en un <Page> aparte y no al final del acta a proposito: es un documento
 * distinto con un uso distinto —el acta se archiva, esto se imprime y se lleva
 * encima— y empezar en pagina limpia es lo que permite imprimir solo estas
 * hojas. Con las tarjetas ademas importa: en rejilla y con borde para poder
 * recortarlas.
 */
function StudyGuidePage({ aids, meeting }: { aids: StudyAids; meeting: MeetingData }) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={{ ...styles.title, fontSize: 20, color: '#5b21b6' }}>Guia de estudio</Text>
        <MetaRow label="Clase" value={meeting.title} />
        <MetaRow label="Fecha" value={format(new Date(meeting.created_at), 'dd/MM/yyyy')} />
      </View>

      {aids.exam_notes.length > 0 && (
        <View style={styles.callout}>
          <Text style={{ ...styles.subsectionTitle, marginTop: 0, color: '#92400e' }}>Sobre la evaluacion</Text>
          {aids.exam_notes.map((n, i) => (
            <Text key={i} style={styles.text}>{'• '}{n}</Text>
          ))}
        </View>
      )}

      {aids.outline.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.studyTitle}>Temario de la clase</Text>
          {aids.outline.map((sec, i) => (
            <View key={i} style={{ marginBottom: 6 }} wrap={false}>
              <Text style={styles.subsectionTitle}>{i + 1}. {sec.section}</Text>
              {sec.points.map((pt, j) => (
                <Text key={j} style={{ ...styles.text, marginLeft: 12 }}>{'• '}{pt}</Text>
              ))}
            </View>
          ))}
        </View>
      )}

      {aids.key_concepts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.studyTitle}>Glosario</Text>
          {aids.key_concepts.map((c, i) => (
            <View key={i} style={{ marginBottom: 6 }} wrap={false}>
              <Text style={styles.term}>{c.term}</Text>
              <Text style={styles.text}>{c.definition}</Text>
              {c.why ? <Text style={{ ...styles.text, fontStyle: 'italic', color: '#6b7280' }}>{c.why}</Text> : null}
            </View>
          ))}
        </View>
      )}

      {(aids.key_formulas?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <Text style={styles.studyTitle}>Formulas y datos clave</Text>
          {aids.key_formulas!.map((f, i) => (
            <View key={i} style={{ marginBottom: 6 }} wrap={false}>
              <Text style={{ ...styles.term, fontFamily: 'Courier' }}>{f.formula}</Text>
              <Text style={styles.text}>{f.meaning}</Text>
              {f.when_to_use ? <Text style={{ ...styles.text, fontStyle: 'italic', color: '#6b7280' }}>Cuando usarla: {f.when_to_use}</Text> : null}
            </View>
          ))}
        </View>
      )}

      {aids.worked_examples.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.studyTitle}>Ejemplos resueltos</Text>
          {aids.worked_examples.map((e, i) => (
            <View key={i} style={{ marginBottom: 8 }} wrap={false}>
              <Text style={styles.term}>{e.problem}</Text>
              <Text style={styles.text}>{e.approach}</Text>
            </View>
          ))}
        </View>
      )}

      {aids.common_mistakes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.studyTitle}>Errores frecuentes</Text>
          {aids.common_mistakes.map((m, i) => (
            <View key={i} style={{ marginBottom: 6 }} wrap={false}>
              <Text style={{ ...styles.text, color: '#dc2626' }}>Error: {m.mistake}</Text>
              <Text style={{ ...styles.text, color: '#15803d' }}>Correcto: {m.correction}</Text>
            </View>
          ))}
        </View>
      )}

      {aids.study_questions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.studyTitle}>Preguntas de repaso</Text>
          {aids.study_questions.map((q, i) => (
            <View key={i} style={{ marginBottom: 6 }} wrap={false}>
              <Text style={styles.term}>{i + 1}. {q.question}</Text>
              <Text style={{ ...styles.text, color: '#4b5563' }}>{q.answer}</Text>
            </View>
          ))}
        </View>
      )}

      {aids.flashcards.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.studyTitle}>Tarjetas de repaso (para recortar)</Text>
          <View style={styles.cardGrid}>
            {aids.flashcards.map((c, i) => (
              <View key={i} style={styles.card} wrap={false}>
                <Text style={{ ...styles.term, fontSize: 10 }}>{c.front}</Text>
                <Text style={{ ...styles.text, fontSize: 9, color: '#4b5563' }}>{c.back}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {aids.open_questions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.studyTitle}>Quedo sin resolver</Text>
          {aids.open_questions.map((q, i) => (
            <Text key={i} style={styles.text}>{'• '}{q}</Text>
          ))}
        </View>
      )}

      {aids.resources.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.studyTitle}>Material mencionado</Text>
          {aids.resources.map((r, i) => (
            <Text key={i} style={styles.text}>{'• '}{r}</Text>
          ))}
        </View>
      )}

      <View style={styles.footer}>
        <Text>Apuntes generados por ZRNote a partir del audio de la clase, usando unicamente lo que se dijo en ella.</Text>
        <Text>Pueden contener errores u omisiones: contrastalos con el material del docente.</Text>
      </View>
    </Page>
  );
}

export function MinutePDFDocument({ 
  meeting, 
  minute 
}: { 
  meeting: MeetingData; 
  minute: MinuteData; 
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{meeting.title}</Text>
          <MetaRow label="Coordinación" value={meeting.coordination || '—'} />
          <MetaRow label="Tipo" value={meeting.type || 'presencial'} />
          <MetaRow label="Fecha" value={format(new Date(meeting.created_at), 'dd/MM/yyyy HH:mm')} />
          {meeting.started_at && <MetaRow label="Inicio" value={format(new Date(meeting.started_at), 'HH:mm')} />}
          {meeting.ended_at && <MetaRow label="Fin" value={format(new Date(meeting.ended_at), 'HH:mm')} />}
        </View>

        {/* Resumen */}
        {minute.summary && (
          <View style={styles.section}>
            <SectionTitle>Resumen Ejecutivo</SectionTitle>
            <Text style={styles.text}>{minute.summary}</Text>
          </View>
        )}

        {/* Temas Discutidos */}
        {minute.discussion && minute.discussion.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>Temas Discutidos</SectionTitle>
            {minute.discussion.map((d, i) => (
              <DiscussionItem key={i} item={d} />
            ))}
          </View>
        )}

        {/* Decisiones */}
        {minute.decisions && minute.decisions.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>Decisiones</SectionTitle>
            {minute.decisions.map((d, i) => (
              <Text key={i} style={{ ...styles.listItem, marginBottom: 6 }}>
                {d}
              </Text>
            ))}
          </View>
        )}

        {/* Estados de Proyectos */}
        {minute.project_statuses && minute.project_statuses.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>Estados de Proyectos</SectionTitle>
            {minute.project_statuses.map((p, i) => (
              <View key={i} style={styles.listItem}>
                <Text style={styles.subsectionTitle}>{p.project}</Text>
                <Text style={{ ...styles.text, color: '#2563eb', fontWeight: 'bold' }}>
                  Estado: {p.status}
                </Text>
                <Text style={styles.text}>{p.details}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Bloqueos */}
        {minute.blockers && minute.blockers.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>Bloqueos / Problemas</SectionTitle>
            {minute.blockers.map((b, i) => (
              <View key={i} style={styles.listItem}>
                <Text style={{ ...styles.subsectionTitle, color: '#dc2626' }}>{b.issue}</Text>
                <Text style={styles.text}>Impacto: {b.impact}</Text>
                {b.owner && <Text style={styles.text}>Responsable: {b.owner}</Text>}
              </View>
            ))}
          </View>
        )}

        {/* Ideas */}
        {minute.ideas && minute.ideas.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>Ideas / Brainstorming</SectionTitle>
            {minute.ideas.map((idea, i) => (
              <Text key={i} style={styles.listItem}>
                {idea}
              </Text>
            ))}
          </View>
        )}

        {/* Próximos Pasos */}
        {minute.next_steps && minute.next_steps.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>Próximos Pasos</SectionTitle>
            {minute.next_steps.map((step, i) => (
              <Text key={i} style={styles.listItem}>
                {step}
              </Text>
            ))}
          </View>
        )}

        {/* Action Items */}
        {minute.action_items && minute.action_items.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>Action Items / Compromisos</SectionTitle>
            <View style={styles.tableHeader}>
              <Text style={[styles.actionItemHeader, { flex: 1.5 }]}>Responsable</Text>
              <Text style={[styles.actionItemHeader, { flex: 3 }]}>Descripción</Text>
              <Text style={[styles.actionItemHeader, { flex: 1 }]}>Prioridad</Text>
              <Text style={[styles.actionItemHeader, { flex: 1 }]}>Fecha Límite</Text>
            </View>
            {minute.action_items.map((item, i) => (
              <ActionItemRow key={i} item={item} />
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Generado por ZRNote — Minutas Inteligentes</Text>
          <Text>Reunión: {meeting.title} • Generado: {format(new Date(), 'dd/MM/yyyy HH:mm')}</Text>
          <Text>ID Reunión: {meeting.id} • Confidencial - Uso interno</Text>
        </View>
      </Page>

      {/* Solo cuando hay apuntes de clase: un acta ejecutiva no lleva esta pagina. */}
      {minute.study_aids && !isStudyAidsEmpty(minute.study_aids) && (
        <StudyGuidePage aids={minute.study_aids} meeting={meeting} />
      )}
    </Document>
  );
}

export async function generateMinutePDFBlob(
  meeting: MeetingData,
  minute: MinuteData
): Promise<Blob> {
  const doc = <MinutePDFDocument meeting={meeting} minute={minute} />;
  return pdf(doc).toBlob();
}

export async function downloadMinutePDF(
  meeting: MeetingData,
  minute: MinuteData,
  filename?: string
): Promise<void> {
  const blob = await generateMinutePDFBlob(meeting, minute);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `minuta-${meeting.title.replace(/\s+/g, '-')}-${format(new Date(), 'yyyyMMdd')}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}