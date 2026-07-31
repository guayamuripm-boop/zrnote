import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import React from 'react';
import { MinutePDFDocument, generateMinutePDFBlob } from '@/lib/minute-pdf';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, coordination, type, status, created_at, started_at, ended_at, created_by')
    .eq('id', resolvedParams.id)
    .eq('created_by', user.id)
    .single();

  if (!meeting) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [minuteResult, actionItemsResult] = await Promise.all([
    supabase.from('minutes').select('*').eq('meeting_id', resolvedParams.id).single(),
    // Live table, not raw_llm_output: reflects reassignment (AssignActionItems)
    // and status changes (ActionItemStatus toggle) made after the minute was generated.
    supabase.from('action_items').select('assignee_name, description, priority, due_date, status')
      .eq('meeting_id', resolvedParams.id)
      .order('priority', { ascending: true }),
  ]);

  const minute = minuteResult.data;

  if (!minute) {
    return NextResponse.json({ error: 'Minute not found. Process the meeting first.' }, { status: 404 });
  }

  const meetingData = {
    id: meeting.id,
    title: meeting.title,
    coordination: meeting.coordination || '',
    type: meeting.type || 'presencial',
    created_at: meeting.created_at,
    started_at: meeting.started_at,
    ended_at: meeting.ended_at,
  };

  const minuteData = {
    summary: minute.summary || '',
    discussion: minute.discussion || [],
    decisions: minute.decisions || [],
    project_statuses: minute.project_statuses || [],
    blockers: minute.blockers || [],
    ideas: minute.ideas || [],
    next_steps: minute.next_steps || [],
    action_items: (actionItemsResult.data || []).map((i) => ({
      assignee_name: i.assignee_name || 'Sin asignar',
      description: i.description,
      priority: i.priority,
      due_date: i.due_date || undefined,
      status: i.status || 'pendiente',
    })),
    created_at: minute.created_at,
  };

  const blob = await generateMinutePDFBlob(meetingData, minuteData);
  const buffer = Buffer.from(await blob.arrayBuffer());

  const filename = `minuta-${meeting.title.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-\u00f1\u00d1]/g, '')}-${new Date().toISOString().slice(0, 10)}.pdf`;

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    },
  });
}
