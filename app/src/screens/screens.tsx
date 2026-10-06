import React, { useCallback, useState } from 'react';
import { Alert, FlatList, ScrollView, Text, View, Pressable, TextInput, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { Btn, Card, Chips, Field, s, statusColor, colors } from '../ui';
import {
  Client, Loan, Payment, LoanSummary, addPayment, createLoan, deleteClient, editPayment, getClient, getLoan,
  listClients, listLoans, listPayments, loanSummary, reversePayment, saveClient, scheduleOf, paymentsInRange
} from '../db/repo';
import { BarChart } from 'react-native-chart-kit';
import {
  buildSchedule, formatCOP, FREQUENCY_LABELS, Frequency, INTEREST_TYPE_LABELS, InterestType, STATUS_LABELS, totalInterest,
} from '../domain/amortization';
import { todayIso } from '../db/db';
import { accountStatementHtml, cashCloseHtml, receiptHtml, renderAndShare, scheduleHtml } from '../reports/pdf';

// ---------- Login ----------
export function LoginScreen() {
  const { signIn, signUp, cloud, signInLocal } = useAuth() as any;
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const run = (fn: any, isSignUp?: boolean) => async () => {
    setIsSubmitting(true);
    try { 
      await fn(email, pass); 
      if (isSignUp && cloud) Alert.alert('Cuenta creada', 'Revisa tu correo electrónico para confirmar la cuenta antes de iniciar sesión.');
    } catch (e: any) { 
      Alert.alert('Error', e.message); 
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLocal = async () => {
    setIsSubmitting(true);
    try { await signInLocal('local@prestamos.com'); } catch (e) {}
    setIsSubmitting(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ flex: 0.35, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 36, fontWeight: '900', color: colors.primary, letterSpacing: -1, fontStyle: 'italic' }}>Prestamos</Text>
        <Text style={[s.sub, { marginTop: 8 }]}>{cloud ? 'Inicia sesión para continuar' : 'Modo local (Sin nube)'}</Text>
      </View>
      
      <ScrollView style={{ flex: 0.65, backgroundColor: colors.primary, borderTopLeftRadius: 40, borderTopRightRadius: 40 }} contentContainerStyle={{ padding: 30, paddingTop: 40 }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 24, fontStyle: 'italic' }}>Ingresa a tu cuenta</Text>
        
        <View style={{ marginBottom: 16 }}>
          <TextInput 
            style={[s.input, { borderRadius: 30, paddingHorizontal: 20, borderWidth: 0 }]} 
            placeholder="Correo electrónico" 
            placeholderTextColor="#9ca3af" 
            value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" 
          />
        </View>
        <View style={{ marginBottom: 24 }}>
          <TextInput 
            style={[s.input, { borderRadius: 30, paddingHorizontal: 20, borderWidth: 0 }]} 
            placeholder="Contraseña" 
            placeholderTextColor="#9ca3af" 
            value={pass} onChangeText={setPass} secureTextEntry 
          />
        </View>
        
        <Btn title="Iniciar sesión" onPress={run(signIn)} loading={isSubmitting} kind="white" />
        
        <View style={{ marginTop: 10, alignItems: 'center' }}>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginBottom: 10 }}>O si eres nuevo</Text>
          <Pressable onPress={run(signUp, true)}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Crear cuenta en la nube</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 40, alignItems: 'center' }}>
          <Pressable onPress={handleLocal} style={{ padding: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20 }}>
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Entrar sin conexión (Modo Local)</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAutoSync } from '../sync/sync';

// ---------- Inicio ----------
export function HomeScreen({ navigation }: any) {
  const { session, signOut } = useAuth();
  const lender = session!.lenderId;
  
  // Activa la sincronización automática en segundo plano
  useAutoSync(lender);

  const [d, setD] = useState({ lent: 0, balance: 0, overdue: 0, active: 0 });
  const [name, setName] = useState(session!.email.split('@')[0]);
  const [isEditingName, setIsEditingName] = useState(false);

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(`userName_${lender}`).then(n => { if (n) setName(n); });
    (async () => {
      const loans = await listLoans(lender);
      let lent = 0, balance = 0, overdue = 0, active = 0;
      for (const l of loans) {
        const sm = await loanSummary(lender, l);
        lent += l.amount; balance += sm.balance;
        if (sm.status !== 'finished') active++;
        if (sm.status === 'overdue') overdue++;
      }
      setD({ lent, balance, overdue, active });
    })();
  }, [lender]));

  const saveName = () => {
    setIsEditingName(false);
    AsyncStorage.setItem(`userName_${lender}`, name);
  };

  return (
    <ScrollView style={s.screen} bounces={false}>
      <View style={{ backgroundColor: colors.primary, padding: 24, paddingTop: 60, paddingBottom: 40, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}>
         <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <View>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>Bienvenido</Text>
              {isEditingName ? (
                <TextInput 
                  style={{ color: '#fff', fontSize: 20, fontWeight: '700', borderBottomWidth: 1, borderColor: '#fff', padding: 0, minWidth: 150 }}
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  onBlur={saveName}
                  onSubmitEditing={saveName}
                />
              ) : (
                <Pressable onPress={() => setIsEditingName(true)}>
                  <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>{name} ✎</Text>
                </Pressable>
              )}
            </View>
            <Pressable onPress={signOut} style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 }}>
               <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Salir</Text>
            </Pressable>
         </View>
         <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginBottom: 4 }}>Dinero en calle (Saldo por cobrar)</Text>
         <Text style={{ color: '#fff', fontSize: 38, fontWeight: '900', letterSpacing: -1 }}>{formatCOP(d.balance)}</Text>
      </View>

      <View style={{ padding: 18, marginTop: -20 }}>
        <Card style={{ padding: 20 }}>
           <Text style={s.sub}>Total prestado histórico</Text>
           <Text style={[s.title, { fontSize: 24, marginTop: 4 }]}>{formatCOP(d.lent)}</Text>
           
           <View style={{ height: 1, backgroundColor: '#F3F4F6', marginVertical: 16 }} />
           
           <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
             <View>
               <Text style={s.sub}>Préstamos activos</Text>
               <Text style={[s.title, { fontSize: 20, color: colors.ok, marginTop: 4 }]}>{d.active}</Text>
             </View>
             <View style={{ alignItems: 'flex-end' }}>
               <Text style={s.sub}>En mora</Text>
               <Text style={[s.title, { fontSize: 20, color: colors.danger, marginTop: 4 }]}>{d.overdue}</Text>
             </View>
           </View>
        </Card>

        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 24, marginBottom: 16, marginLeft: 4 }}>Acciones Rápidas</Text>
        <Btn title="+ Nuevo cliente" onPress={() => navigation.navigate('ClientForm', {})} />
      </View>
    </ScrollView>
  );
}

// ---------- Clientes ----------
export function ClientsScreen({ navigation }: any) {
  const lender = useAuth().session!.lenderId;
  const [items, setItems] = useState<Client[]>([]);
  const [q, setQ] = useState('');
  useFocusEffect(useCallback(() => { listClients(lender).then(setItems); }, [lender]));
  const f = items.filter((c) => (c.name + (c.document_id ?? '')).toLowerCase().includes(q.toLowerCase()));
  return (
    <View style={s.screen}>
      <View style={s.pad}>
        <Field label="Buscar" value={q} onChangeText={setQ} placeholder="Nombre o documento" />
        <Btn title="+ Nuevo cliente" onPress={() => navigation.navigate('ClientForm', {})} />
      </View>
      <FlatList data={f} keyExtractor={(c) => c.id} contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        ListEmptyComponent={<Text style={s.sub}>Sin clientes</Text>}
        renderItem={({ item }) => (
          <Card onPress={() => navigation.navigate('ClientDetail', { id: item.id })}>
            <Text style={s.title}>{item.name}</Text>
            <Text style={s.sub}>{item.phone ?? 'Sin teléfono'} · {item.document_id ?? 'Sin documento'}</Text>
          </Card>
        )} />
    </View>
  );
}

export function ClientFormScreen({ route, navigation }: any) {
  const lender = useAuth().session!.lenderId;
  const id: string | undefined = route.params?.id;
  const [c, setC] = useState({ name: '', document_id: '', phone: '', address: '' });
  React.useEffect(() => {
    if (id) getClient(lender, id).then((x) => x && setC({ name: x.name, document_id: x.document_id ?? '', phone: x.phone ?? '', address: x.address ?? '' }));
  }, [id, lender]);
  const save = async () => {
    if (!c.name.trim()) return Alert.alert('Falta el nombre');
    await saveClient(lender, { id, ...c });
    navigation.goBack();
  };
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Field label="Nombre" value={c.name} onChangeText={(v) => setC({ ...c, name: v })} />
      <Field label="Documento de identidad" value={c.document_id} onChangeText={(v) => setC({ ...c, document_id: v })} />
      <Field label="Teléfono" value={c.phone} keyboardType="phone-pad" onChangeText={(v) => setC({ ...c, phone: v })} />
      <Field label="Dirección" value={c.address} onChangeText={(v) => setC({ ...c, address: v })} />
      <Btn title="Guardar" onPress={save} />
    </ScrollView>
  );
}

export function ClientDetailScreen({ route, navigation }: any) {
  const lender = useAuth().session!.lenderId;
  const { id } = route.params;
  const [client, setClient] = useState<Client | null>(null);
  const [rows, setRows] = useState<{ loan: Loan; sum: LoanSummary }[]>([]);
  useFocusEffect(useCallback(() => {
    (async () => {
      setClient(await getClient(lender, id));
      const loans = await listLoans(lender, id);
      setRows(await Promise.all(loans.map(async (loan) => ({ loan, sum: await loanSummary(lender, loan) }))));
    })();
  }, [lender, id]));
  if (!client) return null;
  const lent = rows.reduce((a, r) => a + r.loan.amount, 0);
  const bal = rows.reduce((a, r) => a + r.sum.balance, 0);
  const overdue = rows.filter((r) => r.sum.status === 'overdue').length;
  const del = () => Alert.alert('Eliminar cliente', '¿Seguro?', [
    { text: 'Cancelar' },
    { text: 'Eliminar', style: 'destructive', onPress: async () => { await deleteClient(lender, id); navigation.goBack(); } },
  ]);
  return (
    <ScrollView style={s.screen} bounces={false}>
      <View style={{ backgroundColor: colors.primary, padding: 24, paddingBottom: 40, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}>
         <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.5 }}>{client.name}</Text>
         <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15, marginTop: 4 }}>{client.phone} · {client.document_id}</Text>
         {!!client.address && <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15 }}>{client.address}</Text>}
      </View>

      <View style={{ padding: 18, marginTop: -20 }}>
        <Card style={{ padding: 20 }}>
          <View style={s.row}><Text style={s.sub}>Total prestado</Text><Text style={{ fontWeight: '700', fontSize: 16 }}>{formatCOP(lent)}</Text></View>
          <View style={[s.row, { marginTop: 12 }]}><Text style={s.sub}>Saldo pendiente</Text><Text style={{ fontWeight: '800', fontSize: 16, color: colors.primary }}>{formatCOP(bal)}</Text></View>
          <View style={{ height: 1, backgroundColor: '#F3F4F6', marginVertical: 14 }} />
          <View style={s.row}><Text style={s.sub}>Préstamos en mora</Text><Text style={{ fontWeight: '700', color: overdue ? colors.danger : colors.ok }}>{overdue}</Text></View>
          <Text style={[s.sub, { marginTop: 8, fontSize: 12 }]}>Puntualidad: {rows.length ? Math.round((1 - overdue / rows.length) * 100) : 100}% sin mora</Text>
        </Card>

        <Btn title="+ Nuevo préstamo" onPress={() => navigation.navigate('LoanForm', { clientId: id })} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
          <Btn title="Editar perfil" kind="ghost" style={{ flex: 0.48 }} onPress={() => navigation.navigate('ClientForm', { id })} />
          <Btn title="Estado cuenta PDF" kind="ghost" style={{ flex: 0.48 }} onPress={async () => renderAndShare(await accountStatementHtml(lender, id))} />
        </View>

        <Text style={[s.title, { marginVertical: 12, marginLeft: 4 }]}>Préstamos</Text>
        {rows.length === 0 && <Text style={s.sub}>No hay préstamos registrados</Text>}
        {rows.map(({ loan, sum }) => (
          <Card key={loan.id} onPress={() => navigation.navigate('LoanDetail', { id: loan.id })}>
            <View style={s.row}><Text style={[s.title, { fontSize: 20 }]}>{formatCOP(loan.amount)}</Text>
              <Text style={{ color: statusColor(sum.status), fontWeight: '700' }}>{STATUS_LABELS[sum.status]}</Text></View>
            <Text style={s.sub}>Saldo {formatCOP(sum.balance)} · {loan.start_date}</Text>
          </Card>
        ))}
        
        <View style={{ marginTop: 24 }}>
          <Btn title="Eliminar cliente" kind="danger" onPress={del} />
        </View>
      </View>
    </ScrollView>
  );
}

// ---------- Préstamos ----------
export function LoanFormScreen({ route, navigation }: any) {
  const lender = useAuth().session!.lenderId;
  const { clientId } = route.params;
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('10');
  const [n, setN] = useState('4');
  const [freq, setFreq] = useState<Frequency>('monthly');
  const [type, setType] = useState<InterestType>('french');
  const [start, setStart] = useState(todayIso());
  const num = (v: string) => Number(v.replace(/[^\d.]/g, '')) || 0;
  const preview = buildSchedule({ amount: num(amount), monthlyRate: num(rate), frequency: freq, installments: Math.floor(num(n)), interestType: type, startDate: start });
  const save = async () => {
    if (!preview.length) return Alert.alert('Revisa monto y número de cuotas');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return Alert.alert('Fecha inválida (AAAA-MM-DD)');
    const id = await createLoan(lender, {
      client_id: clientId, amount: num(amount), interest_rate: num(rate), interest_type: type,
      frequency: freq, installments: Math.floor(num(n)), start_date: start,
    });
    navigation.replace('LoanDetail', { id });
  };
  const tOpts = (Object.keys(INTEREST_TYPE_LABELS) as InterestType[]).map((v) => ({ v, l: INTEREST_TYPE_LABELS[v] }));
  const fOpts = (Object.keys(FREQUENCY_LABELS) as Frequency[]).map((v) => ({ v, l: FREQUENCY_LABELS[v] }));
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Field label="Monto (COP)" value={amount} keyboardType="numeric" onChangeText={setAmount} />
      <Field label="Tasa de interés mensual (%)" value={rate} keyboardType="numeric" onChangeText={setRate} />
      <Field label="Número de cuotas" value={n} keyboardType="numeric" onChangeText={setN} />
      <Text style={s.label}>Modalidad de pago</Text>
      <Chips value={freq} options={fOpts} onChange={setFreq} />
      <Text style={s.label}>Tipo de interés</Text>
      <Chips value={type} options={tOpts} onChange={setType} />
      <Field label="Fecha de inicio (AAAA-MM-DD)" value={start} onChangeText={setStart} />
      {preview.length > 0 && (
        <Card>
          <Text style={s.title}>Cuota: {formatCOP(preview[0].payment)}</Text>
          <Text style={s.sub}>Total intereses: {formatCOP(totalInterest(preview))}</Text>
          <Text style={s.sub}>Total a pagar: {formatCOP(num(amount) + totalInterest(preview))}</Text>
        </Card>
      )}
      <Btn title="Crear préstamo" onPress={save} />
    </ScrollView>
  );
}

export function LoanDetailScreen({ route }: any) {
  const lender = useAuth().session!.lenderId;
  const { id } = route.params;
  const [loan, setLoan] = useState<Loan | null>(null);
  const [sum, setSum] = useState<LoanSummary | null>(null);
  const [pays, setPays] = useState<Payment[]>([]);
  const [amt, setAmt] = useState('');
  const [client, setClient] = useState<Client | null>(null);
  const load = useCallback(async () => {
    const l = await getLoan(lender, id);
    if (!l) return;
    setLoan(l); setSum(await loanSummary(lender, l)); setPays(await listPayments(lender, id));
    setClient(await getClient(lender, l.client_id));
  }, [lender, id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!loan || !sum) return null;

  const pay = async () => {
    try {
      const pid = await addPayment(lender, id, Number(amt.replace(/[^\d.]/g, '')));
      setAmt(''); await load();
      const p = (await listPayments(lender, id)).find((x) => x.id === pid)!;
      Alert.alert('Abono registrado', '¿Generar recibo PDF?', [
        { text: 'No' },
        { text: 'Recibo', onPress: () => renderAndShare(receiptHtml(client!, loan, p)) },
      ]);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };
  const reverse = (p: Payment) => Alert.alert('Revertir abono', `${formatCOP(p.amount_paid)}`, [
    { text: 'Cancelar' }, { text: 'Revertir', style: 'destructive', onPress: async () => { await reversePayment(lender, p.id); load(); } }]);
  const edit = (p: Payment) => {
    Alert.prompt?.('Editar abono', 'Nuevo monto', async (v) => {
      try { await editPayment(lender, p.id, Number(v.replace(/[^\d.]/g, ''))); load(); } catch (e: any) { Alert.alert('Error', e.message); }
    }, 'plain-text', String(p.amount_paid), 'numeric');
  };
  const sched = scheduleOf(loan);
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Card>
        <Text style={s.sub}>{client?.name}</Text>
        <Text style={s.title}>{formatCOP(loan.amount)} · {STATUS_LABELS[sum.status]}</Text>
        <Text style={s.sub}>{loan.interest_rate}% mensual · {INTEREST_TYPE_LABELS[loan.interest_type]} · {loan.installments} cuotas {FREQUENCY_LABELS[loan.frequency].toLowerCase()}es</Text>
        <View style={s.row}><Text>Pagado</Text><Text style={{ fontWeight: '700' }}>{formatCOP(sum.paid)}</Text></View>
        <View style={s.row}><Text>Saldo capital</Text><Text style={{ fontWeight: '700' }}>{formatCOP(sum.balance)}</Text></View>
      </Card>
      {sum.status !== 'finished' && (
        <>
          <Field label="Registrar abono (COP)" value={amt} keyboardType="numeric" onChangeText={setAmt} placeholder={formatCOP(sched[0]?.payment ?? 0)} />
          <Btn title="Registrar abono" onPress={pay} />
        </>
      )}
      <Btn title="Cronograma (PDF)" kind="ghost" onPress={async () => renderAndShare(await scheduleHtml(lender, id))} />
      <Text style={[s.title, { marginVertical: 8 }]}>Cronograma</Text>
      {sched.map((r) => (
        <View key={r.number} style={s.row}>
          <Text>{r.number}. {r.dueDate}</Text><Text>{formatCOP(r.payment)}</Text>
        </View>
      ))}
      <Text style={[s.title, { marginVertical: 8 }]}>Abonos</Text>
      {pays.map((p) => (
        <Card key={p.id}>
          <View style={s.row}>
            <Text style={[s.title, p.reversed_at ? { textDecorationLine: 'line-through', color: colors.muted } : null]}>{formatCOP(p.amount_paid)}</Text>
            <Text style={s.sub}>{new Date(p.payment_date).toLocaleString('es-CO')}</Text>
          </View>
          <Text style={s.sub}>Capital {formatCOP(p.capital_portion)} · Interés {formatCOP(p.interest_portion)} · Saldo {formatCOP(p.remaining_balance)}</Text>
          {p.reversed_at ? <Text style={{ color: colors.danger }}>Revertido</Text> : (
            <View style={{ flexDirection: 'row', marginTop: 8 }}>
              <View style={{ flex: 1, marginRight: 4 }}><Btn title="Recibo" kind="ghost" onPress={() => renderAndShare(receiptHtml(client!, loan, p))} /></View>
              <View style={{ flex: 1, marginRight: 4 }}><Btn title="Editar" kind="ghost" onPress={() => edit(p)} /></View>
              <View style={{ flex: 1 }}><Btn title="Revertir" kind="danger" onPress={() => reverse(p)} /></View>
            </View>
          )}
        </Card>
      ))}
    </ScrollView>
  );
}

// ---------- Reportes ----------
export function ReportsScreen() {
  const lender = useAuth().session!.lenderId;
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState('');
  const t = todayIso();
  const [from, setFrom] = useState(t);
  const [to, setTo] = useState(t);
  const [chartData, setChartData] = useState({ labels: [''], data: [0] });

  useFocusEffect(useCallback(() => { 
    listClients(lender).then(setClients); 
    
    (async () => {
      const t0 = new Date();
      t0.setMonth(t0.getMonth() - 5);
      t0.setDate(1);
      const from6m = t0.toISOString().split('T')[0];
      const rows = await paymentsInRange(lender, from6m, t);
      
      const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      const labels = [];
      const data = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        labels.push(months[d.getMonth()]);
        const yyyyMm = d.toISOString().substring(0, 7);
        const mRows = rows.filter(r => r.payment_date.startsWith(yyyyMm));
        const intSum = mRows.reduce((a, b) => a + (b.interest_portion || 0), 0);
        data.push(intSum);
      }
      setChartData({ labels, data: data.every(d => d === 0) ? [0,0,0,0,0,0] : data });
    })();
  }, [lender, t]));

  const setRange = (kind: 'day' | 'month' | 'year') => {
    const [y, m] = t.split('-');
    if (kind === 'day') { setFrom(t); setTo(t); }
    if (kind === 'month') { setFrom(`${y}-${m}-01`); setTo(`${y}-${m}-${String(new Date(+y, +m, 0).getDate()).padStart(2, '0')}`); }
    if (kind === 'year') { setFrom(`${y}-01-01`); setTo(`${y}-12-31`); }
  };
  const go = async (fn: () => Promise<string>) => {
    try {
      await renderAndShare(await fn());
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const screenWidth = Dimensions.get("window").width;

  return (
    <ScrollView style={s.screen}>
      <View style={{ backgroundColor: colors.primary, padding: 24, paddingTop: 60, paddingBottom: 40, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -0.5, marginBottom: 8 }}>Tus Ganancias</Text>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>Intereses cobrados en los últimos 6 meses</Text>
        <View style={{ marginTop: 24, alignItems: 'center' }}>
          <BarChart
            data={{ labels: chartData.labels, datasets: [{ data: chartData.data }] }}
            width={screenWidth - 48}
            height={220}
            yAxisLabel="$"
            yAxisSuffix=""
            chartConfig={{
              backgroundColor: colors.primary,
              backgroundGradientFrom: colors.primary,
              backgroundGradientTo: colors.primary,
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
              style: { borderRadius: 16 },
              propsForDots: { r: "6", strokeWidth: "2", stroke: colors.primary }
            }}
            style={{ borderRadius: 16 }}
            verticalLabelRotation={0}
          />
        </View>
      </View>

      <View style={{ padding: 18 }}>
        <Card>
          <Text style={[s.title, { marginBottom: 16 }]}>Generar Reporte PDF</Text>
          <Text style={s.label}>Cliente (opcional para cierre de caja)</Text>
          <Chips value={clientId} onChange={setClientId}
            options={[{ v: '', l: 'Todos' }, ...clients.map((c) => ({ v: c.id, l: c.name }))]} />
          
          <Text style={s.label}>Periodo</Text>
          <Chips value={'' as any} onChange={setRange as any}
            options={[{ v: 'day', l: 'Hoy' }, { v: 'month', l: 'Este mes' }, { v: 'year', l: 'Este año' }] as any} />
          
          <Field label="Desde (AAAA-MM-DD)" value={from} onChangeText={setFrom} />
          <Field label="Hasta (AAAA-MM-DD)" value={to} onChangeText={setTo} />
          
          <Btn title="Cierre de caja (Ganancias del periodo)" onPress={() => go(() => cashCloseHtml(lender, from, to, clientId || undefined))} />
          <Btn title="Estado de cuenta del cliente" kind="ghost"
            onPress={() => clientId ? go(() => accountStatementHtml(lender, clientId, from, to)) : Alert.alert('Por favor selecciona un cliente')} />
        </Card>
      </View>
    </ScrollView>
  );
}
