import { Document, Page, Text, View, StyleSheet, Font, pdf } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
  }>;
  created_at?: string;
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
  const p = priority.toLowerCase();
  const baseStyle = styles.priorityBadge;
  
  if (p === 'alta') {
    return <Text style={[baseStyle, styles.priorityAlta]}>{priority.toUpperCase()}</Text>;
  }
  if (p === 'media') {
    return <Text style={[baseStyle, styles.priorityMedia]}>{priority.toUpperCase()}</Text>;
  }
  return <Text style={[baseStyle, styles.priorityBaja]}>{priority.toUpperCase()}</Text>;
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

function ActionItemRow({ item }: { item: { assignee_name: string; description: string; priority: string; due_date?: string } }) {
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
    </View>
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