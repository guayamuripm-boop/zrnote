interface PersonalEmailParams {
  meetingTitle: string;
  meetingDate: string;
  summary: string;
  actionItems: {
    description: string;
    due_date: string | null;
    priority: string;
  }[];
  meetingId: string;
}

export function personalEmailTemplate({
  meetingTitle,
  meetingDate,
  summary,
  actionItems,
  meetingId,
}: PersonalEmailParams): string {
  const date = new Date(meetingDate).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const itemsHtml = actionItems
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #98BAE3;font-family:Roboto,sans-serif;">${item.description}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #98BAE3;font-family:Roboto,sans-serif;">${
          item.due_date
            ? new Date(item.due_date).toLocaleDateString('es-ES')
            : '—'
        }</td>
        <td style="padding:10px 12px;border-bottom:1px solid #98BAE3;font-family:Roboto,sans-serif;">
          <span style="color:${
            item.priority === 'alta'
              ? '#c0392b'
              : item.priority === 'media'
              ? '#d4a017'
              : '#27ae60'
          };font-weight:500;">${item.priority}</span>
        </td>
      </tr>`
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Raleway:wght@600;700&display=swap" rel="stylesheet">
    </head>
    <body style="font-family:'Roboto',sans-serif;max-width:600px;margin:0 auto;padding:0;background-color:#f8f9fa;">
      <div style="background-color:#21284F;padding:20px 30px;text-align:center;">
        <span style="color:#ffffff;font-family:'Raleway',sans-serif;font-size:20px;font-weight:700;">
          <span style="background:#1E4D96;padding:4px 8px;border-radius:4px;">ZR</span> ZRNote
        </span>
      </div>

      <div style="padding:30px;background:#ffffff;">
        <h1 style="font-family:'Raleway',sans-serif;font-size:22px;color:#21284F;margin:0 0 5px 0;">${meetingTitle}</h1>
        <p style="color:#6590CB;font-size:14px;margin:0 0 20px 0;">${date}</p>

        <h2 style="font-family:'Raleway',sans-serif;font-size:16px;color:#1E4D96;margin:0 0 10px 0;border-bottom:2px solid #98BAE3;padding-bottom:6px;">Resumen</h2>
        <p style="color:#21284F;line-height:1.6;margin:0 0 24px 0;">${summary}</p>

        <h2 style="font-family:'Raleway',sans-serif;font-size:16px;color:#1E4D96;margin:0 0 10px 0;border-bottom:2px solid #98BAE3;padding-bottom:6px;">Tus compromisos</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
          <thead>
            <tr style="background-color:#21284F;">
              <th style="padding:10px 12px;text-align:left;color:#ffffff;font-family:'Raleway',sans-serif;font-weight:600;">Tarea</th>
              <th style="padding:10px 12px;text-align:left;color:#ffffff;font-family:'Raleway',sans-serif;font-weight:600;">Fecha</th>
              <th style="padding:10px 12px;text-align:left;color:#ffffff;font-family:'Raleway',sans-serif;font-weight:600;">Prioridad</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/meetings/${meetingId}"
           style="display:inline-block;background:#1E4D96;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-family:'Raleway',sans-serif;font-weight:600;">
          Ver minuta completa
        </a>
      </div>

      <div style="padding:20px 30px;text-align:center;background:#f8f9fa;border-top:1px solid #98BAE3;">
        <p style="color:#6590CB;font-size:12px;margin:0;">
          Generado automáticamente por ZRNote · <span style="color:#21284F;font-weight:600;">ZR Mecacademy</span>
        </p>
      </div>
    </body>
    </html>
  `;
}

interface CoordinatorEmailParams {
  meetingTitle: string;
  meetingDate: string;
  actionItems: {
    assignee_name: string;
    description: string;
    due_date: string | null;
    priority: string;
  }[];
  meetingId: string;
}

export function coordinatorEmailTemplate({
  meetingTitle,
  meetingDate,
  actionItems,
  meetingId,
}: CoordinatorEmailParams): string {
  const date = new Date(meetingDate).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const itemsHtml = actionItems
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #98BAE3;font-family:Roboto,sans-serif;">${item.assignee_name}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #98BAE3;font-family:Roboto,sans-serif;">${item.description}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #98BAE3;font-family:Roboto,sans-serif;">${
          item.due_date
            ? new Date(item.due_date).toLocaleDateString('es-ES')
            : '—'
        }</td>
        <td style="padding:10px 12px;border-bottom:1px solid #98BAE3;font-family:Roboto,sans-serif;">${item.priority}</td>
      </tr>`
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Raleway:wght@600;700&display=swap" rel="stylesheet">
    </head>
    <body style="font-family:'Roboto',sans-serif;max-width:600px;margin:0 auto;padding:0;background-color:#f8f9fa;">
      <div style="background-color:#21284F;padding:20px 30px;text-align:center;">
        <span style="color:#ffffff;font-family:'Raleway',sans-serif;font-size:20px;font-weight:700;">
          <span style="background:#1E4D96;padding:4px 8px;border-radius:4px;">ZR</span> ZRNote
        </span>
      </div>

      <div style="padding:30px;background:#ffffff;">
        <h1 style="font-family:'Raleway',sans-serif;font-size:22px;color:#21284F;margin:0 0 5px 0;">${meetingTitle} — Resumen completo</h1>
        <p style="color:#6590CB;font-size:14px;margin:0 0 20px 0;">${date}</p>

        <h2 style="font-family:'Raleway',sans-serif;font-size:16px;color:#1E4D96;margin:0 0 10px 0;border-bottom:2px solid #98BAE3;padding-bottom:6px;">Todos los action items</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
          <thead>
            <tr style="background-color:#21284F;">
              <th style="padding:10px 12px;text-align:left;color:#ffffff;font-family:'Raleway',sans-serif;font-weight:600;">Responsable</th>
              <th style="padding:10px 12px;text-align:left;color:#ffffff;font-family:'Raleway',sans-serif;font-weight:600;">Tarea</th>
              <th style="padding:10px 12px;text-align:left;color:#ffffff;font-family:'Raleway',sans-serif;font-weight:600;">Fecha</th>
              <th style="padding:10px 12px;text-align:left;color:#ffffff;font-family:'Raleway',sans-serif;font-weight:600;">Prioridad</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/meetings/${meetingId}"
           style="display:inline-block;background:#1E4D96;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-family:'Raleway',sans-serif;font-weight:600;">
          Ver minuta completa
        </a>
      </div>

      <div style="padding:20px 30px;text-align:center;background:#f8f9fa;border-top:1px solid #98BAE3;">
        <p style="color:#6590CB;font-size:12px;margin:0;">
          Generado automáticamente por ZRNote · <span style="color:#21284F;font-weight:600;">ZR Mecacademy</span>
        </p>
      </div>
    </body>
    </html>
  `;
}
