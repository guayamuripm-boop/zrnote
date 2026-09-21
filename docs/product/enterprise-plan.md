# ZRNote — Plan de Integración Google Meet + Knowledge Base Empresarial

> **Objetivo**: Capturar reuniones de Google Meet automáticamente + construir base de conocimiento vectorial por empresa para agentes IA (RAG).

---

## 1. ARQUITECTURA GENERAL

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ZRNOTE ENTERPRISE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐  │
│  │  Google Meet │───▶│  Meet Bot    │───▶│  Procesador  │───▶│  Vector  │  │
│  │  (Calendar)  │    │  (Recall.ai) │    │  (Existente) │    │   DB     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘    └────┬─────┘  │
│                                                                    │        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │        │
│  │  Empresa A   │    │  Empresa B   │    │  Empresa N   │         │        │
│  │  (Org ID)    │    │  (Org ID)    │    │  (Org ID)    │         │        │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘         │        │
│         │                   │                   │                 ▼        │
│         ▼                   ▼                   ▼          ┌──────────────┐ │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │  Agent API   │ │
│  │ Contexto A   │    │ Contexto B   │    │ Contexto N   │ │  (RAG Query) │ │
│  │ (Namespaces) │    │ (Namespaces) │    │ (Namespaces) │ └──────────────┘ │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. GOOGLE MEET INTEGRACIÓN

### 2.1 Opciones de Bot

| Opción | Pros | Contras | Coste |
|--------|------|---------|-------|
| **Recall.ai** (Recomendado) | API simple, soporta Meet/Zoom/Teams, recording + transcript, webhooks | $0.05/min + $0.01/min transcript | ~$30/mes por 10h |
| **Daily.co** | WebRTC nativo, buen SDK | Más dev work | Similar |
| **Propio (Puppeteer/Playwright)** | Control total, sin coste recurrente | Mantenimiento alto, frágil | Solo infra |

### 2.2 Flujo con Recall.ai

```
1. Usuario conecta Google Calendar (OAuth) en ZRNote
2. ZRNote detecta reuniones con Meet link
3. 5 min antes → Recall.ai bot joins meeting
4. Bot graba audio/video → cloud storage (Recall)
5. Meeting ends → Recall webhook → ZRNote /api/webhooks/recall
6. ZRNote descarga audio → procesa con pipeline existente
7. Guarda minuta + action items + vectoriza en Pinecone/pgvector
```

### 2.3 Configuración Recall.ai

```typescript
// src/lib/recall.ts
import { RecallClient } from '@recallai/api-client';

const recall = new RecallClient({ token: process.env.RECALL_API_KEY! });

export async function scheduleBot(meeting: {
  meetUrl: string;
  meetingId: string;
  orgId: string;
  title: string;
  startTime: Date;
}) {
  const bot = await recall.bots.create({
    meeting_url: meeting.meetUrl,
    bot_name: `ZRNote-${meeting.title}`,
    join_at: meeting.startTime.toISOString(),
    leave_after_seconds: 60 * 60 * 4, // max 4h
    recording_config: {
      transcript: { provider: 'assembly_ai', language: 'es' },
      video: { include: true },
    },
    metadata: {
      zrnote_meeting_id: meeting.meetingId,
      zrnote_org_id: meeting.orgId,
    },
  });
  return bot.id;
}
```

---

## 3. KNOWLEDGE BASE EMPRESARIAL (RAG)

### 3.1 Modelo de Datos

```sql
-- Extensión del schema actual
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  pinecone_namespace text UNIQUE, -- ej: "org_acme_corp"
  created_at timestamptz DEFAULT now()
);

-- Índices vectoriales (usando pgvector en Supabase O Pinecone)
CREATE TABLE meeting_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id),
  meeting_id uuid REFERENCES meetings(id),
  chunk_index int,
  content text NOT NULL,           -- Texto del chunk
  embedding vector(1536),          -- OpenAI text-embedding-3-small
  metadata jsonb DEFAULT '{}',     -- {speaker, timestamp, section}
  created_at timestamptz DEFAULT now()
);

CREATE INDEX meeting_chunks_embedding_idx 
  ON meeting_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Políticas RLS
ALTER TABLE meeting_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read chunks" ON meeting_chunks FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));
```

### 3.2 Pipeline de Vectorización

```typescript
// src/lib/vectorize.ts
import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

export async function vectorizeMeeting(
  orgId: string,
  meetingId: string,
  minute: any,
  transcript: string
) {
  const namespace = `org_${orgId}`;
  const index = pinecone.index('zrnote-meetings').namespace(namespace);

  // 1. Chunking inteligente por secciones
  const chunks = createSemanticChunks(minute, transcript);

  // 2. Embeddings en batch
  const embeddings = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: chunks.map(c => c.text),
    dimensions: 1536,
  });

  // 3. Upsert a Pinecone
  const vectors = chunks.map((chunk, i) => ({
    id: `${meetingId}_${chunk.index}`,
    values: embeddings.data[i].embedding,
    metadata: {
      meeting_id: meetingId,
      org_id: orgId,
      section: chunk.section,      // 'summary', 'decisions', 'action_items', etc.
      speaker: chunk.speaker,
      timestamp: chunk.timestamp,
      text: chunk.text.substring(0, 1000), // preview
    },
  }));

  await index.upsert(vectors);
  
  // 4. También guardar en pgvector (Supabase) para queries SQL híbridas
  await saveToPgVector(orgId, meetingId, vectors);
}

function createSemanticChunks(minute: any, transcript: string): Chunk[] {
  const chunks: Chunk[] = [];
  let index = 0;

  // Resumen ejecutivo
  if (minute.summary) {
    chunks.push({ index: index++, section: 'summary', text: minute.summary, speaker: 'system' });
  }

  // Temas discutidos
  for (const topic of minute.discussion || []) {
    chunks.push({ 
      index: index++, 
      section: 'discussion', 
      text: `${topic.topic}: ${topic.details}`, 
      speaker: topic.speaker 
    });
  }

  // Decisiones
  for (const decision of minute.decisions || []) {
    chunks.push({ index: index++, section: 'decisions', text: decision, speaker: 'system' });
  }

  // Action items
  for (const item of minute.action_items || []) {
    chunks.push({ 
      index: index++, 
      section: 'action_items', 
      text: `${item.assignee_name}: ${item.description} (${item.priority})`, 
      speaker: item.assignee_name 
    });
  }

  // Transcripción completa en chunks de ~500 tokens
  const transcriptChunks = splitText(transcript, 500);
  for (const tc of transcriptChunks) {
    chunks.push({ index: index++, section: 'transcript', text: tc, speaker: 'unknown' });
  }

  return chunks;
}
```

---

## 4. AGENT API (RAG QUERY)

### 4.1 Endpoint para Agentes

```typescript
// src/app/api/agent/query/route.ts
import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

export async function POST(request: Request) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { query, orgId, filters = {}, topK = 10 } = await request.json();

  // Verificar que user pertenece a org
  const { data: membership } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', user.id)
    .single();
  
  if (membership?.org_id !== orgId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const namespace = `org_${orgId}`;
  const index = pinecone.index('zrnote-meetings').namespace(namespace);

  // 1. Embedding de la query
  const queryEmbedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
    dimensions: 1536,
  });

  // 2. Vector search
  const results = await index.query({
    vector: queryEmbedding.data[0].embedding,
    topK,
    filter: { ...filters, org_id: { $eq: orgId } },
    includeMetadata: true,
  });

  // 3. Rerank + contexto
  const context = results.matches
    .map(m => `[${m.metadata.section}] ${m.metadata.text}`)
    .join('\n\n');

  // 4. LLM response con citas
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: AGENT_SYSTEM_PROMPT },
      { role: 'user', content: `Contexto:\n${context}\n\nPregunta: ${query}` },
    ],
    temperature: 0.2,
  });

  return NextResponse.json({
    answer: response.choices[0].message.content,
    sources: results.matches.map(m => ({
      meeting_id: m.metadata.meeting_id,
      section: m.metadata.section,
      score: m.score,
      preview: m.metadata.text.substring(0, 200),
    })),
  });
}

const AGENT_SYSTEM_PROMPT = `
Eres un asistente corporativo con acceso al historial de reuniones de la empresa.
Responde basándote SOLO en el contexto proporcionado. Cita fuentes: [meeting_id, section].
Si no hay info suficiente, di "No tengo información sobre eso en las reuniones registradas".
`;
```

---

## 5. MULTI-TENANT Y PERMISOS

### 5.1 Esquema de Permisos

| Rol | Meetings | Vector Search | Admin |
|-----|----------|---------------|-------|
| **Super Admin** | Todas orgs | Todas orgs | Sí |
| **Org Admin** | Su org | Su org | Config org |
| **Coordinator** | Sus meetings | Su org | No |
| **Participant** | Sus meetings | Solo sus meetings* | No |

*Participantes solo buscan en reuniones donde fueron invitados.

### 5.2 Filtros en Vector Search

```typescript
// En agent query
const filters = {
  org_id: { $eq: orgId },
  // Para coordinadores: todas
  // Para participantes: meeting_id IN (SELECT meeting_id FROM meeting_participants WHERE user_id = ?)
  ...(role === 'participant' 
    ? { meeting_id: { $in: userMeetingIds } } 
    : {}
  ),
};
```

---

## 6. PLAN DE IMPLEMENTACIÓN (FASES)

### FASE 1: Fundación (Semana 1-2)
- [ ] Schema multi-tenant: `organizations`, `org_members`, `pinecone_namespace`
- [ ] Migración RLS para aislamiento por org
- [ ] Config Pinecone project + index `zrnote-meetings` (1536 dims, cosine)
- [ ] Variables env: `PINECONE_API_KEY`, `OPENAI_API_KEY`

### FASE 2: Google Meet Bot (Semana 2-3)
- [ ] Recall.ai account + API key
- [ ] OAuth Google Calendar en ZRNote
- [ ] Sync cron: detecta reuniones con Meet link → schedule bot
- [ ] Webhook `/api/webhooks/recall` → procesa recording
- [ ] Integración con pipeline existente (transcribe → analyze → emails)

### FASE 3: Vectorización (Semana 3-4)
- [ ] `vectorizeMeeting()` en pipeline post-analyze
- [ ] Chunking semántico + embeddings OpenAI
- [ ] Upsert Pinecone + pgvector (Supabase)
- [ ] Backfill: vectorizar reuniones históricas

### FASE 4: Agent API (Semana 4-5)
- [ ] `/api/agent/query` con RAG
- [ ] Filtros por rol/permisos
- [ ] Citación de fuentes en respuesta
- [ ] Rate limiting + logging

### FASE 5: UI + Polish (Semana 5-6)
- [ ] Dashboard "Knowledge Base" por org
- [ ] Chat interface para agentes
- [ ] Métricas: chunks indexados, queries/día, latencia
- [ ] Documentación API para agentes externos

---

## 7. COSTES ESTIMADOS (Mensual)

| Servicio | Free Tier | 100 reuniones/mes | 1000 reuniones/mes |
|----------|-----------|-------------------|-------------------|
| **Recall.ai** | 1h gratis | ~$30 (60h) | ~$300 (600h) |
| **Pinecone** | 1 index, 100k vecs | $70 (starter) | $200+ |
| **OpenAI Embeddings** | $5 gratis | ~$2 (15M tokens) | ~$20 |
| **Groq (LLM)** | Gratis | Gratis | Gratis |
| **Supabase** | 500MB DB | Pro $25 | Pro $25 |
| **Vercel** | Hobby | Pro $20 | Pro $20 |
| **TOTAL** | **$0** | **~$150** | **~$565** |

---

## 8. DECISIONES CLAVE A CONFIRMAR

1. **Vector DB**: ¿Pinecone (managed) o pgvector en Supabase (self-hosted, gratis)?
2. **Embedding model**: `text-embedding-3-small` (1536, $0.02/1M) vs `text-embedding-3-large` (3072, $0.13/1M)
3. **Chunking strategy**: Semántico (por secciones) vs Fixed-size (500 tokens overlap 50)
3. **Agent access**: ¿Solo API REST o también MCP (Model Context Protocol)?
4. **Retención vectores**: ¿Mismo ciclo que audio (30d) o indefinido?

---

## 9. PRÓXIMO PASO INMEDIATO

> **¿Quieres que implemente la FASE 1 (schema multi-tenant + Pinecone setup) o prefieres validar primero Recall.ai con una prueba manual?**

---

*ZRNote Enterprise Plan v1.0 · Julio 2026*