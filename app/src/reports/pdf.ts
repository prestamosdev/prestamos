import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { formatCOP, STATUS_LABELS, INTEREST_TYPE_LABELS, FREQUENCY_LABELS } from '../domain/amortization';
import {
  Client, Loan, Payment, PaymentRow, getClient, getLoan, listLoans, listPayments,
  loanSummary, paymentsInRange, scheduleOf,
} from '../db/repo';

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

const css = `
body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 32px; color: #111827; background-color: #ffffff; line-height: 1.5; }
h1 { font-size: 28px; margin: 0 0 4px; color: #00B87C; font-weight: 900; letter-spacing: -0.5px; }
h2 { font-size: 18px; margin: 24px 0 12px; color: #374151; font-weight: 700; }
table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; margin-top: 12px; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; }
th, td { padding: 12px; text-align: left; border-bottom: 1px solid #E5E7EB; }
th { background: #E8F8F2; color: #00845A; font-weight: 700; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; border-bottom: 2px solid #D1FAE5; }
tr:last-child td { border-bottom: none; }
.r { text-align: right; }
.muted { color: #6B7280; font-size: 13px; }
.tot { font-weight: 800; background: #F9FAFB; color: #00B87C; }
.header { border-bottom: 3px solid #00B87C; padding-bottom: 16px; margin-bottom: 24px; }
`;

const wrap = (title: string, body: string) =>
  `<html><head><meta charset="utf-8"><style>${css}</style></head><body>
   <div class="header">
     <h1>${esc(title)}</h1>
     <div class="muted">Generado: ${fmtDate(new Date().toISOString())}</div>
   </div>
   ${body}</body></html>`;

export function receiptHtml(client: Client, loan: Loan, p: Payment): string {
  return wrap('Recibo de pago', `
    <h2>Cliente</h2><p>${esc(client.name)} — Doc: ${esc(client.document_id)}</p>
    <h2>Pago</h2>
    <table>
      <tr><th>Fecha</th><td>${fmtDate(p.payment_date)}</td></tr>
      <tr><th>Recibo N°</th><td>${p.id.slice(0, 8).toUpperCase()}</td></tr>
      <tr><th>Valor abonado</th><td>${formatCOP(p.amount_paid)}</td></tr>
      <tr><th>A capital</th><td>${formatCOP(p.capital_portion)}</td></tr>
      <tr><th>A intereses</th><td>${formatCOP(p.interest_portion)}</td></tr>
      <tr class="tot"><th>Saldo pendiente</th><td>${formatCOP(p.remaining_balance)}</td></tr>
    </table>
    <p class="muted">Préstamo de ${formatCOP(loan.amount)} — ${FREQUENCY_LABELS[loan.frequency]}</p>`);
}

export async function accountStatementHtml(lender: string, clientId: string, from?: string, to?: string): Promise<string> {
  const client = await getClient(lender, clientId);
  if (!client) throw new Error('Cliente no encontrado');
  const loans = await listLoans(lender, clientId);
  let body = `<p>${esc(client.name)} — Doc: ${esc(client.document_id)} — Tel: ${esc(client.phone)}</p>`;
  let totalLent = 0, totalBalance = 0;
  for (const l of loans) {
    const s = await loanSummary(lender, l);
    totalLent += l.amount; totalBalance += s.balance;
    let pays = (await listPayments(lender, l.id)).filter((p) => !p.reversed_at);
    if (from) pays = pays.filter((p) => p.payment_date >= new Date(from + 'T00:00:00').toISOString());
    if (to) pays = pays.filter((p) => p.payment_date <= new Date(to + 'T23:59:59.999').toISOString());
    body += `<h2>Préstamo ${formatCOP(l.amount)} — ${STATUS_LABELS[s.status]}</h2>
      <p class="muted">Inicio ${l.start_date} · ${l.interest_rate}% mensual · ${INTEREST_TYPE_LABELS[l.interest_type]} · ${l.installments} cuotas ${FREQUENCY_LABELS[l.frequency].toLowerCase()}es · Saldo ${formatCOP(s.balance)}</p>
      <table><tr><th>Fecha</th><th class="r">Abono</th><th class="r">Capital</th><th class="r">Interés</th><th class="r">Saldo</th></tr>
      ${pays.map((p) => `<tr><td>${fmtDate(p.payment_date)}</td><td class="r">${formatCOP(p.amount_paid)}</td><td class="r">${formatCOP(p.capital_portion)}</td><td class="r">${formatCOP(p.interest_portion)}</td><td class="r">${formatCOP(p.remaining_balance)}</td></tr>`).join('') || '<tr><td colspan="5">Sin abonos en el periodo</td></tr>'}
      </table>`;
  }
  body += `<h2>Resumen</h2><p>Total prestado: <b>${formatCOP(totalLent)}</b> · Saldo pendiente: <b>${formatCOP(totalBalance)}</b></p>`;
  return wrap('Estado de cuenta', body);
}

export async function cashCloseHtml(lender: string, from: string, to: string, clientId?: string): Promise<string> {
  const rows: PaymentRow[] = await paymentsInRange(lender, from, to, clientId);
  const sum = (k: 'amount_paid' | 'capital_portion' | 'interest_portion') => rows.reduce((a, r) => a + r[k], 0);
  return wrap('Cierre de caja', `<p>Periodo: ${from} a ${to}</p>
    <table><tr><th>Fecha</th><th>Cliente</th><th class="r">Abono</th><th class="r">Capital</th><th class="r">Interés</th></tr>
    ${rows.map((r) => `<tr><td>${fmtDate(r.payment_date)}</td><td>${esc(r.client_name)}</td><td class="r">${formatCOP(r.amount_paid)}</td><td class="r">${formatCOP(r.capital_portion)}</td><td class="r">${formatCOP(r.interest_portion)}</td></tr>`).join('') || '<tr><td colspan="5">Sin recaudo en el periodo</td></tr>'}
    <tr class="tot"><td colspan="2">TOTAL (${rows.length} abonos)</td><td class="r">${formatCOP(sum('amount_paid'))}</td><td class="r">${formatCOP(sum('capital_portion'))}</td><td class="r">${formatCOP(sum('interest_portion'))}</td></tr></table>`);
}

export async function scheduleHtml(lender: string, loanId: string): Promise<string> {
  const loan = await getLoan(lender, loanId);
  if (!loan) throw new Error('Préstamo no encontrado');
  const s = scheduleOf(loan);
  return wrap('Cronograma de pagos', `<table><tr><th>#</th><th>Vence</th><th class="r">Cuota</th><th class="r">Capital</th><th class="r">Interés</th><th class="r">Saldo</th></tr>
    ${s.map((r) => `<tr><td>${r.number}</td><td>${r.dueDate}</td><td class="r">${formatCOP(r.payment)}</td><td class="r">${formatCOP(r.capital)}</td><td class="r">${formatCOP(r.interest)}</td><td class="r">${formatCOP(r.balance)}</td></tr>`).join('')}</table>`);
}

export async function renderAndShare(html: string): Promise<string> {
  // Pedirle a Print que nos dé el archivo en texto crudo (Base64) en lugar de un archivo físico
  const { base64 } = await Print.printToFileAsync({ html, base64: true });
  
  // Escribir ese texto crudo como un PDF nuevo directamente en la carpeta permitida
  const newUri = `${FileSystem.documentDirectory}Recibo_${Date.now()}.pdf`;
  await FileSystem.writeAsStringAsync(newUri, base64!, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(newUri, { mimeType: 'application/pdf', dialogTitle: 'Compartir PDF', UTI: '.pdf' });
  }
  return newUri;
}
