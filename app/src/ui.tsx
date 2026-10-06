import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

export const colors = { primary: '#00B87C', bg: '#F4F9F7', card: '#ffffff', text: '#111827', muted: '#6B7280', danger: '#EF4444', ok: '#10B981', warn: '#F59E0B' };

export function Btn({ title, onPress, kind = 'primary', loading = false, style }: { title: string; onPress: () => void; kind?: 'primary' | 'danger' | 'ghost' | 'white'; loading?: boolean; style?: any }) {
  const bg = kind === 'primary' ? colors.primary : kind === 'danger' ? colors.danger : kind === 'white' ? '#fff' : kind === 'ghost' ? '#E8F8F2' : 'transparent';
  const fg = kind === 'ghost' ? '#00845A' : kind === 'white' ? colors.primary : '#fff';
  return (
    <Pressable onPress={loading ? undefined : onPress} style={[s.btn, { backgroundColor: bg, borderWidth: 0, opacity: loading ? 0.7 : 1 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '800', fontSize: 15 }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...p }: { label: string } & TextInputProps) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor="#9ca3af" {...p} />
    </View>
  );
}

export function Card({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: any }) {
  return <Pressable onPress={onPress} style={[s.card, style]}>{children}</Pressable>;
}

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
      {options.map((o) => (
        <Pressable key={o.v} onPress={() => onChange(o.v)}
          style={[s.chip, value === o.v && { backgroundColor: colors.primary }]}>
          <Text style={{ color: value === o.v ? '#fff' : colors.text, fontWeight: value === o.v ? '600' : '400' }}>{o.l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const statusColor = (st: string) =>
  st === 'overdue' ? colors.danger : st === 'finished' ? colors.muted : st === 'on_time' ? colors.ok : colors.warn;

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 18 },
  btn: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 30, alignItems: 'center', marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 2 } },
  label: { fontSize: 13, color: colors.muted, marginBottom: 6, marginLeft: 4, fontWeight: '500' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 18, padding: 14, fontSize: 15, color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 18, marginBottom: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  title: { fontSize: 19, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  sub: { color: colors.muted, marginTop: 4, fontSize: 13, lineHeight: 18 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#E5E7EB', marginRight: 8, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
});
